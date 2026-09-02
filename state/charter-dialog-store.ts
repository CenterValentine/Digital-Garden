/**
 * Playbook-description dialog state (transient — not persisted).
 *
 * Opened from the file-tree context menu ("Mark as Playbook…" / "Edit Playbook
 * Description…"). A centered modal (see CharterDescriptionDialog) rather than an
 * inline menu input — an inline input grows the context menu past the viewport
 * and forces a page scroll (v3.6 UX fix). The playbook's NAME is always the
 * file's title; only the one-line description is editable here.
 */

import { create } from "zustand";

interface PlaybookDialogState {
  open: boolean;
  /** Content node being marked / edited. */
  contentId: string | null;
  /** File title — shown read-only; it IS the playbook name. */
  title: string;
  /** Seed description (edit mode) or "" (fresh mark). */
  description: string;
  /** true = the note is already a playbook and we're editing its description. */
  editing: boolean;
  openDialog: (args: {
    contentId: string;
    title: string;
    description?: string;
    editing?: boolean;
  }) => void;
  close: () => void;
}

export const useCharterDialogStore = create<PlaybookDialogState>((set) => ({
  open: false,
  contentId: null,
  title: "",
  description: "",
  editing: false,
  openDialog: ({ contentId, title, description = "", editing = false }) =>
    set({ open: true, contentId, title, description, editing }),
  close: () =>
    set({ open: false, contentId: null, title: "", description: "", editing: false }),
}));
