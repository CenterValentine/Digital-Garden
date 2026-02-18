/**
 * Right Panel Collapse Store
 *
 * Manages the collapsed/expanded state of the right panel.
 * Persists user's toggle preference across all /content/ pages.
 *
 * Special behavior:
 * - /content/visualization pages: default to collapsed (full screen view)
 * - All other /content/ pages: remember user's last toggle state
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RightPanelCollapseState {
  // Current collapse state
  isCollapsed: boolean;

  // Actions
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
}

export const useRightPanelCollapseStore = create<RightPanelCollapseState>()(
  persist(
    (set) => ({
      // Default: collapsed
      isCollapsed: true,

      setCollapsed: (collapsed: boolean) =>
        set({ isCollapsed: collapsed }),

      toggleCollapsed: () =>
        set((state) => ({ isCollapsed: !state.isCollapsed })),
    }),
    {
      name: "right-panel-collapse-store",
      version: 2, // Bumped version to reset old contentTypeDefaults data
    }
  )
);
