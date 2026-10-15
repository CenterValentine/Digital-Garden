/**
 * What notes' texts have gained and lost here, ahead of the server
 * (lib/features/content/in-text-media.ts).
 *
 *  - edits      — note id → media id → the latest edit. Fed by the editor
 *                 (`useInTextMediaTracker`), shown by the file tree, dropped
 *                 once the tree's data agrees (`settle`).
 *  - windowEdits — note id → Note Window target id → the latest edit: the
 *                 window rows a note's referenced content gains and loses.
 *  - recordedAt — when an edit was last recorded: the tree fetches rows it
 *                 hasn't loaded and reconciles once the save has had time.
 *
 * Session-only: it bridges the seconds between an edit and its save.
 */
import { create } from "zustand";
import {
  NO_IN_TEXT_EDITS,
  recordInTextEdits,
  type InTextEdits,
} from "@/lib/features/content/in-text-media";

interface InTextMediaState {
  edits: InTextEdits;
  windowEdits: InTextEdits;
  recordedAt: number;
  record: (noteId: string, added: string[], removed: string[]) => void;
  recordWindows: (noteId: string, added: string[], removed: string[]) => void;
  settle: (edits: InTextEdits) => void;
  settleWindows: (windowEdits: InTextEdits) => void;
}

export const useInTextMediaStore = create<InTextMediaState>()((set) => ({
  edits: NO_IN_TEXT_EDITS,
  windowEdits: NO_IN_TEXT_EDITS,
  recordedAt: 0,
  record: (noteId, added, removed) =>
    set((state) => {
      const at = Date.now();
      const edits = recordInTextEdits(state.edits, noteId, added, removed, at);
      return edits === state.edits ? state : { edits, recordedAt: at };
    }),
  recordWindows: (noteId, added, removed) =>
    set((state) => {
      const at = Date.now();
      const windowEdits = recordInTextEdits(state.windowEdits, noteId, added, removed, at);
      return windowEdits === state.windowEdits ? state : { windowEdits, recordedAt: at };
    }),
  settle: (edits) => set((state) => (state.edits === edits ? state : { edits })),
  settleWindows: (windowEdits) =>
    set((state) => (state.windowEdits === windowEdits ? state : { windowEdits })),
}));
