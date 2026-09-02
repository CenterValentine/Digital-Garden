/**
 * Import-Skill dialog state (transient — not persisted).
 *
 * Opened from the file-tree context menu ("Import Skill as Playbook…"). The
 * right-clicked folder, if any, seeds the destination so the imported
 * playbook lands where the user asked. See ImportSkillDialog +
 * lib/domain/ai/charters/import.
 */

import { create } from "zustand";

interface ImportSkillState {
  open: boolean;
  /** Destination folder (from the right-clicked folder), or null for root. */
  parentId: string | null;
  openDialog: (parentId?: string | null) => void;
  close: () => void;
}

export const useImportSkillStore = create<ImportSkillState>((set) => ({
  open: false,
  parentId: null,
  openDialog: (parentId = null) => set({ open: true, parentId }),
  close: () => set({ open: false, parentId: null }),
}));
