/**
 * Comments — talk about the text, in the text.
 *
 * A comment thread is anchored to a passage by the `comment` MARK, whose only
 * attribute is the thread id. The anchor lives in the document (the Y.Doc) so
 * it survives every collaborator's edits; the discussion — who said what,
 * when, resolved or not — lives beside the note in Postgres (`CommentThread`,
 * `Comment`), keyed by that id. Resolution is a row flag drawn as an editor
 * decoration, never a mark attribute.
 *
 * This module is the ONE pure-JSON helper set (no TipTap imports), so it runs
 * on the server, in the browser and under tsx:
 *
 *   - `stripCommentMarks` — remove the mark, keep the text. Called explicitly
 *     at every egress seam whose output is markdown or HTML (AI reads, public
 *     render, exports), AFTER `stripPrivateContent`. Plain-text seams need
 *     nothing: a mark never changes extracted text. The markdown serializer
 *     itself must NOT strip — the source view shows comments as CriticMarkup
 *     (`{==passage==}{>>#id<<}`, see comment-markdown.ts).
 *   - `collectCommentThreadIds` — which threads a document still anchors; the
 *     Comments tab joins this against the server's thread list, and a mark
 *     arriving through Y.js with an unknown id is the "new thread" signal.
 *
 * Plan: docs/notes-feature/work-tracking/COMMENTS-ANNOTATIONS-PLAN.md
 * Seams are pinned by `pnpm comments:check` (scripts/validate-comments.ts).
 */

import type { JSONContent } from "@tiptap/core";

export const COMMENT_MARK = "comment";

/** Thread ids are UUIDs minted client-side so the mark can precede the row. */
export const COMMENT_THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCommentThreadId(value: unknown): value is string {
  return typeof value === "string" && COMMENT_THREAD_ID_RE.test(value);
}

type MarkJson = NonNullable<JSONContent["marks"]>[number];

const isCommentMark = (m: MarkJson) => m.type === COMMENT_MARK;

/**
 * Return a copy of `json` with every `comment` mark removed and the text kept.
 * Never mutates the input. Adjacent text nodes left with identical marks are
 * merged, so the result is the document a reader would have typed.
 */
export function stripCommentMarks(json: JSONContent): JSONContent {
  return stripNode(json);
}

function stripNode(node: JSONContent): JSONContent {
  if (!node || typeof node !== "object") return node;
  let next = node;

  if (Array.isArray(node.marks) && node.marks.some(isCommentMark)) {
    const marks = node.marks.filter((m) => !isCommentMark(m));
    next = { ...node };
    if (marks.length > 0) next.marks = marks;
    else delete next.marks;
  }

  if (Array.isArray(node.content)) {
    const content = mergeAdjacentText(node.content.map(stripNode));
    next = next === node ? { ...node, content } : { ...next, content };
  }

  return next;
}

function sameMarks(a: JSONContent, b: JSONContent): boolean {
  return JSON.stringify(a.marks ?? []) === JSON.stringify(b.marks ?? []);
}

function mergeAdjacentText(nodes: JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.type === "text" &&
      node.type === "text" &&
      typeof prev.text === "string" &&
      typeof node.text === "string" &&
      sameMarks(prev, node)
    ) {
      out[out.length - 1] = { ...prev, text: prev.text + node.text };
    } else {
      out.push(node);
    }
  }
  return out;
}

/** True when the document carries any `comment` mark. */
export function hasCommentMarks(json: JSONContent | null | undefined): boolean {
  if (!json || typeof json !== "object") return false;
  if (Array.isArray(json.marks) && json.marks.some(isCommentMark)) return true;
  return Array.isArray(json.content) && json.content.some(hasCommentMarks);
}

/** Every thread id the document still anchors, in first-appearance order. */
export function collectCommentThreadIds(json: JSONContent | null | undefined): string[] {
  const seen = new Set<string>();
  const visit = (node: JSONContent | null | undefined) => {
    if (!node || typeof node !== "object") return;
    for (const mark of node.marks ?? []) {
      if (isCommentMark(mark)) {
        const id = mark.attrs?.threadId;
        if (isCommentThreadId(id)) seen.add(id.toLowerCase());
      }
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(json);
  return Array.from(seen);
}
