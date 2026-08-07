/**
 * Wiki-link reference utilities (pure, client- and server-safe).
 *
 * Two jobs, one seam:
 *  - `collectWikiLinkRefs` — walk a TipTap doc for `wikiLink` NODES and
 *    return their refs (id-first: autocomplete-authored links carry
 *    `targetId`; hand-typed and AI-authored ones resolve by title).
 *  - `linkifyWikiRefsInTiptap` — upgrade literal `[[Title]]` /
 *    `[[Title|Alias]]` TEXT into real wikiLink nodes. The markdown→TipTap
 *    converter has no wiki syntax (deliberately — the lossless system
 *    serializes wikiLink at Tier 2 node-HTML), so AI-authored markdown lands
 *    as plain text. The AI write tools run this enrichment post-conversion;
 *    the global parser stays untouched.
 */

import type { JSONContent } from "@tiptap/core";

export interface WikiLinkRef {
  targetId: string | null;
  targetTitle: string;
}

/** Collect distinct wikiLink-node refs anywhere in a TipTap doc. */
export function collectWikiLinkRefs(doc: JSONContent | null | undefined): WikiLinkRef[] {
  const out: WikiLinkRef[] = [];
  const seen = new Set<string>();
  const walk = (node: JSONContent | undefined) => {
    if (!node) return;
    if (node.type === "wikiLink") {
      const attrs = (node.attrs ?? {}) as {
        targetId?: string | null;
        targetTitle?: string | null;
      };
      const title = (attrs.targetTitle ?? "").trim();
      if (title) {
        const key = `${attrs.targetId ?? ""}::${title.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ targetId: attrs.targetId ?? null, targetTitle: title });
        }
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc ?? undefined);
  return out;
}

const WIKI_TEXT_RE = /\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

/** True when a text node carries a `code` mark — wiki syntax stays literal there. */
function hasCodeMark(node: JSONContent): boolean {
  return (node.marks ?? []).some((mark) => mark.type === "code");
}

/**
 * Replace literal `[[…]]` runs in text nodes with wikiLink nodes (marks
 * preserved on surrounding text; code blocks and inline code left alone).
 * Returns a new doc; the input is not mutated.
 */
export function linkifyWikiRefsInTiptap(doc: JSONContent): JSONContent {
  const transform = (node: JSONContent): JSONContent | JSONContent[] => {
    if (node.type === "codeBlock") return node;
    if (node.type === "text" && typeof node.text === "string" && !hasCodeMark(node)) {
      const text = node.text;
      if (!text.includes("[[")) return node;
      const pieces: JSONContent[] = [];
      let last = 0;
      WIKI_TEXT_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = WIKI_TEXT_RE.exec(text)) !== null) {
        const [full, target, alias] = match;
        const title = target.trim();
        if (!title) continue;
        if (match.index > last) {
          pieces.push({ ...node, text: text.slice(last, match.index) });
        }
        pieces.push({
          type: "wikiLink",
          attrs: {
            targetId: null,
            targetTitle: title,
            ...(alias?.trim() ? { displayText: alias.trim() } : {}),
          },
        });
        last = match.index + full.length;
      }
      if (pieces.length === 0) return node;
      if (last < text.length) pieces.push({ ...node, text: text.slice(last) });
      return pieces;
    }
    if (!node.content) return node;
    return {
      ...node,
      content: node.content.flatMap((child) => transform(child)),
    };
  };
  const result = transform(doc);
  return Array.isArray(result) ? { ...doc, content: result } : result;
}
