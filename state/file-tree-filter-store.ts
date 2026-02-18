/**
 * File Tree Filter Store
 *
 * Manages visibility settings for the file tree.
 * Phase 2: ContentRole visibility control
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface FileTreeFilterState {
  showReferencedContent: boolean;
  setShowReferencedContent: (show: boolean) => void;
  toggleShowReferencedContent: () => void;
}

export const useFileTreeFilterStore = create<FileTreeFilterState>()(
  persist(
    (set) => ({
      showReferencedContent: false, // Default: hide referenced content
      setShowReferencedContent: (show) => set({ showReferencedContent: show }),
      toggleShowReferencedContent: () =>
        set((state) => ({ showReferencedContent: !state.showReferencedContent })),
    }),
    {
      name: "file-tree-filter-store",
      version: 1,
    }
  )
);
