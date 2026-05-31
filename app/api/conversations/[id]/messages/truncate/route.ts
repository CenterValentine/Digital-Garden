/**
 * Message truncation (edit / regenerate supersession) — Session 5a.
 *
 * POST /api/conversations/[id]/messages/truncate
 *   body: { fromMessageId: string, inclusive?: boolean }
 *
 * Soft-hides the anchor message (when `inclusive`) and everything created
 * after it, implementing the reconcile model: the surface truncates its
 * visible list to the edit/regenerate point, calls this, then sends the
 * new turn — leaving the conversation's non-hidden rows equal to what the
 * user sees.
 *
 * Response: { success: true, data: { hidden: number } }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ConversationNotFoundError,
  hideMessagesFrom,
} from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]/messages/truncate";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;
      const body = (await request.json()) as {
        fromMessageId?: string;
        inclusive?: boolean;
      };
      if (!body.fromMessageId || typeof body.fromMessageId !== "string") {
        return NextResponse.json(
          { success: false, error: "`fromMessageId` is required" },
          { status: 400 },
        );
      }

      const hidden = await hideMessagesFrom(
        session.user.id,
        id,
        body.fromMessageId,
        body.inclusive ?? true,
      );

      return NextResponse.json({ success: true, data: { hidden } });
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
      if (error instanceof ConversationNotFoundError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 404 },
        );
      }
      logger.error({
        layer: "ai",
        event: "messages_truncate:caught",
        summary: `POST ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        { success: false, error: "Truncate failed" },
        { status: 500 },
      );
    }
  });
}
