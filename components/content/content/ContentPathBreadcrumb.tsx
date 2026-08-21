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
 *
 * Layout: a single line that never wraps. Deep paths collapse from the
 * MIDDLE — the root and the current item (plus as many ancestors nearest the
 * current item as fit) stay visible, and the hidden run is replaced by an
 * `…` button that opens the hidden crumbs as a menu:
 *
 *   Pathways › … › Playbooks › Rapid Scout II - Shortlist unfilt…
 *
 * The collapse is width-driven, not depth-driven: a layout effect hides one
 * more middle crumb while the row overflows, and a ResizeObserver re-expands
 * when the pane widens, so a wide desktop pane shows the full path while an
 * extension side panel shows head + tail. Once every middle crumb is hidden
 * the survivors truncate proportionally (current item favoured).
 */

"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Ellipsis, Folder } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { useAnchoredMenu } from "@/lib/core/use-anchored-menu";
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
const MENU_WIDTH = 240;
const MENU_MAX_HEIGHT = 320;

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

  const trail: PathCrumb[] = [
    ...ancestors,
    { id: contentId, title: currentTitle, contentType: currentContentType },
  ];

  // ── Middle collapse ──────────────────────────────────────────────────
  // `hidden` = how many crumbs after the root are folded into the `…`. It is
  // keyed to the trail (ids + titles) the way `fetchedPath` is keyed to the
  // content id: a different trail simply reads as 0 hidden and re-measures,
  // with no reset effect.
  const trailKey = trail.map((crumb) => `${crumb.id}\u0001${crumb.title}`).join("\u0000");
  const [collapse, setCollapse] = useState<{ key: string; hidden: number }>({
    key: "",
    hidden: 0,
  });
  const hidden = collapse.key === trailKey ? collapse.hidden : 0;
  // Root and current item are never folded.
  const maxHidden = Math.max(0, trail.length - 2);
  const navRef = useRef<HTMLElement | null>(null);

  // Grow `hidden` one crumb at a time while the row overflows. Each step is
  // a synchronous re-render before paint, so it converges in ≤ trail.length
  // passes with no visible intermediate state. `collapse` is a dep on
  // purpose: the ResizeObserver below stores a fresh object to force a
  // re-measure even when the derived `hidden` is unchanged (0 → 0).
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (nav.scrollWidth > nav.clientWidth + 1 && hidden < maxHidden) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- layout measurement: fold one more crumb and re-measure; bounded by maxHidden, converges before paint
      setCollapse({ key: trailKey, hidden: hidden + 1 });
    }
  }, [collapse, hidden, maxHidden, trailKey]);

  // Any width change restarts the fit from 0 hidden; the layout effect then
  // re-folds only as much as the new width needs (so widening un-collapses).
  // A fresh object always re-renders, which is what forces the re-measure
  // when narrowing at an already-0 state.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    let lastWidth = nav.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = nav.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      setCollapse({ key: "", hidden: 0 });
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, [isRealContentId]);

  // Destructured on purpose: the React Compiler's ref inference taints a
  // hook-return OBJECT once one of its fields is passed as `ref=`, and then
  // flags every `.open` / `.menuStyle` read as a render-time ref access.
  const {
    open: overflowOpen,
    toggle: toggleOverflow,
    close: closeOverflow,
    triggerRef: overflowTriggerRef,
    menuRef: overflowMenuRef,
    menuStyle: overflowMenuStyle,
  } = useAnchoredMenu({
    width: MENU_WIDTH,
    maxHeight: MENU_MAX_HEIGHT,
  });

  if (!isRealContentId) return null;

  // Visible layout: [root] [… hiddenRun] [rest…]. The hidden run always
  // starts right after the root, so the ancestors nearest the current item
  // survive longest — the parent folder is more useful than a mid-level one.
  const root = trail[0];
  const hiddenRun = hidden > 0 ? trail.slice(1, 1 + hidden) : [];
  const tail = trail.slice(1 + hidden);
  // Everything foldable is folded and the row may still overflow: let the
  // survivors shrink (min-w-0) instead of holding their natural width.
  const squeeze = hidden >= maxHidden;

  const renderCrumb = (crumb: PathCrumb, index: number) => {
    const isCurrent = index === trail.length - 1;
    const isRoot = index === 0;
    return (
      <button
        key={crumb.id}
        type="button"
        onClick={() => handleCrumbClick(trail, index)}
        title={
          isCurrent
            ? "Reveal in file tree"
            : `Select "${crumb.title}" in file tree`
        }
        aria-current={isCurrent ? "page" : undefined}
        className={cn(
          "truncate rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          isCurrent ? "max-w-[18rem]" : "max-w-[10rem]",
          // While measuring, crumbs hold their natural width so overflow is
          // detectable; once fully folded they share the remaining space,
          // root yielding first (higher shrink factor) so the current item
          // keeps the most room.
          squeeze ? "min-w-0 shrink" : "shrink-0",
          squeeze && isRoot && !isCurrent && "shrink-[2]",
        )}
      >
        {crumb.title}
      </button>
    );
  };

  return (
    <nav
      ref={navRef}
      aria-label="File path"
      className="mt-1 flex min-w-0 flex-nowrap items-center overflow-hidden whitespace-nowrap text-xs text-muted-foreground"
    >
      {renderCrumb(root, 0)}

      {hiddenRun.length > 0 && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          <button
            ref={overflowTriggerRef}
            type="button"
            onClick={toggleOverflow}
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            aria-label={`Show ${hiddenRun.length} hidden folder${hiddenRun.length === 1 ? "" : "s"}`}
            title={hiddenRun.map((crumb) => crumb.title).join(" › ")}
            className={cn(
              "shrink-0 rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              overflowOpen && "bg-muted text-foreground",
            )}
          >
            <Ellipsis className="h-3 w-3" />
          </button>
          {overflowOpen &&
            overflowMenuStyle &&
            createPortal(
              <div
                ref={overflowMenuRef}
                role="menu"
                style={overflowMenuStyle}
                className="z-[130] flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white text-xs shadow-xl dark:border-white/10 dark:bg-[#1a1a1a]"
              >
                <div className="min-h-0 flex-1 overflow-y-auto py-1">
                  {hiddenRun.map((crumb, offset) => {
                    // offset 0 is trail[1]; indent one step per level so the
                    // menu still reads as a path, not a flat list.
                    const index = 1 + offset;
                    return (
                      <button
                        key={crumb.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          closeOverflow();
                          handleCrumbClick(trail, index);
                        }}
                        title={`Select "${crumb.title}" in file tree`}
                        className="flex w-full items-center gap-2 py-1.5 pr-3 text-left text-gray-600 transition-colors hover:bg-black/[0.04] focus-visible:bg-black/[0.04] focus-visible:outline-none dark:text-gray-300 dark:hover:bg-white/5 dark:focus-visible:bg-white/5"
                        style={{ paddingLeft: `${12 + offset * 10}px` }}
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-500/80" />
                        <span className="truncate">{crumb.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>,
              document.body,
            )}
        </>
      )}

      {tail.map((crumb, offset) => {
        const index = 1 + hidden + offset;
        return (
          <Fragment key={crumb.id}>
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
            {renderCrumb(crumb, index)}
          </Fragment>
        );
      })}
    </nav>
  );
}
