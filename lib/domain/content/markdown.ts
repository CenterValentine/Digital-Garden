/**
 * Markdown ↔ TipTap JSON Conversion
 *
 * Bidirectional conversion between markdown and TipTap JSON.
 * Uses `marked` for markdown → HTML, then TipTap's `generateJSON`
 * for HTML → TipTap JSON (which requires registered extensions
 * to know which node types to produce).
 */

// NOTE: client-reachable via ChatPanel → edit-orchestrator and the source-view
// toggle. The heavy lifting lives in markdown-serialize.ts (turndown + fence,
// self-verifying); this file keeps the public API + degraded-signal contract.
import type { JSONContent, Extensions } from "@tiptap/core";
import { extractSearchTextFromTipTap } from "./search-text";
import {
  tiptapToMarkdownRich,
  markdownToTiptapRich,
} from "./markdown-serialize";

// Import TipTap extensions
// Use server-only file to avoid loading React components
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";

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
  extensionsArg?: Extensions,
): MarkdownConversionResult {
  if (!markdown) {
    return { json: { type: "doc", content: [] }, degraded: false };
  }
  try {
    const extensions = extensionsArg ?? getServerExtensions();
    // marked → HTML → TipTap JSON, then normalize code blocks, restore
    // dg-block fences, and de-dupe blockIds. See markdown-serialize.ts.
    const json = markdownToTiptapRich(markdown, extensions);
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

/**
 * Backward-compatible thin wrapper — returns just the document.
 * `extensionsArg` is for testability (the block-safety CI gate injects the
 * tsx-safe collaboration extensions); runtime callers omit it.
 */
export function markdownToTiptap(
  markdown: string,
  extensionsArg?: Extensions,
): JSONContent {
  return markdownToTiptapResult(markdown, extensionsArg).json;
}

/*
 * Collaboration-write guard (v3.2 T1). This converter is PURE — it does
 * not know or care whether the target note is collab-enabled. Callers
 * that WRITE the result to a NotePayload MUST respect the R6 lesson: for
 * a note with a live CollaborationDocument, the Y.js doc is authoritative,
 * so overwriting NotePayload.tiptapJson is invisible at best and diverges
 * the two stores at worst (the daily-notes template-overlay failure). The
 * regen sweep (scripts/regen-degraded-notes.ts) already skips collab-live
 * notes; any new write path that converts markdown must do the same, or
 * route the change through the collaboration content-safety layer.
 */

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
 * Convert TipTap JSON to markdown.
 *
 * Top-level blocks are partitioned into contiguous *round-trippable* runs
 * (serialized as normal markdown) and individual *custom* nodes (emitted as
 * lossless dg-block fences). This guarantees `tiptap → md → tiptap` never
 * loses a block — the T2 source-view toggle depends on it.
 *
 * @param json - TipTap JSON content
 * @param extensionsArg - injected extensions (testability; runtime omits it)
 * @returns Markdown string
 */
export function tiptapToMarkdown(
  json: JSONContent,
  extensionsArg?: Extensions,
): string {
  if (!json || !json.content || json.content.length === 0) {
    return "";
  }

  const extensions = extensionsArg ?? getServerExtensions();
  try {
    // turndown (pretty, self-verifying) + dg-block fence fallback. Each block
    // is emitted pretty only if it provably round-trips; else fenced. See
    // markdown-serialize.ts.
    return tiptapToMarkdownRich(json, extensions);
  } catch (error) {
    console.error("Failed to convert TipTap to markdown:", error);

    // Fallback: extract plain text
    return extractPlainText(json);
  }
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
