/**
 * Conversation associations — Session 4a.
 *
 * GET  /api/conversations/[id]/associations          — list associations
 * POST /api/conversations/[id]/associations          — pin (create manual)
 *   body: { contentNodeId: string }
 *
 * Removal lives at /api/conversations/[id]/associations/[contentNodeId].
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  addManualAssociation,
  listAssociations,
} from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]/associations";

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
      const items = await listAssociations(session.user.id, id);
      return NextResponse.json({ success: true, data: { items } });
    } catch (error) {
      return handleError("GET", error);
    }
  });
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
      const body = (await request.json()) as { contentNodeId?: string };
      if (!body.contentNodeId || typeof body.contentNodeId !== "string") {
        return NextResponse.json(
          { success: false, error: "`contentNodeId` is required" },
          { status: 400 },
        );
      }
      const created = await addManualAssociation(
        session.user.id,
        id,
        body.contentNodeId,
      );
      return NextResponse.json(
        { success: true, data: created },
        { status: 201 },
      );
    } catch (error) {
      return handleError("POST", error);
    }
  });
}

function handleError(method: "GET" | "POST", error: unknown): NextResponse {
  if (error instanceof Error && error.message === "Authentication required") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  // Ownership-gated service throws plain Error for not-found / not-owned.
  // Treat as 404 so the client can show "this content/chat is gone."
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
    event: `associations:${method.toLowerCase()}:caught`,
    summary: `${method} ${ROUTE_PATH} caught — 500`,
    error,
  });
  return NextResponse.json(
    {
      success: false,
      error: "Association request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 },
  );
}
