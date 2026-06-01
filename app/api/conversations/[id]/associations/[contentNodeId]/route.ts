/**
 * Conversation association removal — Session 4a.
 *
 * DELETE /api/conversations/[id]/associations/[contentNodeId]   — unpin
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { removeAssociation } from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]/associations/[contentNodeId]";

interface RouteContext {
  params: Promise<{ id: string; contentNodeId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id, contentNodeId } = await context.params;
      await removeAssociation(session.user.id, id, contentNodeId);
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
      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("not owned"))
      ) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 404 },
        );
      }
      logger.error({
        layer: "ai",
        event: "association:delete:caught",
        summary: `DELETE ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Association removal failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  });
}
