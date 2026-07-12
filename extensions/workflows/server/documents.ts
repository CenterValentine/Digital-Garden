import { createHash, randomBytes } from "node:crypto";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { generateUniqueSlug } from "@/lib/domain/content";
import { DOCXConverter } from "@/lib/domain/export/converters/docx";
import { DEFAULT_EXPORT_BACKUP_SETTINGS } from "@/lib/domain/export";
import { attachArtifact } from "./runs";

const WORKFLOWS_FOLDER_TITLE = "Job Applications";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Root-level destination folder for workflow-produced documents. */
async function ensureWorkflowsFolder(ownerId: string): Promise<string> {
  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId,
      contentType: "folder",
      title: WORKFLOWS_FOLDER_TITLE,
      parentId: null,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const slug = await generateUniqueSlug(WORKFLOWS_FOLDER_TITLE, ownerId);
  const folder = await prisma.contentNode.create({
    data: {
      ownerId,
      title: WORKFLOWS_FOLDER_TITLE,
      slug,
      contentType: "folder",
      displayOrder: 0,
    },
  });
  return folder.id;
}

export interface StoreRunDocxInput {
  runId: string;
  ownerId: string;
  title: string;
  tiptap: JSONContent;
  searchText?: string;
}

/**
 * Convert TipTap JSON to DOCX, upload to the user's storage, create a
 * ContentNode + FilePayload in the designated folder, and attach it to the
 * run as an artifact. Mirrors the TTS generate-and-store pattern.
 */
export async function storeRunDocxArtifact(
  input: StoreRunDocxInput
): Promise<{ contentNodeId: string; fileName: string }> {
  const converter = new DOCXConverter();
  const result = await converter.convert(input.tiptap, {
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
  const storageProvider = await getUserStorageProvider(input.ownerId);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const storageKey = `uploads/${input.ownerId}/workflow-${input.runId}-${Date.now()}-${randomBytes(6).toString("hex")}.docx`;
  await storageProvider.uploadFile(storageKey, buffer, DOCX_MIME);

  const safeTitle =
    input.title.replace(/[^a-zA-Z0-9\s-]/g, "").trim() || "Workflow document";
  const fileName = `${safeTitle}.docx`;
  const parentId = await ensureWorkflowsFolder(input.ownerId);
  const slug = await generateUniqueSlug(fileName, input.ownerId);

  const content = await prisma.contentNode.create({
    data: {
      ownerId: input.ownerId,
      title: fileName,
      slug,
      contentType: "file",
      parentId,
      displayOrder: 0,
      filePayload: {
        create: {
          fileName,
          fileExtension: "docx",
          mimeType: DOCX_MIME,
          fileSize: BigInt(buffer.length),
          checksum,
          storageProvider: "r2",
          storageKey,
          searchText: input.searchText,
          uploadStatus: "ready",
          uploadedAt: new Date(),
          isProcessed: true,
          processingStatus: "complete",
        },
      },
    },
  });

  await attachArtifact(input.runId, content.id, "document", fileName);
  return { contentNodeId: content.id, fileName };
}
