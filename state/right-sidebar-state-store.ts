/**
 * Right Sidebar State Store
 *
 * Persists the active right-sidebar tab per content id so switching tabs or
 * temporarily leaving the content view restores the correct sidebar surface.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightSidebarTab = "backlinks" | "outline" | "tags" | "chat";

export const DEFAULT_RIGHT_SIDEBAR_TAB: RightSidebarTab = "backlinks";

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
    }
  )
);
