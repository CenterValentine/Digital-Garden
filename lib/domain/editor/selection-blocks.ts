/**
 * The selection as blocks that can leave this note — the capture, title
 * suggestion and replacement behind "Move to Note" (move-selection.ts),
 * kept apart so any later "selection leaves the note" feature does it the
 * same way.
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

const TITLE_MAX = 60;

function firstHeadingText(nodes: unknown[]): string | null {
  for (const raw of nodes) {
    const node = raw as JSONContent;
    if (!node || typeof node !== "object") continue;
    if (node.type === "heading") {
      const text = (node.content ?? [])
        .map((child) => (child.type === "text" ? child.text ?? "" : ""))
        .join("")
        .trim();
      if (text) return text;
    }
    if (Array.isArray(node.content)) {
      const nested = firstHeadingText(node.content);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * A title for a note made from a selection: its first heading, else its
 * first line, clipped at a word — what the picker's "+ New Note" names the
 * note, so it is named before it has content.
 */
export function suggestNoteTitle(capture: { tiptapJson: { content: unknown[] }; plainText: string }): string {
  const heading = firstHeadingText(capture.tiptapJson.content);
  const firstLine = (heading ?? capture.plainText).split("\n").find((l) => l.trim()) ?? "";
  const flat = firstLine.replace(/\s+/g, " ").trim();
  if (flat.length <= TITLE_MAX) return flat || "Untitled";
  const cut = flat.slice(0, TITLE_MAX);
  const atWord = cut.lastIndexOf(" ");
  return (atWord > TITLE_MAX * 0.5 ? cut.slice(0, atWord) : cut).trim();
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
