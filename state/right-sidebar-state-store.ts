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
  | "extension";

// Outline leads the rail (2026-07-16); "backlinks"/"tags" remain in the union
// only so persisted per-content values from before the Context merge still
// parse — resolveRightSidebarTab falls them back to an available tab.
export const DEFAULT_RIGHT_SIDEBAR_TAB: RightSidebarTab = "outline";

interface RightSidebarState {
  activeTabByContentId: Record<string, RightSidebarTab>;
  setActiveTab: (contentId: string, tab: RightSidebarTab) => void;
  clearContentState: (contentId: string) => void;
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

      setActiveTab: (contentId, tab) =>
        set((state) => ({
          activeTabByContentId: {
            ...state.activeTabByContentId,
            [contentId]: tab,
          },
        })),

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
