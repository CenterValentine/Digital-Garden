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
  options: { ownerContentId?: string } = {},
): Promise<{ contentNodeId: string; created: boolean }> {
  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId,
      parentId,
      ownedByNoteId: options.ownerContentId ?? null,
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
      ...(options.ownerContentId
        ? {
            role: "referenced" as const,
            ownedByNoteId: options.ownerContentId,
          }
        : {}),
    },
    select: { id: true },
  });
  logger.info({
    layer: "ai",
    event: "ai_documents:folder_created",
    summary: `folder "${title}" created`,
    attrs: { folderId: folder.id, parentId, ownerContentId: options.ownerContentId },
  });
  return { contentNodeId: folder.id, created: true };
}

/**
 * Find-or-create a SHORTCUT to existing content (owner confirmation,
 * 2026-08-31): the pointer that lets content keep ONE canonical home while
 * staying visible elsewhere — the AI's alternative to ever duplicating.
 *
 * Semantics mirror the content route's: chains collapse to a single hop
 * (a shortcut to a shortcut points at the final target; a broken chain is
 * refused), nothing is ever stored UNDER a shortcut, and find is scoped to
 * (parent, owner-content, resolved target) so a retried tool call reuses
 * the mirror instead of stacking twins.
 *
 * Flat result shape — this tsconfig doesn't narrow discriminated unions.
 */
export async function findOrCreateShortcut(
  ownerId: string,
  targetContentId: string,
  parentId: string | null,
  options: { title?: string; ownerContentId?: string } = {},
): Promise<{
  contentNodeId?: string;
  created?: boolean;
  title?: string;
  error?: string;
}> {
  const target = await prisma.contentNode.findFirst({
    where: { id: targetContentId, ownerId, deletedAt: null },
    select: {
      id: true,
      title: true,
      shortcutPayload: { select: { targetContentId: true } },
    },
  });
  if (!target) return { error: "Shortcut target not found." };

  // Collapse shortcut→shortcut to one hop (same rule as the content route).
  let resolvedTargetId = target.id;
  let resolvedTitle = target.title;
  if (target.shortcutPayload) {
    const innerId = target.shortcutPayload.targetContentId;
    const inner = innerId
      ? await prisma.contentNode.findFirst({
          where: { id: innerId, ownerId, deletedAt: null },
          select: { id: true, title: true },
        })
      : null;
    if (!inner) {
      return {
        error: "That shortcut is broken, so a shortcut to it would be too.",
      };
    }
    resolvedTargetId = inner.id;
    resolvedTitle = inner.title;
  }

  if (parentId) {
    const parent = await prisma.contentNode.findFirst({
      where: { id: parentId, ownerId, deletedAt: null },
      select: { contentType: true },
    });
    if (!parent) return { error: "Destination folder not found." };
    if (parent.contentType === "shortcut") {
      return {
        error:
          "Nothing is stored under a shortcut — target the real folder it points to.",
      };
    }
  }

  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId,
      parentId,
      ownedByNoteId: options.ownerContentId ?? null,
      contentType: "shortcut",
      deletedAt: null,
      shortcutPayload: { targetContentId: resolvedTargetId },
    },
    select: { id: true, title: true },
  });
  if (existing) {
    return { contentNodeId: existing.id, created: false, title: existing.title };
  }

  const title = (options.title?.trim() || resolvedTitle).slice(0, 255);
  const slug = await generateUniqueSlug(title, ownerId);
  const shortcut = await prisma.contentNode.create({
    data: {
      ownerId,
      title,
      slug,
      contentType: "shortcut",
      parentId,
      displayOrder: 0,
      ...(options.ownerContentId
        ? { role: "referenced" as const, ownedByNoteId: options.ownerContentId }
        : {}),
      shortcutPayload: {
        create: { target: { connect: { id: resolvedTargetId } } },
      },
    },
    select: { id: true },
  });
  logger.info({
    layer: "ai",
    event: "ai_documents:shortcut_created",
    summary: `shortcut "${title}" → ${resolvedTargetId}`,
    attrs: { shortcutId: shortcut.id, parentId, targetId: resolvedTargetId },
  });
  return { contentNodeId: shortcut.id, created: true, title };
}

export interface CreateDocxInput {
  title: string;
  /** Markdown body — converted via the app's markdown→TipTap pipeline. */
  markdown: string;
  /** Destination folder — required for CREATE; ignored for overwrite. */
  parentFolderId?: string;
  /**
   * Overwrite mode (owner approval, 2026-08-31): replace THIS existing
   * file node's bytes in place instead of creating a new node — same id,
   * so every File cell / shortcut referencing it sees the new version.
   */
  overwriteContentId?: string;
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

  const safeTitle =
    input.title.replace(/[^a-zA-Z0-9\s-]/g, "").trim() || "Document";
  const fileName = `${safeTitle}.docx`;

  // Overwrite mode: same node id, new bytes — the shared helper enforces
  // the invariants (fresh storage key, image guard, metadata reset).
  if (input.overwriteContentId) {
    const { overwriteFileNode } = await import(
      "@/lib/features/content/overwrite-file"
    );
    const result = await overwriteFileNode(ownerId, input.overwriteContentId, {
      buffer,
      fileName,
      mimeType: DOCX_MIME,
      searchText: extractSearchTextFromTipTap(tiptap),
    });
    if (!result.contentNodeId) {
      throw new Error(result.error ?? "Could not overwrite the document.");
    }
    logger.info({
      layer: "ai",
      event: "ai_documents:docx_overwritten",
      summary: `docx "${fileName}" overwritten in place`,
      attrs: { contentNodeId: result.contentNodeId, bytes: buffer.length },
    });
    return { contentNodeId: result.contentNodeId, fileName };
  }

  if (!input.parentFolderId) {
    throw new Error("A destination folder is required to create a new document.");
  }

  const { getUserStorageProvider } = await import(
    "@/lib/infrastructure/storage"
  );
  const storageProvider = await getUserStorageProvider(ownerId);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const storageKey = `uploads/${ownerId}/ai-doc-${Date.now()}-${randomBytes(6).toString("hex")}.docx`;
  await storageProvider.uploadFile(storageKey, buffer, DOCX_MIME);

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
