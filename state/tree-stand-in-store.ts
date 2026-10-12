/**
 * Which tree row stands for open content (lib/features/content/tree-stand-in.ts).
 *
 *  - standIns    — content id → the row it was last opened from in the tree,
 *                  when that row wasn't its own (a shortcut, or a row inside
 *                  one). Forgotten when the content is opened from its own row.
 *  - activeRowId — the row the tree points at for the active content: what
 *                  FileNode lights in the gold "open" tone. Null = the
 *                  content's own id (or nothing in the tree leads to it).
 *
 * Session-only: where you were working, not state worth restoring.
 */
import { create } from "zustand";

interface TreeStandInState {
  standIns: Record<string, string>;
  activeRowId: string | null;
  remember: (contentId: string, rowId: string) => void;
  forget: (contentId: string) => void;
  setActiveRow: (rowId: string | null) => void;
}

export const useTreeStandInStore = create<TreeStandInState>()((set) => ({
  standIns: {},
  activeRowId: null,
  remember: (contentId, rowId) =>
    set((state) =>
      state.standIns[contentId] === rowId
        ? state
        : { standIns: { ...state.standIns, [contentId]: rowId } },
    ),
  forget: (contentId) =>
    set((state) => {
      if (!(contentId in state.standIns)) return state;
      const standIns = { ...state.standIns };
      delete standIns[contentId];
      return { standIns };
    }),
  setActiveRow: (rowId) => set((state) => (state.activeRowId === rowId ? state : { activeRowId: rowId })),
}));
