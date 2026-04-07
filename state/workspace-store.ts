"use client";

import { create } from "zustand";
import {
  useContentStore,
  type ContentSelectionOptions,
} from "@/state/content-store";
import {
  useTreeStateStore,
  type TreeStateSnapshot,
} from "@/state/tree-state-store";
import type {
  ContentWorkspaceResponse,
  WorkspaceOpenConflict,
  WorkspaceStatePayload,
} from "@/lib/domain/workspaces";
import type {
  ContentWorkspaceItemAssignmentType,
  ContentWorkspaceItemScope,
} from "@/lib/database/generated/prisma";

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
  conflict: WorkspaceOpenConflict | null;
  pendingOpenIntent: PendingOpenIntent | null;
  loadWorkspaces: (initialWorkspaceId?: string | null) => Promise<void>;
  activateWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<ContentWorkspaceResponse>;
  updateWorkspace: (
    workspaceId: string,
    updates: {
      name?: string;
      isLocked?: boolean;
      expiresAt?: string | null;
      settings?: Record<string, unknown>;
    }
  ) => Promise<void>;
  reorderWorkspaces: (workspaceIds: string[]) => Promise<void>;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  persistActiveWorkspace: () => Promise<void>;
  requestOpenContent: (
    contentId: string,
    options?: ContentSelectionOptions
  ) => Promise<void>;
  borrowPendingContent: (expiresAt: string) => Promise<void>;
  sharePendingContent: () => Promise<void>;
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
    }
  ) => Promise<void>;
  unassignContentFromWorkspace: (
    workspaceId: string,
    contentId: string
  ) => Promise<void>;
}

let isBypassingWorkspaceGuard = false;

function getTreeSnapshotByWorkspace() {
  if (typeof window === "undefined") return {};
  const rawValue = window.localStorage.getItem("workspace-tree-state-snapshots");
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
    JSON.stringify(snapshots)
  );
}

function restoreTreeSnapshotForWorkspace(workspaceId: string | null) {
  if (!workspaceId) return;
  const snapshots = getTreeSnapshotByWorkspace();
  useTreeStateStore.getState().restoreSnapshot(snapshots[workspaceId]);
}

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.error?.message ?? fallback);
  }
  return result.data;
}

function getMainWorkspace(workspaces: ContentWorkspaceResponse[]) {
  return workspaces.find((workspace) => workspace.isMain) ?? workspaces[0] ?? null;
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
  const orderIndex = new Map(order.map((workspaceId, index) => [workspaceId, index]));
  const originalIndex = new Map(
    nonMainWorkspaces.map((workspace, index) => [workspace.id, index])
  );

  const orderedWorkspaces = [...nonMainWorkspaces].sort((a, b) => {
    const aOrder = orderIndex.get(a.id);
    const bOrder = orderIndex.get(b.id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
  });

  return mainWorkspace ? [mainWorkspace, ...orderedWorkspaces] : orderedWorkspaces;
}

function getWorkspace(
  workspaces: ContentWorkspaceResponse[],
  workspaceId: string | null
) {
  return (
    workspaces.find((workspace) => workspace.id === workspaceId) ??
    getMainWorkspace(workspaces)
  );
}

function restoreContentWorkspace(workspace: ContentWorkspaceResponse) {
  const paneTabContentIds = Object.fromEntries(
    Object.entries(workspace.paneState.paneTabContentIds).map(([paneId, pane]) => [
      paneId,
      pane?.contentIds ?? [],
    ])
  );

  isBypassingWorkspaceGuard = true;
  try {
    useContentStore.getState().restoreWorkspace({
      activeContentId: workspace.paneState.activeContentId,
      activePaneId: workspace.paneState.activePaneId,
      layoutMode: workspace.paneState.layoutMode,
      paneTabContentIds,
    });
  } finally {
    isBypassingWorkspaceGuard = false;
  }
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

function directOpenContent(contentId: string, options: ContentSelectionOptions = {}) {
  isBypassingWorkspaceGuard = true;
  try {
    if (options.paneId) {
      useContentStore.getState().openContentInPane(contentId, options.paneId, options);
    } else {
      useContentStore.getState().setSelectedContentId(contentId, options);
    }
  } finally {
    isBypassingWorkspaceGuard = false;
  }
}

function isContentAlreadyInWorkspace(
  workspace: ContentWorkspaceResponse | null,
  contentId: string
) {
  return Boolean(workspace?.items.some((item) => item.contentId === contentId));
}

function closeReleasedBorrowedTabs(
  previousWorkspaces: ContentWorkspaceResponse[],
  nextWorkspaces: ContentWorkspaceResponse[],
  activeWorkspaceId: string | null
) {
  const previous = getWorkspace(previousWorkspaces, activeWorkspaceId);
  const next = getWorkspace(nextWorkspaces, activeWorkspaceId);
  if (!previous || !next) return;

  const nextItemIds = new Set(next.items.map((item) => item.contentId));
  const releasedBorrowedContentIds = previous.items
    .filter(
      (item) =>
        item.assignmentType === "borrowed" && !nextItemIds.has(item.contentId)
    )
    .map((item) => item.contentId);

  if (releasedBorrowedContentIds.length > 0) {
    useContentStore.getState().closeContentTabs(releasedBorrowedContentIds);
  }
}

async function fetchWorkspaces() {
  const response = await fetch("/api/content/workspaces", {
    credentials: "include",
  });
  return parseResponse<ContentWorkspaceResponse[]>(
    response,
    "Failed to fetch workspaces"
  ).then(applyWorkspaceOrder);
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  isLoading: false,
  conflict: null,
  pendingOpenIntent: null,

  loadWorkspaces: async (initialWorkspaceId) => {
    set({ isLoading: true });
    const previousWorkspaces = get().workspaces;
    try {
      const workspaces = await fetchWorkspaces();
      const requestedWorkspace =
        (initialWorkspaceId &&
          workspaces.find((workspace) => workspace.id === initialWorkspaceId)) ||
        getWorkspace(workspaces, get().activeWorkspaceId);
      const activeWorkspace = requestedWorkspace ?? getMainWorkspace(workspaces);

      closeReleasedBorrowedTabs(
        previousWorkspaces,
        workspaces,
        activeWorkspace?.id ?? null
      );

      set({
        workspaces,
        activeWorkspaceId: activeWorkspace?.id ?? null,
        isLoading: false,
      });

      if (activeWorkspace) {
        syncWorkspaceUrl(activeWorkspace.id);
        if (useContentStore.getState().openContentIds.length === 0) {
          restoreContentWorkspace(activeWorkspace);
        }
        restoreTreeSnapshotForWorkspace(activeWorkspace.id);
      }
    } catch (error) {
      console.error("[Workspace Store] Failed to load workspaces:", error);
      set({ isLoading: false });
    }
  },

  activateWorkspace: async (workspaceId) => {
    saveTreeSnapshotForWorkspace(get().activeWorkspaceId);
    await get().persistActiveWorkspace();
    const workspace = getWorkspace(get().workspaces, workspaceId);
    if (!workspace) return;

    set({
      activeWorkspaceId: workspace.id,
      conflict: null,
      pendingOpenIntent: null,
    });
    syncWorkspaceUrl(workspace.id);
    restoreContentWorkspace(workspace);
    restoreTreeSnapshotForWorkspace(workspace.id);
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
      "Failed to create workspace"
    );
    set((state) => ({ workspaces: [workspace, ...state.workspaces] }));
    await get().activateWorkspace(workspace.id);
    return workspace;
  },

  updateWorkspace: async (workspaceId, updates) => {
    const response = await fetch(`/api/content/workspaces/${workspaceId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to update workspace"
    );
    set((state) => ({
      workspaces: state.workspaces.map((candidate) =>
        candidate.id === workspace.id ? workspace : candidate
      ),
    }));
    if (workspaceId === get().activeWorkspaceId) {
      const workspaces = await fetchWorkspaces();
      set({ workspaces });
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
            (workspace) => workspace.id === workspaceId && !workspace.isMain
          )
        )
      )
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
          : workspace
      )
    );

    set({ workspaces: nextWorkspaces });

    const response = await fetch(`/api/content/workspaces/${mainWorkspace.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...mainWorkspace.settings,
          workspaceOrder: uniqueWorkspaceIds,
        },
      }),
    });
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to save workspace order"
    );
    set((state) => ({
      workspaces: applyWorkspaceOrder(
        state.workspaces.map((candidate) =>
          candidate.id === workspace.id ? workspace : candidate
        )
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
      "Failed to archive workspace"
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
  },

  persistActiveWorkspace: async () => {
    const activeWorkspaceId = get().activeWorkspaceId;
    if (!activeWorkspaceId) return;

    const snapshot = useContentStore.getState().getWorkspaceStateSnapshot();
    const response = await fetch(`/api/content/workspaces/${activeWorkspaceId}/state`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot satisfies WorkspaceStatePayload),
    });
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to save workspace state"
    );
    set((state) => ({
      workspaces: state.workspaces.map((candidate) =>
        candidate.id === workspace.id ? workspace : candidate
      ),
    }));
  },

  requestOpenContent: async (contentId, options = {}) => {
    const state = get();
    const activeWorkspace = getWorkspace(state.workspaces, state.activeWorkspaceId);
    if (!activeWorkspace) {
      directOpenContent(contentId, options);
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
    const result = await parseResponse<{
      allowed: boolean;
      conflict: WorkspaceOpenConflict | null;
    }>(response, "Failed to resolve workspace conflict");

    if (result.allowed) {
      directOpenContent(contentId, options);
      void get().persistActiveWorkspace();
      return;
    }

    set({
      conflict: result.conflict,
      pendingOpenIntent: { contentId, options },
    });
  },

  borrowPendingContent: async (expiresAt) => {
    const state = get();
    const activeWorkspaceId = state.activeWorkspaceId;
    const pending = state.pendingOpenIntent;
    if (!activeWorkspaceId || !pending) return;

    await get().assignContentToWorkspace(activeWorkspaceId, pending.contentId, {
      assignmentType: "borrowed",
      expiresAt,
    });
    directOpenContent(pending.contentId, pending.options);
    set({ conflict: null, pendingOpenIntent: null });
  },

  sharePendingContent: async () => {
    const state = get();
    const activeWorkspaceId = state.activeWorkspaceId;
    const pending = state.pendingOpenIntent;
    if (!activeWorkspaceId || !pending) return;

    await get().assignContentToWorkspace(activeWorkspaceId, pending.contentId, {
      assignmentType: "shared",
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
    const response = await fetch(`/api/content/workspaces/${workspaceId}/assignments`, {
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
    });
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to assign content to workspace"
    );
    set((state) => ({
      workspaces: state.workspaces.map((candidate) =>
        candidate.id === workspace.id ? workspace : candidate
      ),
    }));

    if (
      options.moveFromWorkspaceId &&
      options.moveFromWorkspaceId === get().activeWorkspaceId &&
      options.moveFromWorkspaceId !== workspaceId
    ) {
      useContentStore.getState().closeContentTabs([contentId]);
    }
  },

  unassignContentFromWorkspace: async (workspaceId, contentId) => {
    const response = await fetch(
      `/api/content/workspaces/${workspaceId}/assignments/${contentId}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    const workspace = await parseResponse<ContentWorkspaceResponse>(
      response,
      "Failed to remove workspace claim"
    );
    if (!workspace) return;
    set((state) => ({
      workspaces: state.workspaces.map((candidate) =>
        candidate.id === workspace.id ? workspace : candidate
      ),
    }));
  },
}));

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
