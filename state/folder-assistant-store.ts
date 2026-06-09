/**
 * Folder Assistant dialog state (transient — not persisted).
 *
 * The Move-menu action opens the dialog with the current selection; the
 * "Undo & try again" toast reopens it prefilled with the prior prompt.
 * The persistent "I'm feeling lucky" preference lives in folder-move-store.
 */

import { create } from "zustand";

interface FolderAssistantState {
  open: boolean;
  fileIds: string[];
  /** Seeds the prompt box (used by "undo & try again" to restore the draft). */
  initialPrompt: string;
  openDialog: (fileIds: string[], initialPrompt?: string) => void;
  close: () => void;
}

export const useFolderAssistantStore = create<FolderAssistantState>((set) => ({
  open: false,
  fileIds: [],
  initialPrompt: "",
  openDialog: (fileIds, initialPrompt = "") =>
    set({ open: true, fileIds, initialPrompt }),
  close: () => set({ open: false, fileIds: [], initialPrompt: "" }),
}));
