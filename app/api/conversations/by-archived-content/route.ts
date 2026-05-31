/**
 * Resolve a Conversation from a chat ContentNode — Session 4b.
 *
 * GET /api/conversations/by-archived-content?contentId=<chat node id>
 *
 * The full-page ChatViewer is keyed by a chat-type ContentNode, but the
 * association graph (and the reverse-view chips) live on the Conversation
 * entity. This endpoint bridges them via `archivedToContentNodeId`,
 * returning `{ conversationId: string | null }`. Null means the chat was
 * never promoted, so there are no chips to render.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { findConversationIdByArchivedContent } from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/by-archived-content";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const contentId = request.nextUrl.searchParams
        .get("contentId")
        ?.trim();
      if (!contentId) {
        return NextResponse.json(
          { success: false, error: "`contentId` is required" },
          { status: 400 },
        );
      }
      const conversationId = await findConversationIdByArchivedContent(
        session.user.id,
        contentId,
      );
      return NextResponse.json({
        success: true,
        data: { conversationId },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Authentication required"
      ) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "conversations_by_archived:get:caught",
        summary: `GET ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        { success: false, error: "Lookup failed" },
        { status: 500 },
      );
    }
  });
}
