/**
 * Content Store
 *
 * Manages current content selection and editor state.
 * Zustand store for tracking which note is currently open.
 *
 * M4: Added multi-selection support for file tree operations.
 */

import { create } from "zustand";

export interface ContentState {
  /** Currently selected content ID (for editor) */
  selectedContentId: string | null;
  /** Multi-selected IDs (for batch operations) */
  multiSelectedIds: string[];
  /** Last clicked ID (for shift-click range selection) */
  lastClickedId: string | null;
  /** Set selected content */
  setSelectedContentId: (id: string | null) => void;
  /** Clear selection */
  clearSelection: () => void;
  /** Toggle multi-selection (Cmd+Click) */
  toggleMultiSelect: (id: string) => void;
  /** Set multi-selection (Shift+Click range) */
  setMultiSelect: (ids: string[]) => void;
  /** Clear multi-selection */
  clearMultiSelect: () => void;
  /** Check if ID is multi-selected */
  isMultiSelected: (id: string) => boolean;
}

export const useContentStore = create<ContentState>((set, get) => ({
  selectedContentId: null,
  multiSelectedIds: [],
  lastClickedId: null,

  setSelectedContentId: (id) => {
    set({ selectedContentId: id });

    // Only run persistence in browser environment
    if (typeof window === "undefined") return;

    // Persist to localStorage
    if (id) {
      localStorage.setItem("lastSelectedContentId", id);
    } else {
      localStorage.removeItem("lastSelectedContentId");
    }

    // Update URL query parameter (using "content" for all content types)
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("content", id);
    } else {
      url.searchParams.delete("content");
    }
    window.history.replaceState({}, "", url);
  },

  clearSelection: () => {
    console.log('[ContentStore] clearSelection called');
    set({ selectedContentId: null, multiSelectedIds: [], lastClickedId: null });

    // Only run persistence in browser environment
    if (typeof window === "undefined") return;

    // Clear localStorage
    localStorage.removeItem("lastSelectedContentId");
    console.log('[ContentStore] Removed from localStorage');

    // Clear URL query parameter
    const url = new URL(window.location.href);
    url.searchParams.delete("content");
    console.log('[ContentStore] Updating URL to:', url.toString());
    window.history.replaceState({}, "", url);
  },

  toggleMultiSelect: (id) => {
    set((state) => {
      const isSelected = state.multiSelectedIds.includes(id);
      const newSelection = isSelected
        ? state.multiSelectedIds.filter((selectedId) => selectedId !== id)
        : [...state.multiSelectedIds, id];

      return {
        multiSelectedIds: newSelection,
        lastClickedId: id,
      };
    });
  },

  setMultiSelect: (ids) => {
    set({ multiSelectedIds: ids });
  },

  clearMultiSelect: () => {
    set({ multiSelectedIds: [], lastClickedId: null });
  },

  isMultiSelected: (id) => {
    return get().multiSelectedIds.includes(id);
  },
}));
