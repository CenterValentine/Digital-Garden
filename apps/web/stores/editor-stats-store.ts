/**
 * Editor Stats Store
 *
 * Manages editor statistics (word count, character count, save status).
 * Shared between MarkdownEditor and StatusBar.
 */

import { create } from "zustand";

export type FileType = "markdown" | "json" | "file";

export interface EditorStatsState {
  /** Current file type being edited */
  fileType: FileType;
  /** Word count (for markdown) */
  wordCount: number;
  /** Character count (including spaces) */
  characterCount: number;
  /** Line count (for JSON/code files) */
  lineCount: number;
  /** Object count (for JSON files) */
  objectCount: number;
  /** Last save timestamp */
  lastSaved: Date | null;
  /** Is currently saving */
  isSaving: boolean;
  /** Has unsaved changes */
  hasUnsavedChanges: boolean;

  /** Update stats for markdown files */
  setStats: (stats: { wordCount: number; characterCount: number }) => void;
  /** Update stats for JSON files */
  setJsonStats: (stats: { lineCount: number; characterCount: number; objectCount: number }) => void;
  /** Set file type */
  setFileType: (fileType: FileType) => void;
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
  fileType: "markdown",
  wordCount: 0,
  characterCount: 0,
  lineCount: 0,
  objectCount: 0,
  lastSaved: null,
  isSaving: false,
  hasUnsavedChanges: false,

  setStats: (stats) =>
    set({
      fileType: "markdown",
      wordCount: stats.wordCount,
      characterCount: stats.characterCount,
    }),

  setJsonStats: (stats) =>
    set({
      fileType: "json",
      lineCount: stats.lineCount,
      characterCount: stats.characterCount,
      objectCount: stats.objectCount,
      wordCount: 0, // Reset word count for JSON
    }),

  setFileType: (fileType) => set({ fileType }),

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
      fileType: "markdown",
      wordCount: 0,
      characterCount: 0,
      lineCount: 0,
      objectCount: 0,
      lastSaved: null,
      isSaving: false,
      hasUnsavedChanges: false,
    }),
}));
