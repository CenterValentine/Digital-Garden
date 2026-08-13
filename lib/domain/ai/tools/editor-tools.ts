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
 * Editing:
 *   4. apply_diff         — Targeted before/after text replacement.
 *                           CLIENT-EXECUTED (no server `execute`): it runs in the
 *                           browser against the live document, so it validates in
 *                           the same representation it applies to and its tool
 *                           result is the edit's real outcome. See the comment on
 *                           the tool itself for the two bugs that motivated it.
 *   5. replace_document   — Replace entire document content
 *   6. insert_image       — Insert image from URL (source: ai-generated)
 *
 * Workflow:
 *   7. plan               — Generate step-by-step edit plan
 *   8. ask_user           — Prompt user for clarification
 *   9. finish_with_summary — Signal completion with change summary
 *
 * The remaining edit tools return structured payloads instead of writing to the DB;
 * the chat panel intercepts them and applies them to the live TipTap editor with
 * animation, and auto-save handles persistence. NOTE that a returned payload is NOT
 * evidence the edit applied — the model receives it as the tool result either way.
 * `apply_diff` was converted to client execution for exactly that reason; the other
 * four still pre-announce success and should follow.
 */

import "server-only";
import { tool } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import { chunkDocument, getChunk, formatChunkOutput } from "./chunking";
import type { JSONContent } from "@tiptap/core";
import { getContentWriteReceiptEnvelope } from "@/lib/domain/ai/content-write-receipts.server";
import type { ToolExecuteContext } from "./types";
import type { Extensions } from "@tiptap/core";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { getAllBlocks, getBlockDefinition } from "@/lib/domain/blocks/registry";
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
      // Surface each attr's own Zod .describe() — critical for structured
      // attrs like featureList.items, whose {icon,title,description} item shape
      // lives only in the describe (and which the model otherwise guesses wrong).
      const attrHints = keys.map((k) => {
        const desc = (b.attrsSchema.shape[k] as { description?: string }).description;
        return desc ? `${k} (${desc})` : k;
      });
      const attrHint = attrHints.length ? ` — attrs: ${attrHints.join("; ")}` : "";
      const containerHint =
        getBlockAuthoringMode(b.type) === "container"
          ? " [container: takes a `content` array of child blocks]"
          : "";
      return `- ${b.type}: ${effectiveAiDescription(b)}${attrHint}${containerHint}`;
    })
    .join("\n");
  const description = [
    "Insert a NEW rich content block — appended at the end of the note by default, or right after an existing block via `afterBlockId` (get ids from list_document_blocks). Provide the block `blockType` and its `attrs`; omitted attributes use sensible defaults. To CHANGE an existing block, use update_block instead — never insert a copy of it.",
    "Most blocks carry their text in attributes (a hero's headline, a CTA's primaryLabel, a stat's value) — put that text in `attrs`, not elsewhere.",
    "Use EXACTLY the attribute names listed after each block (`attrs: …`); unknown names are rejected, not silently ignored.",
    "Container blocks (marked [container]) take a `content` array of child blocks: for columns/blockColumns each child becomes one column (provide 2–4); for tabs each becomes one tab — set each tab child's `label` to a meaningful tab name (don't leave it blank); for accordion/cardPanel/listContainer the children stack in order. Non-container blocks must omit `content`.",
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
  /** Tab name — used only when this spec is a child of a `tabs` block. */
  label?: string;
}

/** Recursive Zod schema for a block spec (the tool input + its `content` items). */
const blockSpecSchema: z.ZodType<BlockSpec> = z.lazy(() =>
  z.object({
    blockType: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(blockSpecSchema).optional(),
    label: z.string().optional(),
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

/** Every registered block instance in a document, in reading order. */
function findBlocksInDoc(
  doc: JSONContent
): Array<{ blockId: string; blockType: string; attrs: Record<string, unknown> }> {
  const out: Array<{ blockId: string; blockType: string; attrs: Record<string, unknown> }> = [];
  const walk = (node: JSONContent | undefined) => {
    if (!node) return;
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    const blockId = attrs.blockId;
    if (typeof blockId === "string" && node.type && getBlockDefinition(node.type)) {
      out.push({ blockId, blockType: node.type, attrs });
    }
    (node.content ?? []).forEach(walk);
  };
  walk(doc);
  return out;
}

/**
 * When Zod rejects an attr because a string was expected but the model supplied
 * an array/object, JSON-encode that field and return the patched attrs. Many
 * blocks store structured lists as JSON strings (featureList.items,
 * pricingCard.features, gallery images…), and models naturally pass arrays —
 * this meets them there. Returns null if nothing was coercible.
 */
function coerceJsonStringAttrs(
  attrs: Record<string, unknown>,
  err: unknown
): Record<string, unknown> | null {
  const issues =
    err && typeof err === "object" && "issues" in err
      ? (err as { issues: Array<{ code?: string; expected?: string; path?: unknown[] }> })
          .issues
      : null;
  if (!Array.isArray(issues)) return null;

  let changed = false;
  const out = { ...attrs };
  for (const issue of issues) {
    if (
      issue?.code === "invalid_type" &&
      issue?.expected === "string" &&
      Array.isArray(issue?.path) &&
      issue.path.length === 1
    ) {
      const key = issue.path[0] as string;
      const v = out[key];
      if (Array.isArray(v) || (v !== null && typeof v === "object")) {
        out[key] = JSON.stringify(v);
        changed = true;
      }
    }
  }
  return changed ? out : null;
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
  const rawAttrs = { ...(spec.attrs ?? {}), blockType: spec.blockType };
  try {
    parsedAttrs = def.attrsSchema.parse(rawAttrs) as Record<string, unknown>;
  } catch (err) {
    // Retry once with array/object → JSON-string coercion for attrs that the
    // block stores as JSON strings (the model naturally passes arrays).
    const coerced = coerceJsonStringAttrs(rawAttrs, err);
    try {
      if (!coerced) throw err;
      parsedAttrs = def.attrsSchema.parse(coerced) as Record<string, unknown>;
    } catch (finalErr) {
      return {
        error: `Invalid attributes for "${spec.blockType}". Valid fields: ${settable.join(", ")}.\n${finalErr instanceof Error ? finalErr.message : String(finalErr)}`,
      };
    }
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
    node.content = tabs.map((c, i) => {
      const label = (specChildren[i]?.label ?? "").trim();
      return {
        type: "tabPanel",
        attrs: { label: label || `Tab ${i + 1}` },
        content: [c],
      };
    });
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
    // CLIENT-EXECUTED — deliberately no `execute` (2026-08-12).
    //
    // It used to run server-side: it validated `before` against
    // `tiptapToMarkdown(payload.tiptapJson)`, then returned an `__editPayload`
    // *plus a write receipt* for the client to apply. Two defects followed from
    // that shape, both confirmed in a live run:
    //
    //   1. The receipt and the payload told the model (and the receipt chip) that
    //      the note was "updated" BEFORE the client had attempted anything, and the
    //      client's real outcome never travelled back. A failed edit produced
    //      "Done — appended…" in the transcript and an "Updated note" chip while
    //      the document was untouched. Only a toast told the truth.
    //   2. Validation read the MARKDOWN serialization while application searched
    //      the RENDERED text. Any block that falls back to verbatim HTML (the
    //      lossless serializer emits `<p xmlns="http://www.w3.org/1999/xhtml">`)
    //      matches server-side and can never match client-side.
    //
    // Without `execute`, the SDK streams the call to the browser, where the engine
    // runs it against the LIVE ProseMirror document — one representation, one place,
    // and the tool's return value is the edit's actual outcome. See
    // `resolveEditToolCall` in use-conversation-engine.ts.
    apply_diff: tool({
      description:
        "Apply a targeted text replacement to the open document. Specify the exact text to find and what to replace it with. The match must be unique. Read the document first with read_first_chunk and quote the text EXACTLY as that result shows it — the match is made against the document's rendered text, so markdown syntax and HTML markup are not part of it. The result reports whether the edit actually applied; if it says the text was not found, re-read and try again rather than assuming success.",
      inputSchema: z.object({
        before: z
          .string()
          .min(1)
          .describe("The exact text to find in the document. Must match exactly (case-sensitive). Include enough context for a unique match."),
        after: z
          .string()
          .describe(
            "The replacement text. Can be empty to delete the matched text. " +
              "PARAGRAPHS: separate them with a BLANK LINE (\\n\\n). A single newline is inserted as plain text and will NOT start a new paragraph — 'one\\ntwo' becomes 'one two' on one line."
          ),
      }),
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
          .describe("Container blocks only. An array of child blocks: columns/blockColumns → one child per column (2–4); tabs → one child per tab (give each child a `label` naming its tab); accordion/cardPanel/listContainer → children stack in order. Omit for non-container blocks."),
        afterBlockId: z
          .string()
          .optional()
          .describe("Insert immediately AFTER this existing block (a blockId from list_document_blocks). Omit to append at the end. To place between two blocks, pass the id of the block it should follow."),
      }),
      execute: async ({ blockType, attrs, content, afterBlockId }) => {
        const result = await loadNote();
        if ("error" in result) return result.error;
        const { node: noteNode } = result;

        // If positioning after a block, verify it exists — a clear error beats a
        // silent append at the end (which reads as a misplaced duplicate).
        if (afterBlockId) {
          const doc = result.payload.tiptapJson as unknown as JSONContent;
          const exists = findBlocksInDoc(doc).some((b) => b.blockId === afterBlockId);
          if (!exists) {
            return `No block with id "${afterBlockId}" to insert after. Call list_document_blocks for valid blockIds, or omit afterBlockId to append at the end.`;
          }
        }

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
          afterBlockId,
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

    // ─── List Document Blocks ───────────────────────────────
    // Read-only: enumerates the rich blocks in the open note so the model can
    // reference one (by blockId) with update_block.
    list_document_blocks: tool({
      description:
        "List the rich blocks currently in the open note — each block's id, type, and editable attributes. Call this before update_block so you can target a specific block by its blockId.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await loadNote();
        if ("error" in result) return result.error;
        const doc = result.payload.tiptapJson as unknown as JSONContent;
        const blocks = findBlocksInDoc(doc);
        if (blocks.length === 0) {
          return "This note has no rich blocks yet. Use insert_block to add one.";
        }
        return blocks
          .map((b, i) => {
            const attrs = Object.entries(b.attrs)
              .filter(([k]) => k !== "blockId" && k !== "blockType")
              .map(([k, v]) => {
                const s = typeof v === "string" ? v : JSON.stringify(v);
                return `${k}=${s.length > 80 ? s.slice(0, 80) + "…" : s}`;
              })
              .join(", ");
            return `${i + 1}. ${b.blockType} [blockId: ${b.blockId}]${attrs ? ` — ${attrs}` : ""}`;
          })
          .join("\n");
      },
    }),

    // ─── Update Block (Client-Side) ─────────────────────────
    // Patches an existing block's attributes. Returns an __editPayload the
    // orchestrator applies to the live editor node (found by blockId).
    update_block: tool({
      description:
        "Update attributes of an existing block in the open note. Get the blockId from list_document_blocks first, then pass only the attributes you want to change (same names/format as insert_block).",
      inputSchema: z.object({
        blockId: z
          .string()
          .describe("The block's id, from list_document_blocks."),
        attrs: z
          .record(z.string(), z.unknown())
          .describe("The attributes to change — only the ones being updated."),
      }),
      execute: async ({ blockId, attrs }) => {
        const result = await loadNote();
        if ("error" in result) return result.error;
        const { node: noteNode } = result;
        const doc = result.payload.tiptapJson as unknown as JSONContent;
        const { blocks: catalog } = getInsertBlockCatalog();

        const target = findBlocksInDoc(doc).find((b) => b.blockId === blockId);
        if (!target) {
          return `No block with id "${blockId}" in this note. Call list_document_blocks to see valid blockIds.`;
        }
        const def = catalog.find((b) => b.type === target.blockType);
        if (!def) {
          return `The "${target.blockType}" block can't be edited by the AI.`;
        }

        const validKeys = new Set(Object.keys(def.attrsSchema.shape));
        const settable = [...validKeys].filter((k) => k !== "blockId" && k !== "blockType");
        const unknownKeys = Object.keys(attrs).filter((k) => !validKeys.has(k));
        if (unknownKeys.length > 0) {
          return `Unknown attribute(s) for "${target.blockType}": ${unknownKeys.join(", ")}. Valid attributes are: ${settable.join(", ")}.`;
        }

        // Validate the change by merging into the block's current attrs and
        // full-parsing (types/enums + array→JSON-string coercion), then send only
        // the changed keys so the client merges into the LIVE node's attrs.
        const merged = { ...target.attrs, ...attrs, blockType: target.blockType };
        let parsed: Record<string, unknown>;
        try {
          parsed = def.attrsSchema.parse(merged) as Record<string, unknown>;
        } catch (err) {
          const coerced = coerceJsonStringAttrs(merged, err);
          try {
            if (!coerced) throw err;
            parsed = def.attrsSchema.parse(coerced) as Record<string, unknown>;
          } catch (finalErr) {
            return `Invalid attributes for "${target.blockType}". Valid fields: ${settable.join(", ")}.\n${finalErr instanceof Error ? finalErr.message : String(finalErr)}`;
          }
        }
        const changedAttrs: Record<string, unknown> = {};
        for (const k of Object.keys(attrs)) changedAttrs[k] = parsed[k];

        return JSON.stringify({
          __editPayload: true,
          type: "update_block",
          blockId,
          attrs: changedAttrs,
          documentTitle: noteNode.title,
          action: `Updated ${def.label} block in "${noteNode.title}"`,
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
