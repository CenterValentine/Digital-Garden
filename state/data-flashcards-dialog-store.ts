/**
 * Database → flashcard deck dialog state (transient — not persisted).
 *
 * Opened from the file-tree context menu ("Create Flashcard Deck…" on a
 * database node) and from the database viewer's header button. A centered
 * modal (see DataToFlashcardsDialog) mirroring the playbook dialog
 * pattern: store-driven, mounted once globally in ResizablePanels.
 */

import { create } from "zustand";

interface DataFlashcardsDialogState {
  open: boolean;
  /** ContentNode id of the database being converted. */
  contentId: string | null;
  /** Database title — seeds the default deck path. */
  title: string;
  openDialog: (args: { contentId: string; title: string }) => void;
  close: () => void;
}

export const useDataFlashcardsDialogStore = create<DataFlashcardsDialogState>(
  (set) => ({
    open: false,
    contentId: null,
    title: "",
    openDialog: ({ contentId, title }) => set({ open: true, contentId, title }),
    close: () => set({ open: false, contentId: null, title: "" }),
  }),
);
