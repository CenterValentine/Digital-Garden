/**
 * Content Store
 *
 * Manages the active content workspace for the main panel.
 * Sprint 53 expands the Sprint 52 dual-pane model into four fixed pane slots
 * with layout-aware visibility so the workspace can move between single, dual,
 * and quad arrangements without reworking state again.
 */

import { create } from "zustand";

const TOP_LEFT_PANE_ID = "top-left";
const TOP_RIGHT_PANE_ID = "top-right";
const BOTTOM_LEFT_PANE_ID = "bottom-left";
const BOTTOM_RIGHT_PANE_ID = "bottom-right";
const LAST_SELECTED_KEY = "lastSelectedContentId";
const TAB_PREFERENCES_KEY = "workspaceTabPreferences";

const WORKSPACE_PANE_IDS = [
  TOP_LEFT_PANE_ID,
  TOP_RIGHT_PANE_ID,
  BOTTOM_LEFT_PANE_ID,
  BOTTOM_RIGHT_PANE_ID,
] as const;

export type WorkspacePaneId = (typeof WORKSPACE_PANE_IDS)[number];
export type WorkspaceLayoutMode =
  | "single"
  | "dual-vertical"
  | "dual-horizontal"
  | "quad";
export type WorkspaceHorizontalPosition = "left" | "right";
export type WorkspaceVerticalPosition = "top" | "bottom";

export interface WorkspaceTabState {
  id: string;
  contentId: string;
  title: string;
  contentType: string | null;
  isTemporary: boolean;
  isPinned: boolean;
  preferredHorizontal: WorkspaceHorizontalPosition;
  preferredVertical: WorkspaceVerticalPosition;
}

export interface WorkspacePaneState {
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

interface WorkspaceLayoutSnapshot {
  activePaneId: WorkspacePaneId;
  isInitialized: boolean;
  panes: Record<WorkspacePaneId, WorkspacePaneState>;
}

type WorkspaceTabPreferenceMap = Record<
  string,
  Pick<WorkspaceTabState, "preferredHorizontal" | "preferredVertical">
>;

export interface ContentSelectionOptions {
  title?: string | null;
  contentType?: string | null;
  paneId?: WorkspacePaneId;
  temporary?: boolean;
  pin?: boolean;
}

interface WorkspaceRestoreOptions {
  activeContentId: string | null;
  activePaneId?: WorkspacePaneId | null;
  layoutMode?: WorkspaceLayoutMode;
  paneTabContentIds?: Partial<Record<WorkspacePaneId, string[]>>;
  tabContentIds?: string[];
  secondaryTabContentIds?: string[];
}

export interface WorkspaceStateSnapshot {
  layoutMode: WorkspaceLayoutMode;
  activePaneId: WorkspacePaneId;
  activeContentId: string | null;
  paneTabContentIds: Partial<
    Record<
      WorkspacePaneId,
      {
        contentIds: string[];
        activeContentId: string | null;
      }
    >
  >;
}

type WorkspaceOpenGuard = (request: {
  contentId: string;
  options: ContentSelectionOptions;
}) => boolean;

declare global {
  interface Window {
    __dgWorkspaceOpenGuard?: WorkspaceOpenGuard;
  }
}

export interface ContentState {
  selectedContentId: string | null;
  selectedContentType: string | null;
  multiSelectedIds: string[];
  lastClickedId: string | null;

  layoutMode: WorkspaceLayoutMode;
  activePaneId: WorkspacePaneId;
  panes: Record<WorkspacePaneId, WorkspacePaneState>;
  layoutSnapshots: Record<WorkspaceLayoutMode, WorkspaceLayoutSnapshot>;
  tabs: Record<string, WorkspaceTabState>;
  openContentIds: string[];

  focusPane: (paneId: WorkspacePaneId) => void;
  setLayoutMode: (mode: WorkspaceLayoutMode) => void;
  openContentInPane: (
    id: string | null,
    paneId: WorkspacePaneId,
    options?: ContentSelectionOptions
  ) => void;
  setSelectedContentId: (
    id: string | null,
    options?: ContentSelectionOptions
  ) => void;
  setSelectedContentType: (type: string | null) => void;
  updateContentTab: (
    contentId: string,
    updates: Partial<
      Pick<WorkspaceTabState, "title" | "contentType" | "isTemporary" | "isPinned">
    >
  ) => void;
  replaceContentTab: (
    tabId: string,
    contentId: string,
    options?: ContentSelectionOptions
  ) => void;
  activateContentTab: (tabId: string) => void;
  moveContentTabToPane: (
    tabId: string,
    paneId: WorkspacePaneId,
    options?: {
      placementMode?: "layout-aware" | "explicit";
      beforeTabId?: string | null;
      requestedLayoutMode?: WorkspaceLayoutMode;
      complementPaneId?: WorkspacePaneId | null;
    }
  ) => void;
  pinContentTab: (tabId?: string | null) => void;
  closeContentTab: (tabId: string) => void;
  closeContentTabs: (contentIds: string[]) => void;
  clearAllWorkspaceTabs: () => void;
  getWorkspaceStateSnapshot: () => WorkspaceStateSnapshot;
  restoreWorkspace: (workspace: WorkspaceRestoreOptions) => void;
  clearSelection: () => void;
  toggleMultiSelect: (id: string) => void;
  setMultiSelect: (ids: string[]) => void;
  clearMultiSelect: () => void;
  isMultiSelected: (id: string) => boolean;
}

const LAYOUT_VISIBLE_PANES: Record<WorkspaceLayoutMode, WorkspacePaneId[]> = {
  single: [TOP_LEFT_PANE_ID],
  "dual-vertical": [TOP_LEFT_PANE_ID, TOP_RIGHT_PANE_ID],
  "dual-horizontal": [TOP_LEFT_PANE_ID, BOTTOM_LEFT_PANE_ID],
  quad: [...WORKSPACE_PANE_IDS],
};

function getTabId(contentId: string) {
  return `tab:${contentId}`;
}

function createPane(id: WorkspacePaneId): WorkspacePaneState {
  return {
    id,
    tabIds: [],
    activeTabId: null,
  };
}

function createPaneRecord() {
  return WORKSPACE_PANE_IDS.reduce<Record<WorkspacePaneId, WorkspacePaneState>>(
    (record, paneId) => {
      record[paneId] = createPane(paneId);
      return record;
    },
    {} as Record<WorkspacePaneId, WorkspacePaneState>
  );
}

function clonePane(pane: WorkspacePaneState): WorkspacePaneState {
  return {
    ...pane,
    tabIds: [...pane.tabIds],
  };
}

function clonePaneRecord(
  panes: Record<WorkspacePaneId, WorkspacePaneState>
): Record<WorkspacePaneId, WorkspacePaneState> {
  return WORKSPACE_PANE_IDS.reduce<Record<WorkspacePaneId, WorkspacePaneState>>(
    (record, paneId) => {
      record[paneId] = clonePane(panes[paneId] ?? createPane(paneId));
      return record;
    },
    {} as Record<WorkspacePaneId, WorkspacePaneState>
  );
}

function createSnapshot(
  activePaneId: WorkspacePaneId = TOP_LEFT_PANE_ID
): WorkspaceLayoutSnapshot {
  return {
    activePaneId,
    isInitialized: false,
    panes: createPaneRecord(),
  };
}

function createTab(
  contentId: string,
  options: ContentSelectionOptions = {},
  preferredPlacement?: Partial<
    Pick<WorkspaceTabState, "preferredHorizontal" | "preferredVertical">
  >
): WorkspaceTabState {
  return {
    id: getTabId(contentId),
    contentId,
    title: options.title?.trim() || "Loading...",
    contentType: options.contentType ?? null,
    isTemporary: options.temporary ?? !options.pin,
    isPinned: options.pin ?? false,
    preferredHorizontal: preferredPlacement?.preferredHorizontal ?? "left",
    preferredVertical: preferredPlacement?.preferredVertical ?? "top",
  };
}

function getVisiblePaneIds(layoutMode: WorkspaceLayoutMode) {
  return LAYOUT_VISIBLE_PANES[layoutMode];
}

function isPaneVisible(layoutMode: WorkspaceLayoutMode, paneId: WorkspacePaneId) {
  return getVisiblePaneIds(layoutMode).includes(paneId);
}

function getActiveTab(state: Pick<ContentState, "activePaneId" | "panes" | "tabs">) {
  return getPaneActiveTab(state, state.activePaneId);
}

function getPaneActiveTab(
  state: Pick<ContentState, "panes" | "tabs">,
  paneId: WorkspacePaneId
) {
  const pane = state.panes[paneId];
  if (!pane?.activeTabId) return null;
  return state.tabs[pane.activeTabId] ?? null;
}

function getPaneActiveContentId(
  state: Pick<ContentState, "panes" | "tabs">,
  paneId: WorkspacePaneId
) {
  return getPaneActiveTab(state, paneId)?.contentId ?? null;
}

function getPaneActiveContentType(
  state: Pick<ContentState, "panes" | "tabs">,
  paneId: WorkspacePaneId
) {
  return getPaneActiveTab(state, paneId)?.contentType ?? null;
}

function findPaneIdForTab(
  panes: Record<WorkspacePaneId, WorkspacePaneState>,
  tabId: string
) {
  return (
    WORKSPACE_PANE_IDS.find((paneId) => panes[paneId].tabIds.includes(tabId)) ?? null
  );
}

function getVisibleOpenContentIds(
  layoutMode: WorkspaceLayoutMode,
  panes: Record<WorkspacePaneId, WorkspacePaneState>,
  tabs: Record<string, WorkspaceTabState>
) {
  return getVisiblePaneIds(layoutMode)
    .flatMap((paneId) =>
      panes[paneId].tabIds
        .map((tabId) => tabs[tabId]?.contentId ?? null)
        .filter((value): value is string => Boolean(value))
    )
    .filter((contentId, index, allIds) => allIds.indexOf(contentId) === index);
}

function createWorkspaceStateSnapshot(
  state: Pick<
    ContentState,
    "layoutMode" | "activePaneId" | "panes" | "tabs" | "selectedContentId"
  >
): WorkspaceStateSnapshot {
  const paneTabContentIds = WORKSPACE_PANE_IDS.reduce<
    WorkspaceStateSnapshot["paneTabContentIds"]
  >((snapshot, paneId) => {
    const pane = state.panes[paneId];
    const contentIds =
      pane?.tabIds
        .map((tabId) => state.tabs[tabId]?.contentId ?? null)
        .filter((contentId): contentId is string => Boolean(contentId)) ?? [];
    snapshot[paneId] = {
      contentIds,
      activeContentId: pane?.activeTabId
        ? state.tabs[pane.activeTabId]?.contentId ?? null
        : null,
    };
    return snapshot;
  }, {});

  const activeTab = getActiveTab(state);
  return {
    layoutMode: state.layoutMode,
    activePaneId: state.activePaneId,
    activeContentId: state.selectedContentId ?? activeTab?.contentId ?? null,
    paneTabContentIds,
  };
}

function shouldAllowWorkspaceOpen(
  id: string,
  options: ContentSelectionOptions
) {
  if (typeof window === "undefined") return true;
  if (options.contentType === "page-template") return true;
  return window.__dgWorkspaceOpenGuard?.({ contentId: id, options }) !== false;
}

function getOrderedVisibleTabIds(
  layoutMode: WorkspaceLayoutMode,
  panes: Record<WorkspacePaneId, WorkspacePaneState>
) {
  const seenTabIds = new Set<string>();
  const orderedTabIds: string[] = [];

  getVisiblePaneIds(layoutMode).forEach((paneId) => {
    panes[paneId].tabIds.forEach((tabId) => {
      if (seenTabIds.has(tabId)) return;
      seenTabIds.add(tabId);
      orderedTabIds.push(tabId);
    });
  });

  return orderedTabIds;
}

function getHorizontalPositionForPane(
  paneId: WorkspacePaneId
): WorkspaceHorizontalPosition {
  return paneId === TOP_RIGHT_PANE_ID || paneId === BOTTOM_RIGHT_PANE_ID
    ? "right"
    : "left";
}

function getVerticalPositionForPane(
  paneId: WorkspacePaneId
): WorkspaceVerticalPosition {
  return paneId === BOTTOM_LEFT_PANE_ID || paneId === BOTTOM_RIGHT_PANE_ID
    ? "bottom"
    : "top";
}

function applyPanePreferenceToTab(
  tab: WorkspaceTabState,
  layoutMode: WorkspaceLayoutMode,
  paneId: WorkspacePaneId
) {
  let nextTab = tab;

  if (layoutMode === "dual-vertical" || layoutMode === "quad") {
    nextTab = {
      ...nextTab,
      preferredHorizontal: getHorizontalPositionForPane(paneId),
    };
  }

  if (layoutMode === "dual-horizontal" || layoutMode === "quad") {
    nextTab = {
      ...nextTab,
      preferredVertical: getVerticalPositionForPane(paneId),
    };
  }

  return nextTab;
}

function getPreferredPaneIdForTab(
  layoutMode: WorkspaceLayoutMode,
  tab: Pick<WorkspaceTabState, "preferredHorizontal" | "preferredVertical">
) {
  switch (layoutMode) {
    case "single":
      return TOP_LEFT_PANE_ID;
    case "dual-vertical":
      return tab.preferredHorizontal === "right"
        ? TOP_RIGHT_PANE_ID
        : TOP_LEFT_PANE_ID;
    case "dual-horizontal":
      return tab.preferredVertical === "bottom"
        ? BOTTOM_LEFT_PANE_ID
        : TOP_LEFT_PANE_ID;
    case "quad":
    default:
      if (tab.preferredHorizontal === "right" && tab.preferredVertical === "bottom") {
        return BOTTOM_RIGHT_PANE_ID;
      }
      if (tab.preferredHorizontal === "right") {
        return TOP_RIGHT_PANE_ID;
      }
      if (tab.preferredVertical === "bottom") {
        return BOTTOM_LEFT_PANE_ID;
      }
      return TOP_LEFT_PANE_ID;
  }
}

function insertTabId(
  tabIds: string[],
  tabId: string,
  beforeTabId?: string | null
) {
  if (beforeTabId === tabId) {
    return [...tabIds];
  }

  const nextTabIds = tabIds.filter((candidateTabId) => candidateTabId !== tabId);
  if (!beforeTabId) {
    nextTabIds.push(tabId);
    return nextTabIds;
  }

  const insertIndex = nextTabIds.indexOf(beforeTabId);
  if (insertIndex === -1) {
    nextTabIds.push(tabId);
    return nextTabIds;
  }

  nextTabIds.splice(insertIndex, 0, tabId);
  return nextTabIds;
}

function createNormalizedPaneState(
  paneId: WorkspacePaneId,
  tabIds: string[],
  preferredTabId?: string | null
) {
  return {
    id: paneId,
    tabIds,
    activeTabId:
      (preferredTabId && tabIds.includes(preferredTabId) ? preferredTabId : null) ??
      tabIds[0] ??
      null,
  };
}

function collapsePaneIdForLayout(
  layoutMode: WorkspaceLayoutMode,
  paneId: WorkspacePaneId
): WorkspacePaneId {
  if (isPaneVisible(layoutMode, paneId)) {
    return paneId;
  }

  switch (layoutMode) {
    case "single":
      return TOP_LEFT_PANE_ID;
    case "dual-vertical":
      return paneId === BOTTOM_RIGHT_PANE_ID ? TOP_RIGHT_PANE_ID : TOP_LEFT_PANE_ID;
    case "dual-horizontal":
      return paneId === TOP_RIGHT_PANE_ID ? TOP_LEFT_PANE_ID : BOTTOM_LEFT_PANE_ID;
    case "quad":
    default:
      return TOP_LEFT_PANE_ID;
  }
}

function resolveActivePaneForLayout(
  layoutMode: WorkspaceLayoutMode,
  requestedPaneId: WorkspacePaneId | null | undefined,
  panes: Record<WorkspacePaneId, WorkspacePaneState>,
  tabs: Record<string, WorkspaceTabState>
) {
  const visiblePaneIds = getVisiblePaneIds(layoutMode);
  const preferredPaneId = collapsePaneIdForLayout(
    layoutMode,
    requestedPaneId ?? TOP_LEFT_PANE_ID
  );

  if (getPaneActiveTab({ panes, tabs }, preferredPaneId)) {
    return preferredPaneId;
  }

  return (
    visiblePaneIds.find((paneId) => Boolean(getPaneActiveTab({ panes, tabs }, paneId))) ??
    preferredPaneId
  );
}

function saveLayoutSnapshot(state: ContentState) {
  const visiblePaneIds = getVisiblePaneIds(state.layoutMode);
  const nextSnapshot = createSnapshot(
    resolveActivePaneForLayout(
      state.layoutMode,
      state.activePaneId,
      state.panes,
      state.tabs
    )
  );

  visiblePaneIds.forEach((paneId) => {
    nextSnapshot.panes[paneId] = clonePane(state.panes[paneId]);
  });
  nextSnapshot.isInitialized = true;

  return {
    ...state.layoutSnapshots,
    [state.layoutMode]: nextSnapshot,
  };
}

function createEmptyLayoutPanes() {
  return createPaneRecord();
}

function deriveLayoutPanes(
  state: ContentState,
  targetLayoutMode: WorkspaceLayoutMode
) {
  const nextPanes = createEmptyLayoutPanes();
  const orderedTabIds = getOrderedVisibleTabIds(state.layoutMode, state.panes);

  orderedTabIds.forEach((tabId) => {
    const tab = state.tabs[tabId];
    if (!tab) return;

    const targetPaneId = getPreferredPaneIdForTab(targetLayoutMode, tab);
    nextPanes[targetPaneId].tabIds.push(tabId);
  });

  const sourcePaneIds = Array.from(
    new Set([
      state.activePaneId,
      ...getVisiblePaneIds(state.layoutMode),
    ])
  ).filter((paneId): paneId is WorkspacePaneId =>
    isPaneVisible(state.layoutMode, paneId)
  );

  const preferredActiveTabIdsByPane = sourcePaneIds.reduce<
    Partial<Record<WorkspacePaneId, string[]>>
  >((record, sourcePaneId) => {
    const activeTabId = state.panes[sourcePaneId].activeTabId;
    if (!activeTabId) return record;

    const tab = state.tabs[activeTabId];
    if (!tab) return record;

    const targetPaneId = getPreferredPaneIdForTab(targetLayoutMode, tab);
    const existing = record[targetPaneId] ?? [];

    return {
      ...record,
      [targetPaneId]: [...existing, activeTabId],
    };
  }, {});

  getVisiblePaneIds(targetLayoutMode).forEach((paneId) => {
    nextPanes[paneId] = createNormalizedPaneState(
      paneId,
      nextPanes[paneId].tabIds,
      preferredActiveTabIdsByPane[paneId]?.find((tabId) =>
        nextPanes[paneId].tabIds.includes(tabId)
      ) ?? null
    );
  });

  return nextPanes;
}

function getTargetPanesForLayout(
  state: ContentState,
  targetLayoutMode: WorkspaceLayoutMode
) {
  return deriveLayoutPanes(state, targetLayoutMode);
}

function projectPanesToLayout(
  sourceLayoutMode: WorkspaceLayoutMode,
  targetLayoutMode: WorkspaceLayoutMode,
  panes: Record<WorkspacePaneId, WorkspacePaneState>
) {
  const nextPanes = createEmptyLayoutPanes();
  const preferredActiveTabIdsByPane: Partial<Record<WorkspacePaneId, string[]>> = {};

  getVisiblePaneIds(sourceLayoutMode).forEach((sourcePaneId) => {
    const sourcePane = panes[sourcePaneId];
    const targetPaneId = collapsePaneIdForLayout(targetLayoutMode, sourcePaneId);

    nextPanes[targetPaneId].tabIds.push(...sourcePane.tabIds);

    if (!sourcePane.activeTabId) return;

    const existingActiveTabIds = preferredActiveTabIdsByPane[targetPaneId] ?? [];
    preferredActiveTabIdsByPane[targetPaneId] = [
      ...existingActiveTabIds,
      sourcePane.activeTabId,
    ];
  });

  getVisiblePaneIds(targetLayoutMode).forEach((paneId) => {
    nextPanes[paneId] = createNormalizedPaneState(
      paneId,
      nextPanes[paneId].tabIds,
      preferredActiveTabIdsByPane[paneId]?.find((tabId) =>
        nextPanes[paneId].tabIds.includes(tabId)
      ) ?? null
    );
  });

  return nextPanes;
}

function getPaneLabel(
  layoutMode: WorkspaceLayoutMode,
  paneId: WorkspacePaneId
) {
  switch (layoutMode) {
    case "single":
      return paneId === TOP_LEFT_PANE_ID ? "Main Pane" : "Pane";
    case "dual-vertical":
      if (paneId === TOP_LEFT_PANE_ID) return "Left Pane";
      if (paneId === TOP_RIGHT_PANE_ID) return "Right Pane";
      if (paneId === BOTTOM_LEFT_PANE_ID) return "Bottom Left Pane";
      return "Bottom Right Pane";
    case "dual-horizontal":
      if (paneId === TOP_LEFT_PANE_ID) return "Top Pane";
      if (paneId === BOTTOM_LEFT_PANE_ID) return "Bottom Pane";
      if (paneId === TOP_RIGHT_PANE_ID) return "Top Right Pane";
      return "Bottom Right Pane";
    case "quad":
    default:
      if (paneId === TOP_LEFT_PANE_ID) return "Top Left Pane";
      if (paneId === TOP_RIGHT_PANE_ID) return "Top Right Pane";
      if (paneId === BOTTOM_LEFT_PANE_ID) return "Bottom Left Pane";
      return "Bottom Right Pane";
  }
}

function resolveLayoutModeForPane(
  currentLayoutMode: WorkspaceLayoutMode,
  paneId: WorkspacePaneId
) {
  if (isPaneVisible(currentLayoutMode, paneId)) {
    return currentLayoutMode;
  }

  switch (currentLayoutMode) {
    case "single":
      if (paneId === TOP_RIGHT_PANE_ID) return "dual-vertical";
      if (paneId === BOTTOM_LEFT_PANE_ID) return "dual-horizontal";
      return "quad";
    case "dual-vertical":
      return paneId === TOP_RIGHT_PANE_ID ? "dual-vertical" : "quad";
    case "dual-horizontal":
      return paneId === BOTTOM_LEFT_PANE_ID ? "dual-horizontal" : "quad";
    case "quad":
    default:
      return "quad";
  }
}

function normalizeLegacyRestorePanes({
  activeContentId,
  activePaneId,
  layoutMode,
  paneTabContentIds,
  tabContentIds,
  secondaryTabContentIds = [],
}: WorkspaceRestoreOptions) {
  const normalizedLayoutMode =
    layoutMode ??
    (secondaryTabContentIds.length > 0
      ? "dual-vertical"
      : tabContentIds && tabContentIds.length > 0
        ? "single"
        : "single");

  if (paneTabContentIds) {
    return {
      activeContentId,
      activePaneId,
      layoutMode: normalizedLayoutMode,
      paneTabContentIds,
    };
  }

  const legacyPaneTabs: Partial<Record<WorkspacePaneId, string[]>> = {
    [TOP_LEFT_PANE_ID]: tabContentIds ?? (activeContentId ? [activeContentId] : []),
  };

  if (secondaryTabContentIds.length > 0) {
    legacyPaneTabs[TOP_RIGHT_PANE_ID] = secondaryTabContentIds;
  }

  return {
    activeContentId,
    activePaneId:
      activePaneId ??
      (normalizedLayoutMode === "dual-vertical" ? TOP_LEFT_PANE_ID : TOP_LEFT_PANE_ID),
    layoutMode: normalizedLayoutMode,
    paneTabContentIds: legacyPaneTabs,
  };
}

function loadStoredTabPreferences(): WorkspaceTabPreferenceMap {
  if (typeof window === "undefined") return {};

  try {
    const rawPreferences = localStorage.getItem(TAB_PREFERENCES_KEY);
    if (!rawPreferences) return {};

    const parsedPreferences = JSON.parse(rawPreferences) as Record<
      string,
      Partial<Pick<WorkspaceTabState, "preferredHorizontal" | "preferredVertical">>
    >;

    return Object.entries(parsedPreferences).reduce<WorkspaceTabPreferenceMap>(
      (preferences, [contentId, preference]) => {
        if (!contentId) return preferences;

        const preferredHorizontal =
          preference.preferredHorizontal === "right" ? "right" : "left";
        const preferredVertical =
          preference.preferredVertical === "bottom" ? "bottom" : "top";

        preferences[contentId] = {
          preferredHorizontal,
          preferredVertical,
        };
        return preferences;
      },
      {}
    );
  } catch {
    return {};
  }
}

function saveTabPreferences(
  tabs: Record<string, WorkspaceTabState>
) {
  if (typeof window === "undefined") return;

  const preferences = Object.values(tabs).reduce<WorkspaceTabPreferenceMap>(
    (storedPreferences, tab) => {
      storedPreferences[tab.contentId] = {
        preferredHorizontal: tab.preferredHorizontal,
        preferredVertical: tab.preferredVertical,
      };
      return storedPreferences;
    },
    {}
  );

  if (Object.keys(preferences).length === 0) {
    localStorage.removeItem(TAB_PREFERENCES_KEY);
    return;
  }

  localStorage.setItem(TAB_PREFERENCES_KEY, JSON.stringify(preferences));
}

function syncBrowserState(state: Pick<
  ContentState,
  "selectedContentId" | "panes" | "tabs" | "activePaneId" | "layoutMode"
>) {
  if (typeof window === "undefined") return;

  const visiblePaneIds = getVisiblePaneIds(state.layoutMode);
  const activeTab = getActiveTab(state);
  const restorableContentId = state.selectedContentId ?? activeTab?.contentId ?? null;

  if (restorableContentId) {
    localStorage.setItem(LAST_SELECTED_KEY, restorableContentId);
  } else {
    localStorage.removeItem(LAST_SELECTED_KEY);
  }

  saveTabPreferences(state.tabs);

  const url = new URL(window.location.href);
  if (restorableContentId) {
    url.searchParams.set("content", restorableContentId);
  } else {
    url.searchParams.delete("content");
  }

  if (state.layoutMode !== "single") {
    url.searchParams.set("layout", state.layoutMode);
  } else {
    url.searchParams.delete("layout");
  }

  if (state.activePaneId !== TOP_LEFT_PANE_ID) {
    url.searchParams.set("pane", state.activePaneId);
  } else {
    url.searchParams.delete("pane");
  }

  WORKSPACE_PANE_IDS.forEach((paneId) => {
    const paramName = `tabs_${paneId.replace(/-/g, "_")}`;
    if (!visiblePaneIds.includes(paneId)) {
      url.searchParams.delete(paramName);
      return;
    }

    const contentIds = state.panes[paneId].tabIds
      .map((tabId) => state.tabs[tabId]?.contentId ?? null)
      .filter((value): value is string => Boolean(value));

    if (contentIds.length > 0) {
      url.searchParams.set(paramName, contentIds.join(","));
    } else {
      url.searchParams.delete(paramName);
    }
  });

  url.searchParams.delete("tabs");
  url.searchParams.delete("tabs_secondary");
  url.searchParams.delete("split");

  window.history.replaceState({}, "", url);
}

function commitWorkspace(
  set: (
    partial:
      | Partial<ContentState>
      | ((state: ContentState) => Partial<ContentState>)
  ) => void,
  recipe: (state: ContentState) => Partial<ContentState>
) {
  set((state: ContentState) => {
    const updates = recipe(state);
    const nextState = { ...state, ...updates } as ContentState;
    syncBrowserState(nextState);
    return updates;
  });
}

const initialPanes = createPaneRecord();
const initialSnapshots: Record<WorkspaceLayoutMode, WorkspaceLayoutSnapshot> = {
  single: {
    activePaneId: TOP_LEFT_PANE_ID,
    isInitialized: true,
    panes: clonePaneRecord(initialPanes),
  },
  "dual-vertical": createSnapshot(TOP_LEFT_PANE_ID),
  "dual-horizontal": createSnapshot(TOP_LEFT_PANE_ID),
  quad: createSnapshot(TOP_LEFT_PANE_ID),
};

export const useContentStore = create<ContentState>((set, get) => ({
  selectedContentId: null,
  selectedContentType: null,
  multiSelectedIds: [],
  lastClickedId: null,

  layoutMode: "single",
  activePaneId: TOP_LEFT_PANE_ID,
  panes: initialPanes,
  layoutSnapshots: initialSnapshots,
  tabs: {},
  openContentIds: [],

  focusPane: (paneId) => {
    commitWorkspace(set, (state) => {
      if (!isPaneVisible(state.layoutMode, paneId) || state.activePaneId === paneId) {
        return {};
      }

      return {
        activePaneId: paneId,
        selectedContentId: getPaneActiveContentId(state, paneId),
        selectedContentType: getPaneActiveContentType(state, paneId),
      };
    });
  },

  setLayoutMode: (mode) => {
    commitWorkspace(set, (state) => {
      if (state.layoutMode === mode) return {};

      const nextSnapshots = saveLayoutSnapshot(state);
      const nextPanes = getTargetPanesForLayout(
        { ...state, layoutSnapshots: nextSnapshots },
        mode
      );
      const currentActiveTab = getPaneActiveTab(
        { panes: state.panes, tabs: state.tabs },
        state.activePaneId
      );
      const requestedPaneId = currentActiveTab
        ? getPreferredPaneIdForTab(mode, currentActiveTab)
        : state.activePaneId;
      const nextActivePaneId = resolveActivePaneForLayout(
        mode,
        requestedPaneId,
        nextPanes,
        state.tabs
      );
      const activeTab = getPaneActiveTab(
        { panes: nextPanes, tabs: state.tabs },
        nextActivePaneId
      );
      const targetSnapshot: WorkspaceLayoutSnapshot = {
        activePaneId: nextActivePaneId,
        isInitialized: true,
        panes: clonePaneRecord(nextPanes),
      };

      return {
        layoutMode: mode,
        activePaneId: nextActivePaneId,
        panes: nextPanes,
        layoutSnapshots: {
          ...nextSnapshots,
          [mode]: targetSnapshot,
        },
        selectedContentId: activeTab?.contentId ?? null,
        selectedContentType: activeTab?.contentType ?? null,
        openContentIds: getVisibleOpenContentIds(mode, nextPanes, state.tabs),
      };
    });
  },

  openContentInPane: (id, paneId, options = {}) => {
    if (
      id &&
      !shouldAllowWorkspaceOpen(id, {
        ...options,
        paneId,
      })
    ) {
      return;
    }

    const nextLayoutMode = resolveLayoutModeForPane(
      get().layoutMode,
      paneId
    );

    if (nextLayoutMode !== get().layoutMode) {
      get().setLayoutMode(nextLayoutMode);
    }

    get().setSelectedContentId(id, {
      ...options,
      paneId,
    });
  },

  setSelectedContentType: (type) => {
    set({ selectedContentType: type });
  },

  setSelectedContentId: (id, options = {}) => {
    if (id && !shouldAllowWorkspaceOpen(id, options)) return;

    commitWorkspace(set, (state) => {
      if (!id) {
        return {
          selectedContentId: null,
          selectedContentType: null,
        };
      }

      const paneId =
        options.paneId && isPaneVisible(state.layoutMode, options.paneId)
          ? options.paneId
          : state.activePaneId;
      const pane = state.panes[paneId] ?? createPane(paneId);
      const existingTabId = getTabId(id);
      const existingTab = state.tabs[existingTabId];

      const nextTabs = { ...state.tabs };
      const nextPanes = clonePaneRecord(state.panes);
      const nextPane = {
        ...pane,
        tabIds: [...pane.tabIds],
      };
      nextPanes[paneId] = nextPane;

      if (existingTab) {
        nextTabs[existingTabId] = applyPanePreferenceToTab(
          {
            ...existingTab,
            title: options.title?.trim() || existingTab.title,
            contentType: options.contentType ?? existingTab.contentType,
            isTemporary: options.temporary ?? existingTab.isTemporary,
            isPinned: options.pin ?? existingTab.isPinned,
          },
          state.layoutMode,
          paneId
        );

        const ownerPaneId = findPaneIdForTab(state.panes, existingTabId);
        if (ownerPaneId && ownerPaneId !== paneId) {
          const ownerPane = state.panes[ownerPaneId];
          const ownerTabIds = ownerPane.tabIds.filter(
            (candidateTabId) => candidateTabId !== existingTabId
          );
          const removedIndex = ownerPane.tabIds.indexOf(existingTabId);

          nextPanes[ownerPaneId] = {
            ...ownerPane,
            tabIds: ownerTabIds,
            activeTabId:
              ownerPane.activeTabId === existingTabId
                ? ownerTabIds[removedIndex] ?? ownerTabIds[removedIndex - 1] ?? null
                : ownerPane.activeTabId,
          };
        }

        if (!nextPane.tabIds.includes(existingTabId)) {
          nextPane.tabIds.push(existingTabId);
        }
        nextPane.activeTabId = existingTabId;
      } else {
        const replaceableTabId = nextPane.tabIds.find((tabId) => {
          const tab = state.tabs[tabId];
          return tab && !tab.isPinned;
        });

        const nextTab = applyPanePreferenceToTab(
          createTab(id, options),
          state.layoutMode,
          paneId
        );

        if (replaceableTabId) {
          const replaceIndex = nextPane.tabIds.indexOf(replaceableTabId);
          delete nextTabs[replaceableTabId];
          nextTabs[nextTab.id] = nextTab;
          nextPane.tabIds.splice(replaceIndex, 1, nextTab.id);
          nextPane.activeTabId = nextTab.id;
        } else {
          nextTabs[nextTab.id] = nextTab;
          nextPane.tabIds.push(nextTab.id);
          nextPane.activeTabId = nextTab.id;
        }
      }

      return {
        panes: nextPanes,
        tabs: nextTabs,
        activePaneId: paneId,
        selectedContentId: id,
        selectedContentType:
          options.contentType ??
          nextTabs[nextPane.activeTabId ?? ""]?.contentType ??
          null,
        openContentIds: getVisibleOpenContentIds(
          state.layoutMode,
          nextPanes,
          nextTabs
        ),
      };
    });
  },

  updateContentTab: (contentId, updates) => {
    commitWorkspace(set, (state) => {
      const tabId = getTabId(contentId);
      const tab = state.tabs[tabId];
      if (!tab) return {};

      const nextTabs = {
        ...state.tabs,
        [tabId]: {
          ...tab,
          ...updates,
        },
      };

      const activeTab = getActiveTab({
        activePaneId: state.activePaneId,
        panes: state.panes,
        tabs: nextTabs,
      });

      return {
        tabs: nextTabs,
        selectedContentType: activeTab?.contentType ?? state.selectedContentType,
      };
    });
  },

  replaceContentTab: (tabId, contentId, options = {}) => {
    commitWorkspace(set, (state) => {
      const existingTab = state.tabs[tabId];
      if (!existingTab) return {};

      const nextTab = createTab(contentId, {
        ...options,
        temporary: options.temporary ?? existingTab.isTemporary,
        pin: options.pin ?? existingTab.isPinned,
      }, {
        preferredHorizontal: existingTab.preferredHorizontal,
        preferredVertical: existingTab.preferredVertical,
      });

      const nextTabs = { ...state.tabs };
      delete nextTabs[tabId];
      nextTabs[nextTab.id] = nextTab;

      const nextPanes = clonePaneRecord(state.panes);
      WORKSPACE_PANE_IDS.forEach((paneId) => {
        const pane = nextPanes[paneId];
        pane.tabIds = pane.tabIds.map((candidateTabId) =>
          candidateTabId === tabId ? nextTab.id : candidateTabId
        );
        if (pane.activeTabId === tabId) {
          pane.activeTabId = nextTab.id;
        }
      });

      const nextSnapshots = Object.fromEntries(
        Object.entries(state.layoutSnapshots).map(([layoutMode, snapshot]) => {
          const nextSnapshotPanes = clonePaneRecord(snapshot.panes);
          WORKSPACE_PANE_IDS.forEach((paneId) => {
            const pane = nextSnapshotPanes[paneId];
            pane.tabIds = pane.tabIds.map((candidateTabId) =>
              candidateTabId === tabId ? nextTab.id : candidateTabId
            );
            if (pane.activeTabId === tabId) {
              pane.activeTabId = nextTab.id;
            }
          });

          return [
            layoutMode,
            {
              ...snapshot,
              panes: nextSnapshotPanes,
            },
          ];
        })
      ) as Record<WorkspaceLayoutMode, WorkspaceLayoutSnapshot>;

      return {
        tabs: nextTabs,
        panes: nextPanes,
        layoutSnapshots: nextSnapshots,
        selectedContentId:
          state.selectedContentId === existingTab.contentId
            ? contentId
            : state.selectedContentId,
        selectedContentType:
          state.selectedContentId === existingTab.contentId
            ? nextTab.contentType
            : state.selectedContentType,
        openContentIds: getVisibleOpenContentIds(
          state.layoutMode,
          nextPanes,
          nextTabs
        ),
      };
    });
  },

  activateContentTab: (tabId) => {
    commitWorkspace(set, (state) => {
      const tab = state.tabs[tabId];
      if (!tab) return {};

      const paneId = findPaneIdForTab(state.panes, tabId) ?? state.activePaneId;
      const pane = state.panes[paneId];
      if (!pane) return {};

      return {
        activePaneId: paneId,
        panes: {
          ...state.panes,
          [paneId]: {
            ...pane,
            activeTabId: tabId,
          },
        },
        selectedContentId: tab.contentId,
        selectedContentType: tab.contentType,
      };
    });
  },

  moveContentTabToPane: (tabId, paneId, options = {}) => {
    commitWorkspace(set, (state) => {
      const tab = state.tabs[tabId];
      if (!tab) return {};
      if (!options.requestedLayoutMode && options.beforeTabId === tabId) {
        return {};
      }

      const requestedLayoutMode =
        options.requestedLayoutMode ??
        (isPaneVisible(state.layoutMode, paneId)
          ? state.layoutMode
          : resolveLayoutModeForPane(state.layoutMode, paneId));

      const preferenceLayoutMode =
        options.placementMode === "explicit" ? requestedLayoutMode : state.layoutMode;
      const nextTabs = {
        ...state.tabs,
        [tabId]: applyPanePreferenceToTab(tab, preferenceLayoutMode, paneId),
      };

      if (options.requestedLayoutMode && options.requestedLayoutMode !== state.layoutMode) {
        const reshapedPanes = deriveLayoutPanes(
          {
            ...state,
            tabs: nextTabs,
          } as ContentState,
          requestedLayoutMode
        );

        const targetPane = reshapedPanes[paneId];
        targetPane.tabIds = insertTabId(targetPane.tabIds, tabId, options.beforeTabId);
        targetPane.activeTabId = tabId;

        getVisiblePaneIds(requestedLayoutMode).forEach((visiblePaneId) => {
          reshapedPanes[visiblePaneId] = createNormalizedPaneState(
            visiblePaneId,
            reshapedPanes[visiblePaneId].tabIds,
            visiblePaneId === paneId
              ? tabId
              : reshapedPanes[visiblePaneId].activeTabId
          );
        });

        const nextActivePaneId = resolveActivePaneForLayout(
          requestedLayoutMode,
          paneId,
          reshapedPanes,
          nextTabs
        );
        const activeTab = getPaneActiveTab(
          { panes: reshapedPanes, tabs: nextTabs },
          nextActivePaneId
        );
        const nextSnapshots = saveLayoutSnapshot(state);

        return {
          layoutMode: requestedLayoutMode,
          panes: reshapedPanes,
          tabs: nextTabs,
          activePaneId: nextActivePaneId,
          layoutSnapshots: {
            ...nextSnapshots,
            [requestedLayoutMode]: {
              activePaneId: nextActivePaneId,
              isInitialized: true,
              panes: clonePaneRecord(reshapedPanes),
            },
          },
          selectedContentId: activeTab?.contentId ?? null,
          selectedContentType: activeTab?.contentType ?? null,
          openContentIds: getVisibleOpenContentIds(
            requestedLayoutMode,
            reshapedPanes,
            nextTabs
          ),
        };
      }

      const nextPanes = clonePaneRecord(state.panes);
      const ownerPaneId = findPaneIdForTab(nextPanes, tabId);
      if (!ownerPaneId) return {};

      const sourcePane = nextPanes[ownerPaneId];
      const sourceIndex = sourcePane.tabIds.indexOf(tabId);
      sourcePane.tabIds = sourcePane.tabIds.filter((candidateTabId) => candidateTabId !== tabId);
      if (sourcePane.activeTabId === tabId) {
        sourcePane.activeTabId =
          sourcePane.tabIds[sourceIndex] ??
          sourcePane.tabIds[sourceIndex - 1] ??
          sourcePane.tabIds[0] ??
          null;
      }

      const targetPane = nextPanes[paneId];
      targetPane.tabIds = insertTabId(targetPane.tabIds, tabId, options.beforeTabId);
      targetPane.activeTabId = tabId;

      const nextLayoutMode = options.requestedLayoutMode ?? state.layoutMode;
      const finalPanes =
        nextLayoutMode === requestedLayoutMode
          ? nextPanes
          : projectPanesToLayout(requestedLayoutMode, nextLayoutMode, nextPanes);
      const nextActivePaneId = resolveActivePaneForLayout(
        nextLayoutMode,
        paneId,
        finalPanes,
        nextTabs
      );
      const activeTab = getPaneActiveTab(
        { panes: finalPanes, tabs: nextTabs },
        nextActivePaneId
      );
      const nextSnapshots = saveLayoutSnapshot(state);

      return {
        layoutMode: nextLayoutMode,
        panes: finalPanes,
        tabs: nextTabs,
        activePaneId: nextActivePaneId,
        layoutSnapshots: {
          ...nextSnapshots,
          [nextLayoutMode]: {
            activePaneId: nextActivePaneId,
            isInitialized: true,
            panes: clonePaneRecord(finalPanes),
          },
        },
        selectedContentId: activeTab?.contentId ?? null,
        selectedContentType: activeTab?.contentType ?? null,
        openContentIds: getVisibleOpenContentIds(
          nextLayoutMode,
          finalPanes,
          nextTabs
        ),
      };
    });
  },

  pinContentTab: (tabId) => {
    commitWorkspace(set, (state) => {
      const resolvedTabId = tabId ?? state.panes[state.activePaneId]?.activeTabId;
      if (!resolvedTabId) return {};
      const tab = state.tabs[resolvedTabId];
      if (!tab || tab.isPinned) return {};

      return {
        tabs: {
          ...state.tabs,
          [resolvedTabId]: {
            ...tab,
            isPinned: true,
            isTemporary: false,
          },
        },
      };
    });
  },

  closeContentTab: (tabId) => {
    commitWorkspace(set, (state) => {
      const tab = state.tabs[tabId];
      if (!tab) return {};

      const nextTabs = { ...state.tabs };
      delete nextTabs[tabId];

      const nextPanes = clonePaneRecord(state.panes);
      let nextSelectedContentId = state.selectedContentId;
      let nextSelectedContentType = state.selectedContentType;
      let nextActivePaneId = state.activePaneId;

      WORKSPACE_PANE_IDS.forEach((paneId) => {
        const pane = nextPanes[paneId];
        if (!pane.tabIds.includes(tabId)) return;

        const removedIndex = pane.tabIds.indexOf(tabId);
        pane.tabIds = pane.tabIds.filter((candidateTabId) => candidateTabId !== tabId);
        if (pane.activeTabId === tabId) {
          pane.activeTabId =
            pane.tabIds[removedIndex] ?? pane.tabIds[removedIndex - 1] ?? null;
        }

        if (paneId === state.activePaneId) {
          const activeTab = pane.activeTabId ? nextTabs[pane.activeTabId] : null;
          nextSelectedContentId = activeTab?.contentId ?? null;
          nextSelectedContentType = activeTab?.contentType ?? null;
          nextActivePaneId = paneId;
        }
      });

      const nextSnapshots = Object.fromEntries(
        Object.entries(state.layoutSnapshots).map(([layoutMode, snapshot]) => {
          const nextSnapshotPanes = clonePaneRecord(snapshot.panes);
          WORKSPACE_PANE_IDS.forEach((paneId) => {
            const pane = nextSnapshotPanes[paneId];
            if (!pane.tabIds.includes(tabId)) return;

            const removedIndex = pane.tabIds.indexOf(tabId);
            pane.tabIds = pane.tabIds.filter((candidateTabId) => candidateTabId !== tabId);
            if (pane.activeTabId === tabId) {
              pane.activeTabId =
                pane.tabIds[removedIndex] ?? pane.tabIds[removedIndex - 1] ?? null;
            }
          });

          return [
            layoutMode,
            {
              ...snapshot,
              panes: nextSnapshotPanes,
            },
          ];
        })
      ) as Record<WorkspaceLayoutMode, WorkspaceLayoutSnapshot>;

      const resolvedActivePaneId = resolveActivePaneForLayout(
        state.layoutMode,
        nextActivePaneId,
        nextPanes,
        nextTabs
      );
      const activeTab = getPaneActiveTab(
        { panes: nextPanes, tabs: nextTabs },
        resolvedActivePaneId
      );

      return {
        tabs: nextTabs,
        panes: nextPanes,
        layoutSnapshots: nextSnapshots,
        activePaneId: resolvedActivePaneId,
        selectedContentId: activeTab?.contentId ?? nextSelectedContentId,
        selectedContentType: activeTab?.contentType ?? nextSelectedContentType,
        openContentIds: getVisibleOpenContentIds(
          state.layoutMode,
          nextPanes,
          nextTabs
        ),
      };
    });
  },

  closeContentTabs: (contentIds) => {
    if (contentIds.length === 0) return;
    const ids = new Set(contentIds);
    const tabIds = Object.values(get().tabs)
      .filter((tab) => ids.has(tab.contentId))
      .map((tab) => tab.id);

    tabIds.forEach((tabId) => {
      get().closeContentTab(tabId);
    });
  },

  clearAllWorkspaceTabs: () => {
    commitWorkspace(set, (state) => {
      const activePaneId = isPaneVisible(state.layoutMode, state.activePaneId)
        ? state.activePaneId
        : TOP_LEFT_PANE_ID;
      return {
        panes: createPaneRecord(),
        layoutSnapshots: {
          single: createSnapshot(activePaneId),
          "dual-vertical": createSnapshot(activePaneId),
          "dual-horizontal": createSnapshot(activePaneId),
          quad: createSnapshot(activePaneId),
        },
        tabs: {},
        selectedContentId: null,
        selectedContentType: null,
        activePaneId,
        openContentIds: [],
      };
    });
  },

  getWorkspaceStateSnapshot: () => createWorkspaceStateSnapshot(get()),

  restoreWorkspace: (workspace) => {
    commitWorkspace(set, (state) => {
      const normalizedWorkspace = normalizeLegacyRestorePanes(workspace);
      const requestedLayoutMode = normalizedWorkspace.layoutMode ?? "single";
      const requestedPaneIds = getVisiblePaneIds(requestedLayoutMode);
      const storedTabPreferences = loadStoredTabPreferences();
      const nextTabs = { ...state.tabs };
      const nextPanes = createEmptyLayoutPanes();

      requestedPaneIds.forEach((paneId) => {
        const contentIds = normalizedWorkspace.paneTabContentIds?.[paneId] ?? [];
        contentIds.forEach((contentId) => {
          const tabId = getTabId(contentId);
          nextTabs[tabId] =
            nextTabs[tabId] ??
            applyPanePreferenceToTab(
              createTab(contentId, {
                pin: true,
                temporary: false,
              }, storedTabPreferences[contentId]),
              requestedLayoutMode,
              paneId
            );
        });
      });

      if (
        normalizedWorkspace.activeContentId &&
        requestedPaneIds.every(
          (paneId) =>
            !(normalizedWorkspace.paneTabContentIds?.[paneId] ?? []).includes(
              normalizedWorkspace.activeContentId as string
            )
        )
      ) {
        const targetPaneId =
          normalizedWorkspace.activePaneId &&
          requestedPaneIds.includes(normalizedWorkspace.activePaneId)
            ? normalizedWorkspace.activePaneId
            : requestedPaneIds[0];
        const existingContentIds =
          normalizedWorkspace.paneTabContentIds?.[targetPaneId] ?? [];
        normalizedWorkspace.paneTabContentIds = {
          ...normalizedWorkspace.paneTabContentIds,
          [targetPaneId]: [...existingContentIds, normalizedWorkspace.activeContentId],
        };

        const tabId = getTabId(normalizedWorkspace.activeContentId);
        nextTabs[tabId] =
          nextTabs[tabId] ??
          applyPanePreferenceToTab(
            createTab(normalizedWorkspace.activeContentId, {
              pin: true,
              temporary: false,
            }, storedTabPreferences[normalizedWorkspace.activeContentId]),
            requestedLayoutMode,
            targetPaneId
          );
      }

      requestedPaneIds.forEach((paneId) => {
        const contentIds = (normalizedWorkspace.paneTabContentIds?.[paneId] ?? [])
          .map((contentId) => getTabId(contentId))
          .filter((tabId) => Boolean(nextTabs[tabId]));
        nextPanes[paneId] = createNormalizedPaneState(
          paneId,
          contentIds,
          normalizedWorkspace.activePaneId === paneId
            ? normalizedWorkspace.activeContentId
              ? getTabId(normalizedWorkspace.activeContentId)
              : null
            : null
        );
      });

      const nextActivePaneId = resolveActivePaneForLayout(
        requestedLayoutMode,
        normalizedWorkspace.activePaneId ?? TOP_LEFT_PANE_ID,
        nextPanes,
        nextTabs
      );
      const activeTab = getPaneActiveTab(
        { panes: nextPanes, tabs: nextTabs },
        nextActivePaneId
      );

      const nextSnapshots = {
        ...state.layoutSnapshots,
        [requestedLayoutMode]: {
          activePaneId: nextActivePaneId,
          isInitialized: true,
          panes: clonePaneRecord(nextPanes),
        },
      };

      return {
        layoutMode: requestedLayoutMode,
        activePaneId: nextActivePaneId,
        panes: nextPanes,
        layoutSnapshots: nextSnapshots,
        tabs: nextTabs,
        selectedContentId: activeTab?.contentId ?? null,
        selectedContentType: activeTab?.contentType ?? null,
        openContentIds: getVisibleOpenContentIds(
          requestedLayoutMode,
          nextPanes,
          nextTabs
        ),
      };
    });
  },

  clearSelection: () => {
    commitWorkspace(set, () => ({
      selectedContentId: null,
      selectedContentType: null,
      multiSelectedIds: [],
      lastClickedId: null,
    }));
  },

  toggleMultiSelect: (id) => {
    set((state) => {
      const isSelected = state.multiSelectedIds.includes(id);
      const multiSelectedIds = isSelected
        ? state.multiSelectedIds.filter((selectedId) => selectedId !== id)
        : [...state.multiSelectedIds, id];

      return {
        multiSelectedIds,
        lastClickedId: id,
      };
    });
  },

  setMultiSelect: (ids) => {
    set({ multiSelectedIds: ids });
  },

  clearMultiSelect: () => {
    set({ multiSelectedIds: [], lastClickedId: null });
  },

  isMultiSelected: (id) => get().multiSelectedIds.includes(id),
}));

export {
  TOP_LEFT_PANE_ID,
  TOP_RIGHT_PANE_ID,
  BOTTOM_LEFT_PANE_ID,
  BOTTOM_RIGHT_PANE_ID,
  WORKSPACE_PANE_IDS,
  getVisiblePaneIds,
  getPaneLabel,
  getPaneActiveContentId,
  getPaneActiveTab,
};
