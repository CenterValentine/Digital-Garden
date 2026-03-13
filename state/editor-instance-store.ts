/**
 * Editor Instance Store
 *
 * Shares the active TipTap editor instance between the editor component
 * and other consumers (AI chat panel, outline panel, etc.).
 *
 * NOT persisted — the editor instance is ephemeral and tied to the
 * component lifecycle. When the user navigates away, the editor unmounts
 * and clears its registration.
 *
 * Also manages AI editing state: lock, abort, and queue.
 */

import { create } from "zustand";
import type { Editor } from "@tiptap/react";

export interface EditorInstanceState {
  /** The active TipTap editor instance, or null if no editor is mounted */
  editor: Editor | null;

  /** Whether AI is currently editing the document */
  isAiEditing: boolean;

  /** Register the editor instance (called on mount) */
  setEditor: (editor: Editor | null) => void;

  /** Set AI editing state (locks/unlocks editor) */
  setAiEditing: (editing: boolean) => void;
}

export const useEditorInstanceStore = create<EditorInstanceState>()(
  (set) => ({
    editor: null,
    isAiEditing: false,

    setEditor: (editor) => set({ editor }),

    setAiEditing: (editing) => set({ isAiEditing: editing }),
  })
);
