/**
 * Fork (branch) a conversation — Session 5a+.
 *
 * POST /api/conversations/[id]/fork
 *   body: { uptoMessageId?: string }
 *
 * Copies the source conversation's non-hidden messages (all, or up to and
 * including `uptoMessageId`) into a new Conversation that mirrors the
 * source's associations, so the branch appears alongside the original.
 *
 * Response: { success: true, data: { conversationId: string } }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ConversationNotFoundError,
  forkConversation,
} from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]/fork";

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
      const body = (await request
        .json()
        .catch(() => ({}))) as { uptoMessageId?: string };

      const conversationId = await forkConversation(
        session.user.id,
        id,
        typeof body.uptoMessageId === "string" ? body.uptoMessageId : undefined,
      );

      return NextResponse.json(
        { success: true, data: { conversationId } },
        { status: 201 },
      );
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
      // Capture the error class + message so prod investigations don't
      // have to grep the stack trace. Prisma errors carry .code (e.g.
      // P2002 unique violation, P2025 record not found) — surface it.
      const errName = error instanceof Error ? error.name : "Unknown";
      const errMsg = error instanceof Error ? error.message : String(error);
      const errCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : null;
      logger.error({
        layer: "ai",
        event: "conversation_fork:caught",
        summary: `POST ${ROUTE_PATH} caught — 500 (${errName}${errCode ? `:${errCode}` : ""})`,
        attrs: {
          err_name: errName,
          err_code: errCode ?? "none",
        },
        error,
      });
      // Surface a short error tag in the body so the client toast can
      // show something more actionable than "Fork failed". Avoid leaking
      // raw error.message verbatim — keep it scoped to known classes.
      const safeError =
        errCode && errCode.startsWith("P")
          ? `Fork failed (${errCode})`
          : `Fork failed (${errName})`;
      return NextResponse.json(
        { success: false, error: safeError },
        { status: 500 },
      );
    }
  });
}
