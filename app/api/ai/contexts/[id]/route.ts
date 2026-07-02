/**
 * Chat Contexts API — single-resource endpoint.
 *
 * PATCH  /api/ai/contexts/[id]   — edit  body: { name?, body? }
 * DELETE /api/ai/contexts/[id]   — soft-delete (sets deletedAt)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ChatContextNotFoundError,
  ChatContextValidationError,
  softDeleteChatContext,
  updateChatContext,
  type UpdateChatContextPatch,
} from "@/lib/features/chat-contexts";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/contexts/[id]";

interface RouteContext {
  params: Promise<{ id: string }>;
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
      const body = (await request.json()) as {
        name?: unknown;
        body?: unknown;
      };
      const patch: UpdateChatContextPatch = {};
      if (typeof body.name === "string") patch.name = body.name;
      if (typeof body.body === "string") patch.body = body.body;

      const data = await updateChatContext(session.user.id, id, patch);
      return NextResponse.json({ success: true, data });
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
      await softDeleteChatContext(session.user.id, id);
      return NextResponse.json({ success: true });
    } catch (error) {
      return handleError("DELETE", error);
    }
  });
}

function handleError(
  method: "PATCH" | "DELETE",
  error: unknown,
): NextResponse {
  if (error instanceof Error && error.message === "Authentication required") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  if (error instanceof ChatContextNotFoundError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 404 },
    );
  }
  if (error instanceof ChatContextValidationError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 },
    );
  }
  logger.error({
    layer: "ai",
    event: `chat_context:${method.toLowerCase()}:caught`,
    summary: `${method} ${ROUTE_PATH} caught — 500`,
    error,
  });
  return NextResponse.json(
    {
      success: false,
      error: "Chat context request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 },
  );
}
