/**
 * ContentPathBreadcrumb
 *
 * Folder-path breadcrumb rendered under the content title in the main panel.
 * Each crumb mirrors a real file-tree selection of that node: the tree
 * expands and scrolls to it, tree selection (and therefore the + menu and
 * other selection-driven surfaces) targets it, and it opens in the pane —
 * exactly as if the user had selected it in the sidebar. The sidebar is
 * never forced open: with the tree collapsed or unmounted the selection and
 * expansion still land in the persisted stores, so the tree reflects them
 * whenever it next appears.
 */

"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useContentStore, type WorkspacePaneId } from "@/state/content-store";
import { useTreeStateStore } from "@/state/tree-state-store";
import { clientLogger } from "@/lib/core/logger/client";

interface PathCrumb {
  id: string;
  title: string;
  contentType: string | null;
}

interface ContentPathBreadcrumbProps {
  contentId: string;
  /** Live title of the open content — the main panel already tracks renames. */
  currentTitle: string;
  currentContentType: string | null;
  paneId?: WorkspacePaneId;
}

const EMPTY_ANCESTORS: PathCrumb[] = [];

export function ContentPathBreadcrumb({
  contentId,
  currentTitle,
  currentContentType,
  paneId,
}: ContentPathBreadcrumbProps) {
  // Ancestors keyed to the content they were fetched for — a stale chain
  // (previous tab, mid-fetch switch) is simply not rendered, so no state
  // reset is needed when contentId changes.
  const [fetchedPath, setFetchedPath] = useState<{
    forContentId: string;
    ancestors: PathCrumb[];
  } | null>(null);
  // Bumped by tree-shape events (rename/move) to refetch a possibly-stale path.
  const [refreshKey, setRefreshKey] = useState(0);

  const setSelectedContentId = useContentStore((s) => s.setSelectedContentId);
  const expandMany = useTreeStateStore((s) => s.expandMany);
  const setSelectedIds = useTreeStateStore((s) => s.setSelectedIds);

  // Optimistic/unsaved placeholders have no persisted ancestry yet.
  const isRealContentId = Boolean(contentId) && !contentId.startsWith("temp-");

  useEffect(() => {
    if (!isRealContentId) return;

    let cancelled = false;

    const fetchPath = async () => {
      try {
        const response = await fetch(
          `/api/content/content/${contentId}/path`,
          { credentials: "include" },
        );
        if (cancelled) return;
        if (!response.ok) {
          // Shared/trashed/foreign content simply has no breadcrumb.
          setFetchedPath({ forContentId: contentId, ancestors: EMPTY_ANCESTORS });
          return;
        }
        const result = await response.json();
        if (cancelled) return;
        setFetchedPath({
          forContentId: contentId,
          ancestors: result?.data?.ancestors ?? EMPTY_ANCESTORS,
        });
      } catch (err) {
        if (!cancelled) {
          clientLogger.error({
            layer: "fetch",
            event: "content_path:failed",
            summary: "content path breadcrumb fetch failed",
            attrs: { content_id: contentId },
            error: err,
          });
        }
      }
    };

    fetchPath();
    return () => {
      cancelled = true;
    };
  }, [contentId, isRealContentId, refreshKey]);

  const ancestors =
    fetchedPath?.forContentId === contentId
      ? fetchedPath.ancestors
      : EMPTY_ANCESTORS;

  // Tree-shape changes that can invalidate the path: moves (drag or dialog)
  // and ancestor renames. The open node's own rename flows in via props.
  useEffect(() => {
    const refresh = () => setRefreshKey((key) => key + 1);
    const ancestorIds = new Set(ancestors.map((crumb) => crumb.id));

    const handleContentUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ contentId?: string }>).detail;
      if (detail?.contentId && ancestorIds.has(detail.contentId)) {
        refresh();
      }
    };

    window.addEventListener("dg:tree-refresh", refresh);
    window.addEventListener("dg:content-moved", refresh);
    window.addEventListener("content-updated", handleContentUpdated);
    return () => {
      window.removeEventListener("dg:tree-refresh", refresh);
      window.removeEventListener("dg:content-moved", refresh);
      window.removeEventListener("content-updated", handleContentUpdated);
    };
  }, [ancestors]);

  const handleCrumbClick = useCallback(
    (trail: PathCrumb[], index: number) => {
      const target = trail[index];

      // Persist expansion of everything above the target so it is visible in
      // the tree — now if mounted, or on next mount if the sidebar is
      // collapsed (initialOpenState reads these ids).
      expandMany(trail.slice(0, index).map((crumb) => crumb.id));
      setSelectedIds([target.id]);

      // Mirror a real tree selection: folders open their folder view, the
      // current item is a no-op re-selection. Selection-driven surfaces
      // (+ menu, chats) now target this node.
      setSelectedContentId(target.id, {
        title: target.title,
        contentType: target.contentType,
        paneId,
      });

      // Ask a mounted tree to imperatively open ancestors, scroll, and select.
      window.dispatchEvent(
        new CustomEvent("dg:tree-reveal", { detail: { id: target.id } }),
      );
    },
    [expandMany, setSelectedIds, setSelectedContentId, paneId],
  );

  if (!isRealContentId) return null;

  const trail: PathCrumb[] = [
    ...ancestors,
    { id: contentId, title: currentTitle, contentType: currentContentType },
  ];

  return (
    <nav
      aria-label="File path"
      className="mt-1 flex min-w-0 flex-wrap items-center gap-y-0.5 text-xs text-muted-foreground"
    >
      {trail.map((crumb, index) => {
        const isCurrent = index === trail.length - 1;
        return (
          <Fragment key={crumb.id}>
            {index > 0 && (
              <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
            )}
            <button
              type="button"
              onClick={() => handleCrumbClick(trail, index)}
              title={
                isCurrent
                  ? "Reveal in file tree"
                  : `Select "${crumb.title}" in file tree`
              }
              aria-current={isCurrent ? "page" : undefined}
              className="max-w-[12rem] truncate rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {crumb.title}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
