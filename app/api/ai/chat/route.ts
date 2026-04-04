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
import { createEditorTools } from "@/lib/domain/ai/tools";
import { getProviderKey } from "@/lib/domain/ai/keys";
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

    // Resolve API key: request body > stored BYOK key > env var (default)
    let apiKey: string | undefined = body.apiKey;
    if (!apiKey) {
      const storedKey = await getProviderKey(session.user.id, providerId);
      if (storedKey) apiKey = storedKey;
    }

    // Resolve model from provider registry
    const model = await resolveChatModel({
      providerId,
      modelId,
      apiKey,
    });

    // Apply middleware stack
    const wrappedModel = applyMiddleware(model, [
      defaultSettingsMiddleware({ temperature, maxTokens }),
    ]);

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

    // Sprint 45: Auto-inject user's knowledge snippets into system prompt
    let snippetContext = "";
    try {
      const aiSnippets = await prisma.snippet.findMany({
        where: {
          userId: session.user.id,
          isAiContext: true,
        },
        select: {
          title: true,
          content: true,
          category: { select: { name: true } },
        },
        orderBy: { lastUsedAt: "desc" },
        take: 20,
      });

      if (aiSnippets.length > 0) {
        const formatted = aiSnippets.map((s) => {
          const title = s.title || s.content.split("\n")[0].slice(0, 60);
          return `- [${s.category.name}] ${title}: ${s.content.slice(0, 300)}`;
        });
        snippetContext = `\n\nThe user has saved the following knowledge snippets for your reference:\n\n${formatted.join("\n")}`;
      }
    } catch {
      // Non-critical — continue without snippets
    }

    // Include snippet IDs from chat area snippet menu
    const snippetIds: string[] = body.snippetIds ?? [];
    let selectedSnippetContext = "";
    if (snippetIds.length > 0) {
      try {
        const selectedSnippets = await prisma.snippet.findMany({
          where: {
            id: { in: snippetIds.slice(0, 10) },
            userId: session.user.id,
          },
          select: {
            title: true,
            content: true,
            category: { select: { name: true } },
          },
        });

        if (selectedSnippets.length > 0) {
          const formatted = selectedSnippets.map((s) => {
            const title = s.title || s.content.split("\n")[0].slice(0, 60);
            return `### ${title}\n${s.content}`;
          });
          selectedSnippetContext = `\n\nThe user has attached the following snippets to this message:\n\n${formatted.join("\n\n")}`;
        }
      } catch {
        // Non-critical
      }
    }

    // Stream the response
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
      }${mentionedContext}${snippetContext}${selectedSnippetContext}`,
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
