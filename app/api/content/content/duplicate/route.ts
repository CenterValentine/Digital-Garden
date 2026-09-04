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
import type { Prisma } from "@/lib/database/generated/prisma";
import type { JSONContent } from "@tiptap/core";
import { getSession } from "@/lib/infrastructure/auth/session";
import { prisma } from "@/lib/database/client";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";
import { regenerateAllBlockIds } from "@/lib/domain/blocks/block-id-walk";
import { forkConversation } from "@/lib/features/conversations";

/**
 * Mac-style duplicate naming (owner, 2026-09-04): "T" → "T 2" → "T 3";
 * duplicating "T 2" strips the trailing number and continues from the base —
 * never "(Copy)" chains. Scoped to live siblings under the same parent.
 */
async function nextDuplicateTitle(
  originalTitle: string,
  parentId: string | null,
  userId: string,
): Promise<string> {
  const base = originalTitle.replace(/ \d+$/, "");
  const siblings = await prisma.contentNode.findMany({
    where: {
      ownerId: userId,
      parentId,
      deletedAt: null,
      title: { startsWith: base },
    },
    select: { title: true },
  });
  const taken = new Set(siblings.map((s) => s.title));
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

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
                shortcutPayload: true,
                chatPayload: true,
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
          await spanPayload(span, "duplicate_results", {
            requested: ids,
            duplicated: duplicatedNodes,
            skippedNotFound,
            skippedNotOwned,
          });
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
  parentId: string | null = null,
  /** Only the top-level node renames (mac semantics) — children inside a
   *  duplicated folder keep their exact titles (their parent is new, so
   *  there is nothing to collide with). */
  rename = true,
): Promise<any> {
/* eslint-enable @typescript-eslint/no-explicit-any */
  const newTitle = rename
    ? await nextDuplicateTitle(
        original.title,
        parentId ?? original.parentId,
        userId,
      )
    : original.title;

  const duplicate = await prisma.contentNode.create({
    data: {
      // ownerId is required — its absence was the "Argument `owner` is missing"
      // crash on every duplicate. `categoryId` (scalar FK) is the right field;
      // `category` was passing the relation object (always undefined here).
      ownerId: userId,
      title: newTitle,
      slug: `${original.slug}-copy-${Date.now()}`,
      contentType: original.contentType,
      parentId: parentId ?? original.parentId,
      displayOrder: original.displayOrder,
      categoryId: original.categoryId ?? null,
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
            // Fresh blockIds for every copied block: per-instance state
            // keyed by blockId (excalidraw/mermaid sub-maps, Note Window
            // history) must never be shared between original and copy.
            // The duplicate has no Y.Doc, so there is no sub-map data on
            // the copy to orphan — unconditional re-id is safe here
            // (unlike paste, which is collision-scoped).
            tiptapJson: regenerateAllBlockIds(
              original.notePayload.tiptapJson as unknown as JSONContent,
            ) as unknown as Prisma.InputJsonValue,
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

      // Copy the POINTER, not the target. Duplicating a shortcut yields a
      // second shortcut to the same content — duplicating what it points at
      // would silently fork the real note.
      ...(original.shortcutPayload && {
        shortcutPayload: {
          create: {
            targetContentId: original.shortcutPayload.targetContentId,
          },
        },
      }),

      // Chats: copy the legacy payload verbatim; the LIVE transcript (the
      // backing Conversation) is forked below.
      ...(original.chatPayload && {
        chatPayload: {
          create: {
            messages: original.chatPayload.messages || [],
            metadata: original.chatPayload.metadata || {},
          },
        },
      }),
    } as never,
  });

  // Fork, don't blank (owner, 2026-09-04): a duplicated chat used to come
  // out empty because the transcript lives in the backing Conversation,
  // which this route never touched. Fork it (full message copy + mirrored
  // associations) and point the fork at the NEW node. Best-effort: a fork
  // failure still leaves the node copy (with the legacy payload above).
  if (original.contentType === "chat") {
    try {
      const backing = await prisma.conversation.findFirst({
        where: { archivedToContentNodeId: original.id },
        select: { id: true },
      });
      if (backing) {
        const forkedId = await forkConversation(userId, backing.id, undefined);
        await prisma.conversation.update({
          where: { id: forkedId },
          data: { archivedToContentNodeId: duplicate.id, title: newTitle },
        });
      }
    } catch (error) {
      logger.warn({
        layer: "content",
        event: "duplicate:chat_fork_failed",
        summary: "chat node copied but conversation fork failed",
        error,
      });
    }
  }

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
        shortcutPayload: true,
        chatPayload: true,
      },
    });

    for (const child of children) {
      await duplicateNode(child, userId, duplicate.id, false);
    }
  }

  return duplicate;
}
