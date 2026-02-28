/**
 * AI Chat API Route
 *
 * POST /api/ai/chat — Streaming chat endpoint.
 *
 * Flow: requireAuth() → Zod validate → load user settings →
 *       resolveChatModel() → applyMiddleware() → streamText() →
 *       toUIMessageStreamResponse()
 *
 * The response uses AI SDK's streaming format, consumed by
 * useChat() on the client.
 */

import { streamText } from "ai";
import { z } from "zod";
import { requireAuth } from "@/lib/infrastructure/auth";
import { getUserSettings } from "@/lib/features/settings";
import { resolveChatModel } from "@/lib/domain/ai/providers/registry";
import {
  applyMiddleware,
  defaultSettingsMiddleware,
} from "@/lib/domain/ai/middleware";

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })
  ),
  // Optional overrides (client can override user settings per-request)
  contentId: z.string().uuid().optional(),
  providerId: z.enum(["anthropic", "openai"]).optional(),
  modelId: z.string().optional(),
  apiKey: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(200_000).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireAuth();

    const body = await request.json();
    const validated = chatRequestSchema.parse(body);

    // Load user's stored AI settings as defaults
    const userSettings = await getUserSettings(session.user.id);
    const aiSettings = userSettings.ai ?? {};

    // Resolve provider and model — request overrides > user settings > defaults
    const providerId = validated.providerId ?? aiSettings.providerId ?? "anthropic";
    const modelId = validated.modelId ?? aiSettings.modelId ?? "claude-sonnet-3-5";
    const temperature = validated.temperature ?? aiSettings.temperature ?? 0.7;
    const maxTokens = validated.maxTokens ?? aiSettings.maxTokens ?? 4096;

    // Check if AI is enabled
    if (aiSettings.enabled === false) {
      return Response.json(
        {
          success: false,
          error: { code: "AI_DISABLED", message: "AI features are disabled in settings" },
        },
        { status: 403 }
      );
    }

    // Resolve model from provider registry
    const model = await resolveChatModel({
      providerId,
      modelId,
      apiKey: validated.apiKey,
    });

    // Apply middleware stack
    const wrappedModel = applyMiddleware(model, [
      defaultSettingsMiddleware({ temperature, maxTokens }),
    ]);

    // Stream the response
    const result = streamText({
      model: wrappedModel,
      messages: validated.messages,
      system: `You are a helpful AI assistant in Digital Garden, a knowledge management application. Help the user with their notes, writing, and research. Be concise and helpful.`,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: error.issues[0]?.message ?? "Invalid request",
          },
        },
        { status: 400 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "Authentication required"
    ) {
      return Response.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
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
