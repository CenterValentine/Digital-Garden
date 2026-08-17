"use client";

import { create } from "zustand";
import { toast } from "sonner";
import {
  useContentStore,
  type ContentSelectionOptions,
  type WorkspaceLayoutMode,
  type WorkspacePaneId,
} from "@/state/content-store";
import {
  useTreeStateStore,
  type TreeStateSnapshot,
} from "@/state/tree-state-store";
import { useWorkspaceTabFilterStore } from "@/state/workspace-tab-filter-store";
import type {
  ContentWorkspaceResponse,
  WorkspaceLayoutRecordSummary,
  WorkspaceOpenConflict,
  WorkspaceOpenIntentResponse,
  WorkspaceStatePayload,
} from "@/extensions/workplaces/server";
import type {
  ContentWorkspaceItemAssignmentType,
  ContentWorkspaceItemScope,
} from "@/lib/database/generated/prisma";
import { warmContentSummaryCache } from "@/lib/domain/content/content-summary-cache";
import {
  detectWorkspaceSurfaceFamily,
  getDeviceId,
} from "./surface-family";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

interface PendingOpenIntent {
  contentId: string;
  options: ContentSelectionOptions;
}

interface WorkspaceState {
  workspaces: ContentWorkspaceResponse[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  /**
   * True once loadWorkspaces has completed at least once (success or
   * failure). Use this as a one-shot "store is ready" signal to gate
   * downstream fetches whose URL depends on activeWorkspaceId — they
   * would otherwise double-fetch (once for the initial null id, once
   * after the store hydrates with the real id). Stays true for the
   * rest of the session.
   */
  hasLoadedOnce: boolean;
  conflict: WorkspaceOpenConflict | null;
  pendingOpenIntent: PendingOpenIntent | null;
  loadWorkspaces: (initialWorkspaceId?: string | null) => Promise<void>;
  activateWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<ContentWorkspaceResponse>;
  duplicateWorkspace: (
    workspaceId: string,
  ) => Promise<ContentWorkspaceResponse>;
  updateWorkspace: (
    workspaceId: string,
    updates: {
      name?: string;
      isLocked?: boolean;
      expiresAt?: string | null;
      settings?: Record<string, unknown>;
      viewRootContentId?: string | null;
    },
  ) => Promise<void>;
  reorderWorkspaces: (workspaceIds: string[]) => Promise<void>;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  persistActiveWorkspace: () => Promise<void>;
  requestOpenContent: (
    contentId: string,
    options?: ContentSelectionOptions,
  ) => Promise<void>;
  borrowPendingContent: (
    expiresAt: string,
    options?: { useFolderScope?: boolean },
  ) => Promise<void>;
  sharePendingContent: (options?: {
    useFolderScope?: boolean;
  }) => Promise<void>;
  switchToConflictWorkspace: () => Promise<void>;
  cancelOpenConflict: () => void;
  assignContentToWorkspace: (
    workspaceId: string,
    contentId: string,
    options: {
      assignmentType: ContentWorkspaceItemAssignmentType;
      scope?: ContentWorkspaceItemScope;
      expiresAt?: string | null;
      moveFromWorkspaceId?: string | null;
    },
  ) => Promise<void>;
  unassignContentFromWorkspace: (
    workspaceId: string,
    contentId: string,
  ) => Promise<void>;
  resetWorkspaces: () => Promise<void>;
  receiveRefreshedWorkspaces: (workspaces: ContentWorkspaceResponse[]) => void;
}

let isBypassingWorkspaceGuard = false;
// Tracks the updatedAt we last applied from this tab so receiveRefreshedWorkspaces
// can detect when another tab saved a newer pane state.
const lastAppliedUpdatedAt: Record<string, string> = {};

/**
 * Echo suppression (preview smoke 2026-08-16): after restoreContentWorkspace
 * applies remote state, the resulting snapshot-key change fires the persist
 * controller — the follower would re-persist content it just adopted. Benign
 * when both windows run the same code, but it's the fuel any adopt/persist
 * loop runs on (observed as layout ping-pong during a mixed-bundle rolling
 * deploy). Recording the post-apply snapshot lets persistActiveWorkspace skip
 * the write when nothing changed beyond the adoption itself; the moment the
 * user makes a real change, the snapshot differs and persistence resumes.
 */
const lastAppliedSnapshotJson: Record<string, string> = {};
let onMutationBroadcast: (() => void) | null = null;
const WORKSPACE_MUTATION_TIMEOUT_MS = 12_000;
export function registerMutationBroadcast(fn: () => void) {
  onMutationBroadcast = fn;
}
function notifyMutation() {
  onMutationBroadcast?.();
}
const WORKSPACE_EXPIRATION_WARNINGS_DISABLED_KEY =
  "workspace-expiration-warnings-disabled";

function expirationWarningsDisabled() {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(WORKSPACE_EXPIRATION_WARNINGS_DISABLED_KEY) ===
    "true"
  );
}

function disableExpirationWarnings() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    WORKSPACE_EXPIRATION_WARNINGS_DISABLED_KEY,
    "true",
  );
}

function notifyExpirationWarning(title: string, description: string) {
  if (expirationWarningsDisabled()) return;
  toast.warning(title, {
    description,
    action: {
      label: "Don't warn again",
      onClick: () => disableExpirationWarnings(),
    },
  });
}

function getTreeSnapshotByWorkspace() {
  if (typeof window === "undefined") return {};
  const rawValue = window.localStorage.getItem(
    "workspace-tree-state-snapshots",
  );
  if (!rawValue) return {};
  try {
    return JSON.parse(rawValue) as Record<string, TreeStateSnapshot>;
  } catch {
    return {};
  }
}

function saveTreeSnapshotForWorkspace(workspaceId: string | null) {
  if (typeof window === "undefined" || !workspaceId) return;
  const snapshots = getTreeSnapshotByWorkspace();
  snapshots[workspaceId] = useTreeStateStore.getState().getSnapshot();
  window.localStorage.setItem(
    "workspace-tree-state-snapshots",
    JSON.stringify(snapshots),
  );
}

function restoreTreeSnapshotForWorkspace(workspaceId: string | null) {
  if (!workspaceId) return;
  const snapshots = getTreeSnapshotByWorkspace();
  useTreeStateStore.getState().restoreSnapshot(snapshots[workspaceId]);
}

// Persist the active workspace id so it survives navigations that drop the
// `?workspace=` URL param (e.g. visiting Settings then hitting Back). Without
// this, those round-trips fall back to the Main Workspace even though the
// last-selected file restores.
const ACTIVE_WORKSPACE_ID_KEY = "workspace-active-id";

function readPersistedActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_WORKSPACE_ID_KEY);
}

function writePersistedActiveWorkspaceId(workspaceId: string | null) {
  if (typeof window === "undefined") return;
  if (workspaceId) {
    window.localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, workspaceId);
  } else {
    window.localStorage.removeItem(ACTIVE_WORKSPACE_ID_KEY);
  }
}

function isOfflineLikePersistenceError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    message.includes("Can't reach database server") ||
    message.includes("Failed to fetch")
  );
}

async function parseResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.error?.message ?? fallback);
  }
  return result.data;
}

function getMainWorkspace(workspaces: ContentWorkspaceResponse[]) {
  return (
    workspaces.find((workspace) => workspace.isMain) ?? workspaces[0] ?? null
  );
}

function getWorkspaceOrder(workspaces: ContentWorkspaceResponse[]) {
  const mainWorkspace = getMainWorkspace(workspaces);
  const order = mainWorkspace?.settings.workspaceOrder;
  return Array.isArray(order)
    ? order.filter((value): value is string => typeof value === "string")
    : [];
}

function applyWorkspaceOrder(workspaces: ContentWorkspaceResponse[]) {
  const mainWorkspace = getMainWorkspace(workspaces);
  const nonMainWorkspaces = workspaces.filter((workspace) => !workspace.isMain);
  const order = getWorkspaceOrder(workspaces);
  const orderIndex = new Map(
    order.map((workspaceId, index) => [workspaceId, index]),
  );
  const originalIndex = new Map(
    nonMainWorkspaces.map((workspace, index) => [workspace.id, index]),
  );

  const orderedWorkspaces = [...nonMainWorkspaces].sort((a, b) => {
    const aOrder = orderIndex.get(a.id);
    const bOrder = orderIndex.get(b.id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
  });

  return mainWorkspace
    ? [mainWorkspace, ...orderedWorkspaces]
    : orderedWorkspaces;
}

function getWorkspace(
  workspaces: ContentWorkspaceResponse[],
  workspaceId: string | null,
) {
  return (
    workspaces.find((workspace) => workspace.id === workspaceId) ??
    getMainWorkspace(workspaces)
  );
}

function hasWorkspace(
  workspaces: ContentWorkspaceResponse[],
  workspaceId: string | null,
) {
  return Boolean(
    workspaceId && workspaces.some((workspace) => workspace.id === workspaceId),
  );
}

function isWorkspaceNotFoundError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("workspace not found")
  );
}

function readContentIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("content");
  return value && value.length > 0 ? value : null;
}

/**
 * Layout-intent P2: persist THIS surface's per-family layout record
 * (R2/R8). Ordinal mapping per spec §4. Best-effort by design — a record
 * failure must never break the primary persist path.
 */
async function putLayoutRecord(
  workspaceId: string,
  family: string,
  snapshot: WorkspaceStatePayload,
) {
  try {
    const ordinalPanes: Record<string, string[]> = {
      single: ["top-left"],
      "dual-vertical": ["top-left", "top-right"],
      "dual-horizontal": ["top-left", "bottom-left"],
      quad: ["top-left", "top-right", "bottom-left", "bottom-right"],
    };
    const panes = ordinalPanes[snapshot.layoutMode] ?? ordinalPanes.single;
    const paneOrder = panes.map((paneId, index) => ({
      paneOrdinal: index + 1,
      tabOrder:
        snapshot.paneTabContentIds[
          paneId as keyof typeof snapshot.paneTabContentIds
        ]?.contentIds ?? [],
    }));
    const activeOrdinal = Math.max(1, panes.indexOf(snapshot.activePaneId) + 1);
    const activeContentId =
      snapshot.paneTabContentIds[snapshot.activePaneId]?.activeContentId ??
      snapshot.activeContentId;
    await fetch(`/api/content/workspaces/${workspaceId}/layout-records`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        family,
        deviceId: getDeviceId(),
        record: {
          layoutMode: snapshot.layoutMode,
          paneOrder,
          lastActive: activeContentId
            ? { paneOrdinal: activeOrdinal, contentId: activeContentId }
            : null,
        },
      }),
    });
  } catch {
    // Best-effort by design; see docstring.
  }
}

/** Spec §4 pane ordinals per layout (1-indexed; primary = top-left). */
const ORDINAL_PANE_IDS: Record<WorkspaceLayoutMode, WorkspacePaneId[]> = {
  single: ["top-left"],
  "dual-vertical": ["top-left", "top-right"],
  "dual-horizontal": ["top-left", "bottom-left"],
  quad: ["top-left", "top-right", "bottom-left", "bottom-right"],
};

/**
 * Rebuild pane assignments from a layout record against the CURRENT membership
 * set (ordinal mapping per spec §4; membership tabs the record predates land
 * in the primary pane). Shared by open-time inheritance (R5) and the live
 * desktop coupling reconcile (R2).
 */
function buildPanesFromLayoutRecord(
  record: WorkspaceLayoutRecordSummary,
  openTabIds: string[],
): {
  layoutMode: WorkspaceLayoutMode;
  panes: WorkspacePaneId[];
  paneTabContentIds: Partial<Record<WorkspacePaneId, string[]>>;
} {
  const panes = ORDINAL_PANE_IDS[record.layoutMode] ?? ORDINAL_PANE_IDS.single;
  const membershipSet = new Set(openTabIds);
  const placed = new Set<string>();
  const rebuilt: Partial<Record<WorkspacePaneId, string[]>> = {};
  for (const pane of record.paneOrder) {
    const paneId =
      panes[Math.min(Math.max(pane.paneOrdinal, 1), panes.length) - 1];
    for (const id of pane.tabOrder) {
      if (!membershipSet.has(id) || placed.has(id)) continue;
      (rebuilt[paneId] ??= []).push(id);
      placed.add(id);
    }
  }
  for (const id of openTabIds) {
    if (!placed.has(id)) {
      (rebuilt[panes[0]] ??= []).push(id);
      placed.add(id);
    }
  }
  return { layoutMode: record.layoutMode, panes, paneTabContentIds: rebuilt };
}

/**
 * R5 inheritance chain (spec §5): this surface's own record → the shared
 * desktop record → most recent extension → most recent mobile. Records arrive
 * newest-first from the server (and pre-filtered to <30d), so `find` returns
 * the freshest match per rung. Null = fall through to the legacy blob.
 */
function pickInheritedLayout(
  records: WorkspaceLayoutRecordSummary[] | undefined,
): WorkspaceLayoutRecordSummary | null {
  if (!records?.length) return null;
  const family = detectWorkspaceSurfaceFamily();
  const deviceId = family === "desktop" ? "shared" : getDeviceId();
  return (
    records.find((r) => r.family === family && r.deviceId === deviceId) ??
    records.find((r) => r.family === "desktop") ??
    records.find((r) => r.family.startsWith("ext:")) ??
    records.find(
      (r) => r.family.startsWith("native-") || r.family.startsWith("web-"),
    ) ??
    null
  );
}

function restoreContentWorkspace(
  workspace: ContentWorkspaceResponse,
  // Background reconcile (receiveRefreshedWorkspaces) re-applies the remote
  // snapshot to keep the open-tab SET in sync across windows — but it must not
  // yank the active tab away from what the local user is currently viewing.
  // When set and still an open tab in the snapshot, this wins as the active
  // selection, so a poll/visibility refresh can't revert a fresh tab click.
  preferActiveContentId?: string | null,
  // Layout-intent P2b (R3): background reconciles sync the open-tab SET only.
  // "reconcile" preserves this session's layoutMode + activePaneId — another
  // surface persisting its layout must never re-arrange the one you're
  // looking at (the phone↔desktop revert fight, ghost-writer #5). "open"
  // (workspace open/switch/reset) applies the full stored state.
  mode: "open" | "reconcile" = "open",
) {
  const paneTabContentIds = Object.fromEntries(
    Object.entries(workspace.paneState.paneTabContentIds).map(
      ([paneId, pane]) => [paneId, pane?.contentIds ?? []],
    ),
  );

  // Cold-load race: the workspace API can resolve before
  // MainPanelWorkspace's URL parser runs. If the URL specifies a
  // content id that belongs to this workspace, it must win as the
  // active tab — otherwise the user deep-links to a tab but watches
  // it load LAST while the persisted active tab loads first. Gating
  // on workspace membership avoids regressing the manual workspace
  // switch path, where `syncWorkspaceUrl` leaves a stale `content=`
  // in the URL from the previous workspace.
  const contentIdFromUrl = readContentIdFromUrl();
  const urlContentBelongsToWorkspace =
    contentIdFromUrl !== null &&
    workspace.items.some((item) => item.contentId === contentIdFromUrl);
  const openTabIds = Object.values(paneTabContentIds).flat();
  const preferStillOpen =
    preferActiveContentId != null &&
    openTabIds.includes(preferActiveContentId);
  const activeContentId = preferStillOpen
    ? preferActiveContentId
    : urlContentBelongsToWorkspace
      ? contentIdFromUrl
      : workspace.paneState.activeContentId;

  // Per-content title + type from the snapshot so tabs paint named on the
  // first frame (spec §3.8) — no "Loading…" tab label, no post-mount fetch.
  // contentMeta covers the full open-tab set (superset of items), so tabs that
  // aren't formal workspace assignments are still named.
  const tabMeta = workspace.contentMeta ?? {};

  // Reconcile mode: keep this session's own arrangement (R3) — only the tab
  // set and titles refresh. Open mode: run the R5 inheritance chain over the
  // fresh layout records; the legacy blob is the terminal fallback (and stays
  // authoritative for the tab SET either way).
  const local = useContentStore.getState();
  let applyLayoutMode =
    mode === "reconcile" ? local.layoutMode : workspace.paneState.layoutMode;
  let applyActivePaneId =
    mode === "reconcile" ? local.activePaneId : workspace.paneState.activePaneId;
  let applyPaneTabContentIds = paneTabContentIds;
  let applyActiveContentId = activeContentId;

  const inherited =
    mode === "open" ? pickInheritedLayout(workspace.layoutRecords) : null;
  if (inherited) {
    const built = buildPanesFromLayoutRecord(inherited, openTabIds);
    applyLayoutMode = built.layoutMode;
    applyPaneTabContentIds = built.paneTabContentIds as typeof paneTabContentIds;
    const seed = inherited.lastActive;
    applyActivePaneId = seed
      ? built.panes[
          Math.min(Math.max(seed.paneOrdinal, 1), built.panes.length) - 1
        ]
      : built.panes[0];
    // Active-tab precedence is unchanged (URL deep-link, then local
    // preference); the record's lastActive is only the seed of last resort —
    // R3: inherited, never synced.
    if (!preferStillOpen && !urlContentBelongsToWorkspace) {
      applyActiveContentId =
        seed && new Set(openTabIds).has(seed.contentId)
          ? seed.contentId
          : activeContentId;
    }
  }

  // R2 live desktop coupling: concurrently-open desktop windows mirror the
  // shared desktop record's layout + pane order. The background reconcile
  // (fired when another window's save bumps updatedAt) follows the record for
  // ARRANGEMENT only — the active tab/pane stay this window's own (R3 keeps
  // active views independent "even on matching desktop"). Non-desktop
  // families keep the pure set-only reconcile.
  if (mode === "reconcile" && detectWorkspaceSurfaceFamily() === "desktop") {
    const desktopRecord = workspace.layoutRecords?.find(
      (r) => r.family === "desktop",
    );
    if (desktopRecord) {
      const built = buildPanesFromLayoutRecord(desktopRecord, openTabIds);
      applyLayoutMode = built.layoutMode;
      applyPaneTabContentIds = built.paneTabContentIds as typeof paneTabContentIds;
      // Keep this window's active pane when it still exists in the incoming
      // layout; otherwise clamp to the primary pane.
      if (!built.panes.includes(applyActivePaneId)) {
        applyActivePaneId = built.panes[0];
      }
    }
  }

  isBypassingWorkspaceGuard = true;
  try {
    useContentStore.getState().restoreWorkspace({
      activeContentId: applyActiveContentId,
      activePaneId: applyActivePaneId,
      layoutMode: applyLayoutMode,
      paneTabContentIds: applyPaneTabContentIds,
      tabMeta,
    });
  } finally {
    isBypassingWorkspaceGuard = false;
  }

  // Echo suppression: record what this apply produced so the persist
  // controller's follow-up fire can recognize "nothing changed but the
  // adoption" and skip the write (see lastAppliedSnapshotJson).
  lastAppliedSnapshotJson[workspace.id] = JSON.stringify(
    useContentStore.getState().getWorkspaceStateSnapshot(),
  );
}

function syncWorkspaceUrl(workspaceId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (workspaceId) {
    url.searchParams.set("workspace", workspaceId);
  } else {
    url.searchParams.delete("workspace");
  }
  window.history.replaceState({}, "", url);
}

function directOpenContent(
  contentId: string,
  options: ContentSelectionOptions = {},
) {
  isBypassingWorkspaceGuard = true;
  try {
    if (options.paneId) {
      useContentStore
        .getState()
        .openContentInPane(contentId, options.paneId, options);
    } else {
      useContentStore.getState().setSelectedContentId(contentId, options);
    }
  } finally {
    isBypassingWorkspaceGuard = false;
  }
}

function isContentAlreadyInWorkspace(
  workspace: ContentWorkspaceResponse | null,
  contentId: string,
) {
  return Boolean(workspace?.items.some((item) => item.contentId === contentId));
}

function closeReleasedBorrowedTabs(
  previousWorkspaces: ContentWorkspaceResponse[],
  nextWorkspaces: ContentWorkspaceResponse[],
  activeWorkspaceId: string | null,
) {
  const previous = getWorkspace(previousWorkspaces, activeWorkspaceId);
  const next = getWorkspace(nextWorkspaces, activeWorkspaceId);
  if (!previous || !next) return;

  const nextItemIds = new Set(next.items.map((item) => item.contentId));
  const releasedBorrowedContentIds = previous.items
    .filter(
      (item) =>
        item.assignmentType === "borrowed" && !nextItemIds.has(item.contentId),
    )
    .map((item) => item.contentId);

  if (releasedBorrowedContentIds.length > 0) {
    useContentStore.getState().closeContentTabs(releasedBorrowedContentIds);
  }

  const expiredBorrowedItems = previous.items.filter(
    (item) =>
      item.assignmentType === "borrowed" &&
      item.expiresAt &&
      new Date(item.expiresAt).getTime() <= Date.now() &&
      !nextItemIds.has(item.contentId),
  );

  if (expiredBorrowedItems.length > 0) {
    const firstTitle =
      expiredBorrowedItems[0]?.content.title ?? "A borrowed tab";
    const suffix =
      expiredBorrowedItems.length > 1
        ? ` and ${expiredBorrowedItems.length - 1} more`
        : "";
    notifyExpirationWarning(
      "Borrowed tab expired",
      `${firstTitle}${suffix} was released because its borrow window ended.`,
    );
  }
}

function notifyExpiredWorkspaceRemoval(
  previousWorkspaces: ContentWorkspaceResponse[],
  nextWorkspaces: ContentWorkspaceResponse[],
) {
  const nextWorkspaceIds = new Set(
    nextWorkspaces.map((workspace) => workspace.id),
  );
  const expiredWorkspaces = previousWorkspaces.filter(
    (workspace) =>
      !workspace.isMain &&
      !nextWorkspaceIds.has(workspace.id) &&
      workspace.expiresAt &&
      new Date(workspace.expiresAt).getTime() <= Date.now(),
  );

  if (expiredWorkspaces.length === 0) return;

  const firstName = expiredWorkspaces[0]?.name ?? "A workspace";
  const suffix =
    expiredWorkspaces.length > 1
      ? ` and ${expiredWorkspaces.length - 1} more`
      : "";
  notifyExpirationWarning(
    "Workspace expired",
    `${firstName}${suffix} reached its expiration time and was closed. Workspace sessions cannot be recovered.`,
  );
}

async function fetchWorkspaces() {
  const response = await fetch("/api/content/workspaces", {
    credentials: "include",
  });
  return parseResponse<ContentWorkspaceResponse[]>(
    response,
    "Failed to fetch workspaces",
  ).then(applyWorkspaceOrder);
}

async function fetchWorkspaceMutation(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = WORKSPACE_MUTATION_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Workspace save timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function persistWorkspaceStateById(
  workspaceId: string,
  snapshot: WorkspaceStatePayload,
) {
  const response = await fetchWorkspaceMutation(
    `/api/content/workspaces/${workspaceId}/state`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    },
  );

  return parseResponse<ContentWorkspaceResponse>(
    response,
    "Failed to save workspace state",
  );
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  isLoading: false,
  hasLoadedOnce: false,
  conflict: null,
  pendingOpenIntent: null,

  loadWorkspaces: async (initialWorkspaceId) => {
    set({ isLoading: true });
    const previousWorkspaces = get().workspaces;
    try {
      const workspaces = await fetchWorkspaces();
      notifyExpiredWorkspaceRemoval(previousWorkspaces, workspaces);
      const requestedWorkspace =
        (initialWorkspaceId &&
          workspaces.find(
            (workspace) => workspace.id === initialWorkspaceId,
          )) ||
        getWorkspace(workspaces, get().activeWorkspaceId) ||
        // Fall back to the last active workspace persisted across reloads —
        // covers navigations that drop the `?workspace=` URL param.
        getWorkspace(workspaces, readPersistedActiveWorkspaceId());
      const activeWorkspace =
        requestedWorkspace ?? getMainWorkspace(workspaces);

      closeReleasedBorrowedTabs(
        previousWorkspaces,
        workspaces,
        activeWorkspace?.id ?? null,
      );

      set({
        workspaces,
        activeWorkspaceId: activeWorkspace?.id ?? null,
        isLoading: false,
        hasLoadedOnce: true,
      });
      writePersistedActiveWorkspaceId(activeWorkspace?.id ?? null);

      warmContentSummaryCache(
        workspaces.flatMap((ws) => ws.items.map((item) => item.content)),
      );

      if (activeWorkspace) {
        lastAppliedUpdatedAt[activeWorkspace.id] = activeWorkspace.updatedAt;
        syncWorkspaceUrl(activeWorkspace.id);
        if (useContentStore.getState().openContentIds.length === 0) {
          restoreContentWorkspace(activeWorkspace);
        }
        // Order-independent title backfill (spec §3.8): the URL-restore path
        // in MainPanelWorkspace can create tabs (from the `tabs_*` URL params)
        // before this snapshot resolves, in which case the guard above skips
        // restoreContentWorkspace and those tabs are stuck on "Loading…".
        // contentMeta covers the full open-tab set, so this names every tab
        // regardless of which restore path created it.
        useContentStore
          .getState()
          .backfillTabMeta(activeWorkspace.contentMeta ?? {});

        restoreTreeSnapshotForWorkspace(activeWorkspace.id);
      }
    } catch (error) {
      console.error("[Workspace Store] Failed to load workspaces:", error);
      // hasLoadedOnce flips even on failure — the gate is "did we
      // attempt", not "did we succeed". Downstream fetches that need
      // workspace context will run with whatever defaults the store
      // settles on, rather than waiting forever.
      set({ isLoading: false, hasLoadedOnce: true });
    }
  },

  activateWorkspace: async (workspaceId) => {
    const previousActiveWorkspaceId = get().activeWorkspaceId;
    const previousSnapshot = useContentStore
      .getState()
      .getWorkspaceStateSnapshot();
    saveTreeSnapshotForWorkspace(previousActiveWorkspaceId);

    const currentWorkspaces = get().workspaces;
    let workspace = currentWorkspaces.find(
      (candidate) => candidate.id === workspaceId,
    );
    if (!workspace) {
      const refreshedWorkspaces = await fetchWorkspaces();
      set({ workspaces: refreshedWorkspaces });
      workspace = refreshedWorkspaces.find(
        (candidate) => candidate.id === workspaceId,
      );
    }
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    set({
      activeWorkspaceId: workspace.id,
      conflict: null,
      pendingOpenIntent: null,
    });
    writePersistedActiveWorkspaceId(workspace.id);
    lastAppliedUpdatedAt[workspace.id] = workspace.updatedAt;
    syncWorkspaceUrl(workspace.id);
    restoreContentWorkspace(workspace);
    restoreTreeSnapshotForWorkspace(workspace.id);

    // If the workspace was persisted without an activeContentId but has open
    // tabs, derive the right-panel target from the active pane's first tab —
    // the same thing clicking a tab would do.
    {
      const cs = useContentStore.getState();
      if (!cs.selectedContentId && cs.openContentIds.length > 0) {
        const pane = cs.panes[cs.activePaneId];
        const tabId = pane?.activeTabId ?? pane?.tabIds[0];
        if (tabId) {
          useContentStore.getState().activateContentTab(tabId);
        }
      }
    }

    if (
      previousActiveWorkspaceId &&
      hasWorkspace(currentWorkspaces, previousActiveWorkspaceId) &&
      previousActiveWorkspaceId !== workspace.id
    ) {
      void persistWorkspaceStateById(
        previousActiveWorkspaceId,
        previousSnapshot,
      )
        .then((persistedWorkspace) => {
          set((state) => ({
            workspaces: state.workspaces.map((candidate) =>
              candidate.id === persistedWorkspace.id
                ? persistedWorkspace
                : candidate,
            ),
          }));
        })
        .catch(async (error) => {
          if (!isWorkspaceNotFoundError(error)) {
            console.error(
              "[Workspace Store] Failed to persist previous workspace:",
              error,
            );
            return;
          }

          const refreshedWorkspaces = await fetchWorkspaces();
          set((state) => ({
            workspaces: refreshedWorkspaces,
            activeWorkspaceId: hasWorkspace(
              refreshedWorkspaces,
              state.activeWorkspaceId,
            )
              ? state.activeWorkspaceId
              : (getMainWorkspace(refreshedWorkspaces)?.id ?? null),
          }));
        });
    }
  },

  createWorkspace: async (name) => {
    const response = await fetch("/api/content/workspaces", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to create workspace",
    );
    set((state) => ({
      workspaces: applyWorkspaceOrder([
        workspace,
        ...state.workspaces.filter(
          (candidate) => candidate.id !== workspace.id,
        ),
      ]),
    }));
    notifyMutation();
    await get().activateWorkspace(workspace.id);
    return (
      get().workspaces.find((candidate) => candidate.id === workspace.id) ??
      workspace
    );
  },

  duplicateWorkspace: async (workspaceId) => {
    const response = await fetch(
      `/api/content/workspaces/${workspaceId}/duplicate`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to duplicate workspace",
    );
    set((state) => ({
      workspaces: applyWorkspaceOrder([
        workspace,
        ...state.workspaces.filter(
          (candidate) => candidate.id !== workspace.id,
        ),
      ]),
    }));
    await get().activateWorkspace(workspace.id);
    return (
      get().workspaces.find((candidate) => candidate.id === workspace.id) ??
      workspace
    );
  },

  updateWorkspace: async (workspaceId, updates) => {
    const previousWorkspaces = get().workspaces;
    const existingWorkspace = previousWorkspaces.find(
      (candidate) => candidate.id === workspaceId,
    );

    if (existingWorkspace) {
      const optimisticWorkspace: ContentWorkspaceResponse = {
        ...existingWorkspace,
        name: updates.name ?? existingWorkspace.name,
        isLocked: updates.isLocked ?? existingWorkspace.isLocked,
        expiresAt:
          "expiresAt" in updates
            ? (updates.expiresAt ?? null)
            : existingWorkspace.expiresAt,
        settings: updates.settings
          ? {
              ...existingWorkspace.settings,
              ...updates.settings,
            }
          : existingWorkspace.settings,
        viewRootContentId:
          "viewRootContentId" in updates
            ? (updates.viewRootContentId ?? null)
            : existingWorkspace.viewRootContentId,
        isView:
          "viewRootContentId" in updates
            ? updates.viewRootContentId !== null &&
              updates.viewRootContentId !== undefined
            : existingWorkspace.isView,
        viewRoot:
          "viewRootContentId" in updates && updates.viewRootContentId === null
            ? null
            : existingWorkspace.viewRoot,
      };

      set((state) => ({
        workspaces: applyWorkspaceOrder(
          state.workspaces.map((candidate) =>
            candidate.id === workspaceId ? optimisticWorkspace : candidate,
          ),
        ),
      }));
    }

    const response = await fetchWorkspaceMutation(
      `/api/content/workspaces/${workspaceId}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      },
    );
    try {
      const workspace = await parseResponse<ContentWorkspaceResponse>(
        response,
        "Failed to update workspace",
      );
      set((state) => ({
        workspaces: applyWorkspaceOrder(
          state.workspaces.map((candidate) =>
            candidate.id === workspace.id ? workspace : candidate,
          ),
        ),
      }));
      notifyMutation();
    } catch (error) {
      set({ workspaces: previousWorkspaces });
      throw error;
    }
  },

  reorderWorkspaces: async (workspaceIds) => {
    const currentWorkspaces = get().workspaces;
    const mainWorkspace = getMainWorkspace(currentWorkspaces);
    if (!mainWorkspace) return;

    const uniqueWorkspaceIds = Array.from(
      new Set(
        workspaceIds.filter((workspaceId) =>
          currentWorkspaces.some(
            (workspace) => workspace.id === workspaceId && !workspace.isMain,
          ),
        ),
      ),
    );
    const nextWorkspaces = applyWorkspaceOrder(
      currentWorkspaces.map((workspace) =>
        workspace.id === mainWorkspace.id
          ? {
              ...workspace,
              settings: {
                ...workspace.settings,
                workspaceOrder: uniqueWorkspaceIds,
              },
            }
          : workspace,
      ),
    );

    set({ workspaces: nextWorkspaces });

    const response = await fetch(
      `/api/content/workspaces/${mainWorkspace.id}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...mainWorkspace.settings,
            workspaceOrder: uniqueWorkspaceIds,
          },
        }),
      },
    );
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to save workspace order",
    );
    set((state) => ({
      workspaces: applyWorkspaceOrder(
        state.workspaces.map((candidate) =>
          candidate.id === workspace.id ? workspace : candidate,
        ),
      ),
    }));
  },

  archiveWorkspace: async (workspaceId) => {
    const state = get();
    const workspace = getWorkspace(state.workspaces, workspaceId);
    if (!workspace || workspace.isMain) return;

    const response = await fetch(`/api/content/workspaces/${workspaceId}`, {
      method: "DELETE",
      credentials: "include",
    });
    await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to archive workspace",
    );
    const workspaces = await fetchWorkspaces();
    const archivedActiveWorkspace = workspaceId === state.activeWorkspaceId;
    if (archivedActiveWorkspace) {
      const nextWorkspace = getMainWorkspace(workspaces);
      set({ workspaces, activeWorkspaceId: nextWorkspace?.id ?? null });
      if (nextWorkspace) {
        syncWorkspaceUrl(nextWorkspace.id);
        restoreContentWorkspace(nextWorkspace);
        restoreTreeSnapshotForWorkspace(nextWorkspace.id);
      }
    } else {
      set({ workspaces });
    }
    notifyMutation();
  },

  persistActiveWorkspace: async () => {
    const activeWorkspaceId = get().activeWorkspaceId;
    if (!activeWorkspaceId) return;
    if (!hasWorkspace(get().workspaces, activeWorkspaceId)) return;
    saveTreeSnapshotForWorkspace(activeWorkspaceId);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    const snapshot = useContentStore.getState().getWorkspaceStateSnapshot();

    // Echo suppression: if this snapshot is byte-identical to what we just
    // adopted from remote, there is nothing new to say — skip the write
    // (kills the adopt→persist echo; see lastAppliedSnapshotJson).
    if (
      JSON.stringify(snapshot) === lastAppliedSnapshotJson[activeWorkspaceId]
    ) {
      return;
    }

    // Spec §6.3 (ghost-writer #3): extension iframes never write workspace
    // intent. No legacy PATCH — which would also reconcile R1 membership down
    // to the panel's narrow single-pane snapshot, pruning every other tab —
    // and no shared columns. They persist ONLY their own ext:* layout record,
    // so R5/F2 can still see how the panel arranged itself.
    const surfaceFamily = detectWorkspaceSurfaceFamily();
    if (surfaceFamily.startsWith("ext:")) {
      await putLayoutRecord(activeWorkspaceId, surfaceFamily, snapshot);
      return;
    }

    let workspace: ContentWorkspaceResponse;
    try {
      const response = await fetch(
        `/api/content/workspaces/${activeWorkspaceId}/state`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot satisfies WorkspaceStatePayload),
        },
      );
      workspace = await parseResponse<ContentWorkspaceResponse>(
        response,
        "Failed to save workspace state",
      );
    } catch (error) {
      if (isOfflineLikePersistenceError(error)) return;
      if (!isWorkspaceNotFoundError(error)) throw error;

      const workspaces = await fetchWorkspaces();
      const fallbackWorkspace = getWorkspace(workspaces, null);
      set({
        workspaces,
        activeWorkspaceId: fallbackWorkspace?.id ?? null,
      });
      if (fallbackWorkspace) {
        syncWorkspaceUrl(fallbackWorkspace.id);
        restoreContentWorkspace(fallbackWorkspace);
        restoreTreeSnapshotForWorkspace(fallbackWorkspace.id);
      }
      return;
    }

    // Layout-intent P2: beside the legacy PATCH, persist THIS surface's
    // per-family layout record (desktop → the shared coupling row).
    void putLayoutRecord(activeWorkspaceId, surfaceFamily, snapshot);

    lastAppliedUpdatedAt[workspace.id] = workspace.updatedAt;
    set((state) => ({
      workspaces: state.workspaces.map((candidate) =>
        candidate.id === workspace.id ? workspace : candidate,
      ),
    }));
    notifyMutation();
  },

  requestOpenContent: async (contentId, options = {}) => {
    if (options.contentType === "page-template") {
      directOpenContent(contentId, options);
      return;
    }

    const state = get();
    const activeWorkspace = getWorkspace(
      state.workspaces,
      state.activeWorkspaceId,
    );
    if (!activeWorkspace) {
      directOpenContent(contentId, options);
      return;
    }

    // The Main Workspace is the unrestricted catchall: opens are never gated
    // by other workspaces' claims and mint no claims, so skip the open-intent
    // round trip entirely. The server enforces the same rule for stale-cache
    // callers that POST anyway.
    if (activeWorkspace.isMain) {
      directOpenContent(contentId, options);
      void get()
        .persistActiveWorkspace()
        .catch((error) => {
          console.error(
            "[Workspace Store] Failed to persist active workspace after open:",
            error,
          );
        });
      return;
    }

    if (
      isContentAlreadyInWorkspace(activeWorkspace, contentId) ||
      useContentStore.getState().openContentIds.includes(contentId) ||
      contentId.startsWith("temp-")
    ) {
      directOpenContent(contentId, options);
      return;
    }

    const response = await fetch("/api/content/workspaces/open-intent", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: activeWorkspace.id,
        contentId,
      }),
    });
    const result = await parseResponse<WorkspaceOpenIntentResponse>(
      response,
      "Failed to resolve workspace conflict",
    );

    if (result.allowed) {
      // A covered open (direct assignment or a recursive folder claim held by
      // this workspace) must not create a new item: the upsert would overwrite
      // the existing claim's type (borrowed/shared → primary) or permanently
      // pin a descendant of a folder that was only borrowed.
      if (!result.alreadyCovered) {
        await get().assignContentToWorkspace(activeWorkspace.id, contentId, {
          assignmentType: "primary",
          scope: "item",
        });
      }
      directOpenContent(contentId, options);
      void get()
        .persistActiveWorkspace()
        .catch((error) => {
          console.error(
            "[Workspace Store] Failed to persist active workspace after open:",
            error,
          );
        });
      return;
    }

    set({
      conflict: result.conflict,
      pendingOpenIntent: { contentId, options },
    });
  },

  borrowPendingContent: async (expiresAt, options) => {
    const state = get();
    const activeWorkspaceId = state.activeWorkspaceId;
    const pending = state.pendingOpenIntent;
    const conflict = state.conflict;
    if (!activeWorkspaceId || !pending) return;

    const targetContentId =
      options?.useFolderScope && conflict?.folderScopeContentId
        ? conflict.folderScopeContentId
        : pending.contentId;
    const targetScope =
      options?.useFolderScope && conflict?.folderScopeContentId
        ? "recursive"
        : undefined;

    await get().assignContentToWorkspace(activeWorkspaceId, targetContentId, {
      assignmentType: "borrowed",
      scope: targetScope,
      expiresAt,
    });
    directOpenContent(pending.contentId, pending.options);
    set({ conflict: null, pendingOpenIntent: null });
  },

  sharePendingContent: async (options) => {
    const state = get();
    const activeWorkspaceId = state.activeWorkspaceId;
    const pending = state.pendingOpenIntent;
    const conflict = state.conflict;
    if (!activeWorkspaceId || !pending) return;

    const targetContentId =
      options?.useFolderScope && conflict?.folderScopeContentId
        ? conflict.folderScopeContentId
        : pending.contentId;
    const targetScope =
      options?.useFolderScope && conflict?.folderScopeContentId
        ? "recursive"
        : undefined;

    await get().assignContentToWorkspace(activeWorkspaceId, targetContentId, {
      assignmentType: "shared",
      scope: targetScope,
    });
    directOpenContent(pending.contentId, pending.options);
    set({ conflict: null, pendingOpenIntent: null });
  },

  switchToConflictWorkspace: async () => {
    const conflict = get().conflict;
    if (!conflict) return;
    const pending = get().pendingOpenIntent;
    await get().activateWorkspace(conflict.workspaceId);
    if (pending) {
      directOpenContent(pending.contentId, pending.options);
    }
    set({ conflict: null, pendingOpenIntent: null });
  },

  cancelOpenConflict: () => set({ conflict: null, pendingOpenIntent: null }),

  assignContentToWorkspace: async (workspaceId, contentId, options) => {
    const response = await fetch(
      `/api/content/workspaces/${workspaceId}/assignments`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          assignmentType: options.assignmentType,
          scope: options.scope,
          expiresAt: options.expiresAt,
          moveFromWorkspaceId: options.moveFromWorkspaceId,
        }),
      },
    );
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to assign content to workspace",
    );
    if (
      options.moveFromWorkspaceId &&
      options.moveFromWorkspaceId !== workspaceId
    ) {
      const workspaces = await fetchWorkspaces();
      set({ workspaces });
    } else {
      set((state) => ({
        workspaces: state.workspaces.map((candidate) =>
          candidate.id === workspace.id ? workspace : candidate,
        ),
      }));
    }

    if (
      options.moveFromWorkspaceId &&
      options.moveFromWorkspaceId === get().activeWorkspaceId &&
      options.moveFromWorkspaceId !== workspaceId
    ) {
      useContentStore.getState().closeContentTabs([contentId]);
    }
    notifyMutation();
  },

  unassignContentFromWorkspace: async (workspaceId, contentId) => {
    const response = await fetch(
      `/api/content/workspaces/${workspaceId}/assignments/${contentId}`,
      {
        method: "DELETE",
        credentials: "include",
      },
    );
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to remove workspace claim",
    );
    if (!workspace) return;
    set((state) => ({
      workspaces: state.workspaces.map((candidate) =>
        candidate.id === workspace.id ? workspace : candidate,
      ),
    }));
    notifyMutation();
  },

  receiveRefreshedWorkspaces: (incoming) => {
    const state = get();
    const ordered = applyWorkspaceOrder(incoming);
    notifyExpiredWorkspaceRemoval(state.workspaces, ordered);
    closeReleasedBorrowedTabs(
      state.workspaces,
      ordered,
      state.activeWorkspaceId,
    );

    // INVARIANT — cross-session isolation is scoped to the SAME workspace.
    // This background reconcile only re-applies the local session's *active*
    // workspace (keyed on state.activeWorkspaceId below); pane state for every
    // other workspace is refreshed in the list but never applied to this view.
    // Combined with per-workspace persistActiveWorkspace writes and the
    // per-browser active-workspace pointer, two sessions on DIFFERENT
    // workspaces never converge — only same-workspace sessions share pane
    // state. Do not broaden this to apply non-active workspaces.
    //
    // If the active workspace was saved by another tab (its updatedAt changed),
    // apply the remote pane state so open tabs stay in sync across windows.
    const incomingActive = ordered.find(
      (ws) => ws.id === state.activeWorkspaceId,
    );
    if (incomingActive) {
      const knownUpdatedAt = lastAppliedUpdatedAt[incomingActive.id];
      if (knownUpdatedAt && incomingActive.updatedAt !== knownUpdatedAt) {
        lastAppliedUpdatedAt[incomingActive.id] = incomingActive.updatedAt;
        // Preserve the local active tab: a background refresh syncs the open-tab
        // set, but must not revert what the user is currently viewing (e.g. a
        // tab they just clicked after reload).
        const localActive = useContentStore.getState().selectedContentId;
        restoreContentWorkspace(incomingActive, localActive, "reconcile");
      }
    }

    set({ workspaces: ordered });
  },

  resetWorkspaces: async () => {
    const response = await fetch("/api/content/workspaces/reset", {
      method: "POST",
      credentials: "include",
    });
    const workspaces = await parseResponse<ContentWorkspaceResponse[]>(
      response,
      "Failed to reset workplaces",
    );
    const nextWorkspace = getMainWorkspace(workspaces);
    set({
      workspaces,
      activeWorkspaceId: nextWorkspace?.id ?? null,
      conflict: null,
      pendingOpenIntent: null,
    });
    if (nextWorkspace) {
      syncWorkspaceUrl(nextWorkspace.id);
      restoreContentWorkspace(nextWorkspace);
      restoreTreeSnapshotForWorkspace(nextWorkspace.id);
    }
  },
}));

// Keep the tab-filter store scoped to the active workspace. A subscription
// (rather than edits at each set() site) covers every path that changes the
// active workspace: initial load, activate, archive fallback, background sync.
if (typeof window !== "undefined") {
  useWorkspaceTabFilterStore
    .getState()
    .setActiveWorkspace(useWorkspaceStore.getState().activeWorkspaceId);
  useWorkspaceStore.subscribe((state, prevState) => {
    if (state.activeWorkspaceId !== prevState.activeWorkspaceId) {
      useWorkspaceTabFilterStore
        .getState()
        .setActiveWorkspace(state.activeWorkspaceId);
    }
  });
}

export function installWorkspaceOpenGuard() {
  if (typeof window === "undefined") return () => undefined;

  window.__dgWorkspaceOpenGuard = ({ contentId, options }) => {
    if (isBypassingWorkspaceGuard) return true;
    void useWorkspaceStore.getState().requestOpenContent(contentId, options);
    return false;
  };

  return () => {
    if (window.__dgWorkspaceOpenGuard) {
      delete window.__dgWorkspaceOpenGuard;
    }
  };
}
