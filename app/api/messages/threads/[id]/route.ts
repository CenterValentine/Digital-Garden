/**
 * Messages API — single thread.
 *
 * GET /api/messages/threads/[id]
 *   ?cursor=<messageId>          — history pagination (older messages)
 *   ?after=<ISO>&active=true     — fast-poll delta; active=true also updates
 *                                  the viewing heartbeat and marks the
 *                                  thread read (suppresses bell noise while
 *                                  the conversation is open)
 * DELETE /api/messages/threads/[id] — hide the thread for the current user
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  deleteThreadForUser,
  getThreadMessages,
  markThreadRead,
  touchThreadActivity,
} from "@/lib/domain/messaging";
import { handleMessagingRouteError } from "@/lib/domain/messaging/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/messages/threads/[id]";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;

      const params = request.nextUrl.searchParams;
      const cursor = params.get("cursor") ?? undefined;
      const after = params.get("after") ?? undefined;
      const active = params.get("active") === "true";
      const limitParam = Number.parseInt(params.get("limit") ?? "", 10);
      const limit = Number.isFinite(limitParam) ? limitParam : undefined;

      const data = await getThreadMessages(session.user.id, id, {
        cursor,
        after,
        limit,
      });

      if (active) {
        await touchThreadActivity(session.user.id, id);
        await markThreadRead(session.user.id, id);
      }

      return NextResponse.json({ success: true, data });
    } catch (error) {
      return handleMessagingRouteError("messages_thread_get", error);
    }
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;
      await deleteThreadForUser(session.user.id, id);
      return NextResponse.json({ success: true, data: { id } });
    } catch (error) {
      return handleMessagingRouteError("messages_thread_delete", error);
    }
  });
}
