/**
 * AI document creation service (AI v3 core S4b).
 *
 * Folder-targeted document outputs for the chat tool layer — the A2
 * capabilities: create_folder (find-or-create by title under a parent) and
 * create_docx (markdown → TipTap → DOCX → user storage → FilePayload node).
 * Generalized from the workflows run-artifact path
 * (extensions/workflows/server/documents.ts) minus the run coupling:
 * destination is ALWAYS explicit — callers resolve it from the
 * conversation's target folder (chats serve their location).
 */

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import {
  generateUniqueSlug,
  markdownToTiptap,
  extractSearchTextFromTipTap,
} from "@/lib/domain/content";
import { DOCXConverter } from "@/lib/domain/export/converters/docx";
import { DEFAULT_EXPORT_BACKUP_SETTINGS } from "@/lib/domain/export";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Find-or-create a folder by title under a parent (or the root when
 * parentId is null). Find is scoped to the same parent — two projects can
 * both have a "Research" subfolder without colliding.
 */
export async function findOrCreateFolder(
  ownerId: string,
  title: string,
  parentId: string | null,
): Promise<{ contentNodeId: string; created: boolean }> {
  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId,
      parentId,
      contentType: "folder",
      deletedAt: null,
      title: { equals: title, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    return { contentNodeId: existing.id, created: false };
  }

  const slug = await generateUniqueSlug(title, ownerId);
  const folder = await prisma.contentNode.create({
    data: {
      ownerId,
      title,
      slug,
      contentType: "folder",
      parentId,
      displayOrder: 0,
    },
    select: { id: true },
  });
  logger.info({
    layer: "ai",
    event: "ai_documents:folder_created",
    summary: `folder "${title}" created`,
    attrs: { folderId: folder.id, parentId },
  });
  return { contentNodeId: folder.id, created: true };
}

export interface CreateDocxInput {
  title: string;
  /** Markdown body — converted via the app's markdown→TipTap pipeline. */
  markdown: string;
  /** Destination folder — required; callers resolve from the target. */
  parentFolderId: string;
  /**
   * Output ownership (Chat Outputs & References plan, WS3): when set, the
   * document is created as `role: "referenced"`, nested under this owner
   * (a chat's ContentNode) rather than as a loose primary file. Omit for the
   * default primary-in-folder placement.
   */
  role?: "referenced";
  ownedByNoteId?: string;
}

export async function createDocxDocument(
  ownerId: string,
  input: CreateDocxInput,
): Promise<{ contentNodeId: string; fileName: string }> {
  const tiptap = markdownToTiptap(input.markdown);
  const converter = new DOCXConverter();
  const result = await converter.convert(tiptap, {
    format: "docx",
    settings: DEFAULT_EXPORT_BACKUP_SETTINGS,
  });
  const file = result.files[0];
  if (!result.success || !file) {
    throw new Error("DOCX conversion produced no file.");
  }
  const buffer = Buffer.isBuffer(file.content)
    ? file.content
    : Buffer.from(file.content);

  const { getUserStorageProvider } = await import(
    "@/lib/infrastructure/storage"
  );
  const storageProvider = await getUserStorageProvider(ownerId);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const storageKey = `uploads/${ownerId}/ai-doc-${Date.now()}-${randomBytes(6).toString("hex")}.docx`;
  await storageProvider.uploadFile(storageKey, buffer, DOCX_MIME);

  const safeTitle =
    input.title.replace(/[^a-zA-Z0-9\s-]/g, "").trim() || "Document";
  const fileName = `${safeTitle}.docx`;
  const slug = await generateUniqueSlug(fileName, ownerId);

  const content = await prisma.contentNode.create({
    data: {
      ownerId,
      title: fileName,
      slug,
      contentType: "file",
      parentId: input.parentFolderId,
      displayOrder: 0,
      ...(input.role ? { role: input.role } : {}),
      ...(input.ownedByNoteId ? { ownedByNoteId: input.ownedByNoteId } : {}),
      filePayload: {
        create: {
          fileName,
          fileExtension: "docx",
          mimeType: DOCX_MIME,
          fileSize: BigInt(buffer.length),
          checksum,
          storageProvider: "r2",
          storageKey,
          searchText: extractSearchTextFromTipTap(tiptap),
          uploadStatus: "ready",
          uploadedAt: new Date(),
          isProcessed: true,
          processingStatus: "complete",
        },
      },
    },
    select: { id: true },
  });

  logger.info({
    layer: "ai",
    event: "ai_documents:docx_created",
    summary: `docx "${fileName}" created in folder`,
    attrs: {
      contentNodeId: content.id,
      parentFolderId: input.parentFolderId,
      bytes: buffer.length,
    },
  });
  return { contentNodeId: content.id, fileName };
}
