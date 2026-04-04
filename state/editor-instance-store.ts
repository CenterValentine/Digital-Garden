/**
 * Editor Instance Store
 *
 * Tracks editor instances and AI edit state per content id so tab switches do
 * not retarget sidebar AI actions at the wrong editor.
 */

import { create } from "zustand";
import type { Editor } from "@tiptap/react";

interface EditorInstanceStore {
  editorsByContentId: Record<string, Editor | null>;
  aiEditingByContentId: Record<string, boolean>;
  setEditor: (contentId: string, editor: Editor | null) => void;
  getEditor: (contentId?: string | null) => Editor | null;
  clearEditor: (contentId: string) => void;
  setAiEditing: (contentId: string, editing: boolean) => void;
  isAiEditingFor: (contentId?: string | null) => boolean;
}

export const useEditorInstanceStore = create<EditorInstanceStore>((set, get) => ({
  editorsByContentId: {},
  aiEditingByContentId: {},

  setEditor: (contentId, editor) => {
    set((state) => ({
      editorsByContentId: {
        ...state.editorsByContentId,
        [contentId]: editor,
      },
    }));
  },

  getEditor: (contentId) => {
    if (!contentId) return null;
    return get().editorsByContentId[contentId] ?? null;
  },

  clearEditor: (contentId) => {
    set((state) => {
      const nextEditors = { ...state.editorsByContentId };
      const nextAiEditing = { ...state.aiEditingByContentId };
      delete nextEditors[contentId];
      delete nextAiEditing[contentId];
      return {
        editorsByContentId: nextEditors,
        aiEditingByContentId: nextAiEditing,
      };
    });
  },

  setAiEditing: (contentId, editing) => {
    set((state) => {
      const nextAiEditing = { ...state.aiEditingByContentId };

      if (editing) {
        nextAiEditing[contentId] = true;
      } else {
        delete nextAiEditing[contentId];
      }

      return {
        aiEditingByContentId: nextAiEditing,
      };
    });
  },

  isAiEditingFor: (contentId) => {
    if (!contentId) return false;
    return get().aiEditingByContentId[contentId] ?? false;
  },
}));
