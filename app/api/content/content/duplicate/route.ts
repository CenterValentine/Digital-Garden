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
import { getSession } from "@/lib/infrastructure/auth/session";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/content/duplicate";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => getSession(),
      );
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
      let skippedNotFound = 0;
      let skippedNotOwned = 0;

      await withSpan(
        { layer: "content", name: "duplicate" },
        { attrs: { requested: ids.length } },
        async (span) => {
          for (const id of ids) {
            const original = await prisma.contentNode.findUnique({
              where: { id },
              include: {
                folderPayload: true,
                notePayload: true,
                filePayload: true,
                htmlPayload: true,
                codePayload: true,
                externalPayload: true,
              },
            });

            if (!original) {
              skippedNotFound++;
              continue;
            }

            if (original.ownerId !== userId) {
              skippedNotOwned++;
              continue;
            }

            const duplicate = await duplicateNode(original, userId);
            duplicatedNodes.push({
              originalId: id,
              newId: duplicate.id,
              title: duplicate.title,
            });
          }
          span
            .attr("duplicated", duplicatedNodes.length)
            .attr("skipped_not_found", skippedNotFound)
            .attr("skipped_not_owned", skippedNotOwned)
            .summary(`${duplicatedNodes.length}/${ids.length} duplicated`);
        },
      );

      if (skippedNotFound > 0 || skippedNotOwned > 0) {
        logger.warn({
          layer: "content",
          event: "duplicate:skipped",
          summary: `${skippedNotFound} not_found, ${skippedNotOwned} not_owned`,
          attrs: { not_found: skippedNotFound, not_owned: skippedNotOwned },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          duplicated: duplicatedNodes,
        },
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "duplicate:caught",
        summary: "duplicate failed — 500",
        error,
      });
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
  });
}

/**
 * Recursively duplicate a content node and its children
 *
 * TODO(any-epic-phase-4): `original` is a deeply-nested ContentNode with all
 * payload includes; define a Prisma.ContentNodeGetPayload<...> type for this
 * query and use it here + as return type.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function duplicateNode(
  original: any,
  userId: string,
  parentId: string | null = null
): Promise<any> {
/* eslint-enable @typescript-eslint/no-explicit-any */
  const newTitle = `${original.title} (Copy)`;

  const duplicate = await prisma.contentNode.create({
    data: {
      title: newTitle,
      slug: `${original.slug}-copy-${Date.now()}`,
      contentType: original.contentType,
      parentId: parentId ?? original.parentId,
      displayOrder: original.displayOrder,
      category: original.category,
      customIcon: original.customIcon,
      iconColor: original.iconColor,
      isPublished: false,

      ...(original.folderPayload && {
        folderPayload: {
          create: {
            viewMode: original.folderPayload.viewMode,
            sortMode: original.folderPayload.sortMode,
            viewPrefs: original.folderPayload.viewPrefs || {},
            includeReferencedContent: original.folderPayload.includeReferencedContent,
          },
        },
      }),

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

      ...(original.filePayload && {
        filePayload: {
          create: {
            fileName: original.filePayload.fileName,
            mimeType: original.filePayload.mimeType,
            fileSize: original.filePayload.fileSize,
            storageProvider: original.filePayload.storageProvider,
            storageKey: original.filePayload.storageKey,
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

      ...(original.externalPayload && {
        externalPayload: {
          create: {
            url: original.externalPayload.url,
            subtype: original.externalPayload.subtype,
            preview: original.externalPayload.preview || {},
          },
        },
      }),
    } as never,
  });

  if (original.contentType === "folder") {
    const children = await prisma.contentNode.findMany({
      where: { parentId: original.id },
      include: {
        folderPayload: true,
        notePayload: true,
        filePayload: true,
        htmlPayload: true,
        codePayload: true,
        externalPayload: true,
      },
    });

    for (const child of children) {
      await duplicateNode(child, userId, duplicate.id);
    }
  }

  return duplicate;
}
