/**
 * Messages API — single message.
 *
 * DELETE /api/messages/threads/[id]/messages/[messageId] — soft-delete own
 * message (renders as a "message deleted" placeholder for both sides)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { deleteMessage } from "@/lib/domain/messaging";
import { handleMessagingRouteError } from "@/lib/domain/messaging/route-errors";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/messages/threads/[id]/messages/[messageId]";

interface RouteContext {
  params: Promise<{ id: string; messageId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id, messageId } = await context.params;
      await deleteMessage(session.user.id, id, messageId);
      return NextResponse.json({ success: true, data: { id: messageId } });
    } catch (error) {
      return handleMessagingRouteError("messages_delete", error);
    }
  });
}
