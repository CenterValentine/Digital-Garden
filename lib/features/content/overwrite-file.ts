/**
 * Overwrite a file node's CONTENT in place (owner approval, 2026-08-31).
 *
 * Same ContentNode id, new bytes — which is the whole point: every
 * referencer (File cells, shortcuts, data-cell backlinks) sees the new
 * version, and no "name (1)" duplicates accumulate. One code path for
 * every overwrite entry (upload/simple's overwriteContentId branch, the
 * AI's create_docx overwrite mode).
 *
 * Rules:
 *  - New bytes upload under a FRESH storage key; the old object is left
 *    orphaned rather than clobbered mid-flight (storage GC is a separate
 *    concern; a failed upload must never corrupt the current version).
 *  - An image file (referenced by Images cells) cannot be overwritten
 *    with a non-image — that would silently break the Images invariant
 *    everywhere the node is referenced.
 *  - Thumbnail/dimension/blur metadata is RESET (the old image's visuals
 *    must not survive its replacement); the display layer streams the
 *    new bytes until reprocessing fills them back in.
 *
 * Flat result shape — this tsconfig doesn't narrow discriminated unions.
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";

export async function overwriteFileNode(
  ownerId: string,
  contentId: string,
  input: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    /** Optional pre-computed search text (e.g. from a TipTap source). */
    searchText?: string;
  }
): Promise<{
  contentNodeId?: string;
  fileName?: string;
  storageKey?: string;
  storageProvider?: string;
  error?: string;
}> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId, contentType: "file", deletedAt: null },
    select: {
      id: true,
      filePayload: {
        select: { mimeType: true, storageProvider: true },
      },
    },
  });
  if (!node?.filePayload) {
    return { error: "That file was not found." };
  }
  if (
    node.filePayload.mimeType.startsWith("image/") &&
    !input.mimeType.startsWith("image/")
  ) {
    return {
      error:
        "This file is an image and may be referenced as one — overwrite it with another image, or upload a new file instead.",
    };
  }

  const provider = node.filePayload.storageProvider as "r2" | "s3" | "vercel";
  const storage = await getUserStorageProvider(ownerId, provider);
  const fileExtension = input.fileName.split(".").pop() || "";
  const storageKey = `uploads/${ownerId}/overwrite-${Date.now()}-${randomBytes(8).toString("hex")}.${fileExtension}`;
  await storage.uploadFile(storageKey, input.buffer, input.mimeType);

  const checksum = createHash("sha256").update(input.buffer).digest("hex");
  await prisma.$transaction([
    prisma.filePayload.update({
      where: { contentId: node.id },
      data: {
        fileName: input.fileName,
        fileExtension,
        mimeType: input.mimeType,
        fileSize: BigInt(input.buffer.length),
        checksum,
        storageKey,
        uploadStatus: "ready",
        uploadedAt: new Date(),
        ...(input.searchText !== undefined
          ? { searchText: input.searchText }
          : {}),
        // The old version's visuals must not outlive it.
        thumbnailUrl: null,
        blurDataUrl: null,
        width: null,
        height: null,
        isProcessed: false,
        processingStatus: "pending",
      },
    }),
    // The node keeps its id and slug; the title follows the new file so
    // the tree never shows an old name over new bytes.
    prisma.contentNode.update({
      where: { id: node.id },
      data: { title: input.fileName.slice(0, 255) },
    }),
  ]);

  logger.info({
    layer: "content",
    event: "content:file_overwritten",
    summary: `file ${node.id} overwritten (${input.buffer.length} bytes)`,
    attrs: { contentId: node.id, bytes: input.buffer.length, provider },
  });

  return {
    contentNodeId: node.id,
    fileName: input.fileName,
    storageKey,
    storageProvider: provider,
  };
}
