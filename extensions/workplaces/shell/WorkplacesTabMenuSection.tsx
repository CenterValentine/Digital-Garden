"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ExtensionShellTabMenuSectionProps } from "@/lib/extensions/types";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import {
  normalizeWorkbenchSettings,
  type ContentWorkspaceResponse,
  type WorkbenchFolderOption,
} from "@/extensions/workplaces/server/types";
import {
  copyTreeItems,
  ensureAltTracker,
} from "@/lib/features/content/tree-clipboard";

const HEADING_CLASS =
  "px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500";
const ROW_CLASS =
  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10";

/** One workbench destination: a folder under a view workspace's root. */
interface BenchTarget {
  folderId: string;
  title: string;
  /** Existing bench row, or null when the move must materialize it first. */
  workbenchId: string | null;
}

type ApiResponse<T> = { success: boolean; data?: T };

/**
 * Which top-level workspaces can host workbenches: views (not Main) with the
 * workbenches toggle on. Mirrors `createWorkbench`'s server-side guard.
 */
function canHostBenches(workspace: ContentWorkspaceResponse) {
  return (
    workspace.isView &&
    !workspace.isMain &&
    normalizeWorkbenchSettings(workspace.settings).enabled
  );
}

/**
 * Bench destinations for one parent: the fetched root-layer folders (visible
 * ones, which may not be materialized yet) unioned with every bench row the
 * store already knows under that parent — deeper-layer benches only exist
 * in the store, and the store answers before the fetch does.
 */
function collectBenchTargets(
  parent: ContentWorkspaceResponse,
  workspaces: ContentWorkspaceResponse[],
  fetched: WorkbenchFolderOption[] | undefined,
): BenchTarget[] {
  const byFolder = new Map<string, BenchTarget>();
  for (const folder of fetched ?? []) {
    if (folder.hidden) continue;
    byFolder.set(folder.folderId, {
      folderId: folder.folderId,
      title: folder.title,
      workbenchId: folder.workbenchId,
    });
  }
  for (const bench of workspaces) {
    if (
      bench.parentWorkspaceId !== parent.id ||
      bench.status !== "active" ||
      !bench.viewRootContentId ||
      byFolder.has(bench.viewRootContentId)
    ) {
      continue;
    }
    byFolder.set(bench.viewRootContentId, {
      folderId: bench.viewRootContentId,
      title: bench.name,
      workbenchId: bench.id,
    });
  }
  return [...byFolder.values()];
}

export function WorkplacesTabMenuSection({
  tab,
  closeMenu,
}: ExtensionShellTabMenuSectionProps) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const assignContentToWorkspace = useWorkspaceStore(
    (state) => state.assignContentToWorkspace
  );
  const moveTabToWorkspace = useWorkspaceStore(
    (state) => state.moveTabToWorkspace
  );
  const ensureWorkbench = useWorkspaceStore((state) => state.ensureWorkbench);

  // Alt at Copy-click = strictly the URL — the tracker must be live while
  // the menu is open, before any click lands.
  useEffect(() => {
    ensureAltTracker();
  }, []);

  // Workbench rows live in the flat list too; the menu groups them under
  // their parent, so only top-level rows start a group.
  const topLevelWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          workspace.parentWorkspaceId === null && workspace.status === "active"
      ),
    [workspaces]
  );

  // Root-layer folders per bench-capable parent, fetched when the menu opens.
  // A folder needs no bench row yet to be a destination: the move
  // materializes it, exactly as clicking it in the selector would.
  const [foldersByParent, setFoldersByParent] = useState<
    Record<string, WorkbenchFolderOption[]>
  >({});
  const benchHostKey = topLevelWorkspaces
    .filter(canHostBenches)
    .map((workspace) => workspace.id)
    .join(",");
  useEffect(() => {
    if (!benchHostKey) return;
    let cancelled = false;
    for (const parentId of benchHostKey.split(",")) {
      fetch(`/api/content/workspaces/${parentId}/workbenches`, {
        credentials: "include",
      })
        .then(async (response) => {
          const result = (await response.json()) as ApiResponse<
            WorkbenchFolderOption[]
          >;
          return response.ok && result.success && result.data
            ? result.data
            : [];
        })
        .catch((): WorkbenchFolderOption[] => [])
        .then((folders) => {
          if (cancelled) return;
          setFoldersByParent((current) => ({ ...current, [parentId]: folders }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [benchHostKey]);

  const groups = useMemo(
    () =>
      topLevelWorkspaces.map((workspace) => ({
        workspace,
        // The workspace itself is not a destination when the tab already
        // lives in it; its benches still are (the most common move of all).
        isCurrent: workspace.id === activeWorkspaceId,
        isLoadingBenches:
          canHostBenches(workspace) && foldersByParent[workspace.id] === undefined,
        benches: collectBenchTargets(
          workspace,
          workspaces,
          foldersByParent[workspace.id]
        ).filter((bench) => bench.workbenchId !== activeWorkspaceId),
      })),
    [activeWorkspaceId, foldersByParent, topLevelWorkspaces, workspaces]
  );

  const hasAnyTarget = groups.some(
    (group) => !group.isCurrent || group.benches.length > 0
  );

  const movePayload = {
    id: tab.id,
    contentId: tab.contentId,
    title: tab.title,
  };

  const moveTo = async (targetWorkspaceId: string) => {
    try {
      await moveTabToWorkspace(targetWorkspaceId, movePayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to move tab");
    }
  };

  const moveToBench = async (parentWorkspaceId: string, bench: BenchTarget) => {
    try {
      const target =
        bench.workbenchId ??
        (await ensureWorkbench(parentWorkspaceId, bench.folderId)).id;
      await moveTabToWorkspace(target, movePayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to move tab");
    }
  };

  const shareTargets = topLevelWorkspaces.filter(
    (workspace) => workspace.id !== activeWorkspaceId
  );

  return (
    <>
      <div className={HEADING_CLASS}>Clipboard</div>
      <button
        type="button"
        className={ROW_CLASS}
        onClick={() => {
          closeMenu();
          // Same dual-flavor payload as the file tree (owner spec
          // 2026-08-10): URL as text, wiki-link html for note paste,
          // @-mention on chat paste — and tree paste rides along for free.
          void copyTreeItems(
            [
              {
                id: tab.contentId,
                title: tab.title || "Untitled",
                contentType: tab.contentType ?? "note",
              },
            ],
            "copy",
          );
        }}
      >
        Copy link
      </button>
      <div className="my-1 h-px bg-black/10 dark:bg-white/10" />
      <div className={HEADING_CLASS}>Move tab to</div>
      {!hasAnyTarget ? (
        <div className="px-2 py-1.5 text-xs text-gray-500">
          Create another workplace first.
        </div>
      ) : (
        groups.map((group) => {
          if (group.isCurrent && group.benches.length === 0 && !group.isLoadingBenches) {
            return null;
          }
          return (
            <div key={`move-${group.workspace.id}`}>
              {group.isCurrent ? (
                <div className="flex items-center gap-2 px-2 py-1.5 text-gray-400 dark:text-gray-500">
                  <span className="truncate">{group.workspace.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide">
                    current
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className={ROW_CLASS}
                  onClick={() => {
                    closeMenu();
                    void moveTo(group.workspace.id);
                  }}
                >
                  <span className="truncate">{group.workspace.name}</span>
                </button>
              )}
              {group.benches.map((bench) => (
                <button
                  key={`move-bench-${group.workspace.id}-${bench.folderId}`}
                  type="button"
                  className={`${ROW_CLASS} pl-6`}
                  onClick={() => {
                    closeMenu();
                    void moveToBench(group.workspace.id, bench);
                  }}
                >
                  <FolderOpen
                    className="h-3.5 w-3.5 shrink-0 text-gray-400"
                    aria-hidden="true"
                  />
                  <span className="truncate">{bench.title}</span>
                </button>
              ))}
              {group.isLoadingBenches && group.benches.length === 0 ? (
                <div className="flex items-center gap-2 py-1 pl-6 pr-2 text-xs text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Loading workbenches…
                </div>
              ) : null}
            </div>
          );
        })
      )}
      <div className="my-1 h-px bg-black/10 dark:bg-white/10" />
      <div className={HEADING_CLASS}>Share permanently</div>
      {shareTargets.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-gray-500">
          Create another workplace first.
        </div>
      ) : (
        shareTargets.map((workspace) => (
          <button
            key={`share-${workspace.id}`}
            type="button"
            className={ROW_CLASS}
            onClick={() => {
              closeMenu();
              void assignContentToWorkspace(workspace.id, tab.contentId, {
                assignmentType: "shared",
                scope: tab.contentType === "folder" ? "recursive" : "item",
              });
            }}
          >
            <span className="truncate">{workspace.name}</span>
          </button>
        ))
      )}
    </>
  );
}
