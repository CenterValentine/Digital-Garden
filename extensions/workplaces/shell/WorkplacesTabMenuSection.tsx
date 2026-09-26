"use client";

import { useEffect } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ExtensionShellTabMenuSectionProps } from "@/lib/extensions/types";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import {
  copyTreeItems,
  ensureAltTracker,
} from "@/lib/features/content/tree-clipboard";
import { useTabMoveTargets, type BenchTarget } from "./use-tab-move-targets";

const HEADING_CLASS =
  "px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500";
const ROW_CLASS =
  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10";

export function WorkplacesTabMenuSection({
  tab,
  closeMenu,
}: ExtensionShellTabMenuSectionProps) {
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

  // The menu section only mounts while the menu is open, so fetching is
  // always on.
  const { groups, hasAnyTarget, topLevelWorkspaces } = useTabMoveTargets(true);

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
