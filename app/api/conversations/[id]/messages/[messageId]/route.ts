/**
 * PATCH /api/conversations/[id]/messages/[messageId] — update a message's
 * parts in place (AI v3 core S4: continuation persistence).
 *
 * Approval resumes extend an already-persisted assistant message. The
 * client persister creates rows once and skips saved ids, so continuation
 * content (resolved approvals, post-approval text) needs this update path
 * or it evaporates on reload.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { updateMessageParts } from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]/messages/[messageId]";

interface RouteContext {
  params: Promise<{ id: string; messageId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id: conversationId, messageId } = await context.params;
      const body = (await request.json()) as {
        parts?: unknown;
        textCache?: string | null;
        metadata?: unknown;
      };
      if (body.parts === undefined || body.parts === null) {
        return NextResponse.json(
          { success: false, error: "parts is required" },
          { status: 400 },
        );
      }
      const updated = await updateMessageParts(
        session.user.id,
        conversationId,
        messageId,
        body.parts,
        body.textCache,
        body.metadata,
      );
      if (!updated) {
        return NextResponse.json(
          { success: false, error: "Message not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true });
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
        event: "conversation_message:patch:caught",
        summary: `PATCH ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        { success: false, error: "Message update failed" },
        { status: 500 },
      );
    }
  });
}
