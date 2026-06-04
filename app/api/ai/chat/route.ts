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
import {
  resolveChatModel,
  resolveChatModelFromConnection,
  BYOKRequiredError,
} from "@/lib/domain/ai/providers/registry";
import { isGatewayEnabled } from "@/lib/domain/ai/providers/gateway";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";

/**
 * JSON-safe shape compatible with AI SDK's `providerOptions` (whose
 * underlying type is `Record<string, JSONObject>`). Re-declared locally
 * because the canonical `SharedV3ProviderOptions` lives in `@ai-sdk/provider`,
 * which isn't a direct dep — we only need a structural match.
 */
type JSONValueLite =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JSONValueLite }
  | JSONValueLite[];
type ProviderOptionsLite = Record<string, Record<string, JSONValueLite>>;

/**
 * Build per-provider `providerOptions` for streamText based on the
 * model's reasoning posture in the catalog. Returns undefined when no
 * options are needed so we don't pass empty objects through. Session 6.
 */
function buildProviderOptions(
  providerId: string,
  modelId: string,
): ProviderOptionsLite | undefined {
  const model = PROVIDER_CATALOG
    .find((p) => p.id === providerId)
    ?.models.find((m) => m.id === modelId);
  if (!model || model.reasoning !== "enabled") return undefined;

  if (providerId === "anthropic") {
    return {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: model.thinkingBudgetTokens ?? 5_000,
        },
      },
    };
  }
  if (providerId === "google") {
    return {
      google: {
        thinkingConfig: { includeThoughts: true },
      },
    };
  }
  return undefined;
}
import {
  getConnectionWithKey,
  listConnections,
  ConnectionNotFoundError,
} from "@/lib/features/ai-connections";
import { addAutoAssociation } from "@/lib/features/conversations";
import { extractContentIdsFromToolCall } from "@/lib/domain/ai/tools/content-id-args";
import {
  resolvePrimaryRoute,
} from "@/lib/domain/ai/features";
import type {
  ConnectionView,
  ConnectionWithKey,
} from "@/lib/features/ai-connections";
import {
  applyMiddleware,
  defaultSettingsMiddleware,
} from "@/lib/domain/ai/middleware";
import { createBaseTools } from "@/lib/domain/ai/tools";
import { createEditorTools } from "@/lib/domain/ai/tools";
import { createFlashcardTools } from "@/lib/domain/ai/tools";
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

      // ─── Model resolution — connection-first, with legacy fallback ───
      //
      // 1. If the body carries an explicit `connectionId` (new picker path),
      //    fetch that connection and route through it.
      // 2. Else look up a user connection whose presetId matches `providerId`
      //    (transition shim for the old picker until S4 lands the new one).
      // 3. Else consult the feature router for the "chat" feature's primary
      //    route (uses the registry default when nothing's configured).
      // 4. Else fall through to the legacy resolver — which will throw
      //    BYOKRequiredError if no key is available.
      const explicitConnectionId =
        typeof body.connectionId === "string" ? body.connectionId : null;

      let activeConnection: ConnectionWithKey | null = null;
      let activeModelId: string = modelId;
      let resolveSource: "explicit" | "preset-match" | "feature-route" | "legacy" =
        "legacy";

      if (explicitConnectionId) {
        try {
          activeConnection = await getConnectionWithKey(
            session.user.id,
            explicitConnectionId,
          );
          resolveSource = "explicit";
        } catch (e) {
          if (!(e instanceof ConnectionNotFoundError)) throw e;
        }
      }

      // The user's full Connection list — shared by preset-match AND
      // namespaced-model-match below, so we only fetch once.
      const userConns: ConnectionView[] = await listConnections(session.user.id);

      if (!activeConnection) {
        // Transition shim: pick the first user connection whose presetId
        // matches the legacy providerId from the body.
        const presetMatch: ConnectionView | undefined = userConns.find(
          (c) => c.presetId === providerId,
        );
        if (presetMatch) {
          activeConnection = await getConnectionWithKey(
            session.user.id,
            presetMatch.id,
          );
          // Try to find an upstream model id matching the canonical id
          // the legacy picker sent. If not found, send the canonical id
          // as-is and let the upstream reject if invalid.
          const matchedModel = activeConnection.models.find(
            (m) => m.id === modelId,
          );
          if (matchedModel) activeModelId = matchedModel.id;
          resolveSource = "preset-match";
        }
      }

      if (!activeConnection) {
        // Namespaced-model match: gateway Connections (Vercel AI Gateway,
        // OpenRouter, etc.) carry models as `providerId/modelId` strings
        // — so a Vercel Gateway with `anthropic/claude-sonnet-4` in its
        // models list should serve the picker's "claude-sonnet-4" pick.
        // Without this step the resolver falls through to legacy and
        // throws BYOK_REQUIRED even though the user *did* set up a
        // satisfying Connection. Mirrors the client's `isModelAvailable`.
        const namespaced = `${providerId}/${modelId}`;
        const modelMatch = userConns.find((c) =>
          c.models.some((m) => m.id === namespaced),
        );
        if (modelMatch) {
          activeConnection = await getConnectionWithKey(
            session.user.id,
            modelMatch.id,
          );
          activeModelId = namespaced;
          resolveSource = "preset-match";
        }
      }

      if (!activeConnection) {
        // Last resort before legacy: ask the feature router.
        const primary = await resolvePrimaryRoute(session.user.id, "chat");
        if (primary) {
          activeConnection = primary.connection;
          activeModelId = primary.modelId;
          resolveSource = "feature-route";
        }
      }

      // BYOK now flows exclusively through Connections (each carries its
      // own encrypted key). Request-body `apiKey` remains supported for
      // explicit one-off overrides; legacy AIProviderKey lookups removed.
      const apiKey: string | undefined = body.apiKey;

      const transport: "direct" | "gateway" =
        resolveSource === "legacy" && !apiKey && isGatewayEnabled()
          ? "gateway"
          : "direct";

      const wrappedModel = await withSpan(
        { layer: "ai", name: "resolve_model" },
        {
          attrs: {
            provider: providerId,
            model: activeModelId,
            byok: activeConnection !== null || apiKey !== undefined,
            transport,
            resolve_source: resolveSource,
            connection_id: activeConnection?.id ?? null,
            connection_kind: activeConnection?.kind ?? null,
          },
          summary: `${providerId}:${activeModelId} via ${resolveSource}`,
        },
        async () => {
          const model = activeConnection
            ? await resolveChatModelFromConnection(
                activeConnection,
                activeModelId,
              )
            : await resolveChatModel({
                providerId,
                modelId: activeModelId,
                apiKey,
              });
          return applyMiddleware(model, [
            defaultSettingsMiddleware({ temperature, maxTokens }),
          ]);
        },
      );

      // When the bound content is itself a chat node, it is NOT an
      // editable document — skip editor tools + the "you are viewing a
      // document" context so the model doesn't try to "read" the chat as
      // a document (which confuses it and ignores actual attachments).
      let isChatContent = false;
      if (contentId) {
        const node = await prisma.contentNode.findFirst({
          where: { id: contentId, ownerId: session.user.id },
          select: { contentType: true },
        });
        isChatContent = node?.contentType === "chat";
      }
      const editableContentId =
        contentId && !isChatContent ? contentId : undefined;

      // Create tools bound to the authenticated user, then filter by
      // per-tool `enabled` in settings. Tools default to enabled; only
      // `enabled === false` entries are dropped. If the result is empty
      // we pass `undefined` so streamText knows there are no tools at all.
      const toolCtx = {
        userId: session.user.id,
        contentId: editableContentId,
        // When the user is viewing this conversation in full-page mode the
        // chat IS the open content. Pass that through so createNote can
        // default the new note's parent folder to the chat's own parent.
        chatContentId: isChatContent ? contentId : undefined,
      };
      const allTools = {
        ...createBaseTools(toolCtx),
        ...createFlashcardTools(toolCtx),
        ...(editableContentId ? createEditorTools(toolCtx) : {}),
      };
      const toolConfig = (aiSettings as { toolConfig?: Record<
        string,
        { enabled?: boolean }
      > }).toolConfig ?? {};
      const tools = Object.fromEntries(
        Object.entries(allTools).filter(
          ([id]) => toolConfig[id]?.enabled !== false,
        ),
      );
      const toolsActive = Object.keys(tools).length > 0;

      // Resolve attachments for the model: keep file parts the active
      // provider can consume natively (images for vision; PDFs for
      // Anthropic/Google), and inline the server-extracted text for
      // everything else — so the displayed/persisted message stays a clean
      // chip while the model still receives the content.
      const resolvedMessages = resolveAttachmentsForModel(messages, providerId);

      // Convert UIMessages to ModelMessages for streamText
      const modelMessages = await convertToModelMessages(
        resolvedMessages as Parameters<typeof convertToModelMessages>[0],
      );

      // Fetch mentioned content for @ mentions (max 5 to limit token usage)
      const mentionedContentIds: string[] = body.mentionedContentIds ?? [];

      // Auto-association interceptor (Session 4a):
      // When this turn is bound to a Conversation entity (sidebar's
      // multi-conv mode), each @mention writes an `auto` association.
      // Folder cascade is intentionally not handled — folder mentions
      // bind to the folder only, per the locked plan decision.
      const conversationIdForAssoc: string | null =
        typeof body.conversationId === "string" ? body.conversationId : null;
      if (conversationIdForAssoc && mentionedContentIds.length > 0) {
        // Fire-and-forget — failure here shouldn't block the chat call.
        // Each call is idempotent (upsert) and capped via LRU inside.
        void Promise.all(
          mentionedContentIds.slice(0, 5).map((cid) =>
            addAutoAssociation(
              session.user.id,
              conversationIdForAssoc,
              cid,
              "mention",
            ).catch(() => null),
          ),
        );
      }

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

      const reasoningProviderOptions = buildProviderOptions(providerId, modelId);

      const result = streamText({
        model: wrappedModel,
        messages: modelMessages,
        tools: toolsActive ? tools : undefined,
        toolChoice: toolsActive ? "auto" : undefined,
        // Reasoning opt-in for Anthropic + Google (Session 6). Undefined
        // for OpenAI o-series (reasoning is automatic) and non-reasoning
        // chat models.
        ...(reasoningProviderOptions && {
          providerOptions: reasoningProviderOptions,
        }),
        // Allow up to 8 model turns for multi-step tool workflows.
        // Editor tools may need: read → plan → diff → diff → diff → finish + final text.
        // Base chat tools typically need 2-3 steps.
        stopWhen: stepCountIs(editableContentId ? 8 : 5),
        system: `You are a helpful AI assistant in Digital Garden, a knowledge management application. Help the user with their notes, writing, and research. Be concise and helpful.

You have a generate_image tool that creates AI images from text prompts. When asked to generate, create, or draw an image, use this tool. Available providers: DALL·E 3, GPT Image 1, Imagen 3, FLUX (fal.ai/Together/Fireworks), DeepAI, RunwayML, Artbreeder. Default to DALL·E 3 unless specified. Write detailed prompts for best results.

You can manage the user's flashcard decks. Rules:
- ALWAYS call list_decks before proposing a new deck so you can prefer an existing one and populate similarExistingPaths with near-matches.
- Use propose_deck (never direct creation) for new decks. The user confirms in the chat UI.
- Use propose_cards (never direct creation) for cards. Hard limit: 10 cards per propose_cards call (enforced by the tool schema).
  - If the user asks for MORE than 10, propose the first 10, set requestedCount to the true number they asked for, and END YOUR TURN with "Showing first 10 of N requested — accept these and I'll propose the rest." Do NOT chain propose_cards calls unprompted.
- When the user has a note open, set sourceContentId on proposed cards to that note's id so cards link back to their source.
- After any propose_* call, STOP and wait. The user clicks a button to commit; you don't loop back automatically.${
          editableContentId
            ? `\n\nThe user is currently viewing a document (ID: ${editableContentId}). You have editor tools available to read and edit this document.

IMPORTANT EDITING RULES:
- When the document has existing content, ALWAYS use apply_diff to make targeted changes or APPEND new content. NEVER use replace_document unless the user explicitly asks you overwrite the entire document.
- To add content (descriptions, text, images), APPEND it after the existing content using apply_diff. Do NOT overwrite what is already there.
- When asked to edit, always: 1) Read the document first with read_first_chunk, 2) Plan your approach if the edit is complex, 3) Apply changes with apply_diff for targeted edits, 4) Call finish_with_summary when done.
- Only use replace_document for blank/empty documents or when the user explicitly requests a full rewrite.

When you generate an image, the user can insert it into the document at their cursor position.`
            : isChatContent
            ? `\n\nThe user is chatting with you on a full-page chat (ID: ${contentId}). DATA-MODEL FACT YOU MUST KNOW: this chat HAS a notes panel ("Add notes" — a TipTap editor below the conversation) keyed to the chat's own contentId. Writing to it is exactly the same as updating any other content's notes — call \`updateNote\` with the chat's contentId as the \`contentId\` argument. Do NOT create a separate file.

NOTE-TOOL RULES IN CHAT CONTEXT:
- "add a note to this chat", "create a note on this chat", "put X in the chat notes", "update the note in this chat" all mean: update the notes panel attached to THIS chat. Use \`updateNote({ contentId: "${contentId}", content: "<markdown>" })\`. NEVER set \`title\` — that would rename the chat.
- For "create a NEW note in a folder" (separate file), use \`createNote\`. It defaults to the chat's parent folder.
- For "update my Sourdough note" etc. (named other note), use \`searchNotes\` to find the id, then \`updateNote\`.
- Tooling distinguishes by contentId — same tool, different target.
- Title-arg rule: never set \`title\` unless the user EXPLICITLY says "rename this to X". Topic-derived titles are a bug. (The tool will hard-ignore \`title\` when the target is this chat, but still follow the rule.)`
            : ""
        }${mentionedContext}`,
        onStepFinish: (step) => {
          // Tool-call auto-association interceptor (Session 4b).
          // After each model step, scan the step's tool calls for any
          // content-id-bearing args (per the CONTENT_ID_TOOL_ARGS
          // annotation) and upsert an `auto` association. Fire-and-forget,
          // idempotent, LRU-capped inside the service — a failure here
          // must never disturb the stream.
          if (!conversationIdForAssoc) return;
          const ids = new Set<string>();
          for (const call of step.toolCalls ?? []) {
            for (const id of extractContentIdsFromToolCall(
              call.toolName,
              call.input,
            )) {
              ids.add(id);
            }
          }
          if (ids.size === 0) return;
          void Promise.all(
            Array.from(ids).map((cid) =>
              addAutoAssociation(
                session.user.id,
                conversationIdForAssoc,
                cid,
                "tool-call",
              ).catch(() => null),
            ),
          );
        },
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

      // Forward `reasoning` parts to the client. Without this opt-in,
      // AI SDK v6 strips them — Anthropic extended thinking, OpenAI
      // o-series, and Google thinking-* models all emit reasoning that
      // we want the ReasoningRouter to render. Session 6.
      //
      // Also forward token usage + finish reason via `messageMetadata`,
      // which AI SDK v6 surfaces on `UIMessage.metadata` on the client.
      // The client's persist-on-finish path forwards it to the message
      // row, which the per-Connection usage meters read back for $
      // figures. Without this hop, telemetry is request-counts-only.
      return result.toUIMessageStreamResponse({
        sendReasoning: true,
        messageMetadata: ({ part }) => {
          if (part.type === "finish") {
            return {
              usage: {
                inputTokens: part.totalUsage?.inputTokens,
                outputTokens: part.totalUsage?.outputTokens,
                totalTokens: part.totalUsage?.totalTokens,
              },
              finishReason: part.finishReason,
            };
          }
          return undefined;
        },
      });
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

      // Strict BYOK: the resolver throws this when a user lacks a stored
      // key for the requested provider and Gateway is not opt-in. The
      // client matches on `code: "BYOK_REQUIRED"` to show a "Set up API
      // key" call-to-action.
      if (error instanceof BYOKRequiredError) {
        return Response.json(
          {
            success: false,
            error: {
              code: "BYOK_REQUIRED",
              message: error.message,
              providerId: error.providerId,
            },
          },
          { status: 402 },
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

/** Providers whose AI-SDK integration accepts native PDF document parts. */
const PDF_NATIVE_PROVIDERS = new Set(["anthropic", "google"]);

/**
 * Resolve attachment file parts for the active model (Session 5b fix).
 *
 * The client persists attachments as file parts (a clean chip), stashing
 * server-extracted text in `providerMetadata.app.text` for non-image
 * types. Here we adapt each user message for the model:
 *   - images → kept (vision providers consume them);
 *   - PDFs → kept for Anthropic/Google (native document parts), else the
 *     extracted text is inlined and the part dropped;
 *   - other files (txt/md/csv/json) → always inlined as text.
 *
 * The `app` provider-metadata is stripped from kept parts so it never
 * reaches the upstream provider. The original (displayed/persisted)
 * messages are untouched — only this model-bound copy is rewritten.
 */
function resolveAttachmentsForModel(
  messages: unknown[],
  providerId: string,
): unknown[] {
  const nativePdf = PDF_NATIVE_PROVIDERS.has(providerId);

  const stripAppMeta = (part: Record<string, unknown>) => {
    if (!part.providerMetadata) return part;
    const { app: _app, ...rest } = part.providerMetadata as Record<
      string,
      unknown
    >;
    return Object.keys(rest).length > 0
      ? { ...part, providerMetadata: rest }
      : (() => {
          const { providerMetadata: _pm, ...partRest } = part;
          return partRest;
        })();
  };

  return messages.map((raw) => {
    const m = raw as { role?: string; parts?: unknown };
    if (m.role !== "user" || !Array.isArray(m.parts)) return raw;

    const kept: unknown[] = [];
    const inlined: string[] = [];

    for (const p of m.parts as Array<Record<string, unknown>>) {
      if (p?.type !== "file") {
        kept.push(p);
        continue;
      }
      const mediaType = typeof p.mediaType === "string" ? p.mediaType : "";
      const filename = typeof p.filename === "string" ? p.filename : "file";
      const appText = (
        (p.providerMetadata as Record<string, Record<string, unknown>>)?.app
          ?.text as string | undefined
      )?.toString();

      const isImage = mediaType.startsWith("image/");
      const isPdf = mediaType === "application/pdf";

      if (isImage || (isPdf && nativePdf)) {
        kept.push(stripAppMeta(p));
      } else {
        inlined.push(
          appText
            ? `[Attached file: ${filename}]\n${appText}`
            : `[Attached file: ${filename} — content unavailable]`,
        );
      }
    }

    if (inlined.length === 0) return { ...m, parts: kept };

    const suffix = inlined.join("\n\n");
    const merged = [...kept];
    const textPart = merged.find(
      (x) => (x as Record<string, unknown>)?.type === "text",
    ) as { text?: string } | undefined;
    if (textPart) {
      textPart.text = `${textPart.text ?? ""}\n\n${suffix}`.trim();
    } else {
      merged.unshift({ type: "text", text: suffix });
    }
    return { ...m, parts: merged };
  });
}
