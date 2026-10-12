/**
 * Recognised text → TipTap block content. OCR-PASTE-PLAN.md D6.
 *
 * The markdown parser is a parameter: the app binds the editor's own paste
 * parser (`markdownPasteToTiptap`, in index.ts), and the gate binds a
 * tsx-safe twin — the server extension set does not load under tsx.
 */
import type { JSONContent } from "@tiptap/core";

import { isLikelyMarkdown } from "@/lib/domain/content/markdown-detect";

import { reflowOcrText } from "./reflow";

export type MarkdownParser = (markdown: string) => JSONContent;

function plainParagraphs(text: string): JSONContent[] {
  return text.split("\n\n").map((paragraph) => {
    const content: JSONContent[] = [];
    paragraph.split("\n").forEach((line, i) => {
      if (i > 0) content.push({ type: "hardBreak" });
      if (line) content.push({ type: "text", text: line });
    });
    return { type: "paragraph", content };
  });
}

/**
 * The AI engine already returns well-formed markdown (code fences, headings,
 * tables), so it skips the reflow built for Tesseract's one-line-per-visual-
 * line output — reflowing would mangle a code block's lines.
 */
export function buildAiContent(markdown: string, parseMarkdown: MarkdownParser): JSONContent[] {
  const text = markdown.trim();
  if (!text) return [];
  const parsed = parseMarkdown(text).content ?? [];
  return parsed.length > 0 ? parsed : plainParagraphs(text);
}

/** Empty array = no text was recognised. */
export function buildOcrContent(raw: string, parseMarkdown: MarkdownParser): JSONContent[] {
  const text = reflowOcrText(raw);
  if (!text) return [];
  // Lists and headings in a screenshot become real blocks. Same conservative
  // detector as the paste path, so OCR'd prose is never mangled into markup.
  if (isLikelyMarkdown(text)) {
    const parsed = parseMarkdown(text).content ?? [];
    if (parsed.length > 0) return parsed;
  }
  return plainParagraphs(text);
}
