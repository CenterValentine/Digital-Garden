import "server-only";

/**
 * Files and images for an outside agent (MCP-DATABASE-REACH-PLAN §2.4).
 *
 * The app serves file bytes through `/api/content/content/{id}/download`,
 * which needs the user's session cookie — no MCP client has one. Two
 * replacements, both MCP-native:
 *
 *   1. Presigned storage URLs. Every download link inside a note's markdown
 *      is rewritten to a short-lived URL straight at the storage provider,
 *      for clients that can fetch (Claude Code's web fetch, a script).
 *   2. Image content blocks. The bytes themselves, base64, so a model sees
 *      the picture without fetching anything — `garden_read` with
 *      parts: ["images"], a file read on an image, the file resource.
 */

import { prisma } from "@/lib/database/client";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";

/** Presigned URLs live this long; a model's turn never needs more. */
export const PRESIGN_SECONDS = 900;
/** Per image, and in total per read — a tool result is not a gallery. */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const IMAGES_MAX_PER_READ = 6;
export const IMAGES_MAX_TOTAL_BYTES = 6 * 1024 * 1024;

const DOWNLOAD_LINK = /\/api\/content\/content\/([0-9a-f-]{36})\/download(?:\?[^)\s"']*)?/g;

interface FileRef {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  storageProvider: "r2" | "s3" | "vercel";
}

async function ownedFile(userId: string, contentId: string): Promise<FileRef | null> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId: userId, deletedAt: null, contentType: "file" },
    select: {
      id: true,
      filePayload: { select: { fileName: true, mimeType: true, fileSize: true, storageKey: true, storageProvider: true, uploadStatus: true } },
    },
  });
  const f = node?.filePayload;
  if (!f || f.uploadStatus !== "ready") return null;
  return { id: node.id, fileName: f.fileName, mimeType: f.mimeType, fileSize: Number(f.fileSize), storageKey: f.storageKey, storageProvider: f.storageProvider as FileRef["storageProvider"] };
}

export async function presignFile(userId: string, contentId: string): Promise<{ url: string; file: FileRef } | null> {
  const file = await ownedFile(userId, contentId);
  if (!file) return null;
  const storage = await getUserStorageProvider(userId, file.storageProvider);
  const url = await storage.generateDownloadUrl(file.storageKey, PRESIGN_SECONDS);
  return { url, file };
}

/**
 * Replace every in-app download link in a markdown body with a presigned
 * storage URL. Unknown or foreign ids are left as they are. One presign per
 * distinct file per call.
 */
export async function rewriteDownloadLinks(userId: string, markdown: string): Promise<{ text: string; rewritten: number }> {
  const ids = new Set<string>();
  for (const m of markdown.matchAll(DOWNLOAD_LINK)) ids.add(m[1]);
  if (ids.size === 0) return { text: markdown, rewritten: 0 };
  const urls = new Map<string, string>();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const signed = await presignFile(userId, id);
        if (signed) urls.set(id, signed.url);
      } catch {
        // leave the link alone
      }
    })
  );
  let rewritten = 0;
  const text = markdown.replace(DOWNLOAD_LINK, (whole, id: string) => {
    const url = urls.get(id);
    if (!url) return whole;
    rewritten += 1;
    return url;
  });
  return { text, rewritten };
}

export interface ImageBlock {
  type: "image";
  data: string;
  mimeType: string;
  _meta?: Record<string, unknown>;
}

/** The bytes of an owned image file as an MCP image content block, or null when too large / not an image. */
export async function imageBlock(userId: string, contentId: string): Promise<ImageBlock | null> {
  const signed = await presignFile(userId, contentId);
  if (!signed) return null;
  const { file, url } = signed;
  if (!file.mimeType.startsWith("image/") || file.fileSize > IMAGE_MAX_BYTES) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > IMAGE_MAX_BYTES) return null;
  return { type: "image", data: buffer.toString("base64"), mimeType: file.mimeType, _meta: { contentId: file.id, fileName: file.fileName, bytes: buffer.length } };
}

/** Up to the per-read caps, in the order given. */
export async function imageBlocks(userId: string, contentIds: string[]): Promise<{ blocks: ImageBlock[]; skipped: number }> {
  const blocks: ImageBlock[] = [];
  let total = 0;
  let skipped = 0;
  for (const id of contentIds.slice(0, IMAGES_MAX_PER_READ)) {
    const block = await imageBlock(userId, id).catch(() => null);
    if (!block) {
      skipped += 1;
      continue;
    }
    const bytes = Number(block._meta?.bytes ?? 0);
    if (total + bytes > IMAGES_MAX_TOTAL_BYTES) {
      skipped += 1;
      continue;
    }
    total += bytes;
    blocks.push(block);
  }
  skipped += Math.max(0, contentIds.length - IMAGES_MAX_PER_READ);
  return { blocks, skipped };
}

/** Raw bytes for the file resource (blob), any mime, under the per-image cap. */
export async function fileBlob(userId: string, contentId: string): Promise<{ data: string; mimeType: string; fileName: string } | null> {
  const signed = await presignFile(userId, contentId);
  if (!signed || signed.file.fileSize > IMAGE_MAX_BYTES) return null;
  const res = await fetch(signed.url);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return { data: buffer.toString("base64"), mimeType: signed.file.mimeType, fileName: signed.file.fileName };
}
