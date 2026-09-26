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
 * Root-layer bench folders per parent, kept across menu/panel opens.
 *
 * A drop panel that fills in while the pointer is already over it moves the
 * destination under the cursor — rows arriving late pushed the list down
 * mid-drag (owner report, 2026-09-26). So lists are fetched when a DRAG
 * STARTS (`usePrefetchTabMoveTargets`), consumers seed from this cache
 * synchronously, and a refresh only re-renders rows that actually changed.
 * Stale entries are still shown while a refresh is in flight.
 */
const BENCH_FOLDER_CACHE_TTL_MS = 60_000;
const benchFolderCache = new Map<
  string,
  { folders: WorkbenchFolderOption[]; fetchedAt: number }
>();
const benchFolderInFlight = new Map<string, Promise<WorkbenchFolderOption[]>>();

function fetchBenchFolders(parentId: string) {
  const inFlight = benchFolderInFlight.get(parentId);
  if (inFlight) return inFlight;
  const request = fetch(`/api/content/workspaces/${parentId}/workbenches`, {
    credentials: "include",
  })
    .then(async (response) => {
      const result = (await response.json()) as ApiResponse<
        WorkbenchFolderOption[]
      >;
      return response.ok && result.success && result.data ? result.data : [];
    })
    .catch((): WorkbenchFolderOption[] => [])
    .then((folders) => {
      benchFolderCache.set(parentId, { folders, fetchedAt: Date.now() });
      return folders;
    })
    .finally(() => {
      benchFolderInFlight.delete(parentId);
    });
  benchFolderInFlight.set(parentId, request);
  return request;
}

function isFresh(parentId: string) {
  const entry = benchFolderCache.get(parentId);
  return entry !== undefined && Date.now() - entry.fetchedAt < BENCH_FOLDER_CACHE_TTL_MS;
}

function benchHostKey(workspaces: ContentWorkspaceResponse[]) {
  return workspaces
    .filter(
      (workspace) =>
        workspace.parentWorkspaceId === null &&
        workspace.status === "active" &&
        canHostBenches(workspace),
    )
    .map((workspace) => workspace.id)
    .join(",");
}

/**
 * Warm the bench-folder cache while a drag is in progress, before any panel
 * opens — the 150 ms trigger dwell plus travel time usually covers the
 * round-trip, so the panel opens complete.
 */
export function usePrefetchTabMoveTargets(active: boolean) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const hostKey = benchHostKey(workspaces);
  useEffect(() => {
    if (!active || !hostKey) return;
    for (const parentId of hostKey.split(",")) {
      if (!isFresh(parentId)) void fetchBenchFolders(parentId);
    }
  }, [active, hostKey]);
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

function snapshotFromCache(hostKey: string) {
  const snapshot: Record<string, WorkbenchFolderOption[]> = {};
  if (!hostKey) return snapshot;
  for (const parentId of hostKey.split(",")) {
    const entry = benchFolderCache.get(parentId);
    if (entry) snapshot[parentId] = entry.folders;
  }
  return snapshot;
}

/**
 * Destinations a tab in the active workplace can move to, grouped by
 * top-level workplace with benches beneath. Shared by the tab context menu
 * and the drag-and-drop panel so both list the same targets in the same
 * order. Seeds from the bench-folder cache synchronously and refreshes stale
 * parents while `enabled` (menu / panel open) — a folder needs no bench row
 * yet to be a destination; the move materializes it.
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

  const hostKey = benchHostKey(workspaces);
  const [foldersByParent, setFoldersByParent] = useState<
    Record<string, WorkbenchFolderOption[]>
  >(() => snapshotFromCache(hostKey));
  useEffect(() => {
    if (!enabled || !hostKey) return;
    let cancelled = false;
    for (const parentId of hostKey.split(",")) {
      const request = isFresh(parentId)
        ? Promise.resolve(benchFolderCache.get(parentId)?.folders ?? [])
        : fetchBenchFolders(parentId);
      void request.then((folders) => {
        if (cancelled) return;
        setFoldersByParent((current) =>
          // Identity check: an unchanged list must not re-render rows.
          current[parentId] === folders
            ? current
            : { ...current, [parentId]: folders },
        );
      });
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, hostKey]);

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
