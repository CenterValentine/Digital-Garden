import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  WorkspacePaneId,
  WorkspacePaneState,
  WorkspaceTabState,
} from "@/state/content-store";

/**
 * Workspace tab-type filters.
 *
 * Keyed by the tab-icon group key (see components/content/headers/tab-icons.ts),
 * so content types that share an icon share one filter. Each key cycles
 * off → "only" (show only this type) → "hidden" (hide this type) → off.
 *
 * Every active filter is honored as a strict AND — overlapping or
 * contradictory filters (two different "only"s, or "only" + "hidden" on the
 * same type) legitimately resolve to zero visible tabs.
 *
 * Filters are scoped per workspace (the workplaces store keeps
 * `activeWorkspaceId` in sync; a null id falls back to a shared "default"
 * scope when no workspace context exists) and persisted, so a workspace's
 * filters are waiting when the user comes back to it. A saved filter whose
 * type currently has no open tab is INERT rather than deleted — consumers
 * apply `getEffectiveTabFilters` at read time, so the filter can't hide
 * anything invisibly, but it stands and re-applies (with its affordance
 * visible) the next time a tab of that type opens.
 */

export type TabFilterMode = "only" | "hidden";
export type TabFilterMap = Record<string, TabFilterMode>;

const DEFAULT_SCOPE = "default";
const EMPTY_FILTERS: TabFilterMap = {};

interface WorkspaceTabFilterState {
  /** Filter maps keyed by workspace id (DEFAULT_SCOPE when no workspace). */
  filtersByWorkspace: Record<string, TabFilterMap>;
  /** Synced from the workplaces store; not persisted. */
  activeWorkspaceId: string | null;
  setActiveWorkspace: (workspaceId: string | null) => void;
  cycleFilter: (groupKey: string) => void;
  clearFilters: () => void;
}

function scopeKey(activeWorkspaceId: string | null) {
  return activeWorkspaceId ?? DEFAULT_SCOPE;
}

export const useWorkspaceTabFilterStore = create<WorkspaceTabFilterState>()(
  persist(
    (set) => ({
      filtersByWorkspace: {},
      activeWorkspaceId: null,
      setActiveWorkspace: (workspaceId) =>
        set({ activeWorkspaceId: workspaceId }),
      cycleFilter: (groupKey) =>
        set((state) => {
          const scope = scopeKey(state.activeWorkspaceId);
          const next = {
            ...(state.filtersByWorkspace[scope] ?? EMPTY_FILTERS),
          };
          const current = next[groupKey];
          if (current === undefined) next[groupKey] = "only";
          else if (current === "only") next[groupKey] = "hidden";
          else delete next[groupKey];
          return {
            filtersByWorkspace: {
              ...state.filtersByWorkspace,
              [scope]: next,
            },
          };
        }),
      clearFilters: () =>
        set((state) => {
          const scope = scopeKey(state.activeWorkspaceId);
          if (!state.filtersByWorkspace[scope]) return state;
          const next = { ...state.filtersByWorkspace };
          delete next[scope];
          return { filtersByWorkspace: next };
        }),
    }),
    {
      name: "notes:workspace-tab-filters",
      version: 1,
      partialize: (state) => ({
        filtersByWorkspace: state.filtersByWorkspace,
      }),
    },
  ),
);

/** The active workspace's filter map (stable empty object when none). */
export function selectActiveTabFilters(
  state: WorkspaceTabFilterState,
): TabFilterMap {
  return (
    state.filtersByWorkspace[scopeKey(state.activeWorkspaceId)] ?? EMPTY_FILTERS
  );
}

/**
 * Tabs actually attached to a pane — the active workspace's real strip
 * content. The content store's `tabs` record accumulates entries across
 * workspace switches (restoreWorkspace merges, panes are rebuilt), so
 * deriving anything workspace-scoped from `tabs` alone leaks other
 * workspaces' content.
 */
export function collectPaneAttachedTabs(
  panes: Record<WorkspacePaneId, WorkspacePaneState>,
  tabs: Record<string, WorkspaceTabState>,
): WorkspaceTabState[] {
  const seen = new Set<string>();
  const attached: WorkspaceTabState[] = [];
  for (const pane of Object.values(panes)) {
    for (const tabId of pane.tabIds) {
      if (seen.has(tabId)) continue;
      seen.add(tabId);
      const tab = tabs[tabId];
      if (tab) attached.push(tab);
    }
  }
  return attached;
}

/**
 * Restrict a filter map to the group keys that currently have an open tab.
 * A filter with no open tabs of its type must be inert: an "only" on an
 * absent type would blank the whole strip with no affordance visible to
 * explain why.
 */
export function getEffectiveTabFilters(
  filters: TabFilterMap,
  presentKeys: ReadonlySet<string>,
): TabFilterMap {
  const entries = Object.entries(filters).filter(([key]) =>
    presentKeys.has(key),
  );
  if (entries.length === Object.keys(filters).length) return filters;
  return Object.fromEntries(entries);
}

/** Strict AND across every active filter (see module docstring). */
export function isTabGroupVisible(
  filters: TabFilterMap,
  groupKey: string,
): boolean {
  for (const [key, mode] of Object.entries(filters)) {
    if (mode === "only" && key !== groupKey) return false;
    if (mode === "hidden" && key === groupKey) return false;
  }
  return true;
}
