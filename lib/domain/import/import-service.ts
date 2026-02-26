/**
 * Import Service
 *
 * Orchestrates the full import pipeline:
 * 1. Parse markdown (or accept lossless JSON)
 * 2. Enrich with sidecar metadata (if provided)
 * 3. Create ContentNode + NotePayload
 * 4. Sync tags
 */

import type { JSONContent } from "@tiptap/core";
import type { ImportResult, ImportWarning } from "./types";
import { parseMarkdown } from "./markdown-parser";
import { parseSidecar, enrichWithSidecar } from "./sidecar-reader";
import { prisma } from "@/lib/database/client";
import {
  generateUniqueSlug,
  extractSearchTextFromTipTap,
} from "@/lib/domain/content";
import { syncContentTags } from "@/lib/domain/content/tag-sync";

export interface ImportFileInput {
  /** Markdown content (for .md files) */
  markdownContent?: string;
  /** TipTap JSON content (for .json files — lossless bypass) */
  jsonContent?: JSONContent;
  /** Sidecar content (optional .meta.json string) */
  sidecarContent?: string;
  /** Title override (defaults to first heading or filename) */
  title?: string;
  /** Filename (used as title fallback) */
  fileName?: string;
  /** Parent folder ID */
  parentId?: string | null;
  /** User ID (from auth session) */
  userId: string;
}

/**
 * Import a file as a new ContentNode with NotePayload.
 *
 * Supports two input paths:
 * - `.md` file → parsed via custom two-pass parser
 * - `.json` file with `type: "doc"` → used directly (lossless)
 */
export async function importFile(input: ImportFileInput): Promise<ImportResult> {
  const warnings: ImportWarning[] = [];
  let tiptapJson: JSONContent;

  // ── Step 1: Get TipTap JSON ──

  if (input.jsonContent) {
    // Lossless JSON bypass
    if (input.jsonContent.type !== "doc") {
      return {
        success: false,
        title: input.title || input.fileName || "Unknown",
        warnings: [],
        error: "JSON file must have root type 'doc'. This may be a .meta.json sidecar uploaded as the main file.",
      };
    }
    tiptapJson = input.jsonContent;
  } else if (input.markdownContent) {
    // Parse markdown
    const parseResult = parseMarkdown(input.markdownContent);
    tiptapJson = parseResult.tiptapJson;
    warnings.push(...parseResult.warnings);
  } else {
    return {
      success: false,
      title: input.title || input.fileName || "Unknown",
      warnings: [],
      error: "No markdown or JSON content provided",
    };
  }

  // ── Step 2: Enrich with sidecar (if provided) ──

  let sidecarTitle: string | undefined;

  if (input.sidecarContent) {
    const sidecarResult = parseSidecar(input.sidecarContent);
    if (sidecarResult) {
      warnings.push(...sidecarResult.warnings);
      sidecarTitle = sidecarResult.sidecar.title || undefined;

      const enrichResult = enrichWithSidecar(tiptapJson, sidecarResult.sidecar);
      tiptapJson = enrichResult.enrichedJson;
      warnings.push(...enrichResult.warnings);
    } else {
      warnings.push({
        code: "SIDECAR_PARSE_FAILED",
        message: "Failed to parse .meta.json sidecar — importing without metadata enrichment",
      });
    }
  }

  // ── Step 3: Determine title ──

  const title =
    input.title ||
    sidecarTitle ||
    extractTitleFromJson(tiptapJson) ||
    fileNameToTitle(input.fileName) ||
    "Imported Note";

  // ── Step 4: Create ContentNode + NotePayload ──

  try {
    const searchText = extractSearchTextFromTipTap(tiptapJson);
    const wordCount = searchText.split(/\s+/).filter(Boolean).length;

    const slug = await generateUniqueSlug(title, input.userId);

    const content = await prisma.contentNode.create({
      data: {
        title,
        slug,
        contentType: "note",
        ownerId: input.userId,
        parentId: input.parentId || null,
        notePayload: {
          create: {
            tiptapJson: tiptapJson as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Prisma Json type
            searchText,
            metadata: {
              wordCount,
              characterCount: searchText.length,
              readingTime: Math.ceil(wordCount / 200),
              importedAt: new Date().toISOString(),
              importedFrom: input.fileName || undefined,
            },
          },
        },
      },
    });

    // ── Step 5: Sync tags ──

    await syncContentTags(content.id, tiptapJson, input.userId);

    return {
      success: true,
      contentId: content.id,
      title,
      warnings,
    };
  } catch (error) {
    console.error("[importFile] Error creating content:", error);
    return {
      success: false,
      title,
      warnings,
      error: error instanceof Error ? error.message : "Failed to create content",
    };
  }
}

/**
 * Extract title from TipTap JSON.
 * Returns the text of the first H1 heading, or the first paragraph text.
 */
export function extractTitleFromJson(json: JSONContent): string | null {
  if (!json.content) return null;

  for (const node of json.content) {
    // Prefer H1
    if (node.type === "heading" && node.attrs?.level === 1 && node.content) {
      const text = node.content
        .filter((n) => n.type === "text")
        .map((n) => n.text || "")
        .join("");
      if (text.trim()) return text.trim();
    }
  }

  // Fallback: first paragraph with text
  for (const node of json.content) {
    if (node.type === "paragraph" && node.content) {
      const text = node.content
        .filter((n) => n.type === "text")
        .map((n) => n.text || "")
        .join("");
      if (text.trim()) return text.trim().slice(0, 100);
    }
  }

  return null;
}

/** Convert a filename to a title (strip extension, replace separators) */
function fileNameToTitle(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  return fileName
    .replace(/\.(md|json|meta\.json)$/i, "")
    .replace(/[-_]/g, " ")
    .trim() || undefined;
}
