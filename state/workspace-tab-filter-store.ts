import { create } from "zustand";

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
 * Deliberately not persisted: filters are transient view state, and a filter
 * surviving a reload would hide tabs with no obvious cause.
 */

export type TabFilterMode = "only" | "hidden";

interface WorkspaceTabFilterState {
  filters: Record<string, TabFilterMode>;
  cycleFilter: (groupKey: string) => void;
  clearFilters: () => void;
  /** Drop filters whose type is no longer open anywhere in the workspace. */
  pruneFilters: (presentKeys: readonly string[]) => void;
}

export const useWorkspaceTabFilterStore = create<WorkspaceTabFilterState>()(
  (set) => ({
    filters: {},
    cycleFilter: (groupKey) =>
      set((state) => {
        const next = { ...state.filters };
        const current = next[groupKey];
        if (current === undefined) next[groupKey] = "only";
        else if (current === "only") next[groupKey] = "hidden";
        else delete next[groupKey];
        return { filters: next };
      }),
    clearFilters: () => set({ filters: {} }),
    pruneFilters: (presentKeys) =>
      set((state) => {
        const present = new Set(presentKeys);
        const stale = Object.keys(state.filters).filter(
          (key) => !present.has(key)
        );
        if (stale.length === 0) return state;
        const next = { ...state.filters };
        for (const key of stale) delete next[key];
        return { filters: next };
      }),
  })
);

/** Strict AND across every active filter (see module docstring). */
export function isTabGroupVisible(
  filters: Record<string, TabFilterMode>,
  groupKey: string
): boolean {
  for (const [key, mode] of Object.entries(filters)) {
    if (mode === "only" && key !== groupKey) return false;
    if (mode === "hidden" && key === groupKey) return false;
  }
  return true;
}
