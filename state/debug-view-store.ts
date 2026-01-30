/**
 * Debug View Store
 *
 * Manages debug panel visibility and view mode selection for development mode.
 * Provides side-by-side TipTap document debugging with multiple view modes.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DebugViewMode = "json" | "tree" | "markdown" | "metadata";

interface DebugViewStore {
  // State
  isDebugPanelVisible: boolean;
  viewMode: DebugViewMode;
  debugPanelWidth: number; // Percentage (0-100)

  // Actions
  toggleDebugPanel: () => void;
  setDebugPanelVisible: (visible: boolean) => void;
  setViewMode: (mode: DebugViewMode) => void;
  setDebugPanelWidth: (width: number) => void;
}

export const useDebugViewStore = create<DebugViewStore>()(
  persist(
    (set) => ({
      // Initial state
      isDebugPanelVisible: false,
      viewMode: "json",
      debugPanelWidth: 40,

      // Actions
      toggleDebugPanel: () =>
        set((state) => ({ isDebugPanelVisible: !state.isDebugPanelVisible })),

      setDebugPanelVisible: (visible) =>
        set({ isDebugPanelVisible: visible }),

      setViewMode: (mode) =>
        set({ viewMode: mode }),

      setDebugPanelWidth: (width) =>
        set({ debugPanelWidth: Math.max(20, Math.min(80, width)) }), // Clamp between 20-80%
    }),
    {
      name: "debug-view-store",
      // Only persist in development mode
      skipHydration: process.env.NODE_ENV !== "development",
    }
  )
);
