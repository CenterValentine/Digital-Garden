/**
 * Conversations API — single-resource endpoint.
 *
 * GET    /api/conversations/[id]   — fetch with messages + associations
 * PATCH  /api/conversations/[id]   — update title (Session 2 scope)
 *   body: { title?: string | null }
 * DELETE /api/conversations/[id]   — soft-delete (sets deletedAt)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ConversationNotFoundError,
  getConversation,
  softDeleteConversation,
  updateConversation,
  type UpdateConversationPatch,
} from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]";

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
      const conversation = await getConversation(session.user.id, id);

      return NextResponse.json({ success: true, data: conversation });
    } catch (error) {
      return handleError("GET", error);
    }
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const { id } = await context.params;
      const body = (await request.json()) as Partial<UpdateConversationPatch>;

      const patch: UpdateConversationPatch = {};
      if (body.title !== undefined) patch.title = body.title;
      if (body.activeContextId !== undefined)
        patch.activeContextId = body.activeContextId;

      const summary = await updateConversation(session.user.id, id, patch);
      return NextResponse.json({ success: true, data: summary });
    } catch (error) {
      return handleError("PATCH", error);
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
      await softDeleteConversation(session.user.id, id);

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleError("DELETE", error);
    }
  });
}

function handleError(
  method: "GET" | "PATCH" | "DELETE",
  error: unknown,
): NextResponse {
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
    event: `conversation:${method.toLowerCase()}:caught`,
    summary: `${method} ${ROUTE_PATH} caught — 500`,
    error,
  });
  return NextResponse.json(
    {
      success: false,
      error: "Conversation request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 },
  );
}
