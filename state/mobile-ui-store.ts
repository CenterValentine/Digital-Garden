import { create } from "zustand";

/**
 * Mobile UI store — ephemeral (not persisted) state for the phone-width
 * content-IDE layout. Only meaningful below the `md` breakpoint / on phones,
 * where the three panes collapse to a single editor pane with slide-over
 * drawers, and the surrounding chrome can be hidden for focus.
 *
 * Kept intentionally small: the left/right sidebars and their views are still
 * owned by their existing stores (left-panel-view-store, search-store, etc.).
 */

export type MobileDrawerSide = "left" | "right";

interface MobileUiState {
  /** Which slide-over drawer is open, or null when the editor is full-screen. */
  openDrawer: MobileDrawerSide | null;
  setOpenDrawer: (side: MobileDrawerSide | null) => void;
  /** Open the given drawer, or close it if it's already the open one. */
  toggleDrawer: (side: MobileDrawerSide) => void;
  closeDrawer: () => void;

  /**
   * Focus mode: hide the surrounding chrome (top nav, workspace bar, tab strip,
   * bottom nav) so the document owns the screen. The page toolbar stays for
   * quick document actions. Entered via the floating focus button; broken via
   * the top grab handle.
   */
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
  toggleFocusMode: () => void;

  /**
   * Transient reveal of hidden top chrome (the grab-handle "peek"). Used for
   * the landscape nav auto-hide, where the user wants the nav back momentarily
   * without leaving their orientation. Cleared when they interact elsewhere.
   */
  chromePeek: boolean;
  setChromePeek: (v: boolean) => void;
}

export const useMobileUiStore = create<MobileUiState>()((set) => ({
  openDrawer: null,
  setOpenDrawer: (side) => set({ openDrawer: side }),
  toggleDrawer: (side) =>
    set((state) => ({ openDrawer: state.openDrawer === side ? null : side })),
  closeDrawer: () => set({ openDrawer: null }),

  focusMode: false,
  setFocusMode: (v) => set({ focusMode: v, chromePeek: false }),
  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode, chromePeek: false })),

  chromePeek: false,
  setChromePeek: (v) => set({ chromePeek: v }),
}));
