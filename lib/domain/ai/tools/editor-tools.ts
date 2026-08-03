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
import { getContentWriteReceiptEnvelope } from "@/lib/domain/ai/content-write-receipts.server";
import type { ToolExecuteContext } from "./types";
import type { Extensions } from "@tiptap/core";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { getAllBlocks } from "@/lib/domain/blocks/registry";
import {
  getAuthorableBlocks,
  getBlockAuthoringMode,
  effectiveAiDescription,
} from "@/lib/domain/blocks/ai-authoring";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import type { BlockDefinition } from "@/lib/domain/blocks/types";

/**
 * Memoized authorable-block catalog for the `insert_block` tool. The block
 * registry is static after module load, so this is computed once. Calling
 * `getServerExtensions()` does double duty: it triggers the block registration
 * side effects (so `getAllBlocks()` is populated) AND yields the exact server
 * extension set the sanitizer needs.
 */
let insertBlockCatalog: {
  blocks: BlockDefinition[];
  description: string;
  extensions: Extensions;
} | null = null;

function getInsertBlockCatalog() {
  if (insertBlockCatalog) return insertBlockCatalog;
  const extensions = getServerExtensions();
  // Phase 2: all authorable blocks, including containers (which accept a nested
  // `content` array of child blocks).
  const blocks = getAuthorableBlocks(getAllBlocks());
  const list = blocks
    .map((b) => {
      const keys = Object.keys(b.attrsSchema.shape).filter(
        (k) => k !== "blockId" && k !== "blockType"
      );
      const attrHint = keys.length ? ` — attrs: ${keys.join(", ")}` : "";
      const containerHint =
        getBlockAuthoringMode(b.type) === "container"
          ? " [container: takes a `content` array of child blocks]"
          : "";
      return `- ${b.type}: ${effectiveAiDescription(b)}${attrHint}${containerHint}`;
    })
    .join("\n");
  const description = [
    "Insert a rich content block at the end of the open note. Provide the block `blockType` and its `attrs` as a JSON object; omitted attributes use sensible defaults.",
    "Most blocks carry their text in attributes (a hero's headline, a CTA's primaryLabel, a stat's value) — put that text in `attrs`, not elsewhere.",
    "Use EXACTLY the attribute names listed after each block (`attrs: …`); unknown names are rejected, not silently ignored.",
    "Container blocks (marked [container]) take a `content` array of child blocks: for columns/blockColumns each child becomes one column (provide 2–4); for tabs each becomes one tab; for accordion/cardPanel/listContainer the children stack in order. Non-container blocks must omit `content`.",
    "",
    "Available block types:",
    list,
  ].join("\n");
  insertBlockCatalog = { blocks, description, extensions };
  return insertBlockCatalog;
}

/** A block the model wants to author; containers may carry nested `content`. */
interface BlockSpec {
  blockType: string;
  attrs?: Record<string, unknown>;
  content?: BlockSpec[];
}

/** Recursive Zod schema for a block spec (the tool input + its `content` items). */
const blockSpecSchema: z.ZodType<BlockSpec> = z.lazy(() =>
  z.object({
    blockType: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(blockSpecSchema).optional(),
  })
);

/** Two-level containers → their registry-less wrapper child node. */
const CONTAINER_WRAPPER: Record<string, string> = {
  columns: "column",
  blockColumns: "blockColumn",
  tabs: "tabPanel",
};

const MAX_CONTAINER_DEPTH = 4;

function emptyParagraph(): JSONContent {
  return { type: "paragraph" };
}

/**
 * Recursively validate a block spec and build its TipTap JSON node. Validates
 * attrs against each block's own schema (rejecting unknown keys, filling
 * defaults + a fresh blockId), and for container blocks assembles the children
 * into the block's content model — synthesizing the wrapper nodes
 * (column/blockColumn/tabPanel) that the registry doesn't expose, one per child.
 * Built directly as TipTap JSON (not via the drag-builder converter) so every
 * container — including blockColumns — is handled uniformly.
 */
function buildBlockNode(
  spec: BlockSpec,
  blocks: BlockDefinition[],
  depth: number
): { node: JSONContent } | { error: string } {
  const def = blocks.find((b) => b.type === spec.blockType);
  if (!def) {
    return {
      error: `Unknown or unsupported block type "${spec.blockType}". Choose one of: ${blocks
        .map((b) => b.type)
        .join(", ")}`,
    };
  }

  const validKeys = new Set(Object.keys(def.attrsSchema.shape));
  const settable = [...validKeys].filter((k) => k !== "blockId" && k !== "blockType");
  const unknownKeys = Object.keys(spec.attrs ?? {}).filter((k) => !validKeys.has(k));
  if (unknownKeys.length > 0) {
    return {
      error: `Unknown attribute(s) for "${spec.blockType}": ${unknownKeys.join(", ")}. Valid attributes are: ${settable.join(", ")}. Re-call using these exact names.`,
    };
  }

  let parsedAttrs: Record<string, unknown>;
  try {
    parsedAttrs = def.attrsSchema.parse({
      ...(spec.attrs ?? {}),
      blockType: spec.blockType,
    }) as Record<string, unknown>;
  } catch (err) {
    return {
      error: `Invalid attributes for "${spec.blockType}". Valid fields: ${settable.join(", ")}.\n${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const isContainer = getBlockAuthoringMode(spec.blockType) === "container";
  const specChildren = spec.content ?? [];

  if (specChildren.length > 0 && !isContainer) {
    return {
      error: `Block "${spec.blockType}" does not accept nested content. Only container blocks (${Object.keys(
        CONTAINER_WRAPPER
      ).join(", ")}, accordion, cardPanel, listContainer) take a "content" array.`,
    };
  }
  if (specChildren.length > 0 && depth >= MAX_CONTAINER_DEPTH) {
    return { error: `Nested blocks are too deep (max ${MAX_CONTAINER_DEPTH} levels).` };
  }

  const childNodes: JSONContent[] = [];
  for (const childSpec of specChildren) {
    const built = buildBlockNode(childSpec, blocks, depth + 1);
    if ("error" in built) return built;
    childNodes.push(built.node);
  }

  const node: JSONContent = { type: spec.blockType, attrs: parsedAttrs };
  if (!isContainer) return { node };

  const wrapper = CONTAINER_WRAPPER[spec.blockType];
  if (wrapper === "column" || wrapper === "blockColumn") {
    // One column per child. Empty → two blank columns (valid default layout).
    const cols = childNodes.length > 0 ? childNodes : [emptyParagraph(), emptyParagraph()];
    if (cols.length < 2 || cols.length > 4) {
      return {
        error: `"${spec.blockType}" needs 2–4 child blocks (one per column); received ${cols.length}.`,
      };
    }
    parsedAttrs.columnCount = cols.length;
    node.content = cols.map((c) => ({ type: wrapper, content: [c] }));
  } else if (wrapper === "tabPanel") {
    const tabs = childNodes.length > 0 ? childNodes : [emptyParagraph(), emptyParagraph()];
    node.content = tabs.map((c, i) => ({
      type: "tabPanel",
      attrs: { label: `Tab ${i + 1}` },
      content: [c],
    }));
  } else {
    // block+ containers (accordion, cardPanel, listContainer).
    node.content = childNodes.length > 0 ? childNodes : [emptyParagraph()];
  }

  return { node };
}

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
          ...(await getContentWriteReceiptEnvelope(
            ctx.userId,
            node.id,
            "updated",
            "note",
          )),
        });
      },
    }),

    // ─── Gate 5: Replace Document (Client-Side) ──────────────
    // Returns the new markdown content. The client calls
    // editor.commands.setContent() with the converted TipTap JSON.
    replace_document: tool({
      description:
        "Replace the ENTIRE document content with new markdown. Use ONLY when the user explicitly asks to rewrite or replace the whole document. NEVER use this to add, append, insert, or make targeted changes — use apply_diff for all of those. Preserves the document title and metadata.",
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
          ...(await getContentWriteReceiptEnvelope(
            ctx.userId,
            node.id,
            "updated",
            "note",
          )),
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
          ...(await getContentWriteReceiptEnvelope(
            ctx.userId,
            node.id,
            "updated",
            "note",
          )),
        });
      },
    }),

    // ─── Insert Block (Client-Side) ─────────────────────────
    // Returns a payload carrying a fully server-validated TipTap block node.
    // The client inserts it at the end of the document with animation.
    insert_block: tool({
      description: getInsertBlockCatalog().description,
      inputSchema: z.object({
        blockType: z
          .string()
          .describe("The block type to insert — one of the Available block types listed above."),
        attrs: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("The block's attributes as a JSON object (fields relevant to this block type). Omitted fields use defaults."),
        content: z
          .array(blockSpecSchema)
          .optional()
          .describe("Container blocks only. An array of child blocks: columns/blockColumns → one child per column (2–4); tabs → one child per tab; accordion/cardPanel/listContainer → children stack in order. Omit for non-container blocks."),
      }),
      execute: async ({ blockType, attrs, content }) => {
        const result = await loadNote();
        if ("error" in result) return result.error;
        const { node: noteNode } = result;

        const { blocks, extensions } = getInsertBlockCatalog();

        // Validate + build the (possibly nested) block tree.
        const built = buildBlockNode({ blockType, attrs, content }, blocks, 0);
        if ("error" in built) return built.error;

        // Safety net: prove the node is a registered, valid server-side type
        // (also catches a model inventing an unregistered block).
        const sanitized = sanitizeTipTapJsonWithExtensions(
          { type: "doc", content: [built.node] },
          extensions
        );
        const finalNode = sanitized.json.content?.[0];
        if (!finalNode || finalNode.type !== blockType) {
          return `The "${blockType}" block could not be built as valid content — it may be unavailable in this editor build.`;
        }

        const label = blocks.find((b) => b.type === blockType)?.label ?? blockType;
        return JSON.stringify({
          __editPayload: true,
          type: "insert_block",
          node: finalNode,
          blockType,
          documentTitle: noteNode.title,
          action: `Inserted ${label} block into "${noteNode.title}"`,
          ...(await getContentWriteReceiptEnvelope(
            ctx.userId,
            noteNode.id,
            "updated",
            "note",
          )),
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
