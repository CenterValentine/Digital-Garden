/**
 * A drag that started in a note's editor, so another editor can take it
 * (lib/domain/editor/cross-editor-move.ts).
 *
 *  - drag    — what is being dragged, recorded on dragstart. A store because
 *              `dataTransfer` is unreadable during dragover by spec, and the
 *              source editor can unmount mid-drag (a tab opened by hovering
 *              it replaces the pane's editor).
 *  - pending — moves whose source editor wasn't mounted when the drop landed:
 *              removed from the source when its note's editor is back.
 *
 * Session-only.
 */
import { create } from "zustand";
import type { Editor } from "@tiptap/core";

export interface EditorDrag {
  /** The note the drag started in (null: an editor with no content id). */
  noteId: string | null;
  /** The editor it started in — may be destroyed by the time it drops. */
  editor: Editor;
  /** The dragged content, `Slice.toJSON()`. */
  slice: unknown;
  /** ProseMirror's own call: true unless the copy modifier was held. */
  move: boolean;
  /** Where it sat in the source document. */
  from: number;
  to: number;
  /** The pane showing the source note when the drag started. */
  paneId: string | null;
  at: number;
}

export interface PendingRemoval {
  noteId: string;
  slice: unknown;
  from: number;
  to: number;
  at: number;
}

interface EditorDragState {
  drag: EditorDrag | null;
  pending: PendingRemoval[];
  begin: (drag: EditorDrag) => void;
  /** The drag, cleared — so of two nested editors only the first to ask gets it. */
  take: () => EditorDrag | null;
  clear: () => void;
  queueRemoval: (removal: PendingRemoval) => void;
  /** Drop pending removals (done, or no longer applicable). */
  settle: (removals: readonly PendingRemoval[]) => void;
}

export const useEditorDragStore = create<EditorDragState>()((set, get) => ({
  drag: null,
  pending: [],
  begin: (drag) => set({ drag }),
  take: () => {
    const drag = get().drag;
    if (drag) set({ drag: null });
    return drag;
  },
  clear: () => set((state) => (state.drag ? { drag: null } : state)),
  queueRemoval: (removal) => set((state) => ({ pending: [...state.pending, removal] })),
  settle: (removals) =>
    set((state) => {
      if (removals.length === 0) return state;
      const gone = new Set(removals);
      return { pending: state.pending.filter((removal) => !gone.has(removal)) };
    }),
}));
