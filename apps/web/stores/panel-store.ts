/**
 * Panel Layout State
 *
 * Manages panel widths, visibility, and layout persistence.
 * Uses Zustand with localStorage persistence and version-based migration.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PanelState {
  // Version for migration
  version: number;

  // Left sidebar
  leftSidebarVisible: boolean;
  leftSidebarWidth: number;

  // Right sidebar
  rightSidebarVisible: boolean;
  rightSidebarWidth: number;

  // Status bar
  statusBarVisible: boolean;

  // Actions
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  toggleStatusBar: () => void;

  // Reset
  resetLayout: () => void;
}

const CURRENT_VERSION = 3; // Incremented to force reset of incorrect 600px values

const DEFAULT_STATE = {
  version: CURRENT_VERSION,
  leftSidebarVisible: true,
  leftSidebarWidth: 200, // Narrower default
  rightSidebarVisible: true,
  rightSidebarWidth: 300,
  statusBarVisible: true,
};

export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      toggleLeftSidebar: () =>
        set((state) => ({ leftSidebarVisible: !state.leftSidebarVisible })),

      toggleRightSidebar: () =>
        set((state) => ({ rightSidebarVisible: !state.rightSidebarVisible })),

      setLeftSidebarWidth: (width) =>
        set({ leftSidebarWidth: Math.max(200, Math.min(600, width)) }),

      setRightSidebarWidth: (width) =>
        set({ rightSidebarWidth: Math.max(200, Math.min(600, width)) }),

      toggleStatusBar: () =>
        set((state) => ({ statusBarVisible: !state.statusBarVisible })),

      resetLayout: () => set(DEFAULT_STATE),
    }),
    {
      name: "notes-panel-layout",
      version: CURRENT_VERSION,
      migrate: (
        persistedState: unknown,
        version: number
      ): Partial<PanelState> => {
        // If stored version doesn't match current version, reset to defaults
        if (version !== CURRENT_VERSION) {
          console.log(
            `[Panel Store] Migrating from version ${version} to ${CURRENT_VERSION}`
          );
          return DEFAULT_STATE;
        }
        return persistedState as Partial<PanelState>;
      },
    }
  )
);
