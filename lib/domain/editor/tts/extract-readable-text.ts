/**
 * extractReadableText — flatten TipTap JSON into narratable plain text.
 *
 * The ONE place block-awareness lives for "read aloud". Both the whole-document
 * read (toolbar "Listen") and the selection read (BubbleMenu "Read selection")
 * call this, so a highlight spanning a code block or a diagram reads the prose
 * and silently drops the non-narratable node — identical behaviour everywhere.
 *
 * Rules:
 *   - Skipped node types (see `eligibility.ts`) contribute nothing and are NOT
 *     recursed into — neither their text nor their descendants are narrated.
 *   - `text` nodes contribute their text; `hardBreak` becomes a newline.
 *   - Every other node recurses into `content`. Block-boundary nodes
 *     (paragraphs, headings, list items, quotes, table cells, callouts …) get a
 *     trailing paragraph break so the synthesizer pauses naturally between them.
 *
 * Client-safe: consults the block registry, which is populated at editor import
 * time. Extraction runs in the browser; the synth endpoint receives the result
 * as plain text and never needs the registry.
 */

import type { JSONContent } from "@tiptap/core";
import { isTtsSkippedType } from "./eligibility";

/** Inserted after block-boundary nodes — a blank line reads as a pause. */
const PARAGRAPH_BREAK = "\n\n";

/**
 * Node types that delimit a "spoken paragraph". Each gets a trailing pause so
 * the narrator doesn't run sentences together. Inline/structural wrappers
 * (bulletList, doc, callout shell, …) are intentionally absent — they just
 * recurse, and their block children supply the breaks.
 */
const BLOCK_BOUNDARY_TYPES: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "taskItem",
  "tableCell",
  "tableHeader",
  "calloutContent",
  "sectionHeader",
  "pullQuote",
  "codeBlock",
]);

/**
 * Make code listenable: read the meaningful tokens, skip the format noise.
 *
 * ── Tunable regex knob ──
 * Code blocks ARE narrated (the user wants to hear them), but reading every
 * brace and semicolon aloud is useless. This drops lines that carry no
 * letters/digits (pure punctuation: `{`, `});`, `------`, etc.) and collapses
 * long symbol runs within a line. Loosen or tighten the patterns to taste.
 */
export function sanitizeCodeForSpeech(code: string): string {
  return code
    .split("\n")
    // Keep only lines that contain at least one letter or digit.
    .filter((line) => /[A-Za-z0-9]/.test(line))
    // Collapse runs of 3+ non-alphanumeric, non-space chars to a single space.
    .map((line) => line.replace(/[^\sA-Za-z0-9]{3,}/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function nodeToText(node: JSONContent): string {
  const type = node.type;

  // A bare wrapper (e.g. a serialized fragment with no type) — recurse content.
  if (!type) {
    return (node.content ?? []).map(nodeToText).join("");
  }

  if (isTtsSkippedType(type)) return "";

  if (type === "text") return node.text ?? "";
  if (type === "hardBreak") return "\n";

  const inner = (node.content ?? []).map(nodeToText).join("");

  if (type === "codeBlock") {
    const spoken = sanitizeCodeForSpeech(inner);
    return spoken ? `${spoken}${PARAGRAPH_BREAK}` : "";
  }

  if (BLOCK_BOUNDARY_TYPES.has(type)) {
    return inner.trim() ? `${inner.trimEnd()}${PARAGRAPH_BREAK}` : "";
  }

  return inner;
}

/**
 * Extract narratable text from a TipTap document, a node, or a fragment.
 *
 * @param content A full doc (`{ type: "doc", content }`), a single node, or an
 *   array of nodes (e.g. a serialized selection slice).
 * @returns Plain text with paragraph breaks, ready to hand to a TTS engine.
 *   Empty string when nothing narratable remains (e.g. a code-only selection).
 */
export function extractReadableText(
  content: JSONContent | JSONContent[] | null | undefined,
): string {
  if (!content) return "";
  const nodes = Array.isArray(content) ? content : [content];
  const raw = nodes.map(nodeToText).join("");
  // Collapse runs of blank lines and trim the edges.
  return raw.replace(/\n{3,}/g, PARAGRAPH_BREAK).trim();
}
