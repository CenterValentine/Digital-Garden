/**
 * Left Panel Collapse Store
 *
 * Manages the collapsed/expanded state of the left sidebar.
 * Two modes: "hidden" (collapsed to icon bar) and "full" (expanded)
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

type PanelMode = "hidden" | "full";

interface LeftPanelCollapseState {
  mode: PanelMode;
  setMode: (mode: PanelMode) => void;
  toggleMode: () => void;
}

export const useLeftPanelCollapseStore = create<LeftPanelCollapseState>()(
  persist(
    (set) => ({
      mode: "full",
      setMode: (mode) => set({ mode }),
      toggleMode: () =>
        set((state) => ({ mode: state.mode === "full" ? "hidden" : "full" })),
    }),
    {
      name: "left-panel-collapse",
      version: 1,
    }
  )
);
