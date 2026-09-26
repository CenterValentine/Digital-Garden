"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import {
  normalizeWorkbenchSettings,
  type ContentWorkspaceResponse,
  type WorkbenchFolderOption,
} from "@/extensions/workplaces/server/types";

/** One workbench destination: a folder under a view workplace's root. */
export interface BenchTarget {
  folderId: string;
  title: string;
  /** Existing bench row, or null when the move must materialize it first. */
  workbenchId: string | null;
}

export interface TabMoveTargetGroup {
  /** A top-level workplace (never a bench row). */
  workspace: ContentWorkspaceResponse;
  /**
   * The tab already lives here (or in one of its benches): the workplace row
   * is not a destination, its benches still are — the most common move.
   */
  isCurrent: boolean;
  isLoadingBenches: boolean;
  benches: BenchTarget[];
}

type ApiResponse<T> = { success: boolean; data?: T };

/**
 * Which top-level workplaces can host workbenches: views (not Main) with the
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
 * store already knows under that parent — deeper-layer benches only exist in
 * the store, and the store answers before the fetch does.
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

/**
 * Destinations a tab in the active workplace can move to, grouped by
 * top-level workplace with benches beneath. Shared by the tab context menu
 * and the drag-and-drop panel so both list the same targets in the same
 * order. Root-layer bench folders are fetched per bench-capable view
 * workplace while `enabled` is true (menu / panel open) — a folder needs no
 * bench row yet to be a destination; the move materializes it.
 */
export function useTabMoveTargets(
  enabled: boolean,
  /**
   * `excludeActive` (default true) drops the active bench from its parent's
   * list — a tab cannot move to where it already is. Content SENT from the
   * tree can land in the active bench, so that caller passes false.
   */
  options: { excludeActive?: boolean } = {},
) {
  const excludeActive = options.excludeActive ?? true;
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  // Workbench rows live in the flat list too; only top-level rows start a
  // group.
  const topLevelWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          workspace.parentWorkspaceId === null && workspace.status === "active",
      ),
    [workspaces],
  );

  const [foldersByParent, setFoldersByParent] = useState<
    Record<string, WorkbenchFolderOption[]>
  >({});
  const benchHostKey = topLevelWorkspaces
    .filter(canHostBenches)
    .map((workspace) => workspace.id)
    .join(",");
  useEffect(() => {
    if (!enabled || !benchHostKey) return;
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
  }, [benchHostKey, enabled]);

  // Only the exact active row is excluded: from a bench, its parent
  // workplace is still a destination (moving out of the bench).
  const groups = useMemo<TabMoveTargetGroup[]>(
    () =>
      topLevelWorkspaces.map((workspace) => ({
        workspace,
        isCurrent: workspace.id === activeWorkspaceId,
        isLoadingBenches:
          canHostBenches(workspace) && foldersByParent[workspace.id] === undefined,
        benches: collectBenchTargets(
          workspace,
          workspaces,
          foldersByParent[workspace.id],
        ).filter(
          (bench) => !excludeActive || bench.workbenchId !== activeWorkspaceId,
        ),
      })),
    [activeWorkspaceId, excludeActive, foldersByParent, topLevelWorkspaces, workspaces],
  );

  const hasAnyTarget = groups.some(
    (group) => !group.isCurrent || group.benches.length > 0,
  );

  return { groups, hasAnyTarget, topLevelWorkspaces };
}
