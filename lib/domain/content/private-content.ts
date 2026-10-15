/**
 * Private content — "commenting out" for prose.
 *
 * A note can carry text that stays in the document but is inert to every
 * reader that is not the author's own editor: the AI (context, tools,
 * search excerpts), the public site, and the search index. The analogy is a
 * commented-out line of code — it stays in the file, stays in version
 * control, round-trips through markdown as Obsidian's `%% … %%`, and the
 * compiler never sees it.
 *
 * Two shapes, both defined in lib/domain/editor/extensions/private-content.ts:
 *   - `privateText`  — an inline MARK on text nodes (`%%mid-sentence%%`)
 *   - `privateBlock` — a block NODE wrapping whole blocks (`%%` … `%%` lines)
 *
 * This module is the ONE predicate. It is pure JSON (no TipTap imports), so
 * it runs on the server, in the browser, and under tsx. Every egress seam
 * calls `stripPrivateContent` explicitly — the markdown serializer itself
 * must NOT strip, because the source-view toggle uses the same serializer and
 * the author must still see their own private text there.
 *
 * The seams (kept in sync by `pnpm private:content:check`):
 *   - extractSearchTextFromTipTap       (search column + getCurrentNote tool)
 *   - chunkDocument                     (read_first_chunk / read_next_chunk)
 *   - resolveNote in source-resolver    (mentions / attachments)
 *   - renderCharterSection(+Plain)      (system-prompt charter bodies)
 *   - TipTapContent                     (public site render)
 *   - buildOutline / visibleTextBetween (client-side AI editing tools)
 */

import type { JSONContent } from "@tiptap/core";

export const PRIVATE_TEXT_MARK = "privateText";
export const PRIVATE_BLOCK_NODE = "privateBlock";

/** Obsidian's comment delimiter — the typed syntax and the markdown form. */
export const PRIVATE_DELIMITER = "%%";

/**
 * Block containers that should disappear when stripping empties them. A
 * paragraph whose only text was private is noise to a reader; an emptied
 * list item cascades up through its list. Structural cells (table) are NOT
 * here — dropping one would break the row, so they stay as empty cells.
 */
const COLLAPSIBLE_WHEN_EMPTY = new Set<string>([
  "paragraph",
  "heading",
  "listItem",
  "taskItem",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
]);

function hasPrivateMark(node: JSONContent): boolean {
  return Array.isArray(node.marks) && node.marks.some((m) => m.type === PRIVATE_TEXT_MARK);
}

/**
 * Return a copy of `json` with every private block and every privately-marked
 * inline node removed. Never mutates the input. A node that had children and
 * lost all of them to stripping is itself dropped when it is a collapsible
 * container (see COLLAPSIBLE_WHEN_EMPTY), so the reader does not see empty
 * paragraphs where comments used to be.
 *
 * Returns `null` only when the node itself must be removed; the doc root is
 * always returned (possibly with empty content).
 */
export function stripPrivateContent(json: JSONContent): JSONContent {
  return stripNode(json, true) ?? { ...json, content: [] };
}

function stripNode(node: JSONContent, isRoot: boolean): JSONContent | null {
  if (!node || typeof node !== "object") return node;
  if (node.type === PRIVATE_BLOCK_NODE) return null;
  if (hasPrivateMark(node)) return null;

  if (!Array.isArray(node.content)) return node;

  const hadChildren = node.content.length > 0;
  const kept: JSONContent[] = [];
  for (const child of node.content) {
    const next = stripNode(child, false);
    if (next) kept.push(next);
  }

  if (
    !isRoot &&
    hadChildren &&
    kept.length === 0 &&
    typeof node.type === "string" &&
    COLLAPSIBLE_WHEN_EMPTY.has(node.type)
  ) {
    return null;
  }

  return { ...node, content: kept };
}

/** True when the document carries any private block or privately-marked text. */
export function hasPrivateContent(json: JSONContent | null | undefined): boolean {
  if (!json || typeof json !== "object") return false;
  if (json.type === PRIVATE_BLOCK_NODE) return true;
  if (hasPrivateMark(json)) return true;
  return Array.isArray(json.content) && json.content.some(hasPrivateContent);
}
