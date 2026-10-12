/**
 * Moving content (an image, a block, text) from one note's editor to another
 * by drag and drop — between panes, or into a tab opened by hovering it.
 *
 * Owner report, 2026-10-06: dragging an image from a note in one pane onto a
 * note in another did nothing. The app's drag-and-drop layer (react-dnd's
 * HTML5 backend, installed for the file tree) cancels the browser's default
 * handling of content drops, so ProseMirror's own drop never runs, and the
 * editor's fallback (MarkdownEditor `onDrop`) only handled files, AI images
 * and drags that started in the SAME editor.
 *
 * Now the source editor records the drag (`state/editor-drag-store.ts`), the
 * editor it lands in inserts the dragged slice at the drop point, and the
 * source loses it — at once if its editor is mounted, otherwise when its
 * note's editor is back (a tab opened by hovering replaced it; releasing
 * switches back). Only ever after checking the dragged content is still
 * exactly there: if it changed, nothing is removed and the drop was a copy.
 *
 * ProseMirror's call on copy vs move is kept (the copy modifier — Alt/Option
 * on a Mac — makes a copy, as within one editor).
 *
 * Pure (prosemirror-model / -transform only) so `tree:smooth:check` can run it.
 */
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { Slice } from "@tiptap/pm/model";
import { dropPoint } from "@tiptap/pm/transform";
import type { Transaction } from "@tiptap/pm/state";

/** How long a move whose source editor isn't mounted waits for it. */
export const PENDING_REMOVAL_MAX_AGE_MS = 120_000;

export type RemovalCheck = "ok" | "changed" | "not-loaded";

/**
 * Whether the dragged content is still exactly at `from`–`to` in `doc`.
 * "not-loaded": the document is shorter than the range — the source note's
 * editor has mounted but its content hasn't arrived yet; try again.
 */
export function checkDraggedRange(doc: PMNode, from: number, to: number, slice: Slice): RemovalCheck {
  if (from < 0 || to <= from) return "changed";
  if (to > doc.content.size) return "not-loaded";
  return doc.slice(from, to).eq(slice) ? "ok" : "changed";
}

/** Remove the dragged range from the source document, if it is still exactly there. */
export function removeDragged(
  doc: PMNode,
  tr: Transaction,
  removal: { from: number; to: number; slice: Slice },
): RemovalCheck {
  const check = checkDraggedRange(doc, removal.from, removal.to, removal.slice);
  if (check === "ok") tr.delete(removal.from, removal.to);
  return check;
}

/**
 * Insert a dragged slice into `tr` at the drop position, the way ProseMirror
 * places a drop (dropPoint), a lone node replacing its range whole.
 * Returns false when the slice can't go there.
 */
export function insertDropped(doc: PMNode, tr: Transaction, pos: number, slice: Slice): boolean {
  const at = dropPoint(doc, pos, slice) ?? pos;
  const mapped = tr.mapping.map(at);
  const lone =
    slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1
      ? slice.content.firstChild
      : null;
  const before = tr.steps.length;
  try {
    if (lone) tr.replaceRangeWith(mapped, mapped, lone);
    else tr.replaceRange(mapped, mapped, slice);
  } catch {
    return false;
  }
  return tr.steps.length > before;
}

/** A recorded slice, back in this editor's schema (null if it doesn't fit it). */
export function sliceFromJSON(schema: Schema, json: unknown): Slice | null {
  try {
    return Slice.fromJSON(schema, json as Parameters<typeof Slice.fromJSON>[1]);
  } catch {
    return null;
  }
}
