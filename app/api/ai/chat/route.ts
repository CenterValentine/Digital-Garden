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
 *
 * Streaming observability: setup work runs under a withSpan. The
 * streamText call gets a startSpan/onFinish pair so the stream's lifetime
 * (which outlives this function) is captured. The span carries its own
 * trace_id so onFinish — which fires after ALS scope exits — still
 * emits with the correct trace association.
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
import { createEditorTools } from "@/lib/domain/ai/tools";
import { getProviderKey } from "@/lib/domain/ai/keys";
import { prisma } from "@/lib/database/client";
import { logger, spanPayload, startSpan, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/chat";

export async function POST(request: Request) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

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

      // Resolve API key: request body > stored BYOK key > env var (default)
      let apiKey: string | undefined = body.apiKey;
      if (!apiKey) {
        const storedKey = await getProviderKey(session.user.id, providerId);
        if (storedKey) apiKey = storedKey;
      }

      // Resolve model from provider registry (counts as setup work)
      const wrappedModel = await withSpan(
        { layer: "ai", name: "resolve_model" },
        {
          attrs: {
            provider: providerId,
            model: modelId,
            byok: apiKey !== undefined,
          },
          summary: `${providerId}:${modelId}`,
        },
        async () => {
          const model = await resolveChatModel({
            providerId,
            modelId,
            apiKey,
          });
          return applyMiddleware(model, [
            defaultSettingsMiddleware({ temperature, maxTokens }),
          ]);
        },
      );

      // Create tools bound to the authenticated user
      const toolChoice =
        (aiSettings as Record<string, unknown>).toolChoice ?? "auto";
      const toolCtx = { userId: session.user.id, contentId };
      const tools =
        toolChoice !== "none"
          ? {
              ...createBaseTools(toolCtx),
              ...(contentId ? createEditorTools(toolCtx) : {}),
            }
          : undefined;

      // Convert UIMessages to ModelMessages for streamText
      const modelMessages = await convertToModelMessages(messages);

      // Fetch mentioned content for @ mentions (max 5 to limit token usage)
      const mentionedContentIds: string[] = body.mentionedContentIds ?? [];
      let mentionedContext = "";
      if (mentionedContentIds.length > 0) {
        const mentionedNodes = await withSpan(
          { layer: "content", name: "mentions_fetch" },
          { attrs: { requested: mentionedContentIds.length } },
          async (span) => {
            const result = await prisma.contentNode.findMany({
              where: {
                id: { in: mentionedContentIds.slice(0, 5) },
                ownerId: session.user.id,
                deletedAt: null,
              },
              include: {
                notePayload: { select: { searchText: true } },
              },
            });
            span.attr("found", result.length).summary(`${result.length} mentions`);
            return result;
          },
        );

        if (mentionedNodes.length > 0) {
          const sections = mentionedNodes.map((node) => {
            const text =
              node.notePayload?.searchText || "(no text content available)";
            return `### ${node.title}\n${text.slice(0, 2000)}`;
          });
          mentionedContext = `\n\nThe user has referenced the following content:\n\n${sections.join("\n\n")}`;
        }
      }

      // Open the streaming span manually — it outlives this function via
      // streamText's onFinish callback. span.end() / span.fail() will emit
      // with the captured trace_id even after ALS scope exits.
      const streamSpan = startSpan(
        { layer: "ai", name: "chat_stream" },
        {
          attrs: {
            provider: providerId,
            model: modelId,
            messages: modelMessages.length,
            tools: tools ? Object.keys(tools).length : 0,
          },
          summary: `${providerId}:${modelId} streaming`,
        },
      );

      // Capture input messages + mention context to sidecar for replay.
      await spanPayload(streamSpan, "chat_input", {
        messages: modelMessages,
        mentionedContext,
        providerId,
        modelId,
        temperature,
        maxTokens,
      });

      const result = streamText({
        model: wrappedModel,
        messages: modelMessages,
        tools,
        toolChoice: toolChoice !== "none" ? "auto" : undefined,
        // Allow up to 8 model turns for multi-step tool workflows.
        // Editor tools may need: read → plan → diff → diff → diff → finish + final text.
        // Base chat tools typically need 2-3 steps.
        stopWhen: stepCountIs(contentId ? 8 : 5),
        system: `You are a helpful AI assistant in Digital Garden, a knowledge management application. Help the user with their notes, writing, and research. Be concise and helpful.

You have a generate_image tool that creates AI images from text prompts. When asked to generate, create, or draw an image, use this tool. Available providers: DALL·E 3, GPT Image 1, Imagen 3, FLUX (fal.ai/Together/Fireworks), DeepAI, RunwayML, Artbreeder. Default to DALL·E 3 unless specified. Write detailed prompts for best results.${
          contentId
            ? `\n\nThe user is currently viewing a document (ID: ${contentId}). You have editor tools available to read and edit this document.

IMPORTANT EDITING RULES:
- When the document has existing content, ALWAYS use apply_diff to make targeted changes or APPEND new content. NEVER use replace_document unless the user explicitly asks you overwrite the entire document.
- To add content (descriptions, text, images), APPEND it after the existing content using apply_diff. Do NOT overwrite what is already there.
- When asked to edit, always: 1) Read the document first with read_first_chunk, 2) Plan your approach if the edit is complex, 3) Apply changes with apply_diff for targeted edits, 4) Call finish_with_summary when done.
- Only use replace_document for blank/empty documents or when the user explicitly requests a full rewrite.

When you generate an image, the user can insert it into the document at their cursor position.`
            : ""
        }${mentionedContext}`,
        onFinish: async (finishEvent) => {
          // Token usage / finish reason live on the finishEvent shape. The
          // structure varies slightly across AI SDK versions; we read fields
          // defensively to avoid the span ending with bad attrs.
          const usage = (finishEvent as { usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }).usage;
          const finishReason = (finishEvent as { finishReason?: string }).finishReason;
          if (usage?.inputTokens !== undefined) streamSpan.attr("input_tokens", usage.inputTokens);
          if (usage?.outputTokens !== undefined) streamSpan.attr("output_tokens", usage.outputTokens);
          if (usage?.totalTokens !== undefined) streamSpan.attr("total_tokens", usage.totalTokens);
          if (finishReason) streamSpan.attr("finish_reason", finishReason);
          // Capture the full finish event to sidecar for replay.
          await spanPayload(streamSpan, "chat_finish", finishEvent);
          streamSpan.end("ok");
        },
        onError: ({ error }) => {
          streamSpan.fail(error);
        },
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

      logger.error({
        layer: "ai",
        event: "chat:caught",
        summary: "chat setup failed — 500",
        error,
      });
      return Response.json(
        {
          success: false,
          error: { code: "SERVER_ERROR", message: "Chat request failed" },
        },
        { status: 500 }
      );
    }
  });
}
