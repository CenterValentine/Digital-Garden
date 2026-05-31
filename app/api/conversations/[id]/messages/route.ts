/**
 * Conversation messages API — append endpoint.
 *
 * POST /api/conversations/[id]/messages — append a message.
 *   body: {
 *     id?: string,
 *     role: ChatMessageRole,
 *     providerId?: string,
 *     modelId?: string,
 *     parts: UIMessagePart[],
 *     textCache?: string,
 *     metadata?: Record<string, unknown>,
 *     parentId?: string,
 *   }
 *
 * Listing messages is served by GET /api/conversations/[id] (which
 * returns the full ConversationDetail including messages + associations).
 * Splitting them here is a future-session concern only if we hit
 * payload-size pressure.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  ConversationNotFoundError,
  appendMessage,
  type AppendMessageInput,
  type ChatMessageRole,
} from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]/messages";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_ROLES: ChatMessageRole[] = [
  "user",
  "assistant",
  "system",
  "tool",
];

function isValidRole(role: unknown): role is ChatMessageRole {
  return (
    typeof role === "string" &&
    (VALID_ROLES as readonly string[]).includes(role)
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const { id: conversationId } = await context.params;
      const body = (await request.json()) as Partial<AppendMessageInput>;

      if (!isValidRole(body.role)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid role",
            details: `role must be one of ${VALID_ROLES.join(", ")}`,
          },
          { status: 400 },
        );
      }
      if (body.parts === undefined || body.parts === null) {
        return NextResponse.json(
          { success: false, error: "parts is required" },
          { status: 400 },
        );
      }

      const input: AppendMessageInput = {
        id: typeof body.id === "string" ? body.id : undefined,
        role: body.role,
        providerId:
          typeof body.providerId === "string" ? body.providerId : null,
        modelId: typeof body.modelId === "string" ? body.modelId : null,
        parts: body.parts,
        textCache:
          typeof body.textCache === "string" ? body.textCache : null,
        metadata:
          body.metadata && typeof body.metadata === "object"
            ? (body.metadata as Record<string, unknown>)
            : null,
        parentId:
          typeof body.parentId === "string" ? body.parentId : null,
      };

      // TEMP DIAGNOSTIC (A1-DEBUG): log what the client sent so we can
      // verify the chain. Remove once token capture is confirmed.
      const dbgUsage = (input.metadata as { usage?: Record<string, unknown> } | null)?.usage;
      logger.info({
        layer: "ai",
        event: "conversation.message.append",
        summary: `[A1-DEBUG] persist ${input.role}`,
        attrs: {
          role: input.role,
          provider: input.providerId ?? null,
          model: input.modelId ?? null,
          has_metadata: input.metadata != null,
          has_usage: dbgUsage != null,
          input_tokens: (dbgUsage as { inputTokens?: number } | undefined)?.inputTokens ?? null,
          output_tokens: (dbgUsage as { outputTokens?: number } | undefined)?.outputTokens ?? null,
        },
      });

      const message = await appendMessage(
        session.user.id,
        conversationId,
        input,
      );

      return NextResponse.json(
        { success: true, data: message },
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

      logger.error({
        layer: "ai",
        event: "conversation_message:post:caught",
        summary: `POST ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Message append failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  });
}
