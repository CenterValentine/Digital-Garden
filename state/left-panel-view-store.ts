/**
 * Left Panel View Store
 *
 * Manages which view is active in the left sidebar when in full mode.
 * Left-panel companion views.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

type LeftPanelView = "files" | "search" | "people" | "extensions" | "calendar";

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
