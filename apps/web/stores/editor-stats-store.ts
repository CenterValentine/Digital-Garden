/**
 * Editor Stats Store
 *
 * Manages editor statistics (word count, character count, save status).
 * Shared between MarkdownEditor and StatusBar.
 */

import { create } from "zustand";

export interface EditorStatsState {
  /** Word count */
  wordCount: number;
  /** Character count (including spaces) */
  characterCount: number;
  /** Last save timestamp */
  lastSaved: Date | null;
  /** Is currently saving */
  isSaving: boolean;
  /** Has unsaved changes */
  hasUnsavedChanges: boolean;

  /** Update stats */
  setStats: (stats: { wordCount: number; characterCount: number }) => void;
  /** Set last saved timestamp */
  setLastSaved: (date: Date) => void;
  /** Set saving status */
  setIsSaving: (isSaving: boolean) => void;
  /** Set unsaved changes status */
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  /** Reset all stats */
  reset: () => void;
}

export const useEditorStatsStore = create<EditorStatsState>((set) => ({
  wordCount: 0,
  characterCount: 0,
  lastSaved: null,
  isSaving: false,
  hasUnsavedChanges: false,

  setStats: (stats) =>
    set({
      wordCount: stats.wordCount,
      characterCount: stats.characterCount,
    }),

  setLastSaved: (date) =>
    set({
      lastSaved: date,
      hasUnsavedChanges: false,
    }),

  setIsSaving: (isSaving) => set({ isSaving }),

  setHasUnsavedChanges: (hasChanges) =>
    set({ hasUnsavedChanges: hasChanges }),

  reset: () =>
    set({
      wordCount: 0,
      characterCount: 0,
      lastSaved: null,
      isSaving: false,
      hasUnsavedChanges: false,
    }),
}));
