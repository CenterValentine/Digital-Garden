import { create } from "zustand";

/**
 * Mobile UI store — ephemeral (not persisted) state for the phone-width
 * content-IDE layout. Only meaningful below the `md` breakpoint, where the
 * three panes collapse to a single editor pane with slide-over drawers.
 *
 * Kept intentionally tiny: the left/right sidebars and their views are still
 * owned by their existing stores (left-panel-view-store, search-store, etc.).
 * This store only tracks which drawer, if any, is currently open.
 */

export type MobileDrawerSide = "left" | "right";

interface MobileUiState {
  /** Which slide-over drawer is open, or null when the editor is full-screen. */
  openDrawer: MobileDrawerSide | null;
  setOpenDrawer: (side: MobileDrawerSide | null) => void;
  /** Open the given drawer, or close it if it's already the open one. */
  toggleDrawer: (side: MobileDrawerSide) => void;
  closeDrawer: () => void;
}

export const useMobileUiStore = create<MobileUiState>()((set) => ({
  openDrawer: null,
  setOpenDrawer: (side) => set({ openDrawer: side }),
  toggleDrawer: (side) =>
    set((state) => ({ openDrawer: state.openDrawer === side ? null : side })),
  closeDrawer: () => set({ openDrawer: null }),
}));
