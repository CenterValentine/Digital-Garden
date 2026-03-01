/**
 * AI Chat API Route
 *
 * POST /api/ai/chat — Streaming chat endpoint.
 *
 * Flow: requireAuth() → validate → load user settings →
 *       resolveChatModel() → applyMiddleware() → createBaseTools() →
 *       streamText() → toUIMessageStreamResponse()
 *
 * The response uses AI SDK's streaming format, consumed by
 * useChat() on the client.
 *
 * Messages arrive as UIMessage[] (with parts arrays) from AI SDK v6's
 * useChat hook. We use convertToModelMessages() to convert them for
 * streamText().
 */

import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { requireAuth } from "@/lib/infrastructure/auth";
import { getUserSettings } from "@/lib/features/settings";
import { resolveChatModel } from "@/lib/domain/ai/providers/registry";
import {
  applyMiddleware,
  defaultSettingsMiddleware,
} from "@/lib/domain/ai/middleware";
import { createBaseTools } from "@/lib/domain/ai/tools";
import { prisma } from "@/lib/database/client";

export async function POST(request: Request) {
  try {
    const session = await requireAuth();

    const body = await request.json();

    // AI SDK v6 sends messages as UIMessage[] with `parts` arrays
    const messages: UIMessage[] = body.messages ?? [];
    const contentId: string | undefined = body.contentId;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Messages array is required and must not be empty",
          },
        },
        { status: 400 }
      );
    }

    // Load user's stored AI settings as defaults
    const userSettings = await getUserSettings(session.user.id);
    const aiSettings = userSettings.ai ?? {};

    // Resolve provider and model — request overrides > user settings > defaults
    const providerId =
      body.providerId ?? aiSettings.providerId ?? "anthropic";
    const modelId =
      body.modelId ?? aiSettings.modelId ?? "claude-sonnet-3-5";
    const temperature =
      body.temperature ?? aiSettings.temperature ?? 0.7;
    const maxTokens =
      body.maxTokens ?? aiSettings.maxTokens ?? 4096;

    // Check if AI is enabled
    if (aiSettings.enabled === false) {
      return Response.json(
        {
          success: false,
          error: {
            code: "AI_DISABLED",
            message: "AI features are disabled in settings",
          },
        },
        { status: 403 }
      );
    }

    // Resolve model from provider registry
    const model = await resolveChatModel({
      providerId,
      modelId,
      apiKey: body.apiKey,
    });

    // Apply middleware stack
    const wrappedModel = applyMiddleware(model, [
      defaultSettingsMiddleware({ temperature, maxTokens }),
    ]);

    // Create tools bound to the authenticated user
    const toolChoice =
      (aiSettings as Record<string, unknown>).toolChoice ?? "auto";
    const tools =
      toolChoice !== "none"
        ? createBaseTools({ userId: session.user.id })
        : undefined;

    // Convert UIMessages to ModelMessages for streamText
    const modelMessages = await convertToModelMessages(messages);

    // Fetch mentioned content for @ mentions (max 5 to limit token usage)
    const mentionedContentIds: string[] = body.mentionedContentIds ?? [];
    let mentionedContext = "";
    if (mentionedContentIds.length > 0) {
      const mentionedNodes = await prisma.contentNode.findMany({
        where: {
          id: { in: mentionedContentIds.slice(0, 5) },
          ownerId: session.user.id,
          deletedAt: null,
        },
        include: {
          notePayload: { select: { searchText: true } },
        },
      });

      if (mentionedNodes.length > 0) {
        const sections = mentionedNodes.map((node) => {
          const text =
            node.notePayload?.searchText || "(no text content available)";
          return `### ${node.title}\n${text.slice(0, 2000)}`;
        });
        mentionedContext = `\n\nThe user has referenced the following content:\n\n${sections.join("\n\n")}`;
      }
    }

    // Stream the response
    const result = streamText({
      model: wrappedModel,
      messages: modelMessages,
      tools,
      toolChoice: toolChoice !== "none" ? "auto" : undefined,
      // Allow up to 3 model turns so tool calls get a follow-up text response.
      // Turn 1: model may call a tool. Turn 2: model processes tool result
      // (may call another tool). Turn 3: final text response.
      stopWhen: stepCountIs(3),
      system: `You are a helpful AI assistant in Digital Garden, a knowledge management application. Help the user with their notes, writing, and research. Be concise and helpful.${
        contentId
          ? `\n\nThe user is currently viewing content with ID: ${contentId}`
          : ""
      }${mentionedContext}`,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Authentication required"
    ) {
      return Response.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        { status: 401 }
      );
    }

    console.error("POST /api/ai/chat error:", error);
    return Response.json(
      {
        success: false,
        error: { code: "SERVER_ERROR", message: "Chat request failed" },
      },
      { status: 500 }
    );
  }
}
