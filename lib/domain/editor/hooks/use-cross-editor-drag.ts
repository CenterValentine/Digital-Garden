/**
 * The editor side of moving content between notes by drag and drop
 * (lib/domain/editor/cross-editor-move.ts): record a drag that starts here,
 * take one that started in another editor, and remove what was moved out of
 * this note once its editor is back.
 */
import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import type { Slice } from "@tiptap/pm/model";
import type { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  PENDING_REMOVAL_MAX_AGE_MS,
  insertDropped,
  removeDragged,
  sliceFromJSON,
} from "@/lib/domain/editor/cross-editor-move";
import { useEditorDragStore, type EditorDrag, type PendingRemoval } from "@/state/editor-drag-store";
import { useEditorInstanceStore } from "@/state/editor-instance-store";

type PMDragging = { slice: Slice; move: boolean; node?: NodeSelection | null } | null;

function draggingOf(editor: Editor): PMDragging {
  return (editor.view as unknown as { dragging: PMDragging }).dragging;
}

/**
 * Record a drag that ProseMirror just started in this editor. Called from the
 * wrapper's React `onDragStart`, which runs AFTER ProseMirror's own dragstart
 * (it listens on the editor's DOM; React on the root), so `view.dragging` is
 * set — and ProseMirror's `clearData()` can't wipe anything of ours.
 */
export function recordEditorDrag(editor: Editor, noteId: string | null): void {
  const dragging = draggingOf(editor);
  if (!dragging) return;
  const range = dragging.node ?? editor.state.selection;
  useEditorDragStore.getState().begin({
    noteId,
    editor,
    // The document's own content, NOT ProseMirror's drag slice: that one has
    // been through `transformCopied` (clipboard.ts), which rewrites image
    // sources to public links for pasting outside the app — so it never
    // matched the source for the removal, and the target got the public link.
    slice: editor.state.doc.slice(range.from, range.to).toJSON(),
    move: dragging.move,
    from: range.from,
    to: range.to,
    paneId: null,
    at: Date.now(),
  });
}

/** A drag from ANOTHER editor is in flight (this one's own drags are ProseMirror's). */
export function foreignEditorDrag(editor: Editor | null): EditorDrag | null {
  const drag = useEditorDragStore.getState().drag;
  if (!drag || !editor || drag.editor === editor || draggingOf(editor)) return null;
  return drag;
}

/**
 * Whether a drop on this editor view carries content dragged out of ANOTHER
 * editor — for `handleDOMEvents.drop`, so ProseMirror's built-in drop leaves
 * it to the wrapper's handler (which also removes it from the source).
 * Without this, ProseMirror inserts it too and it lands twice.
 */
export function isForeignEditorDropOn(view: EditorView): boolean {
  const drag = useEditorDragStore.getState().drag;
  return Boolean(drag && drag.editor.view !== view);
}

/**
 * An editor still on the page. TipTap tears an editor down after its
 * component unmounts, so a pane that switched tabs mid-drag leaves an editor
 * that isn't destroyed yet but whose view is gone — a removal dispatched
 * there changes nothing real (seen in the dev app, 2026-10-06).
 */
function onPage(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && !editor.isDestroyed && editor.view.dom.isConnected);
}

/** Remove the moved content from its source note — now, or once that note's editor is back. */
function removeFromSource(drag: EditorDrag): void {
  const registered = drag.noteId ? useEditorInstanceStore.getState().getEditor(drag.noteId) : null;
  const live = onPage(drag.editor) ? drag.editor : onPage(registered) ? registered : null;
  if (live) {
    // In the SOURCE editor's schema: ProseMirror compares node types by
    // identity, so a slice rebuilt in the target's schema never matches.
    const slice = sliceFromJSON(live.schema, drag.slice);
    if (!slice) return;
    const tr = live.state.tr;
    const check = removeDragged(live.state.doc, tr, { from: drag.from, to: drag.to, slice });
    if (check === "ok") {
      live.view.dispatch(tr);
      return;
    }
    // Changed since the drag began: leave it — the drop was a copy.
    if (check === "changed") return;
  }
  if (drag.noteId) {
    useEditorDragStore.getState().queueRemoval({
      noteId: drag.noteId,
      slice: drag.slice,
      from: drag.from,
      to: drag.to,
      at: Date.now(),
    });
  }
}

/**
 * Take a drag that started in another editor and drop it here at `coords`.
 * Returns true when it was handled (the caller stops the event).
 */
export function dropForeignEditorDrag(
  target: Editor,
  targetNoteId: string | null,
  coords: { left: number; top: number },
): boolean {
  const drag = foreignEditorDrag(target);
  if (!drag) return false;
  // Taken, so a nested editor's wrapper (a Note Window inside this note)
  // and this one can't both insert it.
  useEditorDragStore.getState().take();
  const slice = sliceFromJSON(target.schema, drag.slice);
  const at = target.view.posAtCoords(coords);
  if (!slice || !at) return true;
  const { state } = target.view;
  const tr = state.tr;
  // The same note open in another pane: one document — remove and insert in
  // one step, here, exactly like a drag within one editor.
  const sameDoc = drag.noteId !== null && drag.noteId === targetNoteId;
  if (sameDoc && drag.move) removeDragged(state.doc, tr, { from: drag.from, to: drag.to, slice });
  if (!insertDropped(state.doc, tr, at.pos, slice)) return true;
  target.view.focus();
  target.view.dispatch(tr);
  if (drag.move && !sameDoc) removeFromSource(drag);
  return true;
}

/**
 * Apply removals queued for this note (moved out while its editor wasn't
 * mounted) once its content is here — then on each change until it arrives.
 * Content that changed in the meantime stays (a copy).
 *
 * `ready`: this editor holds the note's real content. A collaborative note's
 * editor first paints from a cached copy and is rebuilt once the server
 * syncs — a removal applied to that first editor would be overwritten by
 * the server's copy (seen in the dev app, 2026-10-06). So it waits for the
 * synced editor; a plain editor is ready at once.
 */
export function usePendingDragRemovals(
  editor: Editor | null,
  noteId: string | null | undefined,
  ready: boolean,
): void {
  useEffect(() => {
    if (!editor || !noteId || !ready) return;
    let scheduled = false;
    const attempt = () => {
      scheduled = false;
      if (editor.isDestroyed) return;
      const store = useEditorDragStore.getState();
      const mine = store.pending.filter((removal) => removal.noteId === noteId);
      if (mine.length === 0) return;
      const done: PendingRemoval[] = [];
      // Latest first, so earlier ranges are still where they were recorded.
      for (const removal of [...mine].sort((a, b) => b.from - a.from)) {
        if (Date.now() - removal.at > PENDING_REMOVAL_MAX_AGE_MS) {
          done.push(removal);
          continue;
        }
        const slice = sliceFromJSON(editor.schema, removal.slice);
        if (!slice) {
          done.push(removal);
          continue;
        }
        const tr = editor.state.tr;
        const check = removeDragged(editor.state.doc, tr, { from: removal.from, to: removal.to, slice });
        if (check === "ok") editor.view.dispatch(tr);
        if (check !== "not-loaded") done.push(removal);
      }
      store.settle(done);
    };
    // Not inside a transaction handler: dispatching there would re-enter it.
    const later = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(attempt, 0);
    };
    later();
    editor.on("update", later);
    const unsubscribe = useEditorDragStore.subscribe((state, previous) => {
      if (state.pending !== previous.pending) later();
    });
    return () => {
      editor.off("update", later);
      unsubscribe();
    };
  }, [editor, noteId, ready]);
}
