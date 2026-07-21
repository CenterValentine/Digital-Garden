/**
 * Markdown ↔ TipTap JSON Conversion
 *
 * Bidirectional conversion between markdown and TipTap JSON.
 * Uses `marked` for markdown → HTML, then TipTap's `generateJSON`
 * for HTML → TipTap JSON (which requires registered extensions
 * to know which node types to produce).
 */

// NOTE: client-reachable via ChatPanel → edit-orchestrator. Cannot import the
// server logger here without breaking the client bundle (node:async_hooks).
// Migrates to client-safe logger in Phase 5.
import { generateJSON, generateHTML } from "@tiptap/core";
// Server-safe twins (zeed-dom backed): @tiptap/core's generateJSON/HTML
// require a real `window`; in Node (AI tool execution: createNote,
// create_docx) they throw "no window object" and content silently
// degraded to plain paragraphs — users saw literal ## / ** markdown in
// generated notes (AI v3 S4 smoke finding, fixed 2026-07-18).
import {
  generateJSON as generateJSONServer,
  generateHTML as generateHTMLServer,
} from "@tiptap/html";
import type { JSONContent, Extensions } from "@tiptap/core";
import { marked } from "marked";
import { extractSearchTextFromTipTap } from "./search-text";

// Import TipTap extensions
// Use server-only file to avoid loading React components
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";

// ============================================================
// MARKDOWN → TIPTAP JSON
// ============================================================

/**
 * Convert markdown to TipTap JSON
 *
 * @param markdown - Markdown string
 * @returns TipTap JSON content
 */
/**
 * Result of a markdown → TipTap conversion (v3.2 T1 hardening).
 *
 * `degraded` is the load-bearing field: when the structured pipeline
 * fails, we NO LONGER silently return raw markdown as one plain paragraph
 * (the root of the R6 degraded-note bug). Instead we preserve the content
 * as a paragraph-per-block best-effort AND flag `degraded: true` so the
 * caller can mark the note (metadata + badge) and the regen sweep can find
 * it. Callers that don't care read `.json`; the thin `markdownToTiptap`
 * wrapper keeps the old signature.
 */
export interface MarkdownConversionResult {
  json: JSONContent;
  degraded: boolean;
  reason?: string;
}

export function markdownToTiptapResult(
  markdown: string,
): MarkdownConversionResult {
  if (!markdown) {
    return { json: { type: "doc", content: [] }, degraded: false };
  }
  try {
    const extensions = getServerExtensions();
    // marked → HTML, then HTML → TipTap JSON via the registered
    // extensions (native DOM in the browser, zeed-dom in Node).
    const html = marked.parse(markdown, { async: false, gfm: true }) as string;
    const json =
      typeof window === "undefined"
        ? generateJSONServer(html, extensions)
        : generateJSON(html, extensions);
    return { json, degraded: false };
  } catch (error) {
    console.error("markdown → TipTap conversion failed (degraded):", error);
    return {
      json: paragraphSplit(markdown),
      degraded: true,
      reason:
        error instanceof Error ? error.message : "markdown conversion failed",
    };
  }
}

/** Backward-compatible thin wrapper — returns just the document. */
export function markdownToTiptap(markdown: string): JSONContent {
  return markdownToTiptapResult(markdown).json;
}

/**
 * Best-effort degraded document: one paragraph per blank-line-separated
 * block, so at least line/paragraph structure survives when the real
 * pipeline can't run. Never a single raw blob.
 */
function paragraphSplit(source: string): JSONContent {
  const blocks = source
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    type: "doc",
    content: blocks.length
      ? blocks.map((block) => ({
          type: "paragraph",
          content: [{ type: "text", text: block }],
        }))
      : [{ type: "paragraph" }],
  };
}

// ============================================================
// TIPTAP JSON → MARKDOWN
// ============================================================

/**
 * Convert TipTap JSON to markdown
 *
 * @param json - TipTap JSON content
 * @returns Markdown string
 */
export function tiptapToMarkdown(json: JSONContent): string {
  if (!json || !json.content || json.content.length === 0) {
    return "";
  }

  try {
    const extensions = getServerExtensions();
    const sanitized = sanitizeTipTapJsonWithExtensions(json, extensions).json;

    // Use TipTap's markdown serializer
    // Note: This requires @tiptap/extension-markdown to be configured
    const markdown = serializeToMarkdown(sanitized, extensions);
    return markdown;
  } catch (error) {
    console.error("Failed to convert TipTap to markdown:", error);

    // Fallback: extract plain text
    return extractPlainText(json);
  }
}

/**
 * Serialize TipTap JSON to markdown (using prosemirror-markdown)
 */
function serializeToMarkdown(
  json: JSONContent,
  extensions: Extensions
): string {
  // Server path uses the zeed-dom-backed @tiptap/html twin — the old
  // plain-text early return is gone (it lost ALL formatting server-side).
  const html =
    typeof window === "undefined"
      ? generateHTMLServer(json, extensions)
      : generateHTML(json, extensions);
  return htmlToMarkdown(html);
}

// ============================================================
// FALLBACK: HTML → MARKDOWN
// ============================================================

/**
 * Convert HTML to markdown (basic conversion)
 *
 * Note: This is a simple fallback. For production, use a library
 * like turndown for robust HTML → markdown conversion.
 */
function htmlToMarkdown(html: string): string {
  let markdown = html;

  // Headers
  markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, "# $1\n\n");
  markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, "## $1\n\n");
  markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, "### $1\n\n");
  markdown = markdown.replace(/<h4>(.*?)<\/h4>/gi, "#### $1\n\n");
  markdown = markdown.replace(/<h5>(.*?)<\/h5>/gi, "##### $1\n\n");
  markdown = markdown.replace(/<h6>(.*?)<\/h6>/gi, "###### $1\n\n");

  // Bold and italic
  markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  markdown = markdown.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  markdown = markdown.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  markdown = markdown.replace(/<i>(.*?)<\/i>/gi, "*$1*");

  // Links
  markdown = markdown.replace(/<a href="(.*?)">(.*?)<\/a>/gi, "[$2]($1)");

  // Images
  markdown = markdown.replace(/<img src="(.*?)" alt="(.*?)">/gi, "![$2]($1)");

  // Code
  markdown = markdown.replace(/<code>(.*?)<\/code>/gi, "`$1`");
  markdown = markdown.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/gi,
    "```\n$1\n```\n"
  );

  // Lists
  markdown = markdown.replace(/<ul>/gi, "");
  markdown = markdown.replace(/<\/ul>/gi, "\n");
  markdown = markdown.replace(/<ol>/gi, "");
  markdown = markdown.replace(/<\/ol>/gi, "\n");
  markdown = markdown.replace(/<li>(.*?)<\/li>/gi, "- $1\n");

  // Paragraphs
  markdown = markdown.replace(/<p>(.*?)<\/p>/gi, "$1\n\n");

  // Blockquotes
  markdown = markdown.replace(
    /<blockquote>([\s\S]*?)<\/blockquote>/gi,
    "> $1\n\n"
  );

  // Line breaks
  markdown = markdown.replace(/<br\s*\/?>/gi, "\n");

  // Remove remaining HTML tags
  markdown = markdown.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  markdown = markdown.replace(/&nbsp;/g, " ");
  markdown = markdown.replace(/&quot;/g, '"');
  markdown = markdown.replace(/&amp;/g, "&");
  markdown = markdown.replace(/&lt;/g, "<");
  markdown = markdown.replace(/&gt;/g, ">");

  // Clean up whitespace
  markdown = markdown.replace(/\n{3,}/g, "\n\n");
  markdown = markdown.trim();

  return markdown;
}

// ============================================================
// PLAIN TEXT EXTRACTION (fallback)
// ============================================================

/**
 * Extract plain text from TipTap JSON (no formatting)
 */
function extractPlainText(json: JSONContent): string {
  if (!json) return "";

  let text = "";

  if (json.text) {
    text += json.text;
  }

  if (json.content && Array.isArray(json.content)) {
    for (const child of json.content) {
      text += extractPlainText(child);
    }
  }

  return text;
}

// ============================================================
// MARKDOWN FILE IMPORT
// ============================================================

/**
 * Import markdown file as NotePayload
 *
 * @param markdown - Markdown content
 * @param fileName - Original file name
 * @returns NotePayload data
 */
export function importMarkdownFile(
  markdown: string,
  fileName: string
): {
  tiptapJson: JSONContent;
  searchText: string;
  metadata: Record<string, unknown>;
} {
  const tiptapJson = markdownToTiptap(markdown);

  // Extract search text from JSON
  const searchText = extractSearchTextFromTipTap(tiptapJson);

  // Calculate metadata
  const wordCount = searchText.split(/\s+/).filter(Boolean).length;
  const readingTime = Math.ceil(wordCount / 200); // 200 WPM

  return {
    tiptapJson,
    searchText,
    metadata: {
      wordCount,
      readingTime,
      importedFrom: fileName,
      importedAt: new Date().toISOString(),
    },
  };
}

// ============================================================
// MARKDOWN FILE EXPORT
// ============================================================

/**
 * Export NotePayload as markdown file
 *
 * @param tiptapJson - TipTap JSON content
 * @param fileName - Desired file name (without extension)
 * @returns Markdown content
 */
export function exportAsMarkdown(
  tiptapJson: JSONContent,
  fileName: string
): {
  content: string;
  fileName: string;
  mimeType: string;
} {
  const markdown = tiptapToMarkdown(tiptapJson);

  return {
    content: markdown,
    fileName: `${fileName}.md`,
    mimeType: "text/markdown",
  };
}

// ============================================================
// MARKDOWN VALIDATION
// ============================================================

/**
 * Validate markdown content
 *
 * @param markdown - Markdown string
 * @returns Validation result
 */
export function validateMarkdown(markdown: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!markdown || markdown.trim().length === 0) {
    errors.push("Markdown content is empty");
  }

  // Check for common issues
  if (markdown.length > 1_000_000) {
    warnings.push("Markdown content is very large (>1MB)");
  }

  // Check for unclosed code blocks
  const codeBlockMatches = markdown.match(/```/g);
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    warnings.push("Unclosed code block detected");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
