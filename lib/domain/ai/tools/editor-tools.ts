/**
 * AI Editor Tools — Sprint 39 (Client-Side Architecture)
 *
 * 9 agentic tools for AI-powered document editing:
 *
 * Reading:
 *   1. read_first_chunk  — Read beginning of document
 *   2. read_next_chunk   — Paginate forward
 *   3. read_previous_chunk — Navigate backward
 *
 * Editing (return payloads — client applies to live TipTap editor):
 *   4. apply_diff         — Targeted before/after text replacement
 *   5. replace_document   — Replace entire document content
 *   6. insert_image       — Insert image from URL (source: ai-generated)
 *
 * Workflow:
 *   7. plan               — Generate step-by-step edit plan
 *   8. ask_user           — Prompt user for clarification
 *   9. finish_with_summary — Signal completion with change summary
 *
 * Edit tools return structured payloads instead of writing to DB.
 * The chat panel intercepts these payloads and applies edits to the
 * live TipTap editor instance with animation. Auto-save handles persistence.
 */

import "server-only";
import { tool } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import { tiptapToMarkdown } from "@/lib/domain/content/markdown";
import { chunkDocument, getChunk, formatChunkOutput } from "./chunking";
import type { JSONContent } from "@tiptap/core";
import type { ToolExecuteContext } from "./types";

/**
 * Create editor tools bound to user + document context.
 *
 * These tools require `ctx.contentId` to be set — the chat route
 * provides this when the user is viewing a note.
 */
export function createEditorTools(ctx: ToolExecuteContext) {
  // ─── Helper: load note from DB ──────────────────────────────
  async function loadNote() {
    if (!ctx.contentId) {
      return { error: "No document is currently open. Open a note first." };
    }
    const node = await prisma.contentNode.findFirst({
      where: {
        id: ctx.contentId,
        ownerId: ctx.userId,
        deletedAt: null,
      },
      include: {
        notePayload: { select: { contentId: true, tiptapJson: true, searchText: true } },
      },
    });
    if (!node) return { error: `Document "${ctx.contentId}" not found.` };
    if (node.contentType !== "note" || !node.notePayload) {
      return { error: `"${node.title}" is a ${node.contentType}, not a note.` };
    }
    return { node, payload: node.notePayload };
  }

  // ═══════════════════════════════════════════════════════════
  // TOOL DEFINITIONS
  // ═══════════════════════════════════════════════════════════

  return {
    // ─── Gate 1: Read First Chunk ───────────────────────────
    read_first_chunk: tool({
      description:
        "Read the beginning of the currently open document. Returns the first chunk of text with navigation metadata. Always call this before editing to understand the document.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await loadNote();
        if ("error" in result) return result.error;

        const { node, payload } = result;
        const tiptapJson = payload.tiptapJson as unknown as JSONContent;
        const chunks = chunkDocument(tiptapJson);
        const chunk = getChunk(chunks, 0);

        return [
          `Document: "${node.title}"`,
          `Words: ~${(payload.searchText || "").split(/\s+/).filter(Boolean).length}`,
          "",
          formatChunkOutput(chunk),
        ].join("\n");
      },
    }),

    // ─── Gate 2: Read Next Chunk ────────────────────────────
    read_next_chunk: tool({
      description:
        "Read the next chunk of the document. Use after read_first_chunk to continue reading forward.",
      inputSchema: z.object({
        currentChunkIndex: z
          .number()
          .int()
          .min(0)
          .describe("The chunk index you just read (0-based). The next chunk will be returned."),
      }),
      execute: async ({ currentChunkIndex }) => {
        const result = await loadNote();
        if ("error" in result) return result.error;

        const tiptapJson = result.payload.tiptapJson as unknown as JSONContent;
        const chunks = chunkDocument(tiptapJson);
        const nextIndex = currentChunkIndex + 1;

        if (nextIndex >= chunks.length) {
          return `You've reached the end of the document. Last chunk was ${currentChunkIndex} of ${chunks.length}.`;
        }

        return formatChunkOutput(getChunk(chunks, nextIndex));
      },
    }),

    // ─── Gate 3: Read Previous Chunk ────────────────────────
    read_previous_chunk: tool({
      description:
        "Read the previous chunk of the document. Use to navigate backward through the document.",
      inputSchema: z.object({
        currentChunkIndex: z
          .number()
          .int()
          .min(0)
          .describe("The chunk index you just read (0-based). The previous chunk will be returned."),
      }),
      execute: async ({ currentChunkIndex }) => {
        const result = await loadNote();
        if ("error" in result) return result.error;

        const tiptapJson = result.payload.tiptapJson as unknown as JSONContent;
        const chunks = chunkDocument(tiptapJson);
        const prevIndex = currentChunkIndex - 1;

        if (prevIndex < 0) {
          return `You're at the beginning of the document. First chunk is index 0.`;
        }

        return formatChunkOutput(getChunk(chunks, prevIndex));
      },
    }),

    // ─── Gate 4: Apply Diff (Client-Side) ────────────────────
    // Returns a structured edit payload. The client finds the `before`
    // text in the live ProseMirror document and replaces it with animation.
    // Server validates the text exists in the markdown representation.
    apply_diff: tool({
      description:
        "Apply a targeted text replacement to the document. Specify the exact text to find and what to replace it with. The match must be unique in the document. Read the document first to see the exact text.",
      inputSchema: z.object({
        before: z
          .string()
          .min(1)
          .describe("The exact text to find in the document. Must match exactly (case-sensitive). Include enough context for a unique match."),
        after: z
          .string()
          .describe("The replacement text. Can be empty to delete the matched text."),
      }),
      execute: async ({ before, after }) => {
        const result = await loadNote();
        if ("error" in result) return result.error;

        const { node, payload } = result;
        const tiptapJson = payload.tiptapJson as unknown as JSONContent;

        // Convert to markdown to validate the match exists
        const markdown = tiptapToMarkdown(tiptapJson);

        const matchCount = markdown.split(before).length - 1;
        if (matchCount === 0) {
          return `Text not found in document. Make sure you're using the exact text from a read_first_chunk or read_next_chunk result. The text to find was:\n\n"${before.slice(0, 200)}"`;
        }
        if (matchCount > 1) {
          return `Found ${matchCount} occurrences of the text. Please provide more surrounding context to make the match unique.`;
        }

        // Return structured payload for client-side application
        const action = after === ""
          ? `Deleted "${before.slice(0, 50)}${before.length > 50 ? "..." : ""}"`
          : `Replaced "${before.slice(0, 50)}${before.length > 50 ? "..." : ""}" → "${after.slice(0, 50)}${after.length > 50 ? "..." : ""}"`;

        return JSON.stringify({
          __editPayload: true,
          type: "apply_diff",
          before,
          after,
          documentTitle: node.title,
          action,
        });
      },
    }),

    // ─── Gate 5: Replace Document (Client-Side) ──────────────
    // Returns the new markdown content. The client calls
    // editor.commands.setContent() with the converted TipTap JSON.
    replace_document: tool({
      description:
        "Replace the entire document content with new markdown. Use for major rewrites or when apply_diff would require too many individual changes. Preserves the document title and metadata.",
      inputSchema: z.object({
        markdown: z
          .string()
          .describe("The complete new document content in markdown format."),
      }),
      execute: async ({ markdown }) => {
        const result = await loadNote();
        if ("error" in result) return result.error;

        const { node } = result;

        // Return structured payload for client-side application
        return JSON.stringify({
          __editPayload: true,
          type: "replace_document",
          markdown,
          documentTitle: node.title,
          action: `Replacing entire document "${node.title}"`,
        });
      },
    }),

    // ─── Gate 9: Insert Image (Client-Side) ─────────────────
    // Returns a payload to insert an image node at the end of the document
    // with source "ai-generated" for provenance tracking.
    insert_image: tool({
      description:
        "Insert an image into the document from a URL. The image will be marked as AI-generated. Use this when the user asks to add an image from a specific URL, or when providing an AI-generated image.",
      inputSchema: z.object({
        src: z
          .string()
          .url()
          .describe("The image URL (must be a valid, accessible URL)."),
        alt: z
          .string()
          .optional()
          .default("")
          .describe("Alt text describing the image for accessibility."),
      }),
      execute: async ({ src, alt }) => {
        const result = await loadNote();
        if ("error" in result) return result.error;

        const { node } = result;

        return JSON.stringify({
          __editPayload: true,
          type: "insert_image",
          src,
          alt: alt || "",
          documentTitle: node.title,
          action: `Inserted image into "${node.title}"`,
        });
      },
    }),

    // ─── Gate 6: Plan ───────────────────────────────────────
    plan: tool({
      description:
        "Create a step-by-step plan for a complex editing task. Use this to organize your approach before making changes. The plan is shown to the user for transparency.",
      inputSchema: z.object({
        steps: z
          .array(z.string())
          .min(1)
          .max(10)
          .describe("Ordered list of steps to accomplish the editing task."),
        reasoning: z
          .string()
          .optional()
          .describe("Brief explanation of why this approach was chosen."),
      }),
      execute: async ({ steps, reasoning }) => {
        const planText = steps
          .map((step, i) => `${i + 1}. ${step}`)
          .join("\n");

        return [
          "Edit Plan:",
          planText,
          reasoning ? `\nReasoning: ${reasoning}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      },
    }),

    // ─── Gate 7: Ask User ───────────────────────────────────
    ask_user: tool({
      description:
        "Ask the user a clarifying question before proceeding with edits. Use when the instruction is ambiguous, when there are multiple valid approaches, or when you need more context.",
      inputSchema: z.object({
        question: z
          .string()
          .describe("The question to ask the user."),
        options: z
          .array(z.string())
          .optional()
          .describe("Optional list of suggested options for the user to choose from."),
      }),
      execute: async ({ question, options }) => {
        const optionsList = options?.length
          ? `\n\nOptions:\n${options.map((o, i) => `  ${i + 1}. ${o}`).join("\n")}`
          : "";

        return `Question for you: ${question}${optionsList}`;
      },
    }),

    // ─── Gate 8: Finish with Summary ────────────────────────
    finish_with_summary: tool({
      description:
        "Signal that the editing task is complete. Provide a summary of all changes made. Always call this when you're done editing.",
      inputSchema: z.object({
        summary: z
          .string()
          .describe("Brief summary of all changes made to the document."),
        changesCount: z
          .number()
          .int()
          .min(0)
          .describe("Number of individual edits applied."),
      }),
      execute: async ({ summary, changesCount }) => {
        return [
          "Editing Complete",
          `Changes: ${changesCount} edit${changesCount !== 1 ? "s" : ""} applied`,
          "",
          summary,
        ].join("\n");
      },
    }),
  };
}
