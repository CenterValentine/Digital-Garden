/**
 * File-tree inline-rename draft store.
 *
 * Holds the in-progress rename text per node id. Lives in a store (not in
 * FileTree's local state) so a keystroke only re-renders the editing
 * FileNode — NOT FileTree. That keeps the react-arborist node renderer
 * stable, so rows don't remount on every keystroke (which was resetting the
 * caret to the end of the rename input).
 */

import { create } from "zustand";

interface FileTreeEditState {
  drafts: Record<string, string>;
  setDraft: (id: string, value: string) => void;
  clearDraft: (id: string) => void;
}

export const useFileTreeEditStore = create<FileTreeEditState>((set) => ({
  drafts: {},
  setDraft: (id, value) =>
    set((s) =>
      s.drafts[id] === value
        ? s
        : { drafts: { ...s.drafts, [id]: value } },
    ),
  clearDraft: (id) =>
    set((s) => {
      if (!(id in s.drafts)) return s;
      const next = { ...s.drafts };
      delete next[id];
      return { drafts: next };
    }),
}));
