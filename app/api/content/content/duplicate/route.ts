/**
 * Duplicate Content API
 *
 * POST /api/content/content/duplicate
 *
 * Duplicates one or more content nodes (notes, files, folders).
 * Creates deep copies with new IDs, appending " (Copy)" to titles.
 * Supports recursive folder duplication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/database/client";

/**
 * POST /api/content/content/duplicate
 *
 * Request body:
 * {
 *   ids: string[];  // IDs of nodes to duplicate
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     duplicated: Array<{ originalId: string; newId: string; title: string }>;
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "ids must be a non-empty array" } },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const duplicatedNodes: Array<{ originalId: string; newId: string; title: string }> = [];

    // Process each ID
    for (const id of ids) {
      // Fetch the original node
      const original = await prisma.contentNode.findUnique({
        where: { id },
        include: {
          notePayload: true,
          filePayload: true,
          htmlPayload: true,
          codePayload: true,
        },
      });

      if (!original) {
        console.warn(`[Duplicate] Node ${id} not found, skipping`);
        continue;
      }

      // Verify ownership
      if (original.ownerId !== userId) {
        console.warn(`[Duplicate] User ${userId} does not own node ${id}, skipping`);
        continue;
      }

      // Create duplicate
      const duplicate = await duplicateNode(original, userId);
      duplicatedNodes.push({
        originalId: id,
        newId: duplicate.id,
        title: duplicate.title,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        duplicated: duplicatedNodes,
      },
    });
  } catch (error) {
    console.error("[Duplicate API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to duplicate content",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Recursively duplicate a content node and its children
 */
async function duplicateNode(
  original: any,
  userId: string,
  parentId: string | null = null
): Promise<any> {
  // Generate new title with " (Copy)" suffix
  const newTitle = `${original.title} (Copy)`;

  // Create the duplicate node
  const duplicate = await prisma.contentNode.create({
    data: {
      title: newTitle,
      slug: `${original.slug}-copy-${Date.now()}`,
      contentType: original.contentType,
      parentId: parentId ?? original.parentId, // Use provided parentId or keep original
      displayOrder: original.displayOrder,
      createdBy: userId,
      updatedBy: userId,
      category: original.category,
      customIcon: original.customIcon,
      iconColor: original.iconColor,
      isPublished: false, // Duplicates are unpublished by default
      publishedAt: null,

      // Duplicate payload based on type
      ...(original.notePayload && {
        notePayload: {
          create: {
            tiptapJson: original.notePayload.tiptapJson,
            markdownText: original.notePayload.markdownText,
            searchText: original.notePayload.searchText,
            metadata: original.notePayload.metadata || {},
          },
        },
      }),

      // File payloads cannot be duplicated (would need to copy storage)
      // Instead, we create a reference to the same file
      ...(original.filePayload && {
        filePayload: {
          create: {
            fileName: original.filePayload.fileName,
            mimeType: original.filePayload.mimeType,
            fileSize: original.filePayload.fileSize,
            storageProvider: original.filePayload.storageProvider,
            storageKey: original.filePayload.storageKey, // Same file in storage
            storageMetadata: original.filePayload.storageMetadata || {},
            uploadStatus: original.filePayload.uploadStatus,
            thumbnailUrl: original.filePayload.thumbnailUrl,
            previewUrl: original.filePayload.previewUrl,
          },
        },
      }),

      ...(original.htmlPayload && {
        htmlPayload: {
          create: {
            htmlContent: original.htmlPayload.htmlContent,
            rawHtml: original.htmlPayload.rawHtml,
            sanitizedHtml: original.htmlPayload.sanitizedHtml,
            metadata: original.htmlPayload.metadata || {},
          },
        },
      }),

      ...(original.codePayload && {
        codePayload: {
          create: {
            code: original.codePayload.code,
            language: original.codePayload.language,
            metadata: original.codePayload.metadata || {},
          },
        },
      }),
    },
  });

  // If original has children (folder), duplicate them recursively
  if (original.contentType === "folder") {
    const children = await prisma.contentNode.findMany({
      where: { parentId: original.id },
      include: {
        notePayload: true,
        filePayload: true,
        htmlPayload: true,
        codePayload: true,
      },
    });

    for (const child of children) {
      await duplicateNode(child, userId, duplicate.id);
    }
  }

  return duplicate;
}
