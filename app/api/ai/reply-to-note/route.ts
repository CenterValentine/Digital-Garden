import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  extractSearchTextFromTipTap,
  generateUniqueSlug,
  markdownToTiptapResult,
} from "@/lib/domain/content";
import {
  DEFAULT_OUTPUT_TARGET,
  parseOutputTarget,
} from "@/lib/domain/ai/output-target";
import { resolveToolOutputPlacement } from "@/lib/domain/ai/tools/output-placement";
import { getContentWriteReceipt } from "@/lib/domain/ai/content-write-receipts.server";
import {
  addAutoAssociation,
  ensureConversationContentNode,
} from "@/lib/features/conversations";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger, withRouteTrace } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/reply-to-note";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json()) as {
        title?: unknown;
        markdown?: unknown;
        messageId?: unknown;
        conversationId?: unknown;
        contentId?: unknown;
        outputTarget?: unknown;
      };

      const title = typeof body.title === "string" ? body.title.trim() : "";
      const markdown =
        typeof body.markdown === "string" ? body.markdown.trim() : "";
      const conversationId =
        typeof body.conversationId === "string" ? body.conversationId : null;
      const contentId =
        typeof body.contentId === "string" ? body.contentId : null;
      const messageId =
        typeof body.messageId === "string" ? body.messageId : null;

      if (!title || title.length > 255 || !markdown) {
        return NextResponse.json(
          {
            success: false,
            error:
              !title
                ? "A note name is required."
                : title.length > 255
                  ? "The note name must be 255 characters or less."
                  : "The reply is empty.",
          },
          { status: 400 },
        );
      }

      const openContent = contentId
        ? await prisma.contentNode.findFirst({
            where: {
              id: contentId,
              ownerId: session.user.id,
              deletedAt: null,
            },
            select: { id: true, contentType: true, parentId: true },
          })
        : null;
      if (contentId && !openContent) {
        return NextResponse.json(
          { success: false, error: "The chat's rooted content is unavailable." },
          { status: 404 },
        );
      }

      const isChatContent = openContent?.contentType === "chat";
      const openContentLocationId =
        openContent?.contentType === "folder"
          ? openContent.id
          : (openContent?.parentId ?? undefined);

      const conversation = conversationId
        ? await prisma.conversation.findFirst({
            where: {
              id: conversationId,
              ownerId: session.user.id,
              deletedAt: null,
            },
            select: {
              targetFolderId: true,
              archivedToContentNode: {
                select: { id: true, parentId: true },
              },
            },
          })
        : null;
      if (conversationId && !conversation) {
        return NextResponse.json(
          { success: false, error: "The conversation is unavailable." },
          { status: 404 },
        );
      }

      let archivedChatNodeId = conversation?.archivedToContentNode?.id;
      if (
        conversationId &&
        openContent &&
        !isChatContent &&
        !archivedChatNodeId
      ) {
        archivedChatNodeId = await ensureConversationContentNode(
          session.user.id,
          conversationId,
          { ownerContentId: openContent.id },
        );
      }

      const chatNodeId = isChatContent
        ? openContent?.id
        : archivedChatNodeId;
      const originContentId = isChatContent ? undefined : openContent?.id;
      const targetFolderId =
        conversation?.targetFolderId ??
        conversation?.archivedToContentNode?.parentId ??
        openContentLocationId;

      const outputTarget =
        parseOutputTarget(body.outputTarget) ?? DEFAULT_OUTPUT_TARGET;
      let outputOwnerId = chatNodeId;
      let outputParentOverride: string | undefined;

      if (outputTarget.mode === "underContent") {
        outputOwnerId = originContentId ?? chatNodeId;
      } else if (outputTarget.mode === "besideContent") {
        outputOwnerId = undefined;
        outputParentOverride = openContentLocationId;
      } else if (outputTarget.mode === "folder") {
        const folder = await prisma.contentNode.findFirst({
          where: {
            id: outputTarget.folderId,
            ownerId: session.user.id,
            contentType: "folder",
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!folder) {
          return NextResponse.json(
            { success: false, error: "The selected output folder is unavailable." },
            { status: 404 },
          );
        }
        outputOwnerId = undefined;
        outputParentOverride = folder.id;
      }

      const placement = resolveToolOutputPlacement({
        targetFolderId,
        outputOwnerId,
        outputParentOverride,
      });
      const conversion = markdownToTiptapResult(markdown);
      const searchText = extractSearchTextFromTipTap(conversion.json);
      const wordCount = searchText.split(/\s+/).filter(Boolean).length;
      const slug = await generateUniqueSlug(title, session.user.id);

      const note = await prisma.contentNode.create({
        data: {
          ownerId: session.user.id,
          title,
          slug,
          contentType: "note",
          parentId: placement.parentId,
          ...(placement.role ? { role: placement.role } : {}),
          ...(placement.ownedByNoteId
            ? { ownedByNoteId: placement.ownedByNoteId }
            : {}),
          notePayload: {
            create: {
              tiptapJson:
                conversion.json as unknown as Prisma.InputJsonValue,
              searchText,
              metadata: {
                wordCount,
                characterCount: searchText.length,
                readingTime: Math.ceil(wordCount / 200),
                source: "chat-reply-export",
                ...(conversationId ? { conversationId } : {}),
                ...(messageId ? { messageId } : {}),
                ...(conversion.degraded
                  ? {
                      markdownDegraded: true,
                      degradedReason: conversion.reason,
                    }
                  : {}),
              } as unknown as Prisma.InputJsonValue,
            },
          },
        },
        select: { id: true },
      });

      if (conversationId) {
        await addAutoAssociation(
          session.user.id,
          conversationId,
          note.id,
          "tool-call",
        );
      }

      const receipt = await getContentWriteReceipt(
        session.user.id,
        note.id,
        "created",
        "note",
      );
      logger.info({
        layer: "ai",
        event: "chat_reply:exported",
        summary: "assistant reply exported to note",
        attrs: {
          contentId: note.id,
          conversationId,
          messageId,
          outputMode: outputTarget.mode,
        },
      });

      return NextResponse.json({
        success: true,
        data: { contentId: note.id, receipt },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Authentication required"
      ) {
        return NextResponse.json(
          { success: false, error: "Authentication required" },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "chat_reply:export_failed",
        summary: "assistant reply export failed",
        error,
      });
      return NextResponse.json(
        { success: false, error: "Couldn't create the note." },
        { status: 500 },
      );
    }
  });
}
