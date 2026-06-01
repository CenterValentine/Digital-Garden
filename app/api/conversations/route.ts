/**
 * Conversations API — collection endpoint.
 *
 * GET  /api/conversations               — list user's conversations
 *   ?forContentNodeIds=id1,id2          (optional) restrict to chats
 *                                       associated with any of these nodes
 *   ?cursor=<conv-id>                   (optional) pagination
 *   ?limit=<n>                          (optional) page size (max 100)
 *
 * POST /api/conversations               — create a new conversation
 *   body: { title?: string,
 *           snapshotContentNodeIds?: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  createConversation,
  listConversations,
  type CreateConversationInput,
  type ListConversationsOptions,
} from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const url = new URL(request.url);
      const opts: ListConversationsOptions = {};

      const forIdsParam = url.searchParams.get("forContentNodeIds");
      if (forIdsParam) {
        opts.forContentNodeIds = forIdsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const cursor = url.searchParams.get("cursor");
      if (cursor) opts.cursor = cursor;

      const limitParam = url.searchParams.get("limit");
      if (limitParam) {
        const n = Number.parseInt(limitParam, 10);
        if (Number.isFinite(n) && n > 0) opts.limit = n;
      }

      const items = await withSpan(
        { layer: "ai", name: "conv.list" },
        {
          attrs: {
            for_content_count: opts.forContentNodeIds?.length ?? 0,
            paginated: opts.cursor !== undefined,
          },
        },
        async () => listConversations(session.user.id, opts),
      );

      return NextResponse.json({
        success: true,
        data: { items },
      });
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

      const body = (await request.json()) as Partial<CreateConversationInput>;

      const input: CreateConversationInput = {
        title: body.title ?? null,
        snapshotContentNodeIds: Array.isArray(body.snapshotContentNodeIds)
          ? body.snapshotContentNodeIds.filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            )
          : undefined,
        fromContentNodeId:
          typeof body.fromContentNodeId === "string" &&
          body.fromContentNodeId.length > 0
            ? body.fromContentNodeId
            : undefined,
      };

      const conversation = await createConversation(session.user.id, input);

      return NextResponse.json(
        { success: true, data: conversation },
        { status: 201 },
      );
    } catch (error) {
      return handleError("POST", error);
    }
  });
}

function handleError(method: "GET" | "POST", error: unknown): NextResponse {
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
    event: `conversations:${method.toLowerCase()}:caught`,
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
