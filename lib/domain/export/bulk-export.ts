/**
 * Bulk Export Service
 *
 * Export multiple documents with optional compression and folder structure
 */

import JSZip from "jszip";
import { prisma } from "@/lib/database/client";
import { convertDocument } from "./factory";
import { generateMetadataSidecar } from "./metadata";
import { validateBeforeExport, formatValidationResult } from "./validation";
import { errorMonitor, logExportError } from "./error-monitoring";
import { getCurrentSchemaVersion } from "@/lib/domain/editor/schema-version";
import type { BulkExportOptions } from "./types";
import type { JSONContent } from "@tiptap/core";

/**
 * Export entire vault or filtered set of notes
 *
 * @param options - Bulk export configuration
 * @returns ZIP archive buffer
 */
export async function exportVault(
  options: BulkExportOptions
): Promise<Buffer> {
  // Fetch all notes matching criteria
  const notes = await prisma.contentNode.findMany({
    where: {
      ownerId: options.userId,
      notePayload: { isNot: null },
      deletedAt: options.filters?.includeDeleted ? undefined : null,
      ...(options.filters?.parentId && { parentId: options.filters.parentId }),
      ...(options.filters?.tags && {
        contentTags: {
          some: {
            tag: { slug: { in: options.filters.tags } },
          },
        },
      }),
      ...(options.filters?.dateRange && {
        createdAt: {
          gte: options.filters.dateRange.start,
          lte: options.filters.dateRange.end,
        },
      }),
    },
    include: {
      notePayload: true,
      contentTags: { include: { tag: true } },
      sourceLinks: { include: { target: true } },
      parent: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Create ZIP archive
  const zip = new JSZip();

  // Process notes in batches
  const batchSize = options.settings.bulkExport.batchSize;

  for (let i = 0; i < notes.length; i += batchSize) {
    const batch = notes.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (note) => {
        try {
          const tiptapJson = note.notePayload!.tiptapJson as JSONContent;

          // Validate before export
          const validationResult = validateBeforeExport(tiptapJson);

          if (!validationResult.valid) {
            console.warn(
              `[Export] Validation issues for note ${note.id}:`,
              formatValidationResult(validationResult)
            );

            // Log validation errors
            errorMonitor.logValidation(
              note.id,
              options.format,
              options.userId,
              validationResult
            );

            // Continue with export despite validation issues (graceful degradation)
          }

          // Generate metadata sidecar
          const metadata = generateMetadataSidecar(note as any);

          // Convert document
          const result = await convertDocument(tiptapJson, {
            format: options.format,
            settings: options.settings,
            metadata: { customMetadata: metadata as unknown as Record<string, unknown> },
          });

          if (!result.success) {
            console.error(`Failed to convert note ${note.id}:`, result.metadata?.warnings);

            // Log conversion failure
            logExportError(new Error(`Conversion failed: ${result.metadata?.warnings?.join(", ")}`), {
              contentId: note.id,
              format: options.format,
              userId: options.userId,
              schemaVersion: getCurrentSchemaVersion(),
            });

            return;
          }

          // Determine file path
          const folderPath = options.settings.bulkExport.includeStructure
            ? await buildFolderPath(note.id, options.userId)
            : "";

          // Determine file name
          const fileName = getFileName(
            note,
            options.settings.bulkExport.fileNaming
          );

          // Add files to ZIP
          for (const file of result.files) {
            const extension = file.name.split(".").pop();
            const fullPath = `${folderPath}${fileName}.${extension}`;

            zip.file(fullPath, file.content);
          }
        } catch (error) {
          console.error(`Error exporting note ${note.id}:`, error);

          // Log system error
          logExportError(error, {
            contentId: note.id,
            format: options.format,
            userId: options.userId,
            schemaVersion: getCurrentSchemaVersion(),
          });
        }
      })
    );
  }

  // Add README to export
  const readme = generateExportReadme(notes.length, options);
  zip.file("README.md", readme);

  // Generate ZIP buffer
  const compressionLevel =
    options.settings.bulkExport.compressionFormat === "zip" ? 9 : 0;

  return await zip.generateAsync({
    type: "nodebuffer",
    compression: compressionLevel > 0 ? "DEFLATE" : "STORE",
    compressionOptions: { level: compressionLevel },
  });
}

/**
 * Export a single document
 *
 * @param contentId - Content ID
 * @param userId - User ID
 * @param options - Export options
 * @returns Conversion result
 */
export async function exportSingleDocument(
  contentId: string,
  userId: string,
  options: Partial<BulkExportOptions>
) {
  // Fetch content
  const content = await prisma.contentNode.findUnique({
    where: { id: contentId },
    include: {
      notePayload: true,
      contentTags: { include: { tag: true } },
      sourceLinks: { include: { target: true } },
    },
  });

  if (!content || content.ownerId !== userId) {
    throw new Error("Content not found or access denied");
  }

  if (!content.notePayload) {
    throw new Error("Content is not a note");
  }

  const tiptapJson = content.notePayload.tiptapJson as JSONContent;

  // Validate before export
  const validationResult = validateBeforeExport(tiptapJson);

  if (!validationResult.valid) {
    console.warn(
      `[Export] Validation issues for note ${contentId}:`,
      formatValidationResult(validationResult)
    );

    // Log validation errors
    errorMonitor.logValidation(
      contentId,
      options.format || "markdown",
      userId,
      validationResult
    );
  }

  // Generate metadata
  const metadata = generateMetadataSidecar(content as any);

  // Convert document
  const result = await convertDocument(tiptapJson, {
    format: options.format || "markdown",
    settings: options.settings!,
    metadata: { customMetadata: metadata as unknown as Record<string, unknown> },
  });

  // Log if conversion failed
  if (!result.success) {
    logExportError(new Error(`Conversion failed`), {
      contentId,
      format: options.format || "markdown",
      userId,
      schemaVersion: getCurrentSchemaVersion(),
    });
  }

  return result;
}

/**
 * Build folder path for a note based on parent hierarchy
 */
async function buildFolderPath(
  contentId: string,
  userId: string
): Promise<string> {
  const path: string[] = [];

  let currentId: string | null = contentId;

  while (currentId) {
    const node: { parentId: string | null; parent: { slug: string } | null } | null = await prisma.contentNode.findUnique({
      where: { id: currentId },
      select: { parentId: true, parent: { select: { slug: true } } },
    });

    if (!node) break;

    if (node.parent) {
      path.unshift(node.parent.slug);
    }

    currentId = node.parentId;
  }

  return path.length > 0 ? path.join("/") + "/" : "";
}

/**
 * Get file name based on naming strategy
 */
function getFileName(
  note: { id: string; title: string; slug: string },
  naming: "slug" | "title" | "id"
): string {
  switch (naming) {
    case "slug":
      return note.slug;
    case "title":
      // Sanitize title for file system
      return note.title
        .replace(/[^a-z0-9\s-]/gi, "")
        .replace(/\s+/g, "-")
        .toLowerCase();
    case "id":
      return note.id;
    default:
      return note.slug;
  }
}

/**
 * Generate README for export archive
 */
function generateExportReadme(
  noteCount: number,
  options: BulkExportOptions
): string {
  return `# Digital Garden Export

**Export Date:** ${new Date().toISOString()}
**Format:** ${options.format}
**Notes Exported:** ${noteCount}

## About This Export

This archive contains your Digital Garden notes exported in ${options.format.toUpperCase()} format.

${
  options.settings.markdown.includeMetadata
    ? `
### Metadata Files

Each note includes a \`.meta.json\` file containing:
- Tags with colors
- Wiki-link relationships
- Callout information
- Custom metadata

To restore semantic information when re-importing, ensure you upload both the .md and .meta.json files.
`
    : ""
}

## Folder Structure

${
  options.settings.bulkExport.includeStructure
    ? "The folder hierarchy from your Digital Garden has been preserved."
    : "All notes are in a flat structure (no folders)."
}

## File Naming

Files are named using: **${options.settings.bulkExport.fileNaming}**

---

Generated by Digital Garden Content IDE
`;
}
