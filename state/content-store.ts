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
// Synchronous first-frame title source (spec §3.8). The workspace snapshot
// (which carries titles) only arrives after a network round-trip, but the
// URL-restore path recreates tabs synchronously on mount. Persisting last-known
// titles here lets restoreWorkspace name tabs on the first frame after a cold
// reload — no "Loading…" flash, no per-tab title fetch.
const TAB_TITLES_KEY = "workspaceTabTitles";

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
  /**
   * Positional open (drag-drop onto a tab strip): insert the tab before this
   * tab id, or append at the end when null. When set, a new tab never
   * replaces the pane's preview (non-pinned) tab — the drop point is an
   * explicit placement. Omit for the classic preview-replacement behavior.
   */
  beforeTabId?: string | null;
}

interface WorkspaceRestoreOptions {
  activeContentId: string | null;
  activePaneId?: WorkspacePaneId | null;
  layoutMode?: WorkspaceLayoutMode;
  paneTabContentIds?: Partial<Record<WorkspacePaneId, string[]>>;
  tabContentIds?: string[];
  secondaryTabContentIds?: string[];
  /**
   * Per-content title + type from the restored workspace snapshot, so tabs
   * paint named (and typed) on the first frame instead of "Loading…" and a
   * post-mount title fetch (spec §3.8). Keyed by contentId.
   */
  tabMeta?: Record<string, { title?: string | null; contentType?: string | null }>;
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
  /**
   * Idempotently apply titles/types onto existing tabs from a resolved
   * workspace snapshot. Order-independent: tabs may have been created by the
   * URL-restore path (which has no titles) before the workspace snapshot
   * arrives, so this backfills any tab still showing the "Loading…" default
   * (spec §3.8). Keyed by contentId. Never overwrites a real title.
   */
  backfillTabMeta: (
    tabMeta: Record<string, { title?: string | null; contentType?: string | null }>
  ) => void;
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

/**
 * The garden content the user is actively VIEWING — the focused pane's active tab
 * — as a lightweight hint for the chat: contentId + title, ONLY for text-bearing
 * content (note/folder, what getCurrentNote can read). The internal twin of
 * getCurrentPageHint (which serves the external co-browse page): this lets the
 * sidebar chat resolve "this doc / this note / the page I'm viewing" without the
 * user naming it. Returns null when nothing readable is focused, and harmlessly
 * null in the embed panel (default store, no panes). Read at chat send-time.
 */
export function getActiveViewedContentHint(): {
  contentId: string;
  title: string;
} | null {
  const state = useContentStore.getState();
  const activeTab = getActiveTab(state);
  if (!activeTab?.contentId) return null;
  const type = activeTab.contentType;
  // Only note/folder are readable as text via getCurrentNote; skip image/pdf/etc.
  if (type && type !== "note" && type !== "folder") return null;
  return { contentId: activeTab.contentId, title: activeTab.title?.trim() || "" };
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

// ── surface layout capability ─────────────────────────────────────────────
// Pane geometry (layoutMode + which pane each tab sits in) is workspace-shared
// state, but not every surface can RENDER it. The extension panel iframe is one
// pane wide; a mobile client will be too. Such a surface has to show the
// workspace's tabs WITHOUT asserting that the workspace is single-pane —
// otherwise its projection gets persisted and flattens the split everywhere.
//
// This is a different failure class from the stale-peer one the tombstones and
// the `baseUpdatedAt` guard address, and neither of those can help with it: a
// constrained surface's write is perfectly ordered and perfectly fresh. It's
// just describing a viewport, not the workspace. Ordered last-writer-wins still
// converges on whoever wrote last.
//
// Declaring a constraint does two symmetric things:
//   READ  — restoreWorkspace clamps incoming geometry to this surface, folding
//           hidden panes' tabs into the ones it has, rather than adopting a
//           layout it will immediately override (an override that is itself a
//           persisted mutation — that was the actual bug).
//   WRITE — the sync layer marks this surface's payloads non-authoritative and
//           the server folds in membership only, keeping stored geometry.
//
// Divergence between surfaces on the same workspace is the intended outcome
// here, not a bug to reconcile.
let surfaceLayoutMode: WorkspaceLayoutMode | null = null;

/**
 * Pin this surface to one layout and stop it from owning workspace geometry.
 * Pass null to restore full authority (the default for the app shell).
 *
 * Call at module scope, not in an effect: children's effects run before their
 * parents', so a shell that declared this in `useEffect` would lose the race
 * against the workspace restore mounted inside it.
 */
export function constrainSurfaceLayout(mode: WorkspaceLayoutMode | null) {
  surfaceLayoutMode = mode;
}

/** False when this surface projects workspace geometry rather than owning it. */
export function isSurfaceLayoutAuthoritative() {
  return surfaceLayoutMode === null;
}

/**
 * Fold a pane→contentIds map from one layout into another, preserving order and
 * dropping duplicates. Used when a constrained surface adopts a wider layout's
 * tab set: every tab stays reachable, just in fewer panes.
 */
function collapsePaneContentIdsForLayout(
  sourceLayoutMode: WorkspaceLayoutMode,
  targetLayoutMode: WorkspaceLayoutMode,
  paneTabContentIds: Partial<Record<WorkspacePaneId, string[]>>
): Partial<Record<WorkspacePaneId, string[]>> {
  const collapsed: Partial<Record<WorkspacePaneId, string[]>> = {};

  getVisiblePaneIds(sourceLayoutMode).forEach((sourcePaneId) => {
    const targetPaneId = collapsePaneIdForLayout(targetLayoutMode, sourcePaneId);
    const existing = collapsed[targetPaneId] ?? [];
    collapsed[targetPaneId] = [
      ...existing,
      ...(paneTabContentIds[sourcePaneId] ?? []).filter(
        (contentId) => !existing.includes(contentId)
      ),
    ];
  });

  return collapsed;
}

// ── pending workspace intents ─────────────────────────────────────────────
// Opening and closing a tab are the two operations a snapshot-replication model
// can't express on its own. Every surface rendering MainPanelWorkspace (app
// window, extension panel iframe, tree overlay) persists the WHOLE pane
// snapshot, and `restoreWorkspace` replaces the visible tab set wholesale
// rather than merging — so any remote snapshot that predates a local change
// silently undoes it:
//
//   close → a peer that hasn't seen it re-asserts the tab, and the restore
//           faithfully puts it back.
//   open  → the server's set doesn't contain the tab yet, and the restore
//           erases it. This is the sub-second window between opening content
//           and the debounced write landing; with a second window active, any
//           write from it triggers a reconcile that lands inside that window.
//
// Optimistic concurrency (workspace-store.writeWorkspaceState) stops a STALE
// peer's write from landing, but can't help either case: a fresh reconcile is
// not stale, it just predates a change this surface hasn't published yet.
//
// So local changes record an INTENT, and `restoreWorkspace` reconciles incoming
// snapshots against it — subtracting unconfirmed closes, re-adding unconfirmed
// opens. The two are opposites over the same key, so one entry per content id.
//
// LIFETIME — an intent covers exactly the gap between "I changed it" and "the
// server agrees", and is dropped the moment any of these is true:
//
//  1. The write landed (`confirmWorkspaceWrite`). Once the server holds a
//     snapshot expressing the change, every stale peer's write 409s and
//     reconciles toward it, so the intent has no job left. This is the normal
//     exit, and it's why an intent can't outlive its purpose: a peer that
//     LEGITIMATELY reverses the change a second later is obeyed, not ignored.
//  2. The opposite intent was recorded locally — an explicit override.
//  3. The active workspace changed (`clearPendingWorkspaceIntents`). Intents
//     are keyed by content id, but workspaces are separate documents; an intent
//     only ever defended against THIS workspace's peers. Carried across a
//     switch it would edit the incoming workspace's layout — and that surface
//     would then persist the edit, corrupting a workspace that never made it.
//
// The elapsed-time check is a BACKSTOP for case 1 never happening — offline, a
// suspended tab, a server erroring. It is deliberately generous because the
// normal path never reaches it, and an immortal intent is the worst outcome
// available here: a tab this surface silently refuses to display, or refuses to
// let go of.
//
// Local-only and deliberately so: the server-side truth is the guarded write.
type PendingWorkspaceIntent = { kind: "open" | "close"; at: number };
const pendingWorkspaceIntents = new Map<string, PendingWorkspaceIntent>();

// Standalone default. The workplaces extension overrides this off its real poll
// interval via configurePendingIntentBackstop() — see workspace-sync.ts — so
// the two can't drift apart if that interval is ever retuned.
let pendingIntentBackstopMs = 300_000;

/**
 * Set the backstop lifetime for pending intents. Called by the sync layer that
 * owns the actual peer-convergence interval; the content store has no business
 * knowing that number (and deliberately imports nothing from extensions).
 */
export function configurePendingIntentBackstop(ms: number) {
  if (Number.isFinite(ms) && ms > 0) pendingIntentBackstopMs = ms;
}

function rememberIntent(
  contentId: string | null | undefined,
  kind: PendingWorkspaceIntent["kind"]
) {
  if (!contentId) return;
  // Recording the opposite intent replaces the previous one (case 2 above):
  // re-opening what you just closed is an explicit override, and vice versa.
  pendingWorkspaceIntents.set(contentId, { kind, at: Date.now() });
}

/**
 * A pane snapshot was accepted by the server. An intent is durable truth once
 * the accepted payload agrees with it — present for an open, absent for a
 * close — so those intents retire.
 *
 * Keyed on the accepted payload rather than "some write succeeded" on purpose:
 * a write already in flight when the user acts carries the pre-change snapshot.
 * Retiring on its ack would drop the intent on the strength of a write that
 * never expressed the change.
 */
export function confirmWorkspaceWrite(writtenContentIds: Iterable<string>) {
  const written = new Set(writtenContentIds);
  for (const [contentId, intent] of [...pendingWorkspaceIntents]) {
    const durable =
      intent.kind === "open" ? written.has(contentId) : !written.has(contentId);
    if (durable) pendingWorkspaceIntents.delete(contentId);
  }
}

/** Drop every intent — see case 3 above (active workspace changed). */
export function clearPendingWorkspaceIntents() {
  pendingWorkspaceIntents.clear();
}

/**
 * Record open intents for content a surface is about to restore locally.
 *
 * Needed by the `?content=` / `tabs_*` URL path in MainPanelWorkspace, which
 * calls `restoreWorkspace` directly and so never passes through
 * `setSelectedContentId` (nor the workspace open guard). Without this, a
 * deep-linked tab is unprotected for the ~700ms before its first write lands,
 * and a reconcile in that window erases it — the "flashes then disappears"
 * report, which needs a second window to make the reconcile happen at all.
 */
export function markLocalOpenIntents(
  contentIds: Iterable<string | null | undefined>
) {
  for (const contentId of contentIds) rememberIntent(contentId, "open");
}

/**
 * This surface's unpublished intent for `contentId`, or null when the server is
 * already in agreement (or the backstop has expired).
 */
function pendingIntentFor(
  contentId: string
): PendingWorkspaceIntent["kind"] | null {
  const intent = pendingWorkspaceIntents.get(contentId);
  if (!intent) return null;
  if (Date.now() - intent.at > pendingIntentBackstopMs) {
    pendingWorkspaceIntents.delete(contentId);
    return null;
  }
  return intent.kind;
}

/** Content this surface has opened but not yet published. */
function getPendingOpenContentIds(): string[] {
  return [...pendingWorkspaceIntents.keys()].filter(
    (contentId) => pendingIntentFor(contentId) === "open"
  );
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
  tabMeta,
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
      tabMeta,
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
    tabMeta,
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

type StoredTabTitleMap = Record<string, { title: string; contentType: string | null }>;

function loadStoredTabTitles(): StoredTabTitleMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(TAB_TITLES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      { title?: unknown; contentType?: unknown }
    >;
    const result: StoredTabTitleMap = {};
    for (const [contentId, entry] of Object.entries(parsed)) {
      if (!contentId || typeof entry?.title !== "string") continue;
      result[contentId] = {
        title: entry.title,
        contentType:
          typeof entry.contentType === "string" ? entry.contentType : null,
      };
    }
    return result;
  } catch {
    return {};
  }
}

function saveStoredTabTitles(tabs: Record<string, WorkspaceTabState>) {
  if (typeof window === "undefined") return;

  // Merge over the existing cache so closing a tab doesn't evict its title —
  // the cache is a best-effort name source, not a mirror of open tabs.
  const existing = loadStoredTabTitles();
  let changed = false;
  for (const tab of Object.values(tabs)) {
    // Only cache resolved titles, never the "Loading…" placeholder.
    if (!tab.title || tab.title === "Loading...") continue;
    const prev = existing[tab.contentId];
    if (prev?.title === tab.title && prev?.contentType === tab.contentType) {
      continue;
    }
    existing[tab.contentId] = { title: tab.title, contentType: tab.contentType };
    changed = true;
  }

  if (!changed) return;
  try {
    localStorage.setItem(TAB_TITLES_KEY, JSON.stringify(existing));
  } catch {
    // Quota/serialization failure is non-fatal — titles just won't be cached.
  }
}

/**
 * `temp-*` ids are optimistic/unsaved placeholders (a folder/doc mid-creation).
 * They must never be persisted to the URL or localStorage: on reload they'd be
 * restored as a tab that can't load (no real ContentNode → 404 / "failed to
 * load content"). The server snapshot already drops them (owned-content
 * filter); this guards the client URL persistence.
 */
function isPersistableContentId(id: string | null | undefined): id is string {
  return Boolean(id) && !id!.startsWith("temp-");
}

function syncBrowserState(state: Pick<
  ContentState,
  "selectedContentId" | "panes" | "tabs" | "activePaneId" | "layoutMode"
>) {
  if (typeof window === "undefined") return;

  const visiblePaneIds = getVisiblePaneIds(state.layoutMode);
  const activeTab = getActiveTab(state);
  const rawRestorable = state.selectedContentId ?? activeTab?.contentId ?? null;
  const restorableContentId = isPersistableContentId(rawRestorable)
    ? rawRestorable
    : null;

  if (restorableContentId) {
    localStorage.setItem(LAST_SELECTED_KEY, restorableContentId);
  } else {
    localStorage.removeItem(LAST_SELECTED_KEY);
  }

  saveTabPreferences(state.tabs);
  saveStoredTabTitles(state.tabs);

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
      .filter(isPersistableContentId);

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
      // A constrained surface can't leave its pinned layout — and must not try,
      // since every layout change here is a persisted workspace mutation.
      if (surfaceLayoutMode && mode !== surfaceLayoutMode) return {};

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

    // Every user-initiated open funnels through here (openContentInPane
    // delegates to it), so this is where an open intent is recorded — it both
    // overrides a pending close and protects the new tab from a reconcile that
    // lands before the debounced write does. restoreWorkspace deliberately
    // records nothing: that's the remote path intents exist to filter.
    rememberIntent(id, "open");

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

        if (
          options.beforeTabId !== undefined &&
          options.beforeTabId !== existingTabId
        ) {
          nextPane.tabIds = insertTabId(
            nextPane.tabIds,
            existingTabId,
            options.beforeTabId
          );
        } else if (!nextPane.tabIds.includes(existingTabId)) {
          // Also the beforeTabId === existingTabId case: dropping a tab onto
          // its own slot keeps it in place (or appends it if it was just
          // pulled out of another pane).
          nextPane.tabIds.push(existingTabId);
        }
        nextPane.activeTabId = existingTabId;
      } else {
        // Positional opens land exactly where they were dropped, so the
        // preview-replacement slot only applies when no beforeTabId is given.
        const replaceableTabId =
          options.beforeTabId === undefined
            ? nextPane.tabIds.find((tabId) => {
                const tab = state.tabs[tabId];
                return tab && !tab.isPinned;
              })
            : undefined;

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
          nextPane.tabIds = insertTabId(
            nextPane.tabIds,
            nextTab.id,
            options.beforeTabId ?? null
          );
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

      rememberIntent(tab.contentId, "close");

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
      Object.values(state.tabs).forEach((tab) =>
        rememberIntent(tab.contentId, "close")
      );
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
      const incomingLayoutMode = normalizedWorkspace.layoutMode ?? "single";
      // A constrained surface adopts the workspace's TABS but keeps its own
      // geometry: without this it would render the incoming layout, then flip
      // back via setLayoutMode — and that flip is a persisted mutation, so the
      // narrow surface would broadcast its shape to every other surface.
      const requestedLayoutMode = surfaceLayoutMode ?? incomingLayoutMode;
      if (requestedLayoutMode !== incomingLayoutMode) {
        normalizedWorkspace.layoutMode = requestedLayoutMode;
        normalizedWorkspace.paneTabContentIds = collapsePaneContentIdsForLayout(
          incomingLayoutMode,
          requestedLayoutMode,
          normalizedWorkspace.paneTabContentIds ?? {}
        );
      }
      const requestedPaneIds = getVisiblePaneIds(requestedLayoutMode);
      const storedTabPreferences = loadStoredTabPreferences();
      // Synchronous first-frame title fallback (spec §3.8): when this restore
      // came from the title-blind URL path, tabMeta is empty — seed names from
      // the persisted cache so tabs don't flash "Loading…" before the snapshot.
      const storedTabTitles = loadStoredTabTitles();
      const nextTabs = { ...state.tabs };
      const nextPanes = createEmptyLayoutPanes();

      // Reconcile against this surface's UNPUBLISHED intents BEFORE rebuilding
      // panes. This path replaces the visible tab set wholesale rather than
      // merging, so a snapshot predating a local change silently undoes it —
      // in both directions. Mutating normalizedWorkspace (not just the loop
      // below) keeps the activeContentId re-add further down consistent.
      const intentPaneId =
        normalizedWorkspace.activePaneId &&
        requestedPaneIds.includes(normalizedWorkspace.activePaneId)
          ? normalizedWorkspace.activePaneId
          : requestedPaneIds[0];

      const reconciledPaneContentIds = Object.fromEntries(
        Object.entries(normalizedWorkspace.paneTabContentIds ?? {}).map(
          ([paneId, contentIds]) => [
            paneId,
            (contentIds ?? []).filter(
              (contentId) => pendingIntentFor(contentId) !== "close"
            ),
          ]
        )
      ) as Partial<Record<WorkspacePaneId, string[]>>;

      const alreadyPresent = new Set(
        Object.values(reconciledPaneContentIds).flatMap((ids) => ids ?? [])
      );
      const pendingOpens = getPendingOpenContentIds().filter(
        (contentId) => !alreadyPresent.has(contentId)
      );
      if (pendingOpens.length > 0) {
        reconciledPaneContentIds[intentPaneId] = [
          ...(reconciledPaneContentIds[intentPaneId] ?? []),
          ...pendingOpens,
        ];
      }
      normalizedWorkspace.paneTabContentIds = reconciledPaneContentIds;

      if (
        normalizedWorkspace.activeContentId &&
        pendingIntentFor(normalizedWorkspace.activeContentId) === "close"
      ) {
        normalizedWorkspace.activeContentId = null;
      }
      // A tab re-added here was almost certainly what the user was just looking
      // at. `restoreContentWorkspace`'s preferActiveContentId can't protect it
      // — that guard requires the local active tab to exist in the INCOMING
      // snapshot, which by definition it doesn't yet.
      if (
        state.selectedContentId &&
        pendingOpens.includes(state.selectedContentId)
      ) {
        normalizedWorkspace.activeContentId = state.selectedContentId;
      }

      requestedPaneIds.forEach((paneId) => {
        const contentIds = normalizedWorkspace.paneTabContentIds?.[paneId] ?? [];
        contentIds.forEach((contentId) => {
          const tabId = getTabId(contentId);
          const meta = normalizedWorkspace.tabMeta?.[contentId];
          const cached = storedTabTitles[contentId];
          nextTabs[tabId] =
            nextTabs[tabId] ??
            applyPanePreferenceToTab(
              createTab(contentId, {
                pin: true,
                temporary: false,
                title: meta?.title ?? cached?.title ?? undefined,
                contentType: meta?.contentType ?? cached?.contentType ?? undefined,
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
        const activeMeta =
          normalizedWorkspace.tabMeta?.[normalizedWorkspace.activeContentId];
        const activeCached =
          storedTabTitles[normalizedWorkspace.activeContentId];
        nextTabs[tabId] =
          nextTabs[tabId] ??
          applyPanePreferenceToTab(
            createTab(normalizedWorkspace.activeContentId, {
              pin: true,
              temporary: false,
              title: activeMeta?.title ?? activeCached?.title ?? undefined,
              contentType:
                activeMeta?.contentType ?? activeCached?.contentType ?? undefined,
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

  backfillTabMeta: (tabMeta) => {
    set((state) => {
      let changedTabs = false;
      const nextTabs: Record<string, WorkspaceTabState> = {};
      for (const [tabId, tab] of Object.entries(state.tabs)) {
        const meta = tabMeta[tab.contentId];
        if (!meta) {
          nextTabs[tabId] = tab;
          continue;
        }
        // Only fill gaps — never clobber a title/type the tab already has.
        const needsTitle =
          Boolean(meta.title) && (!tab.title || tab.title === "Loading...");
        const needsType = Boolean(meta.contentType) && tab.contentType === null;
        if (!needsTitle && !needsType) {
          nextTabs[tabId] = tab;
          continue;
        }
        changedTabs = true;
        nextTabs[tabId] = {
          ...tab,
          title: needsTitle ? (meta.title as string) : tab.title,
          contentType: needsType ? (meta.contentType as string) : tab.contentType,
        };
      }

      // The right sidebar resolves its saved tab against selectedContentType
      // (spec §3.4 / Phase A regression): if the selection was restored by a
      // title-blind path, contentType is null and the chat tab resolves away.
      // Repair it from the snapshot here.
      const selectedMeta = state.selectedContentId
        ? tabMeta[state.selectedContentId]
        : undefined;
      const needsSelectedType =
        state.selectedContentType === null && Boolean(selectedMeta?.contentType);

      if (!changedTabs && !needsSelectedType) return state;

      // Persist the freshly-applied titles so the next cold reload names tabs
      // on the first frame. backfill bypasses commitWorkspace/syncBrowserState
      // (it must not rewrite the URL mid-restore), so cache the titles here.
      if (changedTabs) saveStoredTabTitles(nextTabs);

      return {
        tabs: changedTabs ? nextTabs : state.tabs,
        selectedContentType: needsSelectedType
          ? (selectedMeta?.contentType as string)
          : state.selectedContentType,
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
