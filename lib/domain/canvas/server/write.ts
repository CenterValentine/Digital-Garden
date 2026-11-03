/**
 * Canvas archive — turning fetched content into node payloads (server-only).
 */

import "server-only";
import crypto from "node:crypto";
import type { JSONContent } from "@tiptap/core";
// Root entry: Turbopack resolves the Node (zeed-dom) build on the server.
// Not `@tiptap/core`'s generateJSON, which needs a browser DOM.
import { generateJSON } from "@tiptap/html";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { stableHash } from "@/lib/core/stable-hash";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { noteFingerprintValue } from "../fingerprint";
import { escapeHtml } from "../html";
import { extensionOf, type FileBody } from "./source";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/** Canvas HTML → a sanitized TipTap document. Never throws: falls back to plain paragraphs. */
export function htmlToNoteJson(html: string): JSONContent {
  const extensions = getServerExtensions();
  const source = html.trim() || "<p></p>";
  try {
    const json = generateJSON(source, extensions) as JSONContent;
    return sanitizeTipTapJsonWithExtensions(json, extensions).json ?? EMPTY_DOC;
  } catch {
    const text = source.replace(/<[^>]*>/g, "\n").split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const fallback = text.length ? text.map((line) => `<p>${escapeHtml(line)}</p>`).join("") : "<p></p>";
    try {
      return generateJSON(fallback, extensions) as JSONContent;
    } catch {
      return EMPTY_DOC;
    }
  }
}

export function noteSearchAndMetadata(json: JSONContent): { searchText: string; metadata: Prisma.InputJsonValue } {
  const searchText = extractSearchTextFromTipTap(json);
  const wordCount = searchText.split(/\s+/).filter(Boolean).length;
  return {
    searchText,
    metadata: {
      wordCount,
      characterCount: searchText.length,
      readingTime: Math.ceil(wordCount / 200),
      importedFrom: "canvas",
    } as unknown as Prisma.InputJsonValue,
  };
}

/** "Has the user edited this?" — compares what a person can change (fingerprint.ts). */
export function noteHash(json: unknown): string {
  return stableHash(noteFingerprintValue(json)).slice(0, 64);
}

export function urlHash(url: string): string {
  return stableHash(url).slice(0, 64);
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return cleaned || "file";
}

export interface StoreFileInput {
  ownerId: string;
  parentId: string | null;
  file: FileBody;
  /** Pre-assigned node id (imported items), so links can point at it before it exists. */
  id?: string;
  /** Media stored for a note (images, submission attachments) is hidden in the tree. */
  role?: "primary" | "referenced";
  /** Reuse an identical file the user already has (media only — items each get their own node). */
  dedupe?: boolean;
  /** Nested Canvas link, written with the node in one statement. */
  link?: Prisma.CanvasSyncLinkCreateWithoutContentInput;
}

export interface StoredFile {
  contentId: string;
  checksum: string;
  fileName: string;
}

/** Upload bytes to the user's storage and create the file node (§3: one shared helper). */
export async function storeFileBody(input: StoreFileInput): Promise<StoredFile> {
  const checksum = crypto.createHash("sha256").update(input.file.body).digest("hex");
  const fileName = sanitizeFileName(input.file.fileName);
  if (input.dedupe) {
    const existing = await prisma.filePayload.findFirst({
      where: {
        checksum,
        fileSize: BigInt(input.file.body.length),
        uploadStatus: "ready",
        content: { ownerId: input.ownerId, deletedAt: null },
      },
      select: { contentId: true, fileName: true },
    });
    if (existing) return { contentId: existing.contentId, checksum, fileName: existing.fileName };
  }
  const extension = extensionOf(fileName) || "bin";
  const providerType = (process.env.DEFAULT_STORAGE_PROVIDER || "r2") as "r2" | "s3" | "vercel";
  const storage = await getUserStorageProvider(input.ownerId, providerType);
  const storageKey = `uploads/${input.ownerId}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
  await storage.uploadFile(storageKey, input.file.body, input.file.mimeType);
  const created = await prisma.contentNode.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      ownerId: input.ownerId,
      title: fileName,
      slug: await generateUniqueSlug(fileName, input.ownerId),
      contentType: "file",
      role: input.role ?? "primary",
      parentId: input.parentId,
      displayOrder: 0,
      filePayload: {
        create: {
          fileName,
          fileExtension: extension.slice(0, 10),
          mimeType: input.file.mimeType.slice(0, 127),
          fileSize: BigInt(input.file.body.length),
          checksum,
          storageProvider: providerType,
          storageKey,
          searchText: fileName,
          uploadStatus: "ready",
          uploadedAt: new Date(),
          isProcessed: false,
          processingStatus: "none",
        },
      },
      ...(input.link ? { canvasSyncLink: { create: input.link } } : {}),
    },
    select: { id: true },
  });
  return { contentId: created.id, checksum, fileName };
}

/** Replace an imported file node's bytes in place (re-import): same id, new content. */
export async function replaceFileBody(ownerId: string, contentId: string, file: FileBody): Promise<string> {
  const checksum = crypto.createHash("sha256").update(file.body).digest("hex");
  const extension = extensionOf(file.fileName) || "bin";
  const providerType = (process.env.DEFAULT_STORAGE_PROVIDER || "r2") as "r2" | "s3" | "vercel";
  const storage = await getUserStorageProvider(ownerId, providerType);
  const storageKey = `uploads/${ownerId}/${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
  await storage.uploadFile(storageKey, file.body, file.mimeType);
  await prisma.filePayload.update({
    where: { contentId },
    data: {
      mimeType: file.mimeType.slice(0, 127),
      fileSize: BigInt(file.body.length),
      checksum,
      storageProvider: providerType,
      storageKey,
      uploadStatus: "ready",
      uploadedAt: new Date(),
      isProcessed: false,
      processingStatus: "none",
      thumbnailUrl: null,
    },
  });
  return checksum;
}

export async function uniqueSlug(title: string, ownerId: string, excludeId?: string): Promise<string> {
  return generateUniqueSlug(title, ownerId, excludeId);
}
