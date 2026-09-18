/**
 * ProseMirror Text Search
 *
 * Finds text positions in a ProseMirror document for AI edit operations.
 * Returns the { from, to } offsets needed to create a TextSelection
 * over the matched text.
 *
 * The search operates on ProseMirror's textContent (rendered text without
 * markdown syntax), which is what the user sees in the editor.
 */

import type { Node as PMNode } from "@tiptap/pm/model";

export interface TextSearchResult {
  /** Start position in document (ProseMirror offset) */
  from: number;
  /** End position in document (ProseMirror offset) */
  to: number;
}

/** Absolute position range to restrict a search to. */
export interface SearchRange {
  from: number;
  to: number;
}

/**
 * Multiple matches. `count` is kept as the discriminant so existing
 * `"count" in result` checks keep working; `matches` lets a caller quote
 * surrounding context for each one so the model can disambiguate.
 */
export interface AmbiguousMatch {
  count: number;
  matches: TextSearchResult[];
}

/**
 * Find exact text in a ProseMirror document.
 *
 * Walks the document tree, accumulating text and tracking ProseMirror
 * offsets. Returns the first match position, or null if not found.
 *
 * @param range Optional absolute position range to search within. Used to scope
 *              a search to one top-level block, so that text repeated elsewhere
 *              in the document does not make the target ambiguous.
 *
 * @returns TextSearchResult for the single match, null if not found,
 *          or { count, matches } if multiple matches exist.
 */
export function findTextInDoc(
  doc: PMNode,
  query: string,
  range?: SearchRange
): TextSearchResult | null | AmbiguousMatch {
  if (!query) return null;

  // Build a flat text representation with offset mapping.
  // Each entry maps a character index in the flat text to its
  // ProseMirror document position.
  const textRuns: Array<{ text: string; pmOffset: number }> = [];

  const collect = (node: PMNode, pos: number) => {
    if (!node.isText || !node.text) return;
    // nodesBetween yields nodes that merely OVERLAP the range, so a text node
    // straddling the boundary would otherwise leak neighbouring blocks' text
    // into the flat string and let a scoped match escape its block.
    if (range && (pos < range.from || pos + node.text.length > range.to)) return;
    textRuns.push({ text: node.text, pmOffset: pos });
  };

  if (range) {
    doc.nodesBetween(range.from, range.to, collect);
  } else {
    doc.descendants(collect);
  }

  // Reconstruct flat text and build position map
  let flatText = "";
  const posMap: number[] = []; // posMap[charIndex] = pmOffset

  for (const run of textRuns) {
    for (let i = 0; i < run.text.length; i++) {
      posMap.push(run.pmOffset + i);
      flatText += run.text[i];
    }
  }

  // Find all occurrences
  const matches: TextSearchResult[] = [];
  let searchStart = 0;

  while (searchStart <= flatText.length - query.length) {
    const idx = flatText.indexOf(query, searchStart);
    if (idx === -1) break;

    matches.push({
      from: posMap[idx],
      to: posMap[idx + query.length - 1] + 1,
    });

    searchStart = idx + 1;
  }

  if (matches.length === 0) return null;
  if (matches.length > 1) return { count: matches.length, matches };
  return matches[0];
}
