/**
 * Visible text of a live ProseMirror document — what the model may read.
 *
 * The client-executed editing tools (outline previews, apply_diff's "the
 * document currently reads" dump, ambiguity context) work on the live
 * ProseMirror node, not on TipTap JSON, so `stripPrivateContent` (the JSON
 * predicate every server seam uses) cannot serve them. This is the same
 * rule for nodes: skip `privateBlock` subtrees and any text carrying the
 * `privateText` mark. Mirrors `Node.textBetween` otherwise, including the
 * block separator.
 */

import type { Node as PMNode } from "@tiptap/pm/model";
import {
  PRIVATE_BLOCK_NODE,
  PRIVATE_TEXT_MARK,
} from "@/lib/domain/content/private-content";

/** `doc.textBetween(from, to, blockSeparator)` minus private content. */
export function visibleTextBetween(
  doc: PMNode,
  from: number,
  to: number,
  blockSeparator: string = "\n",
): string {
  let out = "";
  let first = true;
  // Positions whose enclosing private block should be skipped entirely.
  let skipUntil = -1;

  doc.nodesBetween(from, to, (node, pos) => {
    if (pos < skipUntil) return false;
    if (node.type.name === PRIVATE_BLOCK_NODE) {
      skipUntil = pos + node.nodeSize;
      return false;
    }
    if (node.isText) {
      if (node.marks.some((m) => m.type.name === PRIVATE_TEXT_MARK)) return false;
      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.nodeSize);
      out += node.text?.slice(start - pos, end - pos) ?? "";
      first = false;
    } else if (node.isBlock && !first) {
      out += blockSeparator;
      first = true;
    }
    return true;
  });

  return out;
}

/** A node's own visible text (its `textContent` minus private content). */
export function visibleTextOf(node: PMNode): string {
  if (node.type.name === PRIVATE_BLOCK_NODE) return "";
  if (node.isText) {
    return node.marks.some((m) => m.type.name === PRIVATE_TEXT_MARK) ? "" : (node.text ?? "");
  }
  return visibleTextBetween(node, 0, node.content.size, " ");
}
