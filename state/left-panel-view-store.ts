/**
 * Left Panel View Store
 *
 * Manages which view is active in the left sidebar when in full mode.
 * Three views: "files" (default), "search", and "extensions"
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LeftPanelView = "files" | "search" | "extensions" | string;

interface LeftPanelViewState {
  activeView: LeftPanelView;
  setActiveView: (view: LeftPanelView) => void;
}

export const useLeftPanelViewStore = create<LeftPanelViewState>()(
  persist(
    (set) => ({
      activeView: "files",
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: "left-panel-view",
      version: 1,
    }
  )
);
