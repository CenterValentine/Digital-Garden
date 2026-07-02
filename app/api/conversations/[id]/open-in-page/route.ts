/**
 * Open a conversation in the full-page ChatViewer — Session 5a+.
 *
 * POST /api/conversations/[id]/open-in-page
 *
 * The full-page viewer is keyed by a chat ContentNode, so this ensures
 * one exists for the conversation (creating + archive-linking it if
 * needed) and returns its id for the client to navigate to. Idempotent.
 *
 * Response: { success: true, data: { contentNodeId: string } }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ConversationNotFoundError,
  ensureConversationContentNode,
} from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]/open-in-page";

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

      const contentNodeId = await ensureConversationContentNode(
        session.user.id,
        id,
      );

      return NextResponse.json({ success: true, data: { contentNodeId } });
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
      const errName = error instanceof Error ? error.name : "Unknown";
      const errCode =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : null;
      logger.error({
        layer: "ai",
        event: "conversation_open_in_page:caught",
        summary: `POST ${ROUTE_PATH} caught — 500 (${errName}${errCode ? `:${errCode}` : ""})`,
        attrs: {
          err_name: errName,
          err_code: errCode ?? "none",
        },
        error,
      });
      const safeError =
        errCode && errCode.startsWith("P")
          ? `Open-in-page failed (${errCode})`
          : `Open-in-page failed (${errName})`;
      return NextResponse.json(
        { success: false, error: safeError },
        { status: 500 },
      );
    }
  });
}
