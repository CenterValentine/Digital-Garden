/**
 * Chat Contexts API — collection endpoint.
 *
 * GET  /api/ai/contexts   — list the current user's contexts (newest first)
 * POST /api/ai/contexts   — create a context  body: { name, body }
 *
 * Contexts are user-authored custom-instruction presets surfaced in the
 * chat composer. See lib/features/chat-contexts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ChatContextValidationError,
  createChatContext,
  listChatContexts,
} from "@/lib/features/chat-contexts";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/contexts";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const data = await listChatContexts(session.user.id);
      return NextResponse.json({ success: true, data });
    } catch (error) {
      return handleError("GET", error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = (await request.json()) as {
        name?: unknown;
        body?: unknown;
      };
      const data = await createChatContext(session.user.id, {
        name: typeof body.name === "string" ? body.name : "",
        body: typeof body.body === "string" ? body.body : "",
      });
      return NextResponse.json({ success: true, data }, { status: 201 });
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
