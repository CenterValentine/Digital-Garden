/**
 * Conversations by content — Session 4a.
 *
 * GET /api/conversations/by-content?ids=a,b,c
 *
 * Returns conversations that are associated with any of the given
 * content node ids, along with their associations restricted to that
 * id set. Used by the sidebar tab strip to populate tabs for the
 * currently-open panels.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { listConversationsByContent } from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/by-content";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const url = new URL(request.url);
      const idsParam = url.searchParams.get("ids");
      if (!idsParam) {
        return NextResponse.json({ success: true, data: { items: [] } });
      }
      const contentNodeIds = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (contentNodeIds.length === 0) {
        return NextResponse.json({ success: true, data: { items: [] } });
      }

      const items = await listConversationsByContent(
        session.user.id,
        contentNodeIds,
      );
      return NextResponse.json({ success: true, data: { items } });
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
        event: "conversations_by_content:get:caught",
        summary: `GET ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Lookup failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  });
}
