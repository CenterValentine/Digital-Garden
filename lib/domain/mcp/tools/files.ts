import "server-only";

/**
 * File tools over MCP (MCP-DATABASE-REACH-PLAN §2.4, §2.7): notes, code,
 * uploads, folders and typed blocks. Every note write goes through
 * `writeNoteContent` (through the Y.Doc, with the conversion backup);
 * creation goes through `createNoteFromMarkdown`; blocks go through the
 * same catalog and builder chat's `insert_block` uses.
 */

import crypto from "crypto";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import { createNoteFromMarkdown } from "@/lib/domain/content/create-note";
import { markdownToTiptapResult } from "@/lib/domain/content/markdown";
import { extractSearchTextFromCode } from "@/lib/domain/content/search-text";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { validateExternalUrl } from "@/lib/domain/content/external-validation";
import { ORDER_TRANSACTION, claimSiblingSlot } from "@/lib/domain/content/sibling-slot";
import { NoteEditRefused, writeNoteContent } from "@/lib/domain/content/write-note-content";
import { linkifyWikiRefsInTiptap } from "@/lib/domain/editor/wiki-link-refs";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import { getBlockDefinition } from "@/lib/domain/blocks/registry";
import { buildBlockNode, findBlocksInDoc, getInsertBlockCatalog } from "@/lib/domain/ai/tools/editor-tools";
import { findOrCreateFolder } from "@/lib/domain/ai/documents";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import type { McpScope } from "../jurisdiction";
import { internalError, ok, refuse, type McpToolResult } from "../results";

export const UPLOAD_BASE64_MAX_BYTES = 2 * 1024 * 1024;
const UPLOAD_URL_MAX_BYTES = 25 * 1024 * 1024;
const UPLOAD_URL_TIMEOUT_MS = 30_000;

async function ownedNode(scope: McpScope, id: string, types?: string[]) {
  if (!(await scope.nodeInScope(id))) return null;
  const node = await prisma.contentNode.findFirst({
    where: { id, ownerId: scope.userId, deletedAt: null, ...(types ? { contentType: { in: types as never[] } } : {}) },
    select: { id: true, title: true, contentType: true, parentId: true, updatedAt: true },
  });
  return node;
}

async function resolveParentFolder(scope: McpScope, parentId: string | undefined): Promise<{ id: string } | { refusal: string }> {
  const candidate = parentId ?? (await scope.soleRootFolder());
  if (!candidate) {
    return {
      refusal:
        "parentId is required: this token reaches more than one folder, and new items are never created at the garden root. Use garden_list_tree to pick the folder where the user keeps this kind of thing.",
    };
  }
  const folder = await ownedNode(scope, candidate, ["folder"]);
  if (!folder) return { refusal: "That parent folder is not reachable with this token, or is not a folder." };
  return { id: folder.id };
}

// ── notes ───────────────────────────────────────────────────────────────

export async function writeNote(
  scope: McpScope,
  input: { id?: string; title?: string; parentId?: string; content: string; mode?: "append" | "replace"; expectUpdatedAt?: string }
): Promise<McpToolResult> {
  try {
    if (!input.id) {
      const title = input.title?.trim();
      if (!title) return refuse("title is required to create a note.");
      const parent = await resolveParentFolder(scope, input.parentId);
      if ("refusal" in parent) return refuse(parent.refusal);
      const created = await createNoteFromMarkdown({ ownerId: scope.userId, title, parentId: parent.id, markdown: input.content });
      return ok(
        `Created "${title}" (${created.id}) in folder ${parent.id}.${created.degraded ? " Some markdown could not be parsed as rich text and was kept as plain paragraphs." : ""}`,
        { id: created.id, slug: created.slug, parentId: parent.id, created: true, degraded: created.degraded }
      );
    }

    // Any owned item, not only notes: a database, folder, file or chat has
    // a sidecar notes panel keyed by its own id (the app's "Add notes").
    // The in-app chat tool learned this the hard way — a `["note"]` filter
    // was the "you can't update this chat's notes" bug — and the MCP copy
    // carried the same filter until the owner's first database smoke.
    const node = await ownedNode(scope, input.id);
    if (!node) return refuse("That item is not reachable with this token.");
    const slot = node.contentType === "note" ? "" : ` (the notes panel of this ${node.contentType})`;
    const mode = input.mode ?? "append";
    if (mode === "replace") {
      if (!input.expectUpdatedAt) {
        return refuse(`replace requires expectUpdatedAt — the note's updatedAt you last read. It is currently ${node.updatedAt.toISOString()}. Read the note first, or use append.`, { updatedAt: node.updatedAt.toISOString() });
      }
      if (new Date(input.expectUpdatedAt).getTime() !== node.updatedAt.getTime()) {
        return refuse(`The note changed since you read it (now ${node.updatedAt.toISOString()}). Re-read it and retry, or append instead.`, { updatedAt: node.updatedAt.toISOString(), stale: true });
      }
    }
    const conversion = markdownToTiptapResult(input.content);
    const json = linkifyWikiRefsInTiptap(conversion.json);
    try {
      const result = await writeNoteContent({ contentId: node.id, ownerId: scope.userId, mode, content: json, destructiveApproved: false });
      const after = await prisma.contentNode.findUnique({ where: { id: node.id }, select: { updatedAt: true } });
      return ok(
        `${mode === "append" ? "Appended to" : "Replaced"} "${node.title}"${slot} (${node.id}) via ${result.route}: ${result.blocksBefore} → ${result.blocksAfter} blocks, ${result.charsBefore} → ${result.charsAfter} chars.${result.mayBeMaskedInOpenEditor ? " The note is open in an editor that may not show this until it reloads." : ""}${conversion.degraded ? " Some markdown was kept as plain paragraphs." : ""}`,
        { id: node.id, contentType: node.contentType, slot: node.contentType === "note" ? "note" : "notesPanel", mode, route: result.route, blocksBefore: result.blocksBefore, blocksAfter: result.blocksAfter, updatedAt: after?.updatedAt.toISOString() ?? null, degraded: conversion.degraded }
      );
    } catch (error) {
      if (error instanceof NoteEditRefused) {
        return refuse(`${error.message} Over MCP a destructive rewrite is never approved automatically: append instead, or ask the user to make the change in the app.`, { refusedBy: "shrink-guard" });
      }
      throw error;
    }
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:write_note_caught", summary: "garden_write_note failed", error });
    return internalError("garden_write_note", error, Object.keys(input));
  }
}

// ── code ────────────────────────────────────────────────────────────────

export async function writeCode(
  scope: McpScope,
  input: { id?: string; parentId?: string; title?: string; language?: string; code: string; expectUpdatedAt?: string }
): Promise<McpToolResult> {
  try {
    const language = (input.language ?? "plaintext").trim().slice(0, 50);
    const searchText = extractSearchTextFromCode(input.code, language);
    if (input.id) {
      const node = await ownedNode(scope, input.id, ["code"]);
      if (!node) return refuse("That code node is not reachable with this token, or is not a code node.");
      if (!input.expectUpdatedAt) {
        return refuse(`expectUpdatedAt is required when overwriting; it is currently ${node.updatedAt.toISOString()}.`, { updatedAt: node.updatedAt.toISOString() });
      }
      if (new Date(input.expectUpdatedAt).getTime() !== node.updatedAt.getTime()) {
        return refuse(`The node changed since you read it (now ${node.updatedAt.toISOString()}). Re-read and retry.`, { updatedAt: node.updatedAt.toISOString(), stale: true });
      }
      await prisma.$transaction([
        prisma.codePayload.update({ where: { contentId: node.id }, data: { code: input.code, ...(input.language ? { language } : {}), searchText } }),
        prisma.contentNode.update({ where: { id: node.id }, data: { updatedAt: new Date() } }),
      ]);
      const after = await prisma.contentNode.findUnique({ where: { id: node.id }, select: { updatedAt: true } });
      return ok(`Overwrote "${node.title}" (${node.id}), ${input.code.length} chars.`, { id: node.id, updatedAt: after?.updatedAt.toISOString() ?? null });
    }
    const title = input.title?.trim();
    if (!title) return refuse("title is required to create a code node.");
    const parent = await resolveParentFolder(scope, input.parentId);
    if ("refusal" in parent) return refuse(parent.refusal);
    const slug = await generateUniqueSlug(title, scope.userId);
    const node = await prisma.contentNode.create({
      data: {
        ownerId: scope.userId,
        title,
        slug,
        contentType: "code",
        parentId: parent.id,
        codePayload: { create: { code: input.code, language, searchText, metadata: {} as Prisma.InputJsonValue } },
      },
      select: { id: true },
    });
    return ok(`Created code node "${title}" (${node.id}) in folder ${parent.id}.`, { id: node.id, parentId: parent.id, created: true });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:write_code_caught", summary: "garden_write_code failed", error });
    return internalError("garden_write_code", error, Object.keys(input));
  }
}

// ── folders ─────────────────────────────────────────────────────────────

export async function createFolder(scope: McpScope, input: { parentId: string; title: string }): Promise<McpToolResult> {
  try {
    const parent = await ownedNode(scope, input.parentId, ["folder"]);
    if (!parent) return refuse("That parent folder is not reachable with this token, or is not a folder.");
    const result = await findOrCreateFolder(scope.userId, input.title.trim(), parent.id);
    return ok(`${result.created ? "Created" : "Found existing"} folder "${input.title.trim()}" (${result.contentNodeId}) in ${parent.title}.`, {
      id: result.contentNodeId,
      created: result.created,
      parentId: parent.id,
    });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:create_folder_caught", summary: "garden_create_folder failed", error });
    return internalError("garden_create_folder", error, Object.keys(input));
  }
}

// ── uploads ─────────────────────────────────────────────────────────────

async function fetchBytes(url: string): Promise<{ buffer: Buffer; mimeType: string | null } | { refusal: string }> {
  const check = validateExternalUrl(url);
  if (!check.valid) return { refusal: `sourceUrl refused: ${check.error ?? "not a fetchable public URL"}.` };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_URL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return { refusal: `sourceUrl returned HTTP ${res.status}.` };
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > UPLOAD_URL_MAX_BYTES) return { refusal: `sourceUrl is ${length} bytes; the limit is ${UPLOAD_URL_MAX_BYTES}.` };
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (!reader) return { refusal: "sourceUrl returned no body." };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > UPLOAD_URL_MAX_BYTES) {
        await reader.cancel();
        return { refusal: `sourceUrl exceeds ${UPLOAD_URL_MAX_BYTES} bytes.` };
      }
      chunks.push(value);
    }
    return { buffer: Buffer.concat(chunks), mimeType: res.headers.get("content-type")?.split(";")[0]?.trim() ?? null };
  } catch (error) {
    return { refusal: `sourceUrl could not be fetched: ${error instanceof Error ? error.message : "unknown error"}.` };
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadFile(
  scope: McpScope,
  input: { parentId: string; filename: string; mimeType: string; base64?: string; sourceUrl?: string; overwriteContentId?: string }
): Promise<McpToolResult> {
  try {
    if (!input.base64 && !input.sourceUrl) return refuse("Give either base64 or sourceUrl.");
    if (input.base64 && input.sourceUrl) return refuse("Give base64 OR sourceUrl, not both.");
    const parent = await ownedNode(scope, input.parentId, ["folder"]);
    if (!parent) return refuse("That parent folder is not reachable with this token, or is not a folder.");

    let buffer: Buffer;
    let mimeType = input.mimeType;
    if (input.base64) {
      buffer = Buffer.from(input.base64, "base64");
      if (buffer.length === 0) return refuse("base64 decoded to zero bytes.");
      if (buffer.length > UPLOAD_BASE64_MAX_BYTES) {
        return refuse(`base64 decodes to ${buffer.length} bytes; the limit is ${UPLOAD_BASE64_MAX_BYTES}. Use sourceUrl for larger files.`);
      }
    } else {
      const fetched = await fetchBytes(input.sourceUrl as string);
      if ("refusal" in fetched) return refuse(fetched.refusal);
      buffer = fetched.buffer;
      if (!mimeType && fetched.mimeType) mimeType = fetched.mimeType;
    }

    if (input.overwriteContentId) {
      const target = await ownedNode(scope, input.overwriteContentId, ["file"]);
      if (!target) return refuse("overwriteContentId is not a reachable file node.");
      const { overwriteFileNode } = await import("@/lib/features/content/overwrite-file");
      await overwriteFileNode(scope.userId, target.id, { buffer, fileName: input.filename, mimeType });
      return ok(`Overwrote file "${target.title}" (${target.id}) with ${buffer.length} bytes; every reference follows.`, { id: target.id, overwritten: true, bytes: buffer.length });
    }

    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const fileExtension = input.filename.split(".").pop() || "";
    const storageKey = `uploads/${scope.userId}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${fileExtension}`;
    const storage = await getUserStorageProvider(scope.userId);
    await storage.uploadFile(storageKey, buffer, mimeType);
    let searchText = "";
    try {
      const { DocumentExtractor } = await import("@/lib/infrastructure/media/document-extractor");
      searchText = await new DocumentExtractor(storage, false).extractText(storageKey, mimeType);
    } catch {
      // extraction is best-effort
    }
    const slug = await generateUniqueSlug(input.filename, scope.userId);
    const created = await prisma.$transaction(async (tx) => {
      const displayOrder = await claimSiblingSlot(tx, { ownerId: scope.userId, parentId: parent.id, placement: "bottom" });
      return tx.contentNode.create({
        data: {
          ownerId: scope.userId,
          title: input.filename,
          slug,
          contentType: "file",
          parentId: parent.id,
          displayOrder,
          filePayload: {
            create: {
              fileName: input.filename,
              fileExtension,
              mimeType,
              fileSize: BigInt(buffer.length),
              checksum,
              storageProvider: "r2",
              storageKey,
              searchText,
              uploadStatus: "ready",
              uploadedAt: new Date(),
              isProcessed: false,
              processingStatus: "none",
            },
          },
        },
        select: { id: true },
      });
    }, ORDER_TRANSACTION);
    return ok(`Uploaded "${input.filename}" (${created.id}, ${buffer.length} bytes, ${mimeType}) into ${parent.title}.${searchText ? ` ${searchText.length} chars of text extracted for search.` : ""}`, {
      id: created.id,
      parentId: parent.id,
      bytes: buffer.length,
      mimeType,
      extractedChars: searchText.length,
    });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:upload_file_caught", summary: "garden_upload_file failed", error });
    return internalError("garden_upload_file", error, Object.keys(input));
  }
}

// ── typed blocks ────────────────────────────────────────────────────────

async function loadNoteDoc(scope: McpScope, noteId: string) {
  const node = await ownedNode(scope, noteId, ["note"]);
  if (!node) return null;
  const payload = await prisma.notePayload.findUnique({ where: { contentId: noteId }, select: { tiptapJson: true } });
  const doc = (payload?.tiptapJson as JSONContent | undefined) ?? { type: "doc", content: [] };
  return { node, doc };
}

/** The block catalog text, for the server instructions and the outline. */
export function blockCatalogText(): string {
  return getInsertBlockCatalog().description;
}

export async function insertBlock(
  scope: McpScope,
  input: { noteId: string; blockType: string; attrs?: Record<string, unknown>; content?: string; afterBlockId?: string }
): Promise<McpToolResult> {
  try {
    const loaded = await loadNoteDoc(scope, input.noteId);
    if (!loaded) return refuse("That note is not reachable with this token, or is not a note.");
    const catalog = getInsertBlockCatalog();
    const built = buildBlockNode({ blockType: input.blockType, attrs: input.attrs }, catalog.blocks, 0);
    if ("error" in built) return refuse(built.error);
    const node = built.node;
    if (input.content?.trim()) {
      // Block+ containers stack their children; markdown becomes those children.
      if (Array.isArray(node.content) && !["column", "blockColumn", "tabPanel"].includes(String(node.content[0]?.type))) {
        node.content = markdownToTiptapResult(input.content).json.content ?? [];
      } else if (Array.isArray(node.content)) {
        return refuse(`"${input.blockType}" lays its content out in columns or tabs; insert it empty, then write into it from the app. Content is accepted for accordion, cardPanel and listContainer.`);
      } else {
        return refuse(`"${input.blockType}" does not hold content; put its text in attrs.`);
      }
    }
    const doc: JSONContent = { ...loaded.doc, content: [...(loaded.doc.content ?? [])] };
    let placed = "at the end";
    if (input.afterBlockId) {
      const idx = (doc.content ?? []).findIndex((n) => (n.attrs as Record<string, unknown> | undefined)?.blockId === input.afterBlockId);
      if (idx >= 0) {
        doc.content!.splice(idx + 1, 0, node);
        placed = `after block ${input.afterBlockId}`;
      } else {
        doc.content!.push(node);
        placed = `at the end (block ${input.afterBlockId} is not a top-level block)`;
      }
    } else {
      doc.content!.push(node);
    }
    const sanitized = sanitizeTipTapJsonWithExtensions(doc, catalog.extensions).json;
    // A structural insert on a document we just read: the shrink guard is
    // for prose rewrites, and an insert can only grow the note.
    const result = await writeNoteContent({ contentId: loaded.node.id, ownerId: scope.userId, mode: "replace", content: sanitized, destructiveApproved: true });
    const blockId = (node.attrs as Record<string, unknown> | undefined)?.blockId;
    return ok(`Inserted ${input.blockType} ${placed} in "${loaded.node.title}" via ${result.route}. Block id: ${String(blockId)}.`, {
      noteId: loaded.node.id,
      blockId,
      blockType: input.blockType,
      route: result.route,
    });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:insert_block_caught", summary: "garden_insert_block failed", error });
    return internalError("garden_insert_block", error, Object.keys(input));
  }
}

export async function updateBlock(
  scope: McpScope,
  input: { noteId: string; blockId: string; attrs: Record<string, unknown> }
): Promise<McpToolResult> {
  try {
    const loaded = await loadNoteDoc(scope, input.noteId);
    if (!loaded) return refuse("That note is not reachable with this token, or is not a note.");
    const existing = findBlocksInDoc(loaded.doc).find((b) => b.blockId === input.blockId);
    if (!existing) return refuse(`No block with id ${input.blockId} in this note. Read it with parts: ["outline"] to see block ids.`);
    const def = getBlockDefinition(existing.blockType);
    if (!def) return refuse(`Block type "${existing.blockType}" is not editable.`);
    const validKeys = new Set(Object.keys(def.attrsSchema.shape));
    const unknown = Object.keys(input.attrs).filter((k) => !validKeys.has(k) || k === "blockId" || k === "blockType");
    if (unknown.length > 0) return refuse(`Unknown attribute(s) for "${existing.blockType}": ${unknown.join(", ")}. Valid: ${[...validKeys].filter((k) => k !== "blockId" && k !== "blockType").join(", ")}.`);
    let merged: Record<string, unknown>;
    try {
      merged = def.attrsSchema.parse({ ...existing.attrs, ...input.attrs, blockId: existing.blockId, blockType: existing.blockType }) as Record<string, unknown>;
    } catch (err) {
      return refuse(`Invalid attributes for "${existing.blockType}": ${err instanceof Error ? err.message : String(err)}`);
    }
    const patch = (n: JSONContent): JSONContent => {
      if ((n.attrs as Record<string, unknown> | undefined)?.blockId === input.blockId) return { ...n, attrs: merged };
      return n.content ? { ...n, content: n.content.map(patch) } : n;
    };
    const doc = patch(loaded.doc);
    const result = await writeNoteContent({ contentId: loaded.node.id, ownerId: scope.userId, mode: "replace", content: doc, destructiveApproved: true });
    return ok(`Updated ${existing.blockType} ${input.blockId} in "${loaded.node.title}" via ${result.route}.`, { noteId: loaded.node.id, blockId: input.blockId, route: result.route });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:update_block_caught", summary: "garden_update_block failed", error });
    return internalError("garden_update_block", error, Object.keys(input));
  }
}
