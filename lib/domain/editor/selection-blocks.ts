/**
 * The selection as blocks that can leave this note — shared by "Send to
 * New Note" and "Move to Note" (lib/domain/editor/send-to-new-note.ts,
 * move-selection.ts): capture once, replace once, the same way.
 *
 * Capture turns the selection into standalone blocks (an open slice from
 * one textblock arrives already wrapped in that block). Replacement is the
 * subtle half: a selection that starts at the start of one block and ends
 * at the end of another should take those blocks WHOLE, or the delete
 * leaves an empty heading/paragraph where they stood. ProseMirror's
 * `deleteRange`/`replaceRange` hints only cover a range inside ONE parent,
 * so the expansion to block boundaries is done here, per end.
 */

import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface CapturedSelection {
  /** The selection as the user made it. */
  from: number;
  to: number;
  /** The same range, grown to block boundaries where an end sits on one. */
  blockFrom: number;
  blockTo: number;
  blocks: JSONContent[];
  /** Both ends inside one textblock — an inline replacement fits. */
  singleTextblock: boolean;
  /** Text of the range when captured, to detect a change under an async gap. */
  expectedText: string;
}

export function captureSelectionBlocks(editor: Editor): CapturedSelection | null {
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  const doc = editor.state.doc;
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  const slice = doc.slice(from, to);
  const blocks: JSONContent[] = [];
  slice.content.forEach((node) => {
    const json = node.toJSON() as JSONContent;
    blocks.push(node.isInline ? { type: "paragraph", content: [json] } : json);
  });
  if (blocks.length === 0) return null;
  const singleTextblock = $from.sameParent($to) && $from.parent.isTextblock;
  const atBlockStart = $from.parent.isTextblock && $from.parentOffset === 0;
  const atBlockEnd = $to.parent.isTextblock && $to.parentOffset === $to.parent.content.size;
  return {
    from,
    to,
    blockFrom: !singleTextblock && atBlockStart ? $from.before() : from,
    blockTo: !singleTextblock && atBlockEnd ? $to.after() : to,
    blocks,
    singleTextblock,
    expectedText: doc.textBetween(from, to, "\n"),
  };
}

/** Is the captured text still at its positions (nothing moved it meanwhile)? */
export function capturedStillThere(editor: Editor, captured: CapturedSelection): boolean {
  const doc = editor.state.doc;
  return captured.to <= doc.content.size && doc.textBetween(captured.from, captured.to, "\n") === captured.expectedText;
}

/**
 * Replace the captured range with `inline` (when the selection sat inside
 * one textblock) or with a paragraph holding it, or delete the range when
 * `inline` is null. Goes through the editor, so a collab note writes into
 * its Y.Doc.
 */
export function replaceCapturedRange(
  editor: Editor,
  captured: CapturedSelection,
  inline: PMNode | null,
): boolean {
  const { from, to, blockFrom, blockTo, singleTextblock } = captured;
  return editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      if (inline === null) {
        tr.delete(blockFrom, blockTo);
        return true;
      }
      if (singleTextblock) {
        tr.replaceWith(from, to, inline);
        return true;
      }
      tr.replaceWith(blockFrom, blockTo, state.schema.nodes.paragraph.create(null, inline));
      return true;
    })
    .run();
}
