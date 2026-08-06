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

import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  UI_MESSAGE_STREAM_HEADERS,
} from "ai";
import type { UIMessage } from "ai";
import { isResumableConfigured } from "@/lib/domain/ai/resumable/redis";
import { getStreamContext } from "@/lib/domain/ai/resumable/context";
import {
  associateStream,
  getActiveStreamId,
} from "@/lib/domain/ai/resumable/association";
import type { JSONContent } from "@tiptap/core";
import { requireAuth } from "@/lib/infrastructure/auth";
import { getUserSettings } from "@/lib/features/settings";
import { getChatContextBody } from "@/lib/features/chat-contexts";
import { renderPageContextSection } from "@/lib/domain/browser-extension/page-context";
import {
  buildPromptCachePolicy,
  mergeAIProviderOptions,
  summarizePromptCacheUsage,
  type AIProviderOptions,
  type PromptCacheUsageLike,
} from "@/lib/domain/ai/prompt-cache";
import {
  resolveChatModel,
  resolveChatModelFromConnection,
  BYOKRequiredError,
} from "@/lib/domain/ai/providers/registry";
import { isGatewayEnabled } from "@/lib/domain/ai/providers/gateway";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import { resolveModelTemperature } from "@/lib/domain/ai/model-constraints";
import {
  DEFAULT_OUTPUT_TARGET,
  getLatestUserMessageOutputTarget,
  parseOutputTarget,
  renderOutputTargetInstruction,
} from "@/lib/domain/ai/output-target";

/**
 * Build per-provider `providerOptions` for streamText based on the
 * model's reasoning posture in the catalog. Returns undefined when no
 * options are needed so we don't pass empty objects through. Session 6.
 */
function buildProviderOptions(
  providerId: string,
  modelId: string,
): AIProviderOptions | undefined {
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
  lookupTemplate,
  ConnectionNotFoundError,
} from "@/lib/features/ai-connections";
import {
  addAutoAssociation,
  appendMessage,
  ensureConversationContentNode,
} from "@/lib/features/conversations";
import { publishEvent } from "@/lib/domain/notifications";
import { resolveNativeWebSearchTool } from "@/lib/domain/ai/acquisition";
import { userHasSearchConnection } from "@/lib/domain/ai/acquisition/search/resolve";
import { createAppWebSearchTool } from "@/lib/domain/ai/acquisition/search/tool";
import { repairDanglingToolCalls } from "@/lib/domain/ai/repair-dangling-tools";
import { compactToolOutputs } from "@/lib/domain/ai/compact-tool-outputs";
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
  rateLimitRetryMiddleware,
} from "@/lib/domain/ai/middleware";
import { buildSystemPrompt } from "@/lib/domain/ai/system-prompt";
import { createBaseTools } from "@/lib/domain/ai/tools";
import { createEditorTools } from "@/lib/domain/ai/tools";
import { createFlashcardTools } from "@/lib/domain/ai/tools";
import { createWorkflowTools } from "@/lib/domain/ai/tools";
import {
  readPageInBrowserTool,
  openTabAndReadTool,
  coBrowseOpenTool,
  coBrowseActTool,
  readCurrentPageTool,
  listTabsTool,
} from "@/lib/domain/ai/tools/registry";
import { READ_PAGE_HEADLESS_OR_BROWSER } from "@/lib/domain/ai/tools/read-page-in-browser";
import { OPEN_TAB_AND_READ } from "@/lib/domain/ai/tools/open-tab-and-read";
import {
  CO_BROWSE_OPEN,
  CO_BROWSE_ACT,
  READ_CURRENT_PAGE,
  LIST_TABS,
} from "@/lib/domain/ai/tools/co-browse-tools";
import { effectiveCapabilities } from "@/lib/domain/ai/features/capabilities";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger, spanPayload, startSpan, withRouteTrace, withSpan } from "@/lib/core/logger";
import { after } from "next/server";
import { assembleFolderChatContext } from "@/extensions/studio/server/source-selection";
import { refreshContextOnAccess } from "@/lib/domain/ai-context/context-refresh";
import { ensureFolderContextFresh } from "@/lib/domain/ai-context/gate";
import { assembleFolderCapsule } from "@/lib/domain/ai-context/capsule";
import {
  parsePlaybook,
  type PlaybookReference,
} from "@/lib/domain/ai/playbooks/parse";
import {
  getPhaseModelDirective,
  type PhaseModelResolution,
} from "@/lib/domain/ai/playbooks/model-directives";
import {
  resolvePlaybookModelRoute,
  describeUnresolvedDirective,
} from "@/lib/domain/ai/model-route-resolver";
import type {
  ModelRouteSource,
  ResolvedModelRoute,
} from "@/lib/domain/ai/model-directive";
import { renderPlaybookSection } from "@/lib/domain/ai/playbooks/render";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { isPlaybookMetadata } from "@/lib/domain/ai/playbooks/registry";
import {
  configurePhaseCheckpointGate,
  createPhaseCheckpointGate,
  recordCompletedPhaseTools,
  recordCompletedPhaseToolsFromMessages,
  renderPhaseCheckpointGateInstruction,
} from "@/lib/domain/ai/playbooks/checkpoint-gate";
import {
  bindPlaybookToLatestUserMessage,
  requestsRootedPlaybookExecution,
} from "@/lib/domain/ai/playbooks/message-binding";
import {
  extractPlaybookOutputDirectives,
  type PlaybookOutputDirective,
} from "@/lib/domain/ai/playbooks/output-directives";

const ROUTE_PATH = "/api/ai/chat";

async function resolvePlaybookReferenceContext(
  userId: string,
  references: PlaybookReference[],
  activePhaseReferences: PlaybookReference[],
): Promise<{
  manifest: string;
  activeReferenceContentIds: string[];
}> {
  if (references.length === 0) {
    return { manifest: "", activeReferenceContentIds: [] };
  }

  const uniqueTitles = Array.from(
    new Set(references.map((reference) => reference.targetTitle)),
  );
  const referenceNodes = await prisma.contentNode.findMany({
    where: {
      ownerId: userId,
      title: { in: uniqueTitles },
      contentType: { in: ["note", "folder"] },
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      notePayload: { select: { metadata: true } },
    },
  });
  const byTitle = new Map(referenceNodes.map((node) => [node.title, node]));
  const activeTitles = new Set(
    activePhaseReferences.map((reference) => reference.targetTitle),
  );
  const activeReferenceContentIds = Array.from(
    new Set(
      referenceNodes
        .filter((node) => activeTitles.has(node.title))
        .map((node) => node.id),
    ),
  );
  const lines = uniqueTitles.map((title) => {
    const found = byTitle.get(title);
    if (!found) return `- [[${title}]] — not found in your notes`;
    const isSubPlaybook = isPlaybookMetadata(found.notePayload?.metadata);
    return isSubPlaybook
      ? `- [[${title}]] (getCurrentNote contentId: ${found.id}) — SUB-PLAYBOOK: has its own standing rules/phases; follow its directives once read`
      : `- [[${title}]] (getCurrentNote contentId: ${found.id})`;
  });

  return {
    manifest:
      "\n\n**Linked extensions** " +
      "(call getCurrentNote with the contentId below when the current phase needs one — not preloaded):\n" +
      lines.join("\n"),
    activeReferenceContentIds,
  };
}

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

      // Approval resumes can occur after a reload, when the transport's
      // in-memory turn snapshot is gone and its live fallback may have reset
      // to the default "chat" target. New turns bind placement to their user
      // message, so every continuation replays the target that STARTED the
      // turn. Legacy turns without the data part retain request-body behavior.
      const turnBoundOutputTarget =
        getLatestUserMessageOutputTarget(messages);

      // Load user's stored AI settings as defaults
      const userSettings = await getUserSettings(session.user.id);
      const aiSettings = userSettings.ai ?? {};
      // Auto-pronounce: when on (default), the model is told to attach spoken
      // audio to non-English vocab cards by default. The proposal gate still
      // gates the actual TTS spend, so "default on" never auto-bills.
      const autoPronounceDefault = userSettings.flashcards?.autoPronounce !== false;

      // ── Playbook model routing — hoisted resolve (AI 3.4, S2a) ──────────
      // The playbook context block far below (~line 915+) parses the playbook
      // to build the system prompt AFTER the model is already chosen, so a
      // phase-declared model has no read site there. This hoisted, read-only
      // resolver derives the active phase's model directive BEFORE model
      // resolution. It is deliberately independent of (and runs a separate
      // fetch+parse from) the downstream context block — keeping that block
      // byte-for-byte unchanged makes the injection/checkpoint/reference
      // machinery provably behavior-identical. The small cost is a second
      // fetch+parse of the playbook note on attached-playbook turns.
      // Attach-mode + phase-index derivation MUST mirror the downstream block:
      //   - explicit `body.playbookId` → progressive disclosure, clamped index
      //   - rooted execution cue → all phases visible, active phase is phase 0
      //   - ambient (viewing a playbook without attaching) does NOT route
      // S2a wires the OUTPUT into nothing — the ladder consumes it in S2b.
      const routingExplicitPlaybookId =
        typeof body.playbookId === "string" ? body.playbookId : null;
      const routingRootedPlaybookId =
        !routingExplicitPlaybookId &&
        contentId &&
        requestsRootedPlaybookExecution(messages)
          ? contentId
          : null;
      let phaseModelResolution: PhaseModelResolution | null = null;
      let routingPlaybookTitle = "";
      let routingActivePhaseIndex = 0;
      // Pinned pick = ladder rung 1; the directive resolution below is
      // provably unused when pinned, so skip the fetch+parse entirely
      // (review fix — a pinned playbook conversation paid a DB round-trip
      // + full TipTap parse per turn just to discard the result).
      const modelPinned = body.modelPinned === true;
      // Agentic Browsing Phase 0: the client reports whether the browser
      // extension is reachable this turn; gates the client-executed read tool.
      const browserExtensionAvailable = body.browserExtensionAvailable === true;
      // Agentic Browsing Phase 2b Slice 5c: co-browse is trust-gated to the side
      // panel (the client sends true only from the /embed/panel surface); gates
      // the client-executed co_browse_* tools.
      const coBrowseAvailable = body.coBrowseAvailable === true;
      // Agentic Browsing Phase 1: derive the active research run's page budget
      // from the conversation history — the propose_research_run result always
      // rides in body.messages, whereas a client body flag can't reliably reach
      // the auto-resume legs (they replay the user turn's snapshotted body).
      // Non-null = research mode → raises the step cap (budget-derived, P1-c) and
      // the server-read acquisition budget for this turn. Clamped so a client
      // can't request an unbounded run. Null outside a research run → default caps.
      const researchPageBudget = ((): number | null => {
        const msgs = (body as { messages?: unknown }).messages;
        if (!Array.isArray(msgs)) return null;
        let budget: number | null = null;
        for (const m of msgs) {
          const parts = (m as { parts?: unknown }).parts;
          if (!Array.isArray(parts)) continue;
          for (const part of parts) {
            const p = part as {
              type?: string;
              state?: string;
              output?: { ok?: boolean; pageBudget?: number };
            };
            if (
              p.type === "tool-propose_research_run" &&
              p.state === "output-available"
            ) {
              const b = p.output?.pageBudget;
              if (
                p.output?.ok &&
                typeof b === "number" &&
                Number.isFinite(b) &&
                b > 0
              ) {
                budget = Math.min(Math.floor(b), 40);
              }
            } else if (
              p.type === "tool-record_research_findings" &&
              p.state === "output-available"
            ) {
              budget = null; // run closed → back to default caps
            }
          }
        }
        return budget;
      })();
      // Per-item iteration (spec) — same shape as researchPageBudget: an active
      // iteration (approved propose_item_iteration, not yet closed by
      // record_iteration_findings) raises the step cap so the loop has room to
      // process ALL its items in the run. Without this the default 7/8-step cap
      // ends the turn after ~1 item, even though the client item budget allows N.
      const itemIterationBudget = ((): number | null => {
        const msgs = (body as { messages?: unknown }).messages;
        if (!Array.isArray(msgs)) return null;
        let budget: number | null = null;
        for (const m of msgs) {
          const parts = (m as { parts?: unknown }).parts;
          if (!Array.isArray(parts)) continue;
          for (const part of parts) {
            const p = part as {
              type?: string;
              state?: string;
              output?: { ok?: boolean; itemBudget?: number };
            };
            if (
              p.type === "tool-propose_item_iteration" &&
              p.state === "output-available"
            ) {
              const b = p.output?.itemBudget;
              // Honor a user-raised item cap (up to the schema ceiling) so the
              // server step-cap scales with the run they approved — a 40 clamp
              // here would silently guillotine a large run at ~item 40.
              if (p.output?.ok && typeof b === "number" && Number.isFinite(b) && b > 0) {
                budget = Math.min(Math.floor(b), 200);
              }
            } else if (
              p.type === "tool-record_iteration_findings" &&
              p.state === "output-available"
            ) {
              budget = null; // run closed → back to default caps
            }
          }
        }
        return budget;
      })();
      const routingPlaybookId = modelPinned
        ? null
        : (routingExplicitPlaybookId ?? routingRootedPlaybookId);
      if (routingPlaybookId) {
        try {
          const routingNode = await prisma.contentNode.findFirst({
            where: {
              id: routingPlaybookId,
              ownerId: session.user.id,
              contentType: { in: ["note", "folder"] },
              deletedAt: null,
            },
            select: {
              title: true,
              notePayload: { select: { tiptapJson: true, metadata: true } },
            },
          });
          // Eligibility MUST mirror the downstream execution blocks (review
          // fix): explicit attach requires playbook metadata (downstream
          // checks it too), but rooted execution downstream runs ANY note
          // with a payload — requiring metadata here made rooted runs of
          // unmarked notes execute playbook machinery while their model
          // directives silently never routed.
          if (
            routingNode?.notePayload &&
            (routingRootedPlaybookId != null ||
              isPlaybookMetadata(routingNode.notePayload.metadata))
          ) {
            const routingParsed = parsePlaybook(
              routingNode.notePayload.tiptapJson as JSONContent,
            );
            if (routingParsed.phases.length > 0) {
              // The active phase is the client-derived index (count of
              // approved phase_checkpoints) for BOTH modes — smoke finding:
              // hardcoding 0 for rooted meant a `model:` directive on any
              // phase past the first NEVER routed during rooted "run this
              // playbook" execution, which is the primary flow. The index
              // advances only across checkpoint-bounded turns, so a playbook
              // must checkpoint between phases for the switch to land (a turn
              // is atomic — one model).
              routingActivePhaseIndex = Math.min(
                Math.max(
                  typeof body.activePhaseIndex === "number"
                    ? body.activePhaseIndex
                    : 0,
                  0,
                ),
                routingParsed.phases.length - 1,
              );
              routingPlaybookTitle = routingNode.title;
              phaseModelResolution = getPhaseModelDirective(
                routingParsed,
                routingActivePhaseIndex,
              );
            }
          }
        } catch (error) {
          // Non-fatal: routing degrades to the normal ladder on any error.
          logger.warn({
            layer: "ai",
            event: "chat:model_routing_resolve_failed",
            summary: "playbook model-routing resolve failed — normal ladder",
            error,
          });
        }
      }
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
      // "playbook-phase"/"playbook" added in AI 3.4 (review fix): logging
      // playbook routes as "feature-route" made sanctioned playbook
      // overrides indistinguishable from the banned silent-substitution
      // class in the very telemetry the straight-faced-routing decision
      // audits.
      let resolveSource:
        | "explicit"
        | "preset-match"
        | "feature-route"
        | "playbook-phase"
        | "playbook"
        | "legacy" = "legacy";

      // The user's full Connection list — shared by playbook routing (S2b),
      // preset-match, and namespaced-model-match below, so we only fetch once.
      const userConns: ConnectionView[] = await listConnections(session.user.id);

      // ── Playbook model-routing ladder (AI 3.4, S2b) ──────────────────────
      // Precedence: a PINNED user pick wins (rung 1 — the explicit path
      // below); otherwise the active phase's model directive selects the
      // model HERE, ahead of the provider/model the engine echoes in every
      // baseline body. `modelPinned` is what distinguishes a real user choice
      // from that carried default. A directive that can't resolve emits a
      // visible fall-through notice and drops to the normal ladder — never a
      // silent vendor swap (owner: "prevention is king").
      // (modelPinned is hoisted above the S2a resolver so a pinned turn
      // skips the playbook fetch entirely.)
      let modelRouteSource: ModelRouteSource = "default";
      let playbookRouteApplied = false;
      const modelRouteNotices: string[] = [];
      if (!modelPinned && phaseModelResolution) {
        const applied = await resolvePlaybookModelRoute(
          session.user.id,
          phaseModelResolution.directive,
          userConns,
        );
        if (applied) {
          activeConnection = applied.connection;
          activeModelId = applied.modelId;
          resolveSource = phaseModelResolution.source;
          modelRouteSource = phaseModelResolution.source;
          playbookRouteApplied = true;
        } else {
          modelRouteNotices.push(
            describeUnresolvedDirective(phaseModelResolution.directive),
          );
        }
      }

      // Rung 1: a pinned/explicit connection pick. Skipped when a playbook
      // directive already resolved (not pinned) so the phase model wins.
      if (!playbookRouteApplied && explicitConnectionId) {
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

      // Straight-faced routing (owner decision 2026-07-17): an EXPLICIT
      // model selection is a contract. If no connection serves it, we say
      // so — we do NOT silently substitute another vendor (the old
      // "transition shim" behavior ran gpt-4o under a Sonnet label,
      // misattributing spend, swapping tools, and surfacing rate-limit
      // errors from a provider the user never picked). The feature-route
      // fallback survives ONLY for surfaces that sent no explicit choice.
      const explicitSelection =
        typeof body.providerId === "string" || typeof body.modelId === "string";

      if (
        !activeConnection &&
        explicitSelection &&
        typeof body.apiKey !== "string"
      ) {
        // Legacy resolver can still serve the selection when the env-level
        // gateway is configured; otherwise this selection is unservable.
        if (!isGatewayEnabled()) {
          const providerLabel =
            PROVIDER_CATALOG.find((p) => p.id === providerId)?.name ??
            providerId;
          return Response.json(
            {
              success: false,
              error: {
                code: "MODEL_UNAVAILABLE",
                message:
                  `No connection serves ${providerLabel} · ${modelId}. ` +
                  `Add a ${providerLabel} API key in Settings → AI → Connections, ` +
                  `add a gateway connection that lists ${providerId}/${modelId}, ` +
                  `or pick one of the available (non-greyed) models.`,
              },
            },
            { status: 422 },
          );
        }
      }

      if (!activeConnection && !explicitSelection) {
        // No explicit pick — the feature router's primary is a genuine
        // default, not a substitution.
        const primary = await resolvePrimaryRoute(session.user.id, "chat");
        if (primary) {
          activeConnection = primary.connection;
          activeModelId = primary.modelId;
          resolveSource = "feature-route";
        }
      }

      // Finalize the route source for the inline switch line (AI 3.4). A
      // playbook directive already set it; otherwise a pinned pick reads as
      // "by you", everything else is the conversation's default (no divider).
      if (!playbookRouteApplied) {
        modelRouteSource = modelPinned ? "user" : "default";
      }

      // ── Executed vendor identity (AI 3.4 review fix) ────────────────────
      // ONE derivation of "which vendor actually executes this turn", fed to
      // the stamp, spans, attachment policy, audio capability, reasoning
      // provider-options, and persistence. The body-derived `providerId` is
      // the REQUESTED vendor; when a playbook (or feature route) resolves a
      // different connection, the two diverge — deriving per-consumer was
      // exactly the announced-vs-executed divergence class this feature
      // exists to prevent. Namespaced ids ("vendor/model") name the vendor
      // in the prefix; direct connections name it in presetId; the legacy
      // no-connection path keeps the body value.
      const executedVendorId = activeConnection
        ? activeModelId.includes("/")
          ? activeModelId.split("/")[0]
          : activeConnection.presetId ?? providerId
        : providerId;
      const executedBareModelId = activeModelId.includes("/")
        ? activeModelId.slice(activeModelId.indexOf("/") + 1)
        : activeModelId;

      // The turn's resolved route — emitted to the client via
      // messageMetadata below and persisted with the message. NOTE: this is
      // a per-turn record of what ran, not a replay contract — continuations
      // re-resolve from turn-start inputs (playbookId + activePhaseIndex via
      // the transport's turn snapshot); a stamped-part replay rung is a
      // documented followup in the plan doc.
      const resolvedModelRoute: ResolvedModelRoute = {
        providerId: executedVendorId,
        modelId: activeModelId,
        connectionId: activeConnection?.id,
        source: modelRouteSource,
        ...(playbookRouteApplied && routingPlaybookTitle
          ? {
              playbookTitle: routingPlaybookTitle,
              phaseIndex: routingActivePhaseIndex,
            }
          : {}),
      };

      // BYOK now flows exclusively through Connections (each carries its
      // own encrypted key). Request-body `apiKey` remains supported for
      // explicit one-off overrides; legacy AIProviderKey lookups removed.
      const apiKey: string | undefined = body.apiKey;

      const transport: "direct" | "gateway" =
        resolveSource === "legacy" && !apiKey && isGatewayEnabled()
          ? "gateway"
          : "direct";

      // Fixed-temperature models (v3.1 R4): reasoning/thinking models
      // (OpenAI o-series, Moonshot Kimi thinking line) reject any
      // temperature but 1 with a 4xx. Clamp before it reaches the
      // middleware AND the streamText call — both send temperature.
      const effectiveTemperature = resolveModelTemperature(
        activeModelId,
        temperature,
      );

      const wrappedModel = await withSpan(
        { layer: "ai", name: "resolve_model" },
        {
          attrs: {
            provider: executedVendorId,
            requested_provider: providerId,
            model: activeModelId,
            byok: activeConnection !== null || apiKey !== undefined,
            transport,
            resolve_source: resolveSource,
            model_route_source: modelRouteSource,
            connection_id: activeConnection?.id ?? null,
            connection_kind: activeConnection?.kind ?? null,
          },
          summary: `${executedVendorId}:${activeModelId} via ${resolveSource}`,
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
            defaultSettingsMiddleware({
              temperature: effectiveTemperature,
              maxTokens,
            }),
            rateLimitRetryMiddleware(),
          ]);
        },
      );

      // When the bound content is itself a chat node, it is NOT an
      // editable document — skip editor tools + the "you are viewing a
      // document" context so the model doesn't try to "read" the chat as
      // a document (which confuses it and ignores actual attachments).
      let isChatContent = false;
      // Open workflow (AI v3 core S6): when the open content is a Trellis
      // workflow, the chat's DEFAULT subject is THAT workflow (owner rule,
      // 2026-07-18 — "chats serve their location" applied to workflows).
      // The system prompt states the default; get_workflow/update_workflow/
      // run_workflow resolve to it when called with no arguments.
      let openWorkflowTitle: string | undefined;
      let openContentLocationId: string | undefined;
      // The content this chat is rooted in (title + type), for the "you can
      // see what I have open" context section — so the model resolves "this
      // file / the current note / this playbook" to the chat's own subject
      // without the user re-naming it.
      let rootedContentTitle: string | undefined;
      let rootedContentType: string | undefined;
      if (contentId) {
        const node = await prisma.contentNode.findFirst({
          where: { id: contentId, ownerId: session.user.id },
          select: { contentType: true, title: true, parentId: true },
        });
        isChatContent = node?.contentType === "chat";
        rootedContentTitle = node?.title ?? undefined;
        rootedContentType = node?.contentType ?? undefined;
        if (node?.contentType === "workflow") openWorkflowTitle = node.title;
        // Location inference fallback (v3 ship fix, 2026-07-18): "chats
        // serve their location" must hold for sidebar chats too — they
        // have no archived chat node for the inference below, which left
        // their tools untargeted (files landed at the vault root). A
        // folder is its own location; anything else locates to its parent.
        openContentLocationId =
          node?.contentType === "folder"
            ? contentId
            : (node?.parentId ?? undefined);
      }
      // Workflows are not documents: keep document-editor tools (and the
      // "you are viewing a document" prompt section) off when one is open —
      // apply_diff/read_first_chunk operate on NotePayload and would only
      // confuse the model. ctx.contentId still carries the open workflow id
      // for the workflow tools' open-target resolution.
      const editableContentId =
        contentId && !isChatContent && !openWorkflowTitle
          ? contentId
          : undefined;

      // Create tools bound to the authenticated user, then filter by
      // per-tool `enabled` in settings. Tools default to enabled; only
      // `enabled === false` entries are dropped. If the result is empty
      // we pass `undefined` so streamText knows there are no tools at all.
      // Collect image/audio attachments for propose_cards_from_media to package
      // as card fronts. Scope to the MOST RECENT user message that carries media
      // — NOT the whole conversation. The model indexes "the media I was just
      // given" (0..n) per turn; collecting every attachment across the chat
      // would offset those indices and pull the wrong (earlier) clips. We walk
      // backwards and take the first user message that has media parts.
      const attachedMedia: Array<{
        url: string;
        mediaType: string;
        contentNodeId?: string;
        filename?: string;
      }> = [];
      for (let mi = messages.length - 1; mi >= 0; mi--) {
        const m = messages[mi];
        if (m.role !== "user" || !Array.isArray(m.parts)) continue;
        const mediaParts = (m.parts as Array<Record<string, unknown>>).filter(
          (part) =>
            part?.type === "file" &&
            typeof part.url === "string" &&
            typeof part.mediaType === "string" &&
            ((part.mediaType as string).startsWith("image/") ||
              (part.mediaType as string).startsWith("audio/")),
        );
        if (mediaParts.length === 0) continue;
        for (const part of mediaParts) {
          const app = (
            part.providerMetadata as { app?: { contentNodeId?: string } } | undefined
          )?.app;
          attachedMedia.push({
            url: part.url as string,
            mediaType: part.mediaType as string,
            contentNodeId: app?.contentNodeId,
            filename: typeof part.filename === "string" ? part.filename : undefined,
          });
        }
        break; // only the most recent batch of attachments
      }

      // Bound Conversation entity (sidebar multi-conv / full-page chat).
      // Hoisted above toolCtx (AI v3 core S3) so tools can associate the
      // content they touch; the mention/tool-call interceptors below reuse it.
      const conversationIdForAssoc: string | null =
        typeof body.conversationId === "string" ? body.conversationId : null;

      // Resumable streams (AI 3.3): when on, this turn's SSE output is
      // teed into Redis (see consumeSseStream below) so a reload or a
      // second tab can re-attach mid-generation via GET. The gate is the
      // feature's core correctness property: off or unconfigured MUST be
      // byte-for-byte today's behavior with zero Redis traffic, and only
      // conversation-bound turns are resumable (transient chats have no
      // stable key to reconnect by).
      const resumableStreamId =
        isResumableConfigured() &&
        aiSettings.resumableStreams !== false &&
        conversationIdForAssoc
          ? crypto.randomUUID()
          : null;

      // The conversation's target folder (umbrella decision #7) rides into
      // tool context: read_page files page nodes there; document tools
      // default their destination to it.
      let targetFolderId: string | undefined;
      let archivedChatNodeId: string | undefined;
      if (conversationIdForAssoc) {
        const conv = await prisma.conversation.findFirst({
          where: {
            id: conversationIdForAssoc,
            ownerId: session.user.id,
            deletedAt: null,
          },
          select: {
            targetFolderId: true,
            // Location inference: chats serve their location — the chat
            // node's parent folder is the target unless explicitly set.
            archivedToContentNode: { select: { id: true, parentId: true } },
          },
        });
        targetFolderId =
          conv?.targetFolderId ??
          conv?.archivedToContentNode?.parentId ??
          undefined;
        archivedChatNodeId = conv?.archivedToContentNode?.id;
      }
      // Final fallback: the open content's folder (sidebar chats and
      // transient chats have no chat node to infer from).
      if (!targetFolderId) targetFolderId = openContentLocationId;

      // WS6 (robust materialization): a sidebar chat rooted in content must
      // exist as a referenced ContentNode under that content — both so it
      // appears nested in the tree and so its outputs can nest under it. The
      // client's transient-promotion POST only covers freshly-created chats;
      // doing it here too (idempotent — ensureConversationContentNode reuses
      // an existing node) covers every path: reopened chats, chats created
      // before WS6, the browser side panel, etc. Non-fatal.
      if (
        conversationIdForAssoc &&
        !isChatContent &&
        contentId &&
        !archivedChatNodeId
      ) {
        try {
          archivedChatNodeId = await ensureConversationContentNode(
            session.user.id,
            conversationIdForAssoc,
            { ownerContentId: contentId },
          );
        } catch (error) {
          logger.warn({
            layer: "ai",
            event: "chat:materialize_failed",
            summary: "side-chat node materialization failed — continuing",
            error,
          });
        }
      }

      // Output ownership (Chat Outputs & References plan, WS3): the chat
      // that can own referenced output by default — a full-page chat is
      // itself; a sidebar chat is its (now eagerly materialized, WS6)
      // archived ContentNode. Undefined for a transient/unsaved sidebar chat
      // — output tools fall back to their folder-only default there.
      const chatNodeId: string | undefined = isChatContent
        ? contentId
        : archivedChatNodeId;
      // The content this chat was started FROM (side chats only) — used by the
      // "next to this chat" output-target mode.
      const originContentId: string | undefined = isChatContent
        ? undefined
        : contentId;

      // Output-target chip (WS7): the user's per-turn choice of where NEW
      // content lands by default. `chat` (owner = the chat, WS3 default),
      // `nextToChat` (owner = origin content — a sibling of the chat under it),
      // or `folder` (a chosen folder, as a plain primary node). Only the
      // default when the user doesn't tell the bot otherwise — an explicit
      // destination the bot resolves from the request always wins downstream.
      let outputOwnerId: string | undefined = chatNodeId;
      let outputParentOverride: string | undefined;
      const outputTarget =
        turnBoundOutputTarget ??
        parseOutputTarget(body.outputTarget) ??
        DEFAULT_OUTPUT_TARGET;
      if (outputTarget.mode === "underContent") {
        // Referenced under the rooted content (a child of it, sibling of
        // the chat).
        outputOwnerId = originContentId ?? chatNodeId;
      } else if (outputTarget.mode === "besideContent") {
        // Primary in the rooted content's folder (next to it).
        outputOwnerId = undefined;
        outputParentOverride = openContentLocationId;
      } else if (outputTarget.mode === "folder") {
        outputOwnerId = undefined;
        const selectedOutputFolder = await prisma.contentNode.findFirst({
          where: {
            id: outputTarget.folderId,
            ownerId: session.user.id,
            contentType: "folder",
            deletedAt: null,
          },
          select: { id: true },
        });
        outputParentOverride = selectedOutputFolder?.id;
      }
      // mode "chat" → keep the chat-owner default.

      // Per-request token accumulator (v3.1 R5): onStepFinish adds each
      // step's usage; phase_checkpoint stamps the running total into the
      // Run Ledger.
      const runTokenCounter = { total: 0 };
      // Playbook validation happens below, after the tool registry is built.
      // Tool closures retain this array reference, so trusted directives
      // pushed before streamText begins are available at execution time.
      const playbookOutputDirectives: PlaybookOutputDirective[] = [];
      // Provider-neutral checkpoint proof is configured after the selected
      // playbook is parsed below. Tool closures retain this request-scoped
      // object and consult its live state before surfacing approval.
      const phaseCheckpointGate = createPhaseCheckpointGate();
      const toolCtx = {
        userId: session.user.id,
        runTokens: runTokenCounter,
        // Editor tools read this as "the document being edited"; workflow
        // tools read it as "the open workflow" (they verify contentType
        // themselves). editableContentId is deliberately undefined when a
        // workflow is open, so thread the raw contentId through for it.
        contentId: editableContentId ?? (openWorkflowTitle ? contentId : undefined),
        conversationId: conversationIdForAssoc ?? undefined,
        targetFolderId,
        // When the user is viewing this conversation in full-page mode the
        // chat IS the open content. Pass that through so createNote can
        // default the new note's parent folder to the chat's own parent.
        chatContentId: isChatContent ? contentId : undefined,
        outputOwnerId,
        outputParentOverride,
        // Per-artifact symbolic overrides. The preset above still governs
        // omitted placement, while tools can safely honor instructions such
        // as "put this specific document under the chat" without asking the
        // model to invent or discover internal ContentNode UUIDs.
        outputChatOwnerId: chatNodeId,
        outputContentOwnerId: originContentId,
        outputContentParentId: originContentId
          ? openContentLocationId ?? null
          : undefined,
        playbookOutputDirectives,
        phaseCheckpointGate,
        attachedMedia,
        // Agentic Browsing Phase 1: raises the server-read acquisition budget
        // for a research turn (undefined outside a research run → default cap).
        researchPageBudget: researchPageBudget ?? undefined,
      };
      const allTools = {
        ...createBaseTools(toolCtx),
        ...createFlashcardTools(toolCtx),
        // Trellis workflow mastery (AI v3 core S6, umbrella B1/B2).
        ...createWorkflowTools(toolCtx),
        ...(editableContentId ? createEditorTools(toolCtx) : {}),
        // Agentic Browsing Phase 0: a CLIENT-executed read tool (no server
        // `execute`) — registered only when the client reports the browser
        // extension is reachable, so the model can't call it otherwise.
        ...(browserExtensionAvailable
          ? {
              [READ_PAGE_HEADLESS_OR_BROWSER]: readPageInBrowserTool,
              // Agentic Browsing Phase 2a — read-completion launcher (visible
              // tab). Also client-executed; the extension gates the actual open
              // on the user's "open a tab to read blocked pages" setting, so a
              // disabled launcher returns a relayable CTA, never opens a tab.
              [OPEN_TAB_AND_READ]: openTabAndReadTool,
            }
          : {}),
        // Agentic Browsing Phase 2b Slice 5c: CLIENT-executed co-browse tools (no
        // server `execute`). Registered only when the chat is in the trust-gated
        // side panel with the extension present; the engine's onToolCall drives
        // the chrome.debugger interaction engine via the panel bridge.
        ...(coBrowseAvailable
          ? {
              [CO_BROWSE_OPEN]: coBrowseOpenTool,
              [CO_BROWSE_ACT]: coBrowseActTool,
              // R1: read the tab the user is already on (content-script capture,
              // no new tab / no re-fetch) — distinct from read_page and co_browse_open.
              [READ_CURRENT_PAGE]: readCurrentPageTool,
              // Per-item iteration spec, Enumeration sources: the user's open
              // tabs (lean title+URL; explicit-ask-gated by description).
              [LIST_TABS]: listTabsTool,
            }
          : {}),
      };
      const toolConfig = (aiSettings as { toolConfig?: Record<
        string,
        { enabled?: boolean }
      > }).toolConfig ?? {};
      const tools = Object.fromEntries(
        Object.entries(allTools).filter(
          ([id]) =>
            toolConfig[id]?.enabled !== false &&
            // Agentic Browsing (deterministic reads): when the extension is
            // reachable, `read_page_headless_or_browser` is the SINGLE reader —
            // it does a headless server fetch first, then escalates into the
            // browser (background → visible) in code. Drop the server-only
            // `read_page` so the model can't pick a path that can't escalate;
            // one tool, one deterministic ladder, no routing decision to get
            // wrong. (`open_tab_and_read` stays for an explicit visible-tab ask.)
            !(browserExtensionAvailable && id === "read_page"),
        ),
      );

      // P0 (AI v3 core S2): provider-native web search, resolved per active
      // provider at request composition. CRITICAL: key off the EXECUTED
      // provider, not the requested one — the resolver above may have landed
      // on a different vendor's connection (preset fall-through, feature
      // route), and attaching vendor A's server tool to vendor B's model
      // gets it silently dropped, leaving the model to flail on note tools.
      // Aggregator transports (gateway, OpenRouter) are skipped until their
      // provider-tool passthrough is verified. read_page (owned P1) always
      // remains available.
      const NATIVE_TOOL_VENDORS = new Set([
        "anthropic",
        "openai",
        "google",
        "xai",
      ]);
      // Vendor resolution: direct vendor connections use their preset;
      // gateway connections serve namespaced models ("anthropic/…") — the
      // prefix names the vendor that actually executes, and the Vercel AI
      // Gateway passes provider-defined tools through to it (owner
      // expectation: the Gateway serves everything; live smoke verifies).
      // Derived from the single executed-vendor identity (AI 3.4 review
      // fix) — same values as the old inline derivation, one source of truth.
      const executedProviderId = NATIVE_TOOL_VENDORS.has(executedVendorId)
        ? executedVendorId
        : null;
      const nativeSearch =
        executedProviderId && NATIVE_TOOL_VENDORS.has(executedProviderId)
          ? resolveNativeWebSearchTool(executedProviderId)
          : null;
      const searchEnabled = toolConfig["search_web"]?.enabled !== false;
      if (nativeSearch && searchEnabled) {
        // Big-four: provider-native search (integrated, well-cited).
        (tools as Record<string, unknown>)["search_web"] = nativeSearch;
      } else if (
        !nativeSearch &&
        searchEnabled &&
        (await userHasSearchConnection(session.user.id))
      ) {
        // "Dumb models" (DeepSeek, Kimi, Mistral, Groq, local, …): no
        // native search, so attach the app-executed backend (v3.1) under
        // the SAME tool name — using the user's BYOK search connection.
        (tools as Record<string, unknown>)["search_web"] =
          createAppWebSearchTool(session.user.id);
      }

      // Resolve attachments for the model: keep file parts the active
      // provider can consume natively (images for vision; PDFs for
      // Anthropic/Google), and inline the server-extracted text for
      // everything else — so the displayed/persisted message stays a clean
      // chip while the model still receives the content.
      const audioCapable = effectiveCapabilities({ id: activeModelId }).has(
        "audio-input",
      );
      // Repair dangling tool calls BEFORE conversion (S4 smoke finding):
      // an approval that never executed (network error, user typed past
      // it) leaves tool_use without tool_result — Anthropic 400s on every
      // later send, poisoning the conversation. Moved-past pre-output
      // parts become honest error results; the live last message is
      // untouched (that's the resume path).
      // Payload diet server-side too (defense in depth — other surfaces
      // and previously-persisted conversations still carry ciphertext).
      const repairedMessages = compactToolOutputs(
        repairDanglingToolCalls(messages),
      );
      const resolvedMessages = resolveAttachmentsForModel(
        repairedMessages,
        executedVendorId,
        audioCapable,
      );

      // Convert UIMessages to ModelMessages for streamText
      let modelMessages = await convertToModelMessages(
        resolvedMessages as Parameters<typeof convertToModelMessages>[0],
      );

      // Fetch mentioned content for @ mentions (max 5 to limit token usage)
      const mentionedContentIds: string[] = body.mentionedContentIds ?? [];

      // Auto-association interceptor (Session 4a):
      // When this turn is bound to a Conversation entity (sidebar's
      // multi-conv mode), each @mention writes an `auto` association.
      // Folder cascade is intentionally not handled — folder mentions
      // bind to the folder only, per the locked plan decision.
      // (conversationIdForAssoc is hoisted above toolCtx — S3.)
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
          // Folder mentions (FOLDER-CONTEXT-CAPSULE-PLAN Phase 4): the gate
          // runs server-side BEFORE prompt assembly — authoritative stage of
          // the two-stage gate (sweep B5; the composer pre-flight usually
          // makes this a cheap coverage check). Ladder D5: fresh capsule →
          // stale capsule, flagged → honest absence. Gates run in parallel
          // so multiple folder mentions share the wait.
          const folderSections = new Map<string, string>();
          await Promise.all(
            mentionedNodes
              .filter((node) => node.contentType === "folder")
              .map(async (node) => {
                try {
                  const gate = await ensureFolderContextFresh(
                    session.user.id,
                    node.id
                  );
                  if (gate.status === "optedOut") {
                    folderSections.set(
                      node.id,
                      `### ${node.title}\n(folder — its AI context is disabled by the user; only the name is available)`
                    );
                    return;
                  }
                  const capsule =
                    gate.status === "none"
                      ? null
                      : await assembleFolderCapsule(session.user.id, node.id);
                  if (!capsule) {
                    folderSections.set(
                      node.id,
                      `### ${node.title}\n(folder — no context is available yet: generation could not run${gate.reason ? ` (${gate.reason})` : ""}. Say so rather than guessing at its contents.)`
                    );
                    return;
                  }
                  const staleBanner =
                    gate.status === "stale"
                      ? `\n[NOTE: this folder's context could not be fully refreshed (${gate.reason ?? "budget"}) — parts may lag recent edits.]`
                      : "";
                  folderSections.set(node.id, capsule.text + staleBanner);
                  logger.info({
                    layer: "ai",
                    event: "ai_context:mention_gate",
                    summary: `folder mention gated: ${gate.status}`,
                    attrs: {
                      folderId: node.id,
                      status: gate.status,
                      generationCalls: gate.generationCalls,
                      refreshedNodes: gate.refreshedNodes,
                      waitedMs: gate.waitedMs,
                    },
                  });
                } catch (gateError) {
                  logger.warn({
                    layer: "ai",
                    event: "ai_context:mention_gate_caught",
                    summary: "folder mention gate failed — name-only fallback",
                    error: gateError,
                  });
                  folderSections.set(
                    node.id,
                    `### ${node.title}\n(folder — context unavailable due to an internal error)`
                  );
                }
              })
          );

          const sections = mentionedNodes.map((node) => {
            const folderSection = folderSections.get(node.id);
            if (folderSection) return folderSection;
            const text =
              node.notePayload?.searchText || "(no text content available)";
            return `### ${node.title}\n${text.slice(0, 2000)}`;
          });
          mentionedContext = `\n\nThe user has referenced the following content:\n\n${sections.join("\n\n")}`;
        }
      }

      // Folder Studio grounding (Phase 3): a conversation whose contentId is
      // one of the user's folders gets that folder's selected sources in the
      // system prompt. Returns null fast for non-folders; grounding is
      // additive and must never block the chat.
      if (contentId) {
        try {
          const folderGrounding = await withSpan(
            { layer: "ai", name: "studio_folder_grounding" },
            { summary: "assemble folder sources" },
            async () =>
              assembleFolderChatContext(session.user.id, contentId),
          );
          if (folderGrounding) {
            mentionedContext += `\n\n${folderGrounding}`;
            // Auto-context (stale-while-revalidate): THIS message used the
            // context as-is; drain any dirty/uncovered Context in the folder
            // behind the response so the next message is grounded fresher.
            // Self-gates on the user's autoContextMode.
            after(() =>
              refreshContextOnAccess(session.user.id, contentId)
            );
          }
        } catch (groundingError) {
          logger.warn({
            layer: "ai",
            event: "studio:chat:grounding_failed",
            summary: "folder grounding failed — continuing without it",
            error: groundingError,
          });
        }
      }

      // Playbook progressive disclosure (AI v3.2 T3): inject standing rules
      // + the ACTIVE PHASE ONLY — never the whole playbook. `[[wiki-link]]`
      // references in that phase surface as a manifest the model traces on
      // demand via getCurrentNote; sub-playbooks (a linked note OR folder that is
      // itself marked as a playbook) are called out so the model follows
      // their own directives rather than treating them as passive reading.
      let playbookContext = "";
      let playbookAwareness = "";
      let attachedPlaybookResolved = false;
      let rootedPlaybookResolved = false;
      let attachedPlaybookTitle = "";
      // An EXPLICIT attach (/playbook picker) gets the full progressive
      // disclosure below — standing rules + the active phase + reference
      // manifest, and flips the checkpoint cadence.
      const explicitPlaybookId =
        typeof body.playbookId === "string" ? body.playbookId : null;
      const rootedPlaybookId =
        !explicitPlaybookId &&
        contentId &&
        requestsRootedPlaybookExecution(messages)
          ? contentId
          : null;
      // AMBIENT: the user is chatting FROM a note/folder that is itself a
      // playbook, without attaching it. We do NOT auto-run it — that would
      // flip EVERY casual message on a playbook-anchored chat into playbook
      // mode (per-turn phase injection + the stricter checkpoint cadence)
      // the user never asked for. Instead, add a one-line AWARENESS hint so
      // the model can run it WHEN ASKED and knows the content's id — which
      // is what fixes "it couldn't look at what I'm actively viewing" without
      // hijacking the whole conversation.
      const ambientPlaybookId =
        !explicitPlaybookId && !rootedPlaybookId && contentId
          ? contentId
          : null;
      if (explicitPlaybookId) {
        try {
          // Editor extensions for LOSSLESS playbook rendering (v3.6) — built
          // once per request, only on the playbook path.
          const serverExtensions = getServerExtensions();
          const playbookNode = await prisma.contentNode.findFirst({
            where: {
              id: explicitPlaybookId,
              ownerId: session.user.id,
              // Folders can carry a notePayload (the folder "Notes" editor),
              // so a folder marked as a playbook is a legitimate source, not
              // just a dedicated note.
              contentType: { in: ["note", "folder"] },
              deletedAt: null,
            },
            select: {
              title: true,
              notePayload: { select: { tiptapJson: true, metadata: true } },
            },
          });
          if (
            playbookNode?.notePayload &&
            isPlaybookMetadata(playbookNode.notePayload.metadata)
          ) {
            attachedPlaybookResolved = true;
            attachedPlaybookTitle = playbookNode.title;
            const parsed = parsePlaybook(
              playbookNode.notePayload.tiptapJson as JSONContent,
            );
            if (parsed.phases.length > 0) {
              const rawIndex =
                typeof body.activePhaseIndex === "number" ? body.activePhaseIndex : 0;
              const phaseIndex = Math.min(
                Math.max(rawIndex, 0),
                parsed.phases.length - 1,
              );
              const phase = parsed.phases[phaseIndex];
              playbookOutputDirectives.push(
                ...extractPlaybookOutputDirectives(parsed, [phaseIndex]),
              );

              // Reference manifest: title-resolve every [[link]] in the
              // standing rules + active phase (wiki-links carry no id — see
              // lib/domain/editor/extensions/wiki-link.ts).
              const allRefs = [
                ...parsed.standingRules.references,
                ...phase.references,
              ];
              const phaseText = renderPlaybookSection(
                phase.content,
                serverExtensions,
              );
              const referenceContext = await resolvePlaybookReferenceContext(
                session.user.id,
                allRefs,
                phase.references,
              );
              configurePhaseCheckpointGate(phaseCheckpointGate, {
                phaseTitle: phase.title,
                phaseText,
                referenceContentIds:
                  referenceContext.activeReferenceContentIds,
                researchToolsAvailable:
                  "search_web" in tools || "read_page" in tools,
                referenceToolAvailable: "getCurrentNote" in tools,
              });
              recordCompletedPhaseToolsFromMessages(
                phaseCheckpointGate,
                messages,
              );

              // Phase table-of-contents: the model sees the whole run's SHAPE
              // (every phase title) but only the current phase's DETAIL. Without
              // this it can't honor "announce the next phase" — under
              // progressive disclosure it never saw the other phases.
              const phaseToc = parsed.phases
                .map(
                  (p, i) =>
                    `${i + 1}. ${p.title}${i === phaseIndex ? "  ← current (only this phase's detail is loaded)" : ""}`,
                )
                .join("\n");

              const standingText = renderPlaybookSection(
                parsed.standingRules.content,
                serverExtensions,
              );
              playbookContext =
                `\n\n## Active Playbook: "${playbookNode.title}"\n` +
                `This playbook is ALREADY ATTACHED and loaded below — when the user asks to run "this playbook" (or a bare "run it"/"go"), THIS is it. Do not search notes or read anything else to find it; act on the content already provided here.\n` +
                `Phase ${phaseIndex + 1} of ${parsed.phases.length}: "${phase.title}"\n\n` +
                `**Phases:**\n${phaseToc}\n\n` +
                (standingText
                  ? `**Standing rules (always apply):**\n${standingText}\n\n`
                  : "") +
                `**Current phase (the ONLY phase detail loaded):**\n${phaseText}${referenceContext.manifest}`;
            } else {
              // A valid marked playbook can be empty. Keep its explicit
              // identity in context instead of silently falling through to
              // discovery/rooted-note behavior; the assistant should report
              // the missing instructions, never search for a replacement.
              playbookContext =
                `\n\n## Active Playbook: "${playbookNode.title}"\n` +
                "This playbook is explicitly attached, but it contains no instructions. Do not search for another playbook. Tell the user this attached playbook is empty and needs content before it can run.";
            }
          }
        } catch (playbookError) {
          logger.warn({
            layer: "ai",
            event: "playbook:chat:injection_failed",
            summary: "playbook context injection failed — continuing without it",
            error: playbookError,
          });
        }
      } else if (rootedPlaybookId) {
        try {
          // Editor extensions for LOSSLESS playbook rendering (v3.6).
          const serverExtensions = getServerExtensions();
          const rootedNode = await prisma.contentNode.findFirst({
            where: {
              id: rootedPlaybookId,
              ownerId: session.user.id,
              contentType: { in: ["note", "folder"] },
              deletedAt: null,
            },
            select: {
              title: true,
              notePayload: { select: { tiptapJson: true } },
            },
          });
          if (rootedNode?.notePayload) {
            const parsed = parsePlaybook(
              rootedNode.notePayload.tiptapJson as JSONContent,
            );
            rootedPlaybookResolved = true;
            attachedPlaybookTitle = rootedNode.title;
            playbookOutputDirectives.push(
              ...extractPlaybookOutputDirectives(parsed),
            );

            const standingText = renderPlaybookSection(
              parsed.standingRules.content,
              serverExtensions,
            );
            const activePhase = parsed.phases[0];
            const allReferences = [
              ...parsed.standingRules.references,
              ...parsed.phases.flatMap((phase) => phase.references),
            ];
            const referenceContext = await resolvePlaybookReferenceContext(
              session.user.id,
              allReferences,
              activePhase?.references ?? [],
            );
            if (activePhase) {
              configurePhaseCheckpointGate(phaseCheckpointGate, {
                phaseTitle: activePhase.title,
                phaseText: renderPlaybookSection(
                  activePhase.content,
                  serverExtensions,
                ),
                referenceContentIds:
                  referenceContext.activeReferenceContentIds,
                researchToolsAvailable:
                  "search_web" in tools || "read_page" in tools,
                referenceToolAvailable: "getCurrentNote" in tools,
              });
              recordCompletedPhaseToolsFromMessages(
                phaseCheckpointGate,
                messages,
              );
            }
            const phaseText = parsed.phases
              .map(
                (phase, index) =>
                  `### Phase ${index + 1}: ${phase.title}\n${renderPlaybookSection(phase.content, serverExtensions)}`,
              )
              .join("\n\n");
            playbookContext =
              `\n\n## Active Playbook: "${rootedNode.title}"\n` +
              "The user explicitly asked to execute the rooted file as a playbook. Its validated contents are loaded below. Follow it directly; do not search for or substitute another playbook. All phases are visible, so continue through approved checkpoints as instructed.\n\n" +
              (standingText
                ? `**Standing rules (always apply):**\n${standingText}\n\n`
                : "") +
              (phaseText ||
                "This rooted playbook contains no executable instructions. Tell the user it needs content before it can run.") +
              referenceContext.manifest;
          }
        } catch (rootedPlaybookError) {
          logger.warn({
            layer: "ai",
            event: "playbook:chat:rooted_injection_failed",
            summary:
              "explicit rooted playbook injection failed — continuing without it",
            error: rootedPlaybookError,
          });
        }
      } else if (ambientPlaybookId) {
        try {
          const node = await prisma.contentNode.findFirst({
            where: {
              id: ambientPlaybookId,
              ownerId: session.user.id,
              contentType: { in: ["note", "folder"] },
              deletedAt: null,
            },
            select: {
              title: true,
              notePayload: { select: { tiptapJson: true, metadata: true } },
            },
          });
          if (
            node?.notePayload &&
            isPlaybookMetadata(node.notePayload.metadata)
          ) {
            const parsed = parsePlaybook(
              node.notePayload.tiptapJson as JSONContent,
            );
            playbookAwareness =
              `\n\nThe content you're working in — "${node.title}" — is itself a PLAYBOOK` +
              (parsed.phases.length > 0
                ? ` (${parsed.phases.length} phases)`
                : "") +
              `. Do NOT start running it on your own initiative. Only if the user asks you to run, start, or follow it: read its full content with getCurrentNote (contentId: ${ambientPlaybookId}), then follow its standing rules and phases in order, calling phase_checkpoint at each phase boundary.`;
          }
        } catch (awarenessError) {
          logger.warn({
            layer: "ai",
            event: "playbook:chat:awareness_failed",
            summary: "ambient playbook awareness failed — continuing without it",
            error: awarenessError,
          });
        }
      }

      // Discovery and execution are mutually exclusive states. Once the
      // ownership-scoped attachment resolves, remove the discovery tool for
      // this turn so weaker models cannot search for the playbook that is
      // already loaded. Generic note search remains available for phase work.
      if (attachedPlaybookResolved || rootedPlaybookResolved) {
        delete tools.search_playbooks;
        // System context alone proved insufficient for weaker models: the
        // owner smoke trace showed a correctly injected Active Playbook, yet
        // DeepSeek still opened the rooted note first. Put the validated
        // selection directly on the latest user request as well.
        modelMessages = bindPlaybookToLatestUserMessage(
          modelMessages,
          attachedPlaybookTitle,
          rootedPlaybookResolved ? "rooted" : "attached",
        );
      }

      // Rooted-content context: tell the model what this chat is ABOUT, so
      // "this file / the current note / this playbook" resolves to the chat's
      // own subject without the user re-naming it (the "can't you see what I
      // have open?" gap). Skipped when the chat IS the content (full-page chat
      // has its own section) or it's a workflow (workflow section covers it).
      let rootedContentSection = "";
      if (contentId && !isChatContent && !openWorkflowTitle && rootedContentTitle) {
        const readable =
          rootedContentType === "note" || rootedContentType === "folder";
        rootedContentSection = attachedPlaybookResolved
          ? `\n\nThis chat was opened from **"${rootedContentTitle}"** (a ${rootedContentType ?? "content"}). It is optional working context, NOT the selected playbook. The playbook attached to the current user message and loaded in "Active Playbook" is the procedure to execute. Do not read "${rootedContentTitle}" merely to identify, discover, or understand the playbook.` +
            (readable
              ? ` Read the rooted content with getCurrentNote (contentId: ${contentId}) only when the user's request or the active playbook phase actually requires its contents.`
              : "")
          : rootedPlaybookResolved
            ? `\n\nThis chat is rooted in **"${rootedContentTitle}"** (a ${rootedContentType ?? "content"}), and the user explicitly asked to execute it as the Active Playbook. Its validated instructions are already loaded; do not read or search for another playbook.`
            : `\n\nThis chat is rooted in **"${rootedContentTitle}"** (a ${rootedContentType ?? "content"}) — that is what this conversation is about. When the user refers to "this file", "this note", "the current one", "this playbook", etc. without naming it, they mean "${rootedContentTitle}".` +
              (readable
                ? ` Read its content with getCurrentNote (contentId: ${contentId}) when you need it.`
                : "");
      }

      // Resolve the selected custom-instruction context, if any. Sent by
      // the composer's context picker. Ownership-gated; a missing/foreign/
      // deleted id degrades to the base system prompt (returns null).
      let userContextSection = "";
      const contextId: string | null =
        typeof body.contextId === "string" ? body.contextId : null;
      if (contextId) {
        const ctx = await getChatContextBody(session.user.id, contextId);
        if (ctx) {
          userContextSection = `\n\nThe user has set a custom context titled "${ctx.name}". Follow these instructions for how you respond — they take precedence over default tone, but never over safety or the editing rules above:\n\n${ctx.body}`;
        }
      }

      // Side-panel page context (B2): the extension captured what the user is
      // viewing. Untrusted — renderPageContextSection frames it as data, not
      // instructions. Validated defensively (client-supplied) and capped.
      let pageContextSection = "";
      const rawPageContext = body.pageContext;
      if (
        rawPageContext &&
        typeof rawPageContext === "object" &&
        typeof rawPageContext.content === "string" &&
        rawPageContext.content.trim()
      ) {
        pageContextSection = renderPageContextSection({
          title:
            typeof rawPageContext.title === "string" ? rawPageContext.title : null,
          byline: null,
          siteName:
            typeof rawPageContext.siteName === "string"
              ? rawPageContext.siteName
              : null,
          excerpt: null,
          content: rawPageContext.content.slice(0, 100_000),
          quality: "raw",
          scope:
            rawPageContext.scope === "selection" ||
            rawPageContext.scope === "viewport"
              ? rawPageContext.scope
              : "full",
          url: typeof rawPageContext.url === "string" ? rawPageContext.url : "",
          capturedAt: 0,
        });
      }

      // Lightweight current-page hint (url+title) — always present when the panel
      // is on a page, regardless of the attach toggle. Lets the model know WHAT
      // page the user is viewing and read it on demand (the full content is behind
      // its read tool, not pushed unless the user attaches).
      const rawCurrentPage = body.currentPage;
      const currentPageHint =
        rawCurrentPage &&
        typeof rawCurrentPage === "object" &&
        typeof rawCurrentPage.url === "string" &&
        rawCurrentPage.url.trim()
          ? {
              url: rawCurrentPage.url,
              title:
                typeof rawCurrentPage.title === "string" ? rawCurrentPage.title : "",
            }
          : null;
      // The garden doc the user is actively VIEWING (focused content tab) — the
      // internal twin of currentPage. Lets the model resolve "this note/doc"
      // without the user naming it, and read it with getCurrentNote(contentId).
      const rawViewedContent = body.viewedContent;
      const viewedContentHint =
        rawViewedContent &&
        typeof rawViewedContent === "object" &&
        typeof rawViewedContent.contentId === "string" &&
        rawViewedContent.contentId.trim()
          ? {
              contentId: rawViewedContent.contentId,
              title:
                typeof rawViewedContent.title === "string"
                  ? rawViewedContent.title
                  : "",
            }
          : null;

      const toolsActive = Object.keys(tools).length > 0;
      const validatedPlaybookId = attachedPlaybookResolved
        ? explicitPlaybookId
        : rootedPlaybookResolved
          ? rootedPlaybookId
          : null;
      const promptCachePolicy = buildPromptCachePolicy({
        providerId: executedVendorId,
        modelId: activeModelId,
        userId: session.user.id,
        toolNames: Object.keys(tools),
        playbookId: validatedPlaybookId,
        playbookContext,
      });

      // Open the streaming span manually — it outlives this function via
      // streamText's onFinish callback. span.end() / span.fail() will emit
      // with the captured trace_id even after ALS scope exits.
      const streamSpan = startSpan(
        { layer: "ai", name: "chat_stream" },
        {
          attrs: {
            provider: executedVendorId,
            requested_provider: providerId,
            model: activeModelId,
            messages: modelMessages.length,
            tools: tools ? Object.keys(tools).length : 0,
            // S2 debug surface: which tools actually attached, and whether
            // the native search tool made it in (gateway transports may
            // handle provider-defined tools differently than direct).
            tool_names: Object.keys(tools).join(","),
            native_search: "search_web" in tools,
            executed_provider: executedVendorId,
            prompt_cache_enabled: promptCachePolicy.enabled,
            prompt_cache_scope: promptCachePolicy.scope,
            prompt_cache_policy: promptCachePolicy.policyVersion,
          },
          summary: `${executedVendorId}:${activeModelId} streaming`,
        },
      );

      // Capture input messages + mention context to sidecar for replay.
      await spanPayload(streamSpan, "chat_input", {
        messages: modelMessages,
        mentionedContext,
        playbookContext,
        attachedPlaybookResolved,
        rootedPlaybookResolved,
        playbookOutputDirectives,
        outputTarget,
        outputOwnerId,
        outputParentOverride,
        providerId,
        modelId,
        executedProvider: executedVendorId,
        executedModel: activeModelId,
        modelRouteSource,
        temperature: effectiveTemperature,
        maxTokens,
        promptCache: {
          enabled: promptCachePolicy.enabled,
          scope: promptCachePolicy.scope,
          policyVersion: promptCachePolicy.policyVersion,
        },
      });

      // Keyed off the EXECUTED vendor/model (AI 3.4 review fix) — building
      // e.g. anthropic thinking options for an OpenAI-executed turn silently
      // dropped the routed model's reasoning config. Bare id: the catalog
      // stores un-namespaced ids.
      const reasoningProviderOptions = buildProviderOptions(
        executedVendorId,
        executedBareModelId,
      );
      const providerOptions = mergeAIProviderOptions(
        reasoningProviderOptions,
        promptCachePolicy.providerOptions,
      );

      // Turn start — for the generation-duration shown in the assistant avatar
      // tooltip (attached on `finish` in messageMetadata below). Anchored here so
      // it spans the whole turn (reasoning + tools + text), matching the wall
      // time the user waited.
      const turnStartMs = Date.now();

      const result = streamText({
        model: wrappedModel,
        messages: modelMessages,
        tools: toolsActive ? tools : undefined,
        toolChoice: toolsActive ? "auto" : undefined,
        // Reasoning opt-in for Anthropic + Google (Session 6). Undefined
        // for OpenAI o-series (reasoning is automatic) and non-reasoning
        // chat models.
        ...(providerOptions && {
          providerOptions,
        }),
        // Allow up to 8 model turns for multi-step tool workflows.
        // Editor tools may need: read → plan → diff → diff → diff → finish + final text.
        // Flashcard workflows can chain: list_decks → propose_deck (parent)
        //   → propose_deck (child) → propose_cards → final text = 5 steps,
        //   with headroom for an optional search_decks or get_deck call.
        // Base chat (no flashcards, no document) typically needs 2-3 steps.
        // Agentic Browsing Phase 1 (P1-c): in a research run the step cap is
        // DERIVED from the approved page budget (budget×2 + overhead for
        // extract/synthesis), so a run sized for N pages always has the steps to
        // finish N pages. The page budget is the depth lever; this is the safety
        // ceiling that follows it. Outside a research run, the normal 7/8 cap.
        stopWhen: stepCountIs(
          itemIterationBudget != null
            ? // Each item ≈ read + record (+ optional re-read); +8 overhead for
              // list_tabs / propose / roll-up createNote / record_iteration_findings.
              // The client item budget is the true limiter (soft-stops new items);
              // this is the safety ceiling that must not cut off before it.
              itemIterationBudget * 4 + 8
            : researchPageBudget != null
              ? researchPageBudget * 2 + 4
              : editableContentId
                ? 8
                : 7,
        ),
        system: buildSystemPrompt({
          hasImageTools: "generate_image" in tools,
          hasFlashcardTools: "list_decks" in tools,
          hasWebSearch: "search_web" in tools,
          hasCheckpointTool: "phase_checkpoint" in tools,
          hasBrowserReadTool: READ_PAGE_HEADLESS_OR_BROWSER in tools,
          hasTabLauncher: OPEN_TAB_AND_READ in tools,
          hasCoBrowseTools: CO_BROWSE_OPEN in tools,
          hasReadCurrentPage: READ_CURRENT_PAGE in tools,
          hasResearchTools: "extract_structured" in tools,
          hasListTabs: LIST_TABS in tools,
          hasItemIteration: "propose_item_iteration" in tools,
          viewedContentHint,
          // Runtime identity (v3.1): what this turn is ACTUALLY served by,
          // from live routing — so the model self-identifies from ground
          // truth. Prefer the connection's preset template name (matches
          // the picker: "Moonshot (Kimi)"), then the catalog, then the raw
          // id.
          runtimeProviderName:
            (activeConnection?.presetId
              ? lookupTemplate(activeConnection.presetId)?.name
              : undefined) ??
            lookupTemplate(providerId)?.name ??
            PROVIDER_CATALOG.find((p) => p.id === providerId)?.name ??
            providerId,
          runtimeModelId: activeModelId,
          openWorkflowTitle,
          editableContentId,
          isChatContent,
          chatContentId: isChatContent ? contentId : undefined,
          autoPronounceDefault,
          userContextSection,
          mentionedContext,
          playbookContext,
          playbookAwareness,
          rootedContentSection,
          outputTargetSection: renderOutputTargetInstruction(outputTarget),
          hasAttachedPlaybook: attachedPlaybookResolved,
          checkpointIntegritySection:
            renderPhaseCheckpointGateInstruction(phaseCheckpointGate),
          pageContextSection,
          currentPageHint,
        }),
        onStepFinish: (step) => {
          // Tokens-per-phase accumulator (v3.1 R5) — cheap, never throws.
          runTokenCounter.total +=
            (step as { usage?: { totalTokens?: number } }).usage
              ?.totalTokens ?? 0;
          // A checkpoint approval may only surface after the current phase's
          // runtime-verifiable research/reference requirements completed.
          // This includes provider-native search because it is represented in
          // the SDK step's tool calls/results just like app-executed tools.
          recordCompletedPhaseTools(
            phaseCheckpointGate,
            step.toolCalls,
            step.toolResults,
          );
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
          const usage = (
            finishEvent as {
              usage?: PromptCacheUsageLike & {
                outputTokens?: number;
                totalTokens?: number;
              };
            }
          ).usage;
          const finishReason = (finishEvent as { finishReason?: string }).finishReason;
          if (usage?.inputTokens !== undefined) streamSpan.attr("input_tokens", usage.inputTokens);
          if (usage?.outputTokens !== undefined) streamSpan.attr("output_tokens", usage.outputTokens);
          if (usage?.totalTokens !== undefined) streamSpan.attr("total_tokens", usage.totalTokens);
          const cacheUsage = summarizePromptCacheUsage(usage);
          streamSpan.attr("cache_read_tokens", cacheUsage.cacheReadTokens);
          streamSpan.attr("cache_write_tokens", cacheUsage.cacheWriteTokens);
          streamSpan.attr("cache_uncached_tokens", cacheUsage.noCacheTokens);
          streamSpan.attr(
            "cache_hit_rate",
            Number(cacheUsage.hitRate.toFixed(4)),
          );
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
      // Detach-resilience (AI v3 core S1): consume the stream server-side so
      // the tool loop, onFinish, and persistence complete even if the client
      // disconnects mid-run (navigation, tab close, workspace swap). The UI
      // response below tees off the same stream — this does not starve it.
      void result.consumeStream();

      // Resumable tee (AI 3.3): pipe a tee'd copy of the SSE output into
      // Redis for replay. The AI SDK tees internally — this neither
      // consumes the response stream nor competes with consumeStream()
      // above. Undefined when the gate is off ⇒ nothing changes.
      const teeToResumable =
        resumableStreamId && conversationIdForAssoc
          ? ({ stream }: { stream: ReadableStream<string> }) => {
              const streamContext = getStreamContext();
              if (!streamContext) return;
              // Association first so the mapping exists by the time the
              // first chunks land in Redis.
              void associateStream(
                session.user.id,
                conversationIdForAssoc,
                resumableStreamId,
              );
              void streamContext
                .createNewResumableStream(resumableStreamId, () => stream)
                .catch((error) => {
                  logger.warn({
                    layer: "ai",
                    event: "resumable:tee_failed",
                    summary:
                      "resumable stream tee failed — turn continues non-resumable",
                    error,
                  });
                });
            }
          : undefined;

      return result.toUIMessageStreamResponse({
        consumeSseStream: teeToResumable,
        // Continuation awareness (smoke #4 root cause): approval resumes
        // execute tools whose invocation lives in the LAST assistant
        // message of the incoming history. Without originalMessages the
        // stream starts a fresh message, the tool-result chunk finds no
        // matching invocation, and the response pipe dies mid-stream
        // (AI_UIMessageStreamError → browser "network error").
        originalMessages: repairedMessages,
        sendReasoning: true,
        onFinish: async ({ responseMessage, isAborted }) => {
          // Server-side turn persistence + approval notification (S1). Only
          // turns bound to a Conversation entity persist here; ephemeral
          // surfaces keep their existing client-side persist path.
          if (isAborted || !conversationIdForAssoc) return;

          const rawParts = responseMessage.parts as Array<
            Record<string, unknown>
          >;

          try {
            const textCache = rawParts
              .filter((p) => p.type === "text" && typeof p.text === "string")
              .map((p) => p.text as string)
              .join("\n");
            // Empty/absent ids reach here on some continuation shapes —
            // "" is not a valid uuid and was failing EVERY server persist
            // silently (found in smoke #4's server log). Omit → DB
            // generates.
            // Fresh turns carry AI-SDK nanoid ids (not uuids) — the CLIENT
            // owns their persistence (create + continuation PATCH). Server
            // create/update only applies to uuid ids, i.e. messages loaded
            // from history whose client id IS the DB row id.
            const isUuid =
              typeof responseMessage.id === "string" &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                responseMessage.id,
              );
            if (isUuid) {
            const messageId = responseMessage.id;
            await appendMessage(session.user.id, conversationIdForAssoc, {
              id: messageId,
              role: "assistant",
              providerId: executedVendorId,
              modelId: activeModelId,
              parts: responseMessage.parts,
              textCache: textCache || null,
              // Persist the turn's model-route stamp (AI 3.4) — this is the
              // only durable record for server-persisted turns (the client
              // path forwards its own metadata; this path used to write
              // null, leaving those turns permanently unattributed).
              metadata: {
                modelRoute: resolvedModelRoute,
                ...(modelRouteNotices.length > 0
                  ? { modelRouteNotices }
                  : {}),
              },
              parentId: null,
            });
            }
          } catch (error) {
            if ((error as { code?: string }).code === "P2002") {
              // The row exists (client persisted the pre-approval half).
              // A continuation carries NEW parts under the SAME id — update
              // the row so post-approval content isn't lost.
              try {
                await prisma.conversationMessage.updateMany({
                  where: {
                    id: responseMessage.id,
                    conversation: {
                      id: conversationIdForAssoc,
                      ownerId: session.user.id,
                    },
                  },
                  data: {
                    parts: responseMessage.parts as unknown as Prisma.InputJsonValue,
                  },
                });
              } catch {
                /* best-effort — client copy remains authoritative */
              }
            } else {
              logger.error({
                layer: "ai",
                event: "chat:server_persist:failed",
                summary: "server-side assistant turn persistence failed",
                error,
              });
            }
          }

          // Notification rule (owner, 2026-07-17): approval-requested is a
          // notify trigger; run-finish notification arrives with playbook
          // run semantics in S4. collapseKey coalesces repeated pauses in
          // one conversation; subject enables mark-read-on-view later.
          const pausedTools = rawParts
            .filter((p) => p.state === "approval-requested")
            .map((p) =>
              typeof p.type === "string" && p.type.startsWith("tool-")
                ? p.type.slice(5)
                : "a tool",
            );
          if (pausedTools.length > 0) {
            await publishEvent(prisma, {
              kind: "ai.notify",
              actorType: "ai",
              actorLabel: "Assistant",
              subjectType: "conversation",
              subjectId: conversationIdForAssoc,
              payload: {
                title: "Approval needed",
                body: `The assistant paused and needs your approval to run: ${pausedTools.join(", ")}.`.slice(
                  0,
                  1000,
                ),
                conversationId: conversationIdForAssoc,
              },
              recipients: [
                {
                  userId: session.user.id,
                  collapseKey: `ai-approval:${conversationIdForAssoc}`,
                },
              ],
            }).catch(() => null);
          }
        },
        messageMetadata: ({ part }) => {
          // The turn's resolved model route (AI 3.4) — attached at `start`
          // so the client can render the inline switch line before the first
          // token, and REPEATED on `finish` so it survives to persistence
          // regardless of how the SDK merges start/finish metadata. Any
          // fall-through notices ride alongside.
          const routeMeta = {
            modelRoute: resolvedModelRoute,
            ...(modelRouteNotices.length > 0 ? { modelRouteNotices } : {}),
          };
          if (part.type === "start") {
            return routeMeta;
          }
          if (part.type === "finish") {
            return {
              ...routeMeta,
              usage: {
                inputTokens: part.totalUsage?.inputTokens,
                outputTokens: part.totalUsage?.outputTokens,
                totalTokens: part.totalUsage?.totalTokens,
              },
              // Generation wall time for the avatar tooltip (persisted with the
              // message, so it survives reload alongside usage).
              durationMs: Date.now() - turnStartMs,
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
  audioCapable: boolean,
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
      const isAudio = mediaType.startsWith("audio/");

      if (isImage || (isPdf && nativePdf) || (isAudio && audioCapable)) {
        kept.push(stripAppMeta(p));
      } else if (isAudio) {
        // Audio but the model can't hear it — tell the model so it can ask the
        // user to switch to an audio-input model rather than silently ignoring.
        inlined.push(
          `[Attached audio: ${filename} — the selected model can't process audio. Ask the user to switch to an audio-input model.]`,
        );
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

/**
 * GET /api/ai/chat — re-attach to an in-flight stream (AI 3.3).
 *
 * useChat's reconnectToStream issues a GET here; the client transport's
 * prepareReconnectToStreamRequest puts the persistent conversationId in
 * the query (the useChat id is the surface-scoped conversationKey,
 * which the server doesn't know). Authorization is the association key
 * itself — lookups are scoped to the caller's userId, so a guessed
 * conversationId can never reach another owner's stream.
 *
 * Every quiet path returns 204: the transport treats 204 as "nothing to
 * resume" and ANY non-OK status as an error surfaced to onError, so
 * ordinary absence must never 4xx/5xx here.
 */
export async function GET(request: Request) {
  try {
    const session = await requireAuth();

    const conversationId = new URL(request.url).searchParams.get(
      "conversationId",
    );
    if (!conversationId || !isResumableConfigured()) {
      return new Response(null, { status: 204 });
    }

    // Same gate as the POST tee: toggle off ⇒ zero Redis traffic.
    const userSettings = await getUserSettings(session.user.id);
    if (userSettings.ai?.resumableStreams === false) {
      return new Response(null, { status: 204 });
    }

    const streamContext = getStreamContext();
    if (!streamContext) return new Response(null, { status: 204 });

    const streamId = await getActiveStreamId(session.user.id, conversationId);
    if (!streamId) return new Response(null, { status: 204 });

    // undefined = unknown streamId, null = stream already finished —
    // both mean "nothing live to attach to"; persistence has (or will
    // have) the completed message for the next history load.
    const stream = await streamContext.resumeExistingStream(streamId);
    if (!stream) return new Response(null, { status: 204 });

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      status: 200,
      headers: UI_MESSAGE_STREAM_HEADERS,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Authentication required"
    ) {
      return Response.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        },
        { status: 401 },
      );
    }
    // Redis/replay hiccups must not surface as chat errors — absence
    // semantics keep the client on today's behavior.
    logger.warn({
      layer: "ai",
      event: "resumable:get_failed",
      summary: "resume GET failed — returning 204 (no resume)",
      error,
    });
    return new Response(null, { status: 204 });
  }
}
