/**
 * Right Sidebar State Store
 *
 * Persists the active right-sidebar tab per content id so switching tabs or
 * temporarily leaving the content view restores the correct sidebar surface.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightSidebarTab =
  | "backlinks"
  | "outline"
  | "tags"
  | "chat"
  | "properties"
  | "publish"
  | "studio"
  | "context"
  | "database"
  | "extension";

// Outline leads the rail (2026-07-16); "backlinks"/"tags" remain in the union
// only so persisted per-content values from before the Context merge still
// parse — resolveRightSidebarTab falls them back to an available tab.
export const DEFAULT_RIGHT_SIDEBAR_TAB: RightSidebarTab = "outline";

interface RightSidebarState {
  activeTabByContentId: Record<string, RightSidebarTab>;
  /**
   * The tab the user last CHOSE, on any content (owner, 2026-10-08): content
   * with no tab of its own opens on this rail instead of the first one, so
   * moving through notes keeps you in the panel you were working in. Set only
   * by an explicit tab click (`recordEngagedTab`), never by programmatic
   * opens or the live Properties override.
   */
  lastEngagedTab: RightSidebarTab | null;
  setActiveTab: (contentId: string, tab: RightSidebarTab) => void;
  recordEngagedTab: (tab: RightSidebarTab) => void;
  clearContentState: (contentId: string) => void;
}

/** Tabs that describe a moment, not a place to return to. */
const NOT_A_DEFAULT: ReadonlySet<RightSidebarTab> = new Set(["properties"]);

/**
 * The tab to show: the content's own saved tab, else the rail the user last
 * engaged with, else the first available — each only if this content offers it.
 */
export function defaultRightSidebarTab(
  savedTab: RightSidebarTab | null | undefined,
  lastEngagedTab: RightSidebarTab | null | undefined,
  availableTabs: RightSidebarTab[]
): RightSidebarTab {
  if (savedTab) return resolveRightSidebarTab(savedTab, availableTabs);
  return resolveRightSidebarTab(lastEngagedTab, availableTabs);
}

export function resolveRightSidebarTab(
  savedTab: RightSidebarTab | null | undefined,
  availableTabs: RightSidebarTab[]
): RightSidebarTab {
  const fallback = availableTabs[0] ?? DEFAULT_RIGHT_SIDEBAR_TAB;

  if (!savedTab) {
    return fallback;
  }

  if (availableTabs.length > 0 && !availableTabs.includes(savedTab)) {
    return fallback;
  }

  return savedTab;
}

export const useRightSidebarStateStore = create<RightSidebarState>()(
  persist(
    (set) => ({
      activeTabByContentId: {},
      lastEngagedTab: null,

      setActiveTab: (contentId, tab) =>
        set((state) => ({
          activeTabByContentId: {
            ...state.activeTabByContentId,
            [contentId]: tab,
          },
        })),

      recordEngagedTab: (tab) =>
        set((state) =>
          NOT_A_DEFAULT.has(tab) || state.lastEngagedTab === tab ? state : { lastEngagedTab: tab }
        ),

      clearContentState: (contentId) =>
        set((state) => {
          const nextState = { ...state.activeTabByContentId };
          delete nextState[contentId];
          return { activeTabByContentId: nextState };
        }),
    }),
    {
      name: "right-sidebar-state",
      version: 1,
      // Deferred hydration: the right sidebar's active-tab-per-content
      // mapping affects an inert sidebar that isn't load-bearing on
      // first paint. Defaults to "backlinks" tab on cold render; real
      // last-active tab loads after FCP via
      // lib/features/stores/deferred-store-hydrator.tsx.
      skipHydration: true,
    }
  )
);
