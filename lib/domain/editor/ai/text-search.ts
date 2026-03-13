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

/**
 * Find exact text in a ProseMirror document.
 *
 * Walks the document tree, accumulating text and tracking ProseMirror
 * offsets. Returns the first match position, or null if not found.
 *
 * @returns TextSearchResult for the first match, null if not found,
 *          or { count: number } if multiple matches exist.
 */
export function findTextInDoc(
  doc: PMNode,
  query: string
): TextSearchResult | null | { count: number } {
  if (!query) return null;

  // Build a flat text representation with offset mapping.
  // Each entry maps a character index in the flat text to its
  // ProseMirror document position.
  const textRuns: Array<{ text: string; pmOffset: number }> = [];

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      textRuns.push({ text: node.text, pmOffset: pos });
    }
  });

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
  if (matches.length > 1) return { count: matches.length };
  return matches[0];
}
