/**
 * Inline Content Parser
 *
 * Cursor-based scanner that converts inline markdown content into
 * TipTap JSONContent nodes. Handles marks (bold, italic, code, strike),
 * links, and produces text nodes with mark arrays.
 *
 * Phase 1: Core marks + links
 * Phase 2: Semantic tags, wiki-links, plain tags, plain wiki-links
 */

import type { JSONContent } from "@tiptap/core";
import type { ParseOptions } from "./types";

// ─── Semantic HTML comment patterns (from export converter) ──
const SEMANTIC_TAG_RE =
  /^<!-- tag:([^:]*):?(.*?) -->#([a-zA-Z0-9][a-zA-Z0-9_-]*)<!-- \/tag -->/;
const SEMANTIC_WIKILINK_RE =
  /^<!-- wikilink:([^ ]*) -->\[\[([^\]]+)\]\]<!-- \/wikilink -->/;
const PLAIN_WIKILINK_RE = /^\[\[([^\]]+)\]\]/;
// Plain tag: # followed by alphanumeric, 2-50 chars, preceded by whitespace or start
const PLAIN_TAG_RE = /^#([a-zA-Z0-9][a-zA-Z0-9_-]{1,49})\b/;

/** A mark applied to a text span */
interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * Parse inline markdown content into TipTap JSONContent nodes.
 *
 * Returns an array of text nodes (with marks) and inline atomic nodes.
 * The caller wraps these in a paragraph or heading node.
 */
export function parseInlineContent(
  text: string,
  options: ParseOptions
): JSONContent[] {
  if (!text) return [];

  const nodes: JSONContent[] = [];
  const result = parseInlineSegment(text, [], options);

  // Merge adjacent text nodes with identical marks
  for (const node of result) {
    const last = nodes[nodes.length - 1];
    if (
      last &&
      last.type === "text" &&
      node.type === "text" &&
      marksEqual(last.marks, node.marks)
    ) {
      last.text = (last.text || "") + (node.text || "");
    } else {
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * Recursive inline parser with mark stack.
 *
 * Scans character by character looking for delimiter patterns.
 * When a delimiter is found, recursively parses the delimited content
 * with the new mark pushed onto the stack.
 */
function parseInlineSegment(
  text: string,
  activeMarks: Mark[],
  options: ParseOptions
): JSONContent[] {
  const nodes: JSONContent[] = [];
  let i = 0;
  let buffer = "";

  function flushBuffer() {
    if (buffer) {
      nodes.push(makeTextNode(buffer, activeMarks));
      buffer = "";
    }
  }

  while (i < text.length) {
    // ── Escaped character ──
    if (text[i] === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      if ("\\`*_~[](){}#+-!|".includes(next)) {
        buffer += next;
        i += 2;
        continue;
      }
    }

    // ── Semantic tag: <!-- tag:id:color -->#name<!-- /tag --> ──
    if (options.parseSemantics && text.startsWith("<!-- tag:", i)) {
      const remaining = text.slice(i);
      const match = remaining.match(SEMANTIC_TAG_RE);
      if (match) {
        flushBuffer();
        const [fullMatch, tagId, color, tagName] = match;
        nodes.push({
          type: "tag",
          attrs: {
            tagId: tagId || "",
            tagName,
            slug: tagName.toLowerCase(),
            color: color || null,
          },
        });
        i += fullMatch.length;
        continue;
      }
    }

    // ── Semantic wiki-link: <!-- wikilink:id -->[[Target|Display]]<!-- /wikilink --> ──
    if (options.parseSemantics && text.startsWith("<!-- wikilink:", i)) {
      const remaining = text.slice(i);
      const match = remaining.match(SEMANTIC_WIKILINK_RE);
      if (match) {
        flushBuffer();
        const [fullMatch, , innerContent] = match;
        const parts = innerContent.split("|");
        const targetTitle = parts[0];
        const displayText = parts.length > 1 ? parts.slice(1).join("|") : null;
        nodes.push({
          type: "wikiLink",
          attrs: { targetTitle, displayText },
        });
        i += fullMatch.length;
        continue;
      }
    }

    // ── Plain wiki-link: [[Target]] or [[Target|Display]] ──
    if (text[i] === "[" && text[i + 1] === "[") {
      const remaining = text.slice(i);
      const match = remaining.match(PLAIN_WIKILINK_RE);
      if (match) {
        flushBuffer();
        const [fullMatch, innerContent] = match;
        const parts = innerContent.split("|");
        const targetTitle = parts[0];
        const displayText = parts.length > 1 ? parts.slice(1).join("|") : null;
        nodes.push({
          type: "wikiLink",
          attrs: { targetTitle, displayText },
        });
        i += fullMatch.length;
        continue;
      }
    }

    // ── Plain tag: #tagName (preceded by whitespace or start of line) ──
    if (text[i] === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
      const remaining = text.slice(i);
      const match = remaining.match(PLAIN_TAG_RE);
      if (match) {
        flushBuffer();
        const [fullMatch, tagName] = match;
        nodes.push({
          type: "tag",
          attrs: {
            tagId: "",
            tagName,
            slug: tagName.toLowerCase(),
            color: null,
          },
        });
        i += fullMatch.length;
        continue;
      }
    }

    // ── Inline code (highest priority — no nesting inside) ──
    if (text[i] === "`") {
      const closeIdx = text.indexOf("`", i + 1);
      if (closeIdx !== -1) {
        flushBuffer();
        const codeText = text.slice(i + 1, closeIdx);
        nodes.push(
          makeTextNode(codeText, [
            ...activeMarks,
            { type: "code" },
          ])
        );
        i = closeIdx + 1;
        continue;
      }
    }

    // ── Bold: ** ──
    if (text[i] === "*" && text[i + 1] === "*") {
      const closeIdx = findClosingDelimiter(text, i + 2, "**");
      if (closeIdx !== -1) {
        flushBuffer();
        const inner = text.slice(i + 2, closeIdx);
        const innerNodes = parseInlineSegment(inner, [
          ...activeMarks,
          { type: "bold" },
        ], options);
        nodes.push(...innerNodes);
        i = closeIdx + 2;
        continue;
      }
    }

    // ── Strikethrough: ~~ ──
    if (text[i] === "~" && text[i + 1] === "~") {
      const closeIdx = findClosingDelimiter(text, i + 2, "~~");
      if (closeIdx !== -1) {
        flushBuffer();
        const inner = text.slice(i + 2, closeIdx);
        const innerNodes = parseInlineSegment(inner, [
          ...activeMarks,
          { type: "strike" },
        ], options);
        nodes.push(...innerNodes);
        i = closeIdx + 2;
        continue;
      }
    }

    // ── Italic: * (single, after bold check) ──
    if (text[i] === "*" && text[i + 1] !== "*") {
      const closeIdx = findClosingDelimiter(text, i + 1, "*");
      if (closeIdx !== -1) {
        flushBuffer();
        const inner = text.slice(i + 1, closeIdx);
        const innerNodes = parseInlineSegment(inner, [
          ...activeMarks,
          { type: "italic" },
        ], options);
        nodes.push(...innerNodes);
        i = closeIdx + 1;
        continue;
      }
    }

    // ── Italic: _ ──
    if (text[i] === "_" && text[i + 1] !== "_") {
      const closeIdx = findClosingDelimiter(text, i + 1, "_");
      if (closeIdx !== -1) {
        flushBuffer();
        const inner = text.slice(i + 1, closeIdx);
        const innerNodes = parseInlineSegment(inner, [
          ...activeMarks,
          { type: "italic" },
        ], options);
        nodes.push(...innerNodes);
        i = closeIdx + 1;
        continue;
      }
    }

    // ── Link: [text](url) ──
    if (text[i] === "[") {
      const result = parseLinkAt(text, i);
      if (result) {
        flushBuffer();
        const linkMark: Mark = {
          type: "link",
          attrs: { href: result.href, target: "_blank", rel: "noopener noreferrer nofollow", class: null },
        };
        const innerNodes = parseInlineSegment(result.text, [
          ...activeMarks,
          linkMark,
        ], options);
        nodes.push(...innerNodes);
        i = result.endIndex;
        continue;
      }
    }

    // ── Hard break: two trailing spaces before newline ──
    if (text[i] === " " && text[i + 1] === " " && text[i + 2] === "\n") {
      flushBuffer();
      nodes.push({ type: "hardBreak" });
      i += 3;
      continue;
    }

    // ── Default: accumulate into text buffer ──
    buffer += text[i];
    i++;
  }

  flushBuffer();
  return nodes;
}

// ─── Helpers ────────────────────────────────────────────────

/** Find the closing position of a delimiter, skipping escaped characters */
function findClosingDelimiter(
  text: string,
  startIdx: number,
  delimiter: string
): number {
  let i = startIdx;
  while (i < text.length) {
    // Skip escaped characters
    if (text[i] === "\\" && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (text.startsWith(delimiter, i)) {
      return i;
    }
    i++;
  }
  return -1;
}

/** Parse a markdown link [text](url) at position i, return null if not a valid link */
function parseLinkAt(
  text: string,
  i: number
): { text: string; href: string; endIndex: number } | null {
  if (text[i] !== "[") return null;

  // Find closing ]
  let bracketDepth = 1;
  let j = i + 1;
  while (j < text.length && bracketDepth > 0) {
    if (text[j] === "[") bracketDepth++;
    else if (text[j] === "]") bracketDepth--;
    j++;
  }
  if (bracketDepth !== 0) return null;

  const linkText = text.slice(i + 1, j - 1);

  // Expect ( immediately after ]
  if (text[j] !== "(") return null;

  // Find closing ) — handle balanced parens in URLs
  let parenDepth = 1;
  let k = j + 1;
  while (k < text.length && parenDepth > 0) {
    if (text[k] === "(") parenDepth++;
    else if (text[k] === ")") parenDepth--;
    k++;
  }
  if (parenDepth !== 0) return null;

  const href = text.slice(j + 1, k - 1);

  return { text: linkText, href, endIndex: k };
}

/** Create a TipTap text node with optional marks */
function makeTextNode(text: string, marks: Mark[]): JSONContent {
  const node: JSONContent = { type: "text", text };
  if (marks.length > 0) {
    node.marks = marks.map((m) => {
      if (m.attrs) return { type: m.type, attrs: m.attrs };
      return { type: m.type };
    });
  }
  return node;
}

/** Check if two mark arrays are structurally equal */
function marksEqual(
  a: JSONContent["marks"] | undefined,
  b: JSONContent["marks"] | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
