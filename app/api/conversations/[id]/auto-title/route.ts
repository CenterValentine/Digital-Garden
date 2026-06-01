/**
 * Auto-title endpoint — Session 4a extension.
 *
 * POST /api/conversations/[id]/auto-title
 *
 * Uses the `chat-title-generation` feature route (Session 3.6) to ask
 * a cheap model for a 3–5 word title from the conversation's first
 * exchange, then PATCHes the conversation. Idempotent: if a title is
 * already set, returns it without spending tokens.
 *
 * Response: { success: true, data: { title: string | null, skipped: boolean, reason?: string } }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import {
  resolveFeatureRoute,
  executeWithFallback,
  NoRoutesAvailableError,
} from "@/lib/domain/ai/features";
import { resolveChatModelFromConnection } from "@/lib/domain/ai/providers/registry";
import { publishConversationEvent } from "@/lib/features/conversations/events";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]/auto-title";
const MAX_TITLE_CHARS = 80;
const FIRST_TURN_MESSAGE_LIMIT = 3;

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

      const conv = await prisma.conversation.findFirst({
        where: { id, ownerId: session.user.id, deletedAt: null },
        include: {
          messages: {
            where: { isHidden: false },
            orderBy: { createdAt: "asc" },
            take: FIRST_TURN_MESSAGE_LIMIT,
          },
        },
      });
      if (!conv) {
        return NextResponse.json(
          { success: false, error: "Conversation not found" },
          { status: 404 },
        );
      }

      // Already titled → return existing and short-circuit.
      if (conv.title && conv.title.trim().length > 0) {
        return NextResponse.json({
          success: true,
          data: { title: conv.title, skipped: true, reason: "already_titled" },
        });
      }

      // Need at least a user message to base a title on.
      const userMsgs = conv.messages.filter((m) => m.role === "user");
      if (userMsgs.length === 0) {
        return NextResponse.json({
          success: true,
          data: { title: null, skipped: true, reason: "no_messages" },
        });
      }

      // Resolve feature route. If nothing is configured AND no default
      // suggestion matches the user's connections, silently skip.
      const routes = await resolveFeatureRoute(
        session.user.id,
        "chat-title-generation",
      );
      if (routes.length === 0) {
        return NextResponse.json({
          success: true,
          data: { title: null, skipped: true, reason: "no_route" },
        });
      }

      // Build a compact prompt from the first ~3 messages.
      const conversationText = conv.messages
        .map((m) => {
          const text = extractText(m.parts);
          if (!text) return null;
          return `${m.role === "user" ? "User" : "Assistant"}: ${text.slice(0, 500)}`;
        })
        .filter(Boolean)
        .join("\n\n");

      const systemPrompt =
        "You generate concise chat titles. Respond with ONLY a 3-5 word title in title case. No quotes, no punctuation, no markdown, no commentary.";

      const generated = await withSpan(
        { layer: "ai", name: "auto_title" },
        {
          attrs: {
            conversation_id: id,
            route_count: routes.length,
          },
        },
        async () =>
          executeWithFallback({
            featureId: "chat-title-generation",
            routes,
            attempt: async ({ route }) => {
              const model = await resolveChatModelFromConnection(
                route.connection,
                route.modelId,
              );
              const { text } = await generateText({
                model,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: conversationText },
                ],
                maxOutputTokens: 30,
              });
              return text;
            },
          }),
      );

      const title = sanitizeTitle(generated);
      if (!title) {
        return NextResponse.json({
          success: true,
          data: { title: null, skipped: true, reason: "empty_response" },
        });
      }

      await prisma.conversation.update({
        where: { id },
        data: { title },
      });

      // Keep the backing chat ContentNode's title in sync (file tree +
      // workspace tabs are ContentNode-driven) when archive-linked.
      if (conv.archivedToContentNodeId) {
        await prisma.contentNode.updateMany({
          where: {
            id: conv.archivedToContentNodeId,
            ownerId: session.user.id,
          },
          data: { title },
        });
      }

      publishConversationEvent(session.user.id, {
        type: "conversation.updated",
        conversationId: id,
        title,
        at: new Date().toISOString(),
      });

      logger.info({
        layer: "ai",
        event: "conv.auto_title",
        summary: `auto-title set for ${id}`,
        attrs: { conversation_id: id, title_chars: title.length },
      });

      return NextResponse.json({
        success: true,
        data: { title, skipped: false },
      });
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
      if (error instanceof NoRoutesAvailableError) {
        return NextResponse.json({
          success: true,
          data: { title: null, skipped: true, reason: "no_route" },
        });
      }
      logger.error({
        layer: "ai",
        event: "auto_title:caught",
        summary: `POST ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Auto-title failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  });
}

/** Pull plain text out of a UIMessage parts array (JSON-stored). */
function extractText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter(
      (p): p is { type: "text"; text: string } =>
        typeof p === "object" &&
        p !== null &&
        (p as { type?: string }).type === "text" &&
        typeof (p as { text?: string }).text === "string",
    )
    .map((p) => p.text)
    .join(" ")
    .trim();
}

/**
 * Clean up model output: strip wrapping quotes, trailing punctuation,
 * markdown emphasis markers, and enforce a length cap. Models love to
 * over-elaborate even when told not to.
 */
function sanitizeTitle(raw: string): string {
  let t = raw.trim();
  // Strip leading "Title:" / "Chat title:" prefixes if the model added them.
  t = t.replace(/^(chat\s+)?title\s*:?\s*/i, "");
  // Strip surrounding quotes / backticks / asterisks.
  t = t.replace(/^[`*"'“‘]+|[`*"'”’.,!?:;]+$/g, "");
  // Strip newlines — single-line title.
  t = t.split(/\r?\n/, 1)[0]?.trim() ?? "";
  // Length cap.
  if (t.length > MAX_TITLE_CHARS) {
    t = t.slice(0, MAX_TITLE_CHARS).trim();
  }
  return t;
}
