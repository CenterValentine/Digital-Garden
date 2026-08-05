/**
 * useConversationEngine — shared chat engine for sidebar + full-page surfaces.
 *
 * Consolidates the AI SDK `useChat` setup, input state, mention search +
 * tracking, command items, model selection, and auto-scroll behavior that
 * `ChatPanel` (sidebar) and `ChatViewer` (full-page) previously each
 * implemented independently.
 *
 * Session 1 scope: structural extraction only — UI and behavior are
 * unchanged. Later sessions evolve persistence, associations, and
 * provider theming on top of this hook.
 *
 * The hook does not own:
 *   - persistence (full-page persists to ChatPayload; sidebar saves on demand)
 *   - editor-tool orchestration (sidebar-only; lives in ChatPanel)
 *   - chat-outline extraction (full-page-only; lives in ChatViewer)
 *   - UI rendering (each surface composes its own shell)
 *
 * AI SDK v6 references:
 *   - 6.0.140: HTTP Chat Transport supports resolvable body — used here.
 *   - 6.0.163: useChat onFinish exposes finishReason + messages — pre-staged
 *     in `onFinish` so Sessions 2+ can wire persistence without refactoring.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
  type FileUIPart,
} from "ai";
import {
  acquireUrlWithFallback,
  launchTabAndRead,
  isExtensionAcquireAvailable,
} from "@/lib/domain/browser-extension/acquire-url";
import { READ_PAGE_HEADLESS_OR_BROWSER } from "@/lib/domain/ai/tools/read-page-in-browser";
import { OPEN_TAB_AND_READ } from "@/lib/domain/ai/tools/open-tab-and-read";
import {
  CO_BROWSE_OPEN,
  CO_BROWSE_ACT,
  READ_CURRENT_PAGE,
  LIST_TABS,
} from "@/lib/domain/ai/tools/co-browse-tools";
import {
  isCoBrowseAvailable,
  coBrowseOpen,
  coBrowseSnapshot,
  coBrowseNavigate,
  coBrowseClick,
  coBrowseHover,
  coBrowseType,
  coBrowseScroll,
  coBrowseCollect,
  coBrowseBack,
  coBrowseReveal,
  coBrowseShowTimer,
  coBrowseClearTimer,
  coBrowseListTabs,
  type CoBrowseNode,
} from "@/lib/domain/browser-extension/co-browse";
import { capturePageContent } from "@/lib/domain/browser-extension/panel-bridge";
import {
  markCoBrowseActive,
  beginCoBrowseWait,
  endCoBrowseWait,
} from "@/state/co-browse-store";
import { toast } from "sonner";
import { convertHeicToJpegFile } from "@/lib/infrastructure/media/heic-convert";
import type { ChatStatus } from "ai";
import {
  BASE_TOOL_METADATA,
  BASE_TOOL_IDS,
} from "@/lib/domain/ai/tools/metadata";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import { effectiveCapabilities } from "@/lib/domain/ai/features/capabilities";
import {
  useModelSelection,
} from "@/components/content/ai/ModelPicker";
import type { SuggestionItem } from "@/components/content/ai/ChatSuggestionMenu";
import { useSettingsStore } from "@/state/settings-store";
import { compactToolOutputs } from "@/lib/domain/ai/compact-tool-outputs";
import {
  getAttachedPageContext,
  getCurrentPageHint,
} from "@/state/panel-page-context-store";
import { getActiveViewedContentHint } from "@/state/content-store";
import {
  DEFAULT_OUTPUT_TARGET,
  createOutputTargetMessagePart,
  outputTargetStorageKey,
  readStoredOutputTarget,
  resolveOutputTargetKeyChange,
  writeStoredOutputTarget,
  type OutputTarget,
} from "@/lib/domain/ai/output-target";
import { createPlaybookMessageAttachmentPart } from "@/lib/domain/ai/playbooks/message-binding";
import { stopPendingToolCalls } from "@/lib/domain/ai/repair-dangling-tools";
import { getContentWriteRefreshTargets } from "@/lib/domain/ai/content-write-receipts";

export type { OutputTarget } from "@/lib/domain/ai/output-target";

/**
 * Stream-time artifact refresh (AI v3.1 R2). Parses a tool part's generic
 * content-write receipts and dispatches the freshness events —
 * dg:tree-refresh (file tree), then dg:notes-refresh (surgical note
 * reload) or dg:workflow-refresh (canvas) by content type. Deduped by
 * toolCallId through the shared seen-set so the streaming effect and the
 * onFinish backstop never double-fire, including across two surfaces
 * bound to the same conversation (toolCallIds are globally unique).
 * Legacy __notePayload results remain supported for persisted older chats.
 */
const dispatchedArtifactToolCalls = new Set<string>();

function maybeDispatchArtifactRefresh(part: unknown, seen: Set<string>): void {
  if (typeof window === "undefined") return;
  const p = part as { toolCallId?: string; output?: unknown };
  if (!p.toolCallId || p.output === undefined) return;
  if (seen.has(p.toolCallId)) return;
  const refreshTargets = getContentWriteRefreshTargets(p.output);
  if (refreshTargets.tree) {
    seen.add(p.toolCallId);
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
    for (const contentId of refreshTargets.workflowContentIds) {
      window.dispatchEvent(
        new CustomEvent("dg:workflow-refresh", {
          detail: { contentId },
        }),
      );
    }
    for (const contentId of refreshTargets.noteContentIds) {
      // Surgical notes-only refresh — narrower than `content-updated`,
      // which resets loading/outline/tab state (see MainPanelContent).
      window.dispatchEvent(
        new CustomEvent("dg:notes-refresh", {
          detail: { contentId },
        }),
      );
    }
    return;
  }

  // Backward compatibility for persisted pre-receipt tool results.
  try {
    const legacy =
      typeof p.output === "string"
        ? (JSON.parse(p.output) as {
            __notePayload?: boolean;
            contentId?: string;
            noun?: string;
          })
        : (p.output as {
            __notePayload?: boolean;
            contentId?: string;
            noun?: string;
          });
    if (!legacy.__notePayload || typeof legacy.contentId !== "string") return;
    seen.add(p.toolCallId);
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
    window.dispatchEvent(
      new CustomEvent(
        legacy.noun === "workflow"
          ? "dg:workflow-refresh"
          : "dg:notes-refresh",
        { detail: { contentId: legacy.contentId } },
      ),
    );
  } catch {
    /* unparseable tool output — skip */
  }
}

/** Mention syntax shared by composer + send pipeline: `@[Title](id)`. */
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** Default mention search hint copy keyed by tool id. */
const COMMAND_HINTS: Record<string, string> = {
  searchNotes: "Search my notes for ",
  getCurrentNote: "Read the current note",
  createNote: "Create a new note titled ",
};

/**
 * One transport instance is shared across all uses of this hook. The
 * dynamic body (contentId, providerId, modelId, mentions) flows per-call
 * via `sendMessage(msg, { body })` — supported since AI SDK 6.0.140+.
 * That keeps the transport pure and side-steps the React Compiler's
 * render-time ref-read prohibition.
 */
/**
 * Per-chat baseline request bodies (S4 smoke fix, 2026-07-18).
 *
 * The SDK fires INTERNAL requests through the transport WITHOUT the
 * per-call `sendMessage(msg, { body })` enrichment — the approval
 * auto-resume (`sendAutomaticallyWhen` → makeRequest) was the
 * reproducible "network error": a naked resume ran under default
 * provider resolution with no conversation binding, so the approved
 * tool executed against the wrong vendor and nothing persisted. Each
 * engine instance registers a resolver keyed by its useChat id; the
 * transport merges it UNDER any per-call body (per-call wins).
 */
const chatBodyResolvers = new Map<string, () => Record<string, unknown>>();

/**
 * Turn-start body snapshots (2026-07-18 smoke #2): a resume must run with
 * the body that STARTED the turn. Live state can flip mid-run — the
 * per-conversation model memory re-seeds the active selection from
 * message stamps on (re)load, which switched a Sonnet-4 run to the
 * unavailable claude-sonnet-3-5 between the send and its approval
 * resume. Every real user send (carries providerId) is snapshotted here;
 * internal sends replay the snapshot, falling back to the live resolver
 * only when no turn has been sent yet in this chat instance.
 */
const lastSentBodies = new Map<string, Record<string, unknown>>();

const chatTransport = new DefaultChatTransport({
  api: "/api/ai/chat",
  prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => {
    const perCall =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : undefined;
    if (id && perCall && "providerId" in perCall) {
      lastSentBodies.set(id, perCall);
    }
    const baseline = id
      ? (lastSentBodies.get(id) ?? chatBodyResolvers.get(id)?.() ?? {})
      : {};
    // Replicates the SDK's default payload shape; per-call body wins over
    // the baseline so explicit sends behave exactly as before.
    return {
      body: {
        ...baseline,
        ...(perCall ?? {}),
        id,
        // Payload diet: strip provider ciphertext (encryptedContent) from
        // prior tool results — multi-MB otherwise, which kills the POST.
        messages: compactToolOutputs(messages),
        trigger,
        messageId,
      },
    };
  },
  // Resume bridge (AI 3.3): the SDK's default reconnect URL is
  // `${api}/${useChat-id}/stream`, but the useChat id is the
  // surface-scoped conversationKey — the server keys resumable streams
  // by the persistent conversationId. Rewrite the reconnect GET to the
  // same route with the real conversationId in the query, resolved from
  // this chat's registered baseline body. An empty conversationId (chat
  // not yet bound) still produces a valid URL the server answers with
  // 204 — a quiet no-op.
  prepareReconnectToStreamRequest: ({ id, api }) => {
    const baseline = id ? chatBodyResolvers.get(id)?.() : undefined;
    const conversationId =
      baseline && typeof baseline.conversationId === "string"
        ? baseline.conversationId
        : "";
    return {
      api: `${api}?conversationId=${encodeURIComponent(conversationId)}`,
    };
  },
});

/**
 * Payload passed to a surface's `onFinish` callback.
 *
 * The shape matches AI SDK 6.0.163+ — surfaces receive the full message
 * array and the upstream finish reason so persistence layers (Session 2)
 * can act on completed turns.
 */
export interface ConversationEngineFinishEvent {
  messages: UIMessage[];
  /**
   * The fresh final assistant message from the AI SDK's onFinish event.
   * Carries `metadata` (token usage, finishReason) applied *just before*
   * onFinish fired — typically not yet reflected in `messages` because
   * the SDK mutates `state.message.metadata` directly without a
   * setMessages flush. Use this when you need the latest metadata.
   */
  message?: UIMessage;
  finishReason?: string;
  /** True when the user explicitly stopped the active response. */
  isAbort: boolean;
}

export interface UseConversationEngineParams {
  /**
   * Identifier for the in-memory useChat instance. Different surfaces
   * viewing the same content must use different keys so their message
   * arrays don't cross-contaminate (e.g. sidebar uses
   * `sidebar-chat:${contentId}` while full-page uses `${contentId}`).
   */
  conversationKey: string;
  /**
   * The content node id this conversation is bound to (for editor tools
   * and mention context). Forwarded to the server with each turn.
   */
  contentId?: string | null;
  /**
   * Persistent Conversation entity id (Session 2+). When set, forwarded
   * to the chat route so it can write auto-associations on @mentions
   * and tool-calls, and resolve the active connection from the user's
   * preferences for that conversation.
   */
  conversationId?: string | null;
  /**
   * Selected custom-instruction context id, forwarded with each turn so
   * the chat route can append the context body to the system prompt.
   * Null/undefined sends no personalization (base prompt).
   */
  activeContextId?: string | null;
  /**
   * Optional initial messages used to seed the chat (e.g. when a full-
   * page chat loads a previously-persisted conversation on mount).
   */
  initialMessages?: UIMessage[];
  /**
   * Called when an assistant turn completes. Surfaces use this to
   * persist, refresh derived UI, etc. AI SDK 6.0.163+ payload.
   */
  onFinish?: (event: ConversationEngineFinishEvent) => void;
  /**
   * Override the default `toast.error` behavior on chat error.
   */
  onError?: (error: Error) => void;
  /**
   * Stable ref the binding hook populates with a server-side supersede
   * call. `editMessage`/`regenerateMessage` await it before re-running so
   * the conversation's non-hidden rows match the truncated view. No-op in
   * transient/unbound mode.
   */
  truncateRef?: React.RefObject<
    (clientId: string, inclusive: boolean) => Promise<void>
  >;
  /**
   * Stable ref the engine writes the exact parts of the just-sent user
   * turn into (text + attachment file parts). The binding hook reads it to
   * persist attachments reliably — AI SDK's in-memory message can drop
   * file parts after the turn, so we never re-derive them from there.
   */
  pendingUserPartsRef?: React.RefObject<UIMessage["parts"] | null>;
}

export interface UseConversationEngineResult {
  // ── useChat surface ──
  messages: UIMessage[];
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  status: ChatStatus;
  stop: () => void;
  error: Error | undefined;
  setMessages: ReturnType<typeof useChat>["setMessages"];
  /**
   * Respond to a tool approval request (AI SDK v6 native HITL — AI v3 core
   * S1). Tools flagged `needsApproval` pause the loop in
   * `approval-requested` state; the chat surface renders an approval card
   * whose Approve/Reject calls this. The loop resumes automatically once
   * all pending approvals are answered.
   */
  addToolApprovalResponse: ReturnType<
    typeof useChat
  >["addToolApprovalResponse"];
  /** True while the model is processing (submitted or streaming). */
  isActive: boolean;
  /**
   * True while the active stream began as a resume (reload / second tab)
   * rather than a fresh send (AI 3.3). Lets the view render the buffered
   * flood settled instead of re-typing it.
   */
  resumedStream: boolean;

  // ── input + send ──
  input: string;
  setInput: (value: string) => void;
  /** Send the current input with @mention reconstruction. */
  handleSend: () => void;

  // ── attachments (Session 5b) ──
  /** Pending/ready attachments in the composer. */
  attachments: ChatAttachment[];
  /** Classify + upload files (images → storage, text → inlined). */
  addAttachmentFiles: (files: File[] | FileList) => void;
  /** Drop an attachment from the composer before send. */
  removeAttachment: (id: string) => void;
  /** True while any attachment is still uploading (gates send). */
  attachmentsUploading: boolean;
  /** Whether the active model can accept image attachments. */
  supportsImageAttachments: boolean;

  // ── edit / regenerate (Session 5a) ──
  /**
   * Replace a user message with new text and re-run from that point.
   * Supersedes the old turn (and everything after) server-side first.
   */
  editMessage: (messageId: string, newText: string) => Promise<void>;
  /**
   * Re-run the model for an assistant message. Supersedes the old
   * answer (and anything after) server-side first.
   */
  regenerateMessage: (messageId: string) => Promise<void>;

  // ── provider/model ──
  providerId: string;
  modelId: string;
  handleModelChange: ReturnType<typeof useModelSelection>["handleChange"];
  /**
   * Whether the model is pinned for this conversation (AI 3.4). Pinned ⇒ the
   * selected model wins over playbook phase directives. Toggled explicitly
   * via `setModelPinned` (the footer pin control).
   */
  modelPinned: boolean;
  /** Pin/unpin the current model for this conversation. */
  setModelPinned: (pinned: boolean) => void;

  // ── suggestions ──
  mentionResults: SuggestionItem[];
  handleMentionSearch: (query: string) => void;
  /** Tool-hint commands + playbook attach entries for the `/` menu. */
  commandItems: SuggestionItem[];

  // ── playbooks (AI v3.2 T3) ──
  /** The playbook attached to this conversation, or null. */
  activePlaybook: ActivePlaybook | null;
  /** Attach a playbook — called when ChatInput's `/` selection is a playbook. */
  attachPlaybook: (item: SuggestionItem) => void;
  /** Detach the active playbook (dismiss the composer chip). */
  detachPlaybook: () => void;

  // ── output target (WS7) ──
  /** Where new content lands by default (persisted per conversation). */
  outputTarget: OutputTarget;
  /** Update the output target (the OutputTargetChip's onChange). */
  setOutputTarget: (target: OutputTarget) => void;
  /**
   * Carry the transient chat's current target across promotion to a newly
   * created conversation. This is an explicit state handoff; localStorage is
   * retained as the remount/reload fallback.
   */
  promoteOutputTarget: (conversationId: string) => void;

  // ── suggested follow-ups (Session 7) ──
  /** 2-3 chip suggestions generated after the last assistant turn. */
  followUps: string[];
  /** Clear the chips (parent calls on new send or explicit dismiss). */
  clearFollowUps: () => void;

  // ── scroll ──
  /** RefObject for reads (e.g. scroll-to-message). Attach via `setScrollEl`. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Callback ref for the scroll container — binds the stick-to-bottom listener. */
  setScrollEl: (el: HTMLDivElement | null) => void;
  /** True when the user has scrolled up and auto-scroll is released. */
  showJumpToLatest: boolean;
  /** Scroll to the bottom and re-engage auto-scroll. */
  scrollToBottom: () => void;

  // ── per-message stamping ──
  /**
   * Resolve the provider + model that generated a given message.
   * Returns the stamped values when known (captured at send time) or
   * `fallback` otherwise.
   */
  getMessageStamp: (messageId: string, fallback: MessageStamp) => MessageStamp;
  /** Back-compat shim that returns only the providerId. */
  getProviderForMessage: (messageId: string, fallback: string) => string;
  /**
   * Seed stamps for messages loaded from persistence (Session 5a fix).
   * Without this, historical messages have no stamp and fall back to the
   * *active* selection — so the avatar tooltip would show the currently-
   * picked model instead of the one that actually answered. Only fills
   * gaps; never overwrites a stamp captured this session.
   */
  seedMessageStamps: (stamps: Record<string, MessageStamp>) => void;
}

/** Captured at send time and propagated to user + assistant turns. */
export interface MessageStamp {
  providerId: string;
  modelId: string;
}

/** A pending/ready chat attachment held in the composer before send. */
export interface ChatAttachment {
  /** Client-local id for list keying + removal. */
  id: string;
  name: string;
  /**
   * image → sent as a file part (vision);
   * audio → sent as a file part (audio-input models), else placeholder;
   * text  → inlined into the prompt;
   * document (PDF) → native file part for capable models, else inlined
   * extracted text.
   */
  kind: "image" | "audio" | "text" | "document";
  status: "uploading" | "ready" | "error";
  /** Image/document: the hosted URL the model fetches. */
  url?: string;
  /** Object-storage key — persisted in the file part so trash purge can
   *  delete the blob deterministically. */
  storageKey?: string;
  /** Referenced ContentNode id — lets the message chip open the file in
   *  the content viewer. */
  contentNodeId?: string;
  /** Image/document: IANA media type. */
  mediaType?: string;
  /** Text, or extracted document text — folded into the message on send. */
  text?: string;
  error?: string;
}

/** Playbook summary shape returned by GET /api/content/playbooks. */
interface PlaybookCommandSource {
  id: string;
  title: string;
  description: string;
  phaseCount: number;
}

/** The playbook currently attached to the composer (AI v3.2 T3). */
export interface ActivePlaybook {
  id: string;
  title: string;
  /** Phases completed so far — derived from resolved phase_checkpoint calls. */
  phaseIndex: number;
  phaseCount: number;
}

/**
 * Auto-resume predicate for the client-executed `read_page_in_browser` tool
 * (Agentic Browsing Phase 0). The server stops the stream at the tool call (no
 * server `execute`); once `onToolCall` supplies the result via `addToolResult`,
 * the loop must re-POST so the model can use it.
 *
 * Deliberately TARGETED to our tool only (the last step contains a resolved
 * `read_page_in_browser`), NOT the SDK's
 * `lastAssistantMessageIsCompleteWithToolCalls`: that also fires when a normal
 * server-tool turn stops on a resolved tool at the `stopWhen` step-count limit,
 * which would defeat that bound and risk a runaway loop.
 */
function lastMessageHasResolvedBrowserRead({
  messages,
}: {
  messages: UIMessage[];
}): boolean {
  const message = messages[messages.length - 1];
  if (!message || message.role !== "assistant") return false;
  const lastStepStart = message.parts.reduce(
    (last, part, index) => (part.type === "step-start" ? index : last),
    -1,
  );
  const browserReadParts = message.parts
    .slice(lastStepStart + 1)
    .filter(
      (part) =>
        part.type === `tool-${READ_PAGE_HEADLESS_OR_BROWSER}` ||
        part.type === `tool-${OPEN_TAB_AND_READ}` ||
        // Co-browse tools (Slice 5c) are client-executed the same way — resume the
        // loop after their result so the model can act → look → act.
        part.type === `tool-${CO_BROWSE_OPEN}` ||
        part.type === `tool-${CO_BROWSE_ACT}` ||
        part.type === `tool-${READ_CURRENT_PAGE}` ||
        part.type === `tool-${LIST_TABS}`,
    ) as Array<{ state?: string }>;
  return (
    browserReadParts.length > 0 &&
    browserReadParts.every(
      (part) =>
        part.state === "output-available" || part.state === "output-error",
    )
  );
}

/**
 * Compact the co-browse a11y snapshot for the MODEL (Slice 5c): keep only what it
 * targets by — role + name + the states that matter (value / expanded / disabled)
 * + a frame marker for cross-origin nodes. Drop the internal handles
 * (backendDOMNodeId / sessionId) it never references. Order is preserved so `nth`
 * lines up with the extension's resolveFresh.
 */
/** Best-effort host label for the co-browse indicator. */
function safeHost(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function coBrowseSnapshotOutput(snap: {
  ok: boolean;
  data?: { nodes: CoBrowseNode[]; url?: string; captchaDetected?: boolean };
  error?: string;
}): Record<string, unknown> {
  const nodes = snap.ok ? (snap.data?.nodes ?? []) : [];
  const elements = nodes.map((n) => ({
    role: n.role,
    name: n.name,
    ...(n.value ? { value: n.value } : {}),
    ...(n.expanded === true || n.expanded === false ? { expanded: n.expanded } : {}),
    ...(n.disabled ? { disabled: true } : {}),
    // Elements sharing a `group` are in the same card/row/item — use it to act on
    // the RIGHT one (e.g. the apply button in THIS job's group).
    ...(typeof n.group === "number" ? { group: n.group } : {}),
    ...(n.frameUrl ? { frame: n.frameUrl } : {}),
  }));
  return {
    // Trust-labeled: element names/text come from the page — informational only,
    // they never instruct the model (mirrors read_page's untrustedWebContent).
    trust: "untrusted-web",
    // Current URL — compare across snapshots to classify page behavior: URL
    // changed = a new page opened (use `back` to return); URL same = content
    // loaded in place (the previous list is still there).
    ...(snap.data?.url ? { url: snap.data.url } : {}),
    elementCount: elements.length,
    elements,
    // A captcha / anti-bot challenge frame is present. Its nodes are deliberately
    // excluded above — STOP and hand to the user; no tool can (or should) solve it.
    ...(snap.data?.captchaDetected ? { captchaDetected: true } : {}),
    ...(snap.ok ? {} : { snapshotError: snap.error }),
  };
}

/**
 * Agentic Browsing Phase 1 — derive the CURRENTLY-ACTIVE research run's page
 * budget from the message history, or null if none is active. A run opens on an
 * approved `propose_research_run` result and closes on a `record_research_findings`
 * result; the latest un-closed proposal wins. Used to seed the client-side
 * per-run budget lazily on the first read (before `onFinish` has run), and to
 * detect closure — so the budget is scoped strictly to an active run and never
 * touches a normal one-off read.
 */
function deriveActiveResearchRun(
  messages: UIMessage[],
): { pageBudget: number } | null {
  let active: { pageBudget: number } | null = null;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const part of m.parts) {
      const p = part as { type?: string; state?: string; output?: unknown };
      if (
        p.type === "tool-propose_research_run" &&
        p.state === "output-available"
      ) {
        const out = p.output as
          | { ok?: boolean; pageBudget?: number }
          | undefined;
        if (out?.ok && typeof out.pageBudget === "number" && out.pageBudget > 0) {
          active = { pageBudget: out.pageBudget };
        }
      } else if (
        p.type === "tool-record_research_findings" &&
        p.state === "output-available"
      ) {
        active = null; // run closed by its findings write
      }
    }
  }
  return active;
}

/**
 * Per-item iteration (level-2 controller; see the iteration spec) — derive the
 * CURRENTLY-ACTIVE iteration's item budget AND how many items are already
 * recorded, straight from history. Opens on an approved `propose_item_iteration`
 * result; every `record_item_result` counts against the budget; closes on
 * `record_iteration_findings`. Recomputed from messages (not a mutable counter)
 * because items are recorded by a SERVER tool — onToolCall never sees those
 * calls, so a client-side increment would drift. The scan is the source of truth.
 */
function deriveActiveItemIteration(
  messages: UIMessage[],
): { itemBudget: number; itemsRecorded: number } | null {
  let active: { itemBudget: number; itemsRecorded: number } | null = null;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const part of m.parts) {
      const p = part as { type?: string; state?: string; output?: unknown };
      if (
        p.type === "tool-propose_item_iteration" &&
        p.state === "output-available"
      ) {
        const out = p.output as { ok?: boolean; itemBudget?: number } | undefined;
        if (out?.ok && typeof out.itemBudget === "number" && out.itemBudget > 0) {
          active = { itemBudget: out.itemBudget, itemsRecorded: 0 };
        }
      } else if (
        p.type === "tool-record_item_result" &&
        p.state === "output-available" &&
        active
      ) {
        const out = p.output as { ok?: boolean } | undefined;
        if (out?.ok !== false) active.itemsRecorded += 1;
      } else if (
        p.type === "tool-record_iteration_findings" &&
        p.state === "output-available"
      ) {
        active = null; // run closed by its reconciliation write
      }
    }
  }
  return active;
}

export function useConversationEngine({
  conversationKey,
  contentId,
  conversationId,
  activeContextId,
  initialMessages,
  onFinish,
  onError,
  truncateRef,
  pendingUserPartsRef,
}: UseConversationEngineParams): UseConversationEngineResult {
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── stick-to-bottom scroll ──
  // Auto-scroll only while the user is near the bottom. Scrolling up
  // "breaks" the lock so the reply can be read mid-stream; returning to the
  // bottom re-engages it. A scroll listener (bound via the `setScrollEl`
  // callback ref) keeps `pinnedRef` current without re-rendering on scroll.
  const SCROLL_BOTTOM_THRESHOLD = 80;
  const pinnedRef = useRef(true);
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const setScrollEl = useCallback((el: HTMLDivElement | null) => {
    // Detach any prior listener (element swapped on chat switch / unmount).
    scrollCleanupRef.current?.();
    scrollCleanupRef.current = null;
    scrollRef.current = el;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distance <= SCROLL_BOTTOM_THRESHOLD;
      pinnedRef.current = atBottom;
      setShowJumpToLatest(!atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    scrollCleanupRef.current = () =>
      el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  // ── Sticky drafts ──
  // Persist the in-progress prompt per chat to localStorage so users
  // returning to the same conversation (in the same browser) find what
  // they were typing. Scope:
  //   - conversationId when bound — finer-grained, supports per-chat
  //     drafts in multi-conversation notes;
  //   - contentId in transient mode (pre-Conversation) so a draft typed
  //     before sending the first message survives a quick reload.
  // Cleared on send via the existing setInput("") — the persistence
  // effect deletes the storage key when input is empty.
  const draftStorageKey = conversationId
    ? `dg:chat-draft:conv:${conversationId}`
    : contentId
      ? `dg:chat-draft:content:${contentId}`
      : null;

  /**
   * Hydrate from localStorage at useState init time — NOT in a
   * post-render useEffect. The useEffect-hydrate approach raced with
   * the persistence effect on mount: hydrate queued setInput(saved),
   * but the persistence effect ran in the same commit with input="",
   * matched the gate (lastHydratedKeyRef was just set), and wrote ""
   * to localStorage — wiping the draft before the setInput re-render
   * had a chance to write it back.
   *
   * Lazy init runs once per mount BEFORE the first render, so input's
   * initial value already reflects what's in localStorage. The
   * persistence effect's first fire sees the correct value.
   */
  const [input, setInput] = useState<string>(() => {
    if (typeof window === "undefined" || !draftStorageKey) return "";
    try {
      return window.localStorage.getItem(draftStorageKey) ?? "";
    } catch {
      return "";
    }
  });
  // Initialize with the key we just hydrated from so the persistence
  // effect can write immediately for that key without re-running
  // hydrate.
  const lastHydratedKeyRef = useRef<string | null>(draftStorageKey);

  // Re-hydrate when the draft key changes WITHOUT a full remount
  // (rare — most consumers re-key the surrounding component on chat
  // switch). Gated to only fire when the key actually differs from
  // the last hydrated one so the initial mount doesn't trigger this
  // (useState lazy init already handled mount).
  useEffect(() => {
    if (lastHydratedKeyRef.current === draftStorageKey) return;
    if (typeof window === "undefined" || !draftStorageKey) {
      lastHydratedKeyRef.current = null;
      return;
    }
    try {
      const saved = window.localStorage.getItem(draftStorageKey);
      setInput(saved ?? "");
      lastHydratedKeyRef.current = draftStorageKey;
    } catch {
      lastHydratedKeyRef.current = draftStorageKey;
    }
  }, [draftStorageKey]);

  // Persist on input change. Gate prevents writing the previous key's
  // value into the new key during the brief gap between draftStorageKey
  // changing and the hydrate effect catching up (in the no-remount
  // case).
  useEffect(() => {
    if (typeof window === "undefined" || !draftStorageKey) return;
    if (lastHydratedKeyRef.current !== draftStorageKey) return;
    try {
      if (input.length > 0) {
        window.localStorage.setItem(draftStorageKey, input);
      } else {
        window.localStorage.removeItem(draftStorageKey);
      }
    } catch {
      // localStorage write failures are non-blocking — drafts stay
      // in-memory until next key change or page reload.
    }
  }, [input, draftStorageKey]);

  const { providerId, modelId, handleChange: handleModelChange } =
    useModelSelection();

  // ── model pin (AI 3.4) ──
  // A pinned pick is the TOP rung of the server's routing ladder — it wins
  // over any playbook phase directive. `modelPinned` is what lets the server
  // tell a deliberate user choice apart from the provider/model the engine
  // echoes in every baseline body. Persisted per-conversation (mirrors the
  // output-target persistence) so the choice survives reload; released by the
  // picker's unpin control so a playbook can take the wheel again.
  const modelPinKey = conversationId
    ? `dg:model-pinned:conv:${conversationId}`
    : contentId
      ? `dg:model-pinned:content:${contentId}`
      : null;
  // Every key this chat could have been pinned under: promotion dual-writes
  // (a pre-promotion pin lives under content:, then gets copied to conv:),
  // so UNPIN must clear the whole set or stale residue re-pins the chat on
  // the next remount/key flip (smoke finding: "can't unpin").
  const modelPinAltKey =
    conversationId && contentId ? `dg:model-pinned:content:${contentId}` : null;
  const [modelPinned, setModelPinnedState] = useState<boolean>(() => {
    if (typeof window === "undefined" || !modelPinKey) return false;
    try {
      return window.localStorage.getItem(modelPinKey) === "1";
    } catch {
      return false;
    }
  });
  const lastModelPinKeyRef = useRef<string | null>(modelPinKey);
  useEffect(() => {
    // ChatPanel stays mounted across conversation switches — rehydrate the
    // pin for the new key instead of leaking the previous chat's pin.
    if (lastModelPinKeyRef.current === modelPinKey) return;
    lastModelPinKeyRef.current = modelPinKey;
    if (typeof window === "undefined" || !modelPinKey) {
      setModelPinnedState(false);
      return;
    }
    try {
      setModelPinnedState(window.localStorage.getItem(modelPinKey) === "1");
    } catch {
      setModelPinnedState(false);
    }
  }, [modelPinKey]);
  // Same-tab cross-instance sync (smoke finding): the sidebar panel and the
  // full-page viewer each mount their own engine over the SAME chat, and
  // localStorage writes don't notify the same tab — without this event an
  // unpin in one surface left the other's in-memory pin (and its request
  // bodies) stale.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPinEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{ keys?: unknown; pinned?: unknown }>
      ).detail;
      const keys = Array.isArray(detail?.keys) ? detail.keys : [];
      if (modelPinKey && keys.includes(modelPinKey)) {
        setModelPinnedState(detail?.pinned === true);
      }
    };
    window.addEventListener("dg:model-pin", onPinEvent);
    return () => window.removeEventListener("dg:model-pin", onPinEvent);
  }, [modelPinKey]);
  const persistModelPin = useCallback(
    (pinned: boolean) => {
      setModelPinnedState(pinned);
      if (typeof window === "undefined" || !modelPinKey) return;
      try {
        if (pinned) {
          window.localStorage.setItem(modelPinKey, "1");
        } else {
          window.localStorage.removeItem(modelPinKey);
          if (modelPinAltKey) window.localStorage.removeItem(modelPinAltKey);
        }
        window.dispatchEvent(
          new CustomEvent("dg:model-pin", {
            detail: {
              keys: [modelPinKey, modelPinAltKey].filter(Boolean),
              pinned,
            },
          }),
        );
      } catch {
        /* non-blocking — pin stays in memory until next key change */
      }
    },
    [modelPinKey, modelPinAltKey],
  );
  // Pin is now an EXPLICIT toggle, not a side effect of picking a model
  // (smoke finding: auto-pin-on-change was undiscoverable — a user in a
  // rooted-playbook chat who never re-picked saw no pin control at all, and
  // silently pinning on every switch was itself surprising). The picker uses
  // the raw handleModelChange; the footer pin button drives setModelPinned.
  const setModelPinned = persistModelPin;

  // ── @ mention search (150ms debounce) ──
  const [mentionResults, setMentionResults] = useState<SuggestionItem[]>([]);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMentionSearch = useCallback((query: string) => {
    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    mentionTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/content/content?search=${encodeURIComponent(query)}&limit=8`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const data = await res.json();
        const items: SuggestionItem[] = (data.data?.items || []).map(
          (item: { id: string; title: string; contentType: string }) => ({
            id: item.id,
            label: item.title,
            contentType: item.contentType,
            description: item.contentType,
          }),
        );
        setMentionResults(items);
      } catch {
        /* silently fail — search is best-effort */
      }
    }, 150);
  }, []);

  // ── playbooks (AI v3.2 T3) ──
  // Fetched once per mount for the /playbook command entry. A handful of
  // playbooks per user is the expected scale — no search-as-you-type needed,
  // the existing "/" substring filter (below) already narrows the list.
  const [playbooks, setPlaybooks] = useState<PlaybookCommandSource[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/content/playbooks", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const items = data?.data?.playbooks;
        if (Array.isArray(items)) setPlaybooks(items);
      })
      .catch(() => {
        /* best-effort — the picker just shows no playbooks */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── / command items (tool hints + playbooks) ──
  const commandItems = useMemo<SuggestionItem[]>(() => {
    const playbookItems: SuggestionItem[] = playbooks.map((p) => ({
      id: p.id,
      label: p.title,
      description:
        p.description ||
        `Playbook · ${p.phaseCount} phase${p.phaseCount === 1 ? "" : "s"}`,
      contentType: "playbook",
    }));
    const toolItems: SuggestionItem[] = BASE_TOOL_IDS.map((id) => ({
      id,
      label: BASE_TOOL_METADATA[id].name,
      description: BASE_TOOL_METADATA[id].description,
      insertText: COMMAND_HINTS[id] ?? BASE_TOOL_METADATA[id].name,
    }));
    return [...playbookItems, ...toolItems];
  }, [playbooks]);

  // ── active playbook state (AI v3.2 T3) ──
  // Attached via the /playbook command (ChatInput routes "contentType ===
  // playbook" selections here instead of inserting text). The derived
  // phase-index memo lives below, after `messages` is available from `chat`.
  const [activePlaybookId, setActivePlaybookId] = useState<string | null>(null);
  const [activePlaybookTitle, setActivePlaybookTitle] = useState<string | null>(
    null,
  );

  const attachPlaybook = useCallback((item: SuggestionItem) => {
    setActivePlaybookId(item.id);
    setActivePlaybookTitle(item.label);
  }, []);

  const detachPlaybook = useCallback(() => {
    setActivePlaybookId(null);
    setActivePlaybookTitle(null);
  }, []);

  // ── output target (WS7) ──
  // Where new content lands by default; persisted client-side per chat so the
  // choice sticks across reloads. Keyed by conversationId when bound, else
  // contentId (transient). ChatPanel intentionally stays mounted while the
  // active conversation changes, so the key-change effect below must hydrate
  // each conversation instead of leaking the prior chat's selection.
  const outputTargetKey = outputTargetStorageKey({
    conversationId,
    contentId,
  });
  const [outputTarget, setOutputTargetState] = useState<OutputTarget>(() => {
    if (typeof window === "undefined") return DEFAULT_OUTPUT_TARGET;
    return (
      readStoredOutputTarget(window.localStorage, outputTargetKey) ??
      DEFAULT_OUTPUT_TARGET
    );
  });
  const lastOutputTargetKeyRef = useRef<string | null>(outputTargetKey);
  const pendingOutputTargetPromotionRef = useRef<{
    nextKey: string;
    target: OutputTarget;
  } | null>(null);

  useEffect(() => {
    const previousKey = lastOutputTargetKeyRef.current;
    if (previousKey === outputTargetKey) return;

    const pendingPromotion = pendingOutputTargetPromotionRef.current;
    const promotedTarget =
      pendingPromotion?.nextKey === outputTargetKey
        ? pendingPromotion.target
        : null;
    const storedTarget =
      typeof window === "undefined"
        ? null
        : readStoredOutputTarget(window.localStorage, outputTargetKey);
    const resolvedTarget = resolveOutputTargetKeyChange({
      previousKey,
      nextKey: outputTargetKey,
      currentTarget: outputTarget,
      storedTarget,
      promotedTarget,
    });
    if (pendingPromotion) {
      pendingOutputTargetPromotionRef.current = null;
    }
    lastOutputTargetKeyRef.current = outputTargetKey;
    setOutputTargetState(resolvedTarget);
  }, [outputTargetKey, outputTarget]);

  const setOutputTarget = useCallback(
    (t: OutputTarget) => {
      setOutputTargetState(t);
      if (typeof window !== "undefined" && outputTargetKey) {
        try {
          writeStoredOutputTarget(window.localStorage, outputTargetKey, t);
        } catch {
          /* non-blocking */
        }
      }
    },
    [outputTargetKey],
  );
  const promoteOutputTarget = useCallback(
    (nextConversationId: string) => {
      const nextKey = outputTargetStorageKey({
        conversationId: nextConversationId,
      });
      if (!nextKey) return;
      pendingOutputTargetPromotionRef.current = {
        nextKey,
        target: outputTarget,
      };
      if (typeof window !== "undefined") {
        try {
          writeStoredOutputTarget(window.localStorage, nextKey, outputTarget);
        } catch {
          // The in-memory transfer remains authoritative for this promotion.
        }
      }
      // Model pin (AI 3.4) rides the same promotion: a pin set while the
      // chat was still content-keyed must survive the flip to the conv key,
      // or the user's explicit pick silently unpins mid-conversation and the
      // next playbook phase overrides it. This callback is the de facto
      // "conversation promoted" hook, so both chat surfaces inherit the
      // carry-over without a second API.
      if (modelPinned && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            `dg:model-pinned:conv:${nextConversationId}`,
            "1",
          );
        } catch {
          /* pin re-hydration will fall back to unpinned — non-fatal */
        }
      }
    },
    [outputTarget, modelPinned],
  );

  // ── suggested follow-ups (Session 7) ──
  const [followUps, setFollowUps] = useState<string[]>([]);
  const followUpRequestVersionRef = useRef(0);
  const clearFollowUps = useCallback(() => {
    // Invalidate an already-running suggestion request too. Otherwise a
    // response started before Send/Stop can repopulate stale chips afterward.
    followUpRequestVersionRef.current += 1;
    setFollowUps([]);
  }, []);

  /**
   * Extract the text content of the latest user + assistant messages and
   * call /api/ai/follow-ups. The endpoint soft-fails to an empty list,
   * so we never need a UI error state for this.
   */
  const fetchFollowUps = useCallback(
    async (finalMessages: UIMessage[]) => {
      const requestVersion = followUpRequestVersionRef.current + 1;
      followUpRequestVersionRef.current = requestVersion;
      const lastAssistant = [...finalMessages]
        .reverse()
        .find((m) => m.role === "assistant");
      const lastUser = [...finalMessages]
        .reverse()
        .find((m) => m.role === "user");
      const partText = (m: UIMessage | undefined): string => {
        if (!m) return "";
        return m.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ")
          .trim();
      };
      const lastAssistantText = partText(lastAssistant);
      if (!lastAssistantText) return;
      const lastUserText = partText(lastUser);

      try {
        const res = await fetch("/api/ai/follow-ups", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lastUserText,
            lastAssistantText,
            fallbackProviderId: providerId,
            fallbackModelId: modelId,
          }),
        });
        if (!res.ok) return;
        const body = await res.json();
        const list: string[] = body?.data?.suggestions ?? [];
        // Drop empties + dedupe defensively; the model can repeat itself.
        const cleaned = Array.from(
          new Set(list.map((s) => s.trim()).filter(Boolean)),
        ).slice(0, 3);
        if (followUpRequestVersionRef.current !== requestVersion) return;
        setFollowUps(cleaned);
      } catch {
        /* soft-fail */
      }
    },
    [providerId, modelId],
  );

  // Agentic Browsing Phase 1 — client-side per-run page budget. Non-null ONLY
  // while a research run is active (opened by an approved propose_research_run,
  // closed by record_research_findings or the next user turn). A ref, not state:
  // it's read at send-time and mutated per read without needing a re-render.
  // Fail-open by construction — when null, the budget path is never entered, so
  // a normal one-off read is completely untouched.
  const researchRunRef = useRef<{ pageBudget: number; pagesUsed: number } | null>(
    null,
  );

  // ── useChat ──
  const chat = useChat({
    transport: chatTransport,
    id: conversationKey,
    messages: initialMessages,
    experimental_throttle: 100,
    // Resume the tool loop automatically once every pending needsApproval
    // request on the last assistant message has been answered (AI v3 core S1),
    // OR once the client-executed read_page_in_browser tool has a result
    // (Agentic Browsing Phase 0). Without this, either would sit in client
    // state and never re-trigger the server.
    sendAutomaticallyWhen: (options) =>
      lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
      lastMessageHasResolvedBrowserRead(options),
    // Client-executed tools (no server `execute`): the model's tool call is
    // streamed to the browser; run it here and post the result back. Phase 0:
    // read_page_in_browser reads a page in the user's own session.
    onToolCall: async ({ toolCall }) => {
      // Agentic Browsing Phase 2b Slice 5c — client-executed co-browse tools. The
      // model opens a tab and acts on it; we drive the extension's chrome.debugger
      // engine via the panel bridge (co-browse.ts) and return the FRESH a11y
      // snapshot so it can act → look → act.
      if (
        toolCall.toolName === CO_BROWSE_OPEN ||
        toolCall.toolName === CO_BROWSE_ACT
      ) {
        const toolName = toolCall.toolName;
        const input = (toolCall.input ?? {}) as {
          url?: string;
          action?: string;
          role?: string;
          name?: string;
          nth?: number;
          text?: string;
          direction?: "down" | "up";
          to?: "bottom" | "top";
          seconds?: number;
          label?: string;
        };
        try {
          if (toolName === CO_BROWSE_OPEN) {
            if (!input.url) {
              chat.addToolResult({
                tool: toolName,
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: "no url provided",
              });
              return;
            }
            const opened = await coBrowseOpen(input.url);
            if (!opened.ok) {
              chat.addToolResult({
                tool: toolName,
                toolCallId: toolCall.toolCallId,
                output: `Could not open the page: ${opened.error ?? "unknown error"}.`,
              });
              return;
            }
            markCoBrowseActive(safeHost(input.url)); // 5d: light the in-app indicator
            const snap = await coBrowseSnapshot();
            chat.addToolResult({
              tool: toolName,
              toolCallId: toolCall.toolCallId,
              output: {
                tabId: (opened.data as { tabId?: number } | undefined)?.tabId,
                ...coBrowseSnapshotOutput(snap),
              },
            });
            return;
          }
          // CO_BROWSE_ACT — read / click / hover / type / navigate / scroll / wait /
          // back on the bound tab.
          const action = input.action;
          // wait — pause for the user to REVIEW this page, with an on-page
          // countdown overlay (T1, timed iteration). The extension only injects
          // the self-removing overlay and returns fast; the SLEEP happens here so
          // the bridge round-trip isn't held open for the whole minute. No page
          // change and no re-snapshot — it's a pure pause.
          if (action === "wait") {
            const seconds = Math.max(1, Math.min(3600, Math.round(input.seconds ?? 60)));
            const label = input.label ?? null;
            await coBrowseShowTimer(seconds, label ?? undefined);
            beginCoBrowseWait(seconds, label);
            try {
              await new Promise((r) => setTimeout(r, seconds * 1000));
            } finally {
              endCoBrowseWait();
              await coBrowseClearTimer().catch(() => {});
            }
            chat.addToolResult({
              tool: toolName,
              toolCallId: toolCall.toolCallId,
              output: {
                action: "wait",
                waited: seconds,
                note: `Paused ${seconds}s for the user to review the page.`,
              },
            });
            return;
          }
          // collect — auto scroll-collect the whole list in one call (Slice 3d).
          // Returns the merged, deduped set directly (not a fresh single snapshot).
          if (action === "collect") {
            const collected = await coBrowseCollect();
            chat.addToolResult({
              tool: toolName,
              toolCallId: toolCall.toolCallId,
              output: { action: "collect", ...coBrowseSnapshotOutput(collected) },
            });
            return;
          }
          const target = { role: input.role, name: input.name, nth: input.nth };
          let res: { ok: boolean; error?: string };
          if (action === "read") res = { ok: true };
          else if (action === "click") res = await coBrowseClick(target);
          else if (action === "hover") res = await coBrowseHover(target);
          else if (action === "type") res = await coBrowseType(target, input.text ?? "");
          else if (action === "navigate")
            res = input.url
              ? await coBrowseNavigate(input.url)
              : { ok: false, error: "navigate needs a url" };
          else if (action === "scroll")
            res = await coBrowseScroll({ direction: input.direction, to: input.to });
          else if (action === "back") res = await coBrowseBack();
          else if (action === "reveal") res = await coBrowseReveal();
          else res = { ok: false, error: `unknown action: ${action ?? "(none)"}` };
          if (!res.ok) {
            chat.addToolResult({
              tool: toolName,
              toolCallId: toolCall.toolCallId,
              output: `Action "${action}" failed: ${res.error ?? "unknown error"}. Read the page again and adapt — don't repeat the same action blindly.`,
            });
            return;
          }
          if (action === "navigate") markCoBrowseActive(safeHost(input.url)); // 5d: update indicator host
          // Let a click/navigation settle before re-snapshotting so the model sees
          // the RESULT, not a mid-transition page. Navigation (incl. back) needs longer.
          await new Promise((r) =>
            setTimeout(r, action === "navigate" || action === "back" ? 1200 : 500),
          );
          const snap = await coBrowseSnapshot();
          chat.addToolResult({
            tool: toolName,
            toolCallId: toolCall.toolCallId,
            output: { action, ...coBrowseSnapshotOutput(snap) },
          });
        } catch (err) {
          chat.addToolResult({
            tool: toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : "co-browse failed",
          });
        }
        return;
      }
      // R1 — read the page the user is ALREADY on (the current tab), via the
      // panel's content-script capture: no new tab, no re-fetch, no debugger
      // banner. Distinct from read_page (refetches a URL) and co_browse_open
      // (opens a fresh tab). For "summarize this page".
      if (toolCall.toolName === READ_CURRENT_PAGE) {
        try {
          const captured = await capturePageContent("full");
          if (!captured.ok || !captured.content) {
            chat.addToolResult({
              tool: READ_CURRENT_PAGE,
              toolCallId: toolCall.toolCallId,
              output: `Couldn't read the current page: ${captured.error ?? "no readable content"}.`,
            });
            return;
          }
          chat.addToolResult({
            tool: READ_CURRENT_PAGE,
            toolCallId: toolCall.toolCallId,
            output: {
              url: captured.url,
              title: captured.title,
              siteName: captured.siteName,
              via: "current-tab",
              // Trust-labeled (prompt-injection defense) — mirrors read_page.
              untrustedWebContent: captured.content,
            },
          });
        } catch (err) {
          chat.addToolResult({
            tool: READ_CURRENT_PAGE,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : "read current page failed",
          });
        }
        return;
      }
      // list_tabs — tabs-as-curation enumeration (iteration spec, Enumeration
      // sources). Lean title+URL only; the optional filter narrows client-side so
      // the model sees the smallest slice that covers the ask. Privacy gate lives
      // in the tool DESCRIPTION (explicit ask only) — by the time a call arrives
      // here the model has judged the user asked for their tabs.
      if (toolCall.toolName === LIST_TABS) {
        const { filter } = (toolCall.input ?? {}) as { filter?: string };
        try {
          const res = await coBrowseListTabs();
          if (!res.ok || !res.data) {
            chat.addToolResult({
              tool: LIST_TABS,
              toolCallId: toolCall.toolCallId,
              output: `Couldn't list tabs: ${res.error ?? "extension unavailable"}.`,
            });
            return;
          }
          const want = (filter ?? "").trim().toLowerCase();
          const tabs = res.data.tabs
            .filter((t) => /^https?:/.test(t.url))
            .filter(
              (t) =>
                !want ||
                t.title.toLowerCase().includes(want) ||
                t.url.toLowerCase().includes(want),
            )
            .slice(0, 60)
            .map((t) => ({ title: t.title, url: t.url }));
          chat.addToolResult({
            tool: LIST_TABS,
            toolCallId: toolCall.toolCallId,
            output: {
              count: tabs.length,
              ...(want ? { filter: want } : {}),
              tabs,
              note:
                "Tab titles/URLs are the user's own browser state. To read one, use read_page with its URL. Each tab's URL is its stable item key.",
            },
          });
        } catch (err) {
          chat.addToolResult({
            tool: LIST_TABS,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: err instanceof Error ? err.message : "list tabs failed",
          });
        }
        return;
      }
      // Two client-executed read tools: read_page_in_browser (escalates
      // P1→P3) and open_tab_and_read (Phase 2a launcher — forces a VISIBLE tab,
      // used only after a normal read failed). Both share the budget + result
      // plumbing below.
      const isBrowserRead = toolCall.toolName === READ_PAGE_HEADLESS_OR_BROWSER;
      const isTabLaunch = toolCall.toolName === OPEN_TAB_AND_READ;
      if (!isBrowserRead && !isTabLaunch) return;
      const toolName = toolCall.toolName;
      const { url } = (toolCall.input ?? {}) as { url?: string };
      if (!url) {
        chat.addToolResult({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: "no url provided",
        });
        return;
      }
      // Agentic Browsing Phase 1 — per-run page budget (client-side; the server
      // has no `execute` to gate a client tool). Applies to BOTH client read
      // tools. Lazily hydrate from the approved research plan in history so even
      // the FIRST read is bounded. Null run = normal read, budget skipped.
      if (researchRunRef.current === null) {
        const active = deriveActiveResearchRun(chat.messages);
        if (active) {
          researchRunRef.current = { pageBudget: active.pageBudget, pagesUsed: 0 };
        }
      }
      const run = researchRunRef.current;
      if (run && run.pagesUsed >= run.pageBudget) {
        // Soft stop, not an error: tell the model to wrap up with what it has.
        chat.addToolResult({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          output: `Research page budget reached (${run.pageBudget} pages read). Stop reading now — synthesize from what you already have (createNote with a summary + a markdown table), then call record_research_findings.`,
        });
        return;
      }
      // Per-item iteration budget (level-2 controller). Recomputed from history
      // each time — items are recorded by a SERVER tool, so a client counter
      // would drift; the message scan IS the source of truth. Enforced at the
      // read tools only (a read is how the NEXT item starts) so mid-item acting
      // is never broken. Fail-open: no active iteration → path skipped entirely.
      const iteration = deriveActiveItemIteration(chat.messages);
      if (iteration && iteration.itemsRecorded >= iteration.itemBudget) {
        chat.addToolResult({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          output: `Item budget reached (${iteration.itemsRecorded}/${iteration.itemBudget} items recorded). Stop starting new items — write the roll-up now (createNote: summary + a markdown table of items/verdicts), then close with record_iteration_findings.`,
        });
        return;
      }
      try {
        let outcome = isTabLaunch
          ? await launchTabAndRead(url)
          : await acquireUrlWithFallback(url);
        // Deterministic escalation (Phase 2a): if a background read (not the
        // launcher itself) came back blocked or too thin, and we're NOT in a
        // research run, auto-retry in a VISIBLE tab instead of hoping the model
        // chooses to. The extension still gates the open on the user's setting
        // (refused → keep the original), so a tab only opens when they've opted
        // in; suppressed in research runs so a multi-source run can't pop a stack
        // of tabs (there the model escalates explicitly via open_tab_and_read).
        // Surface what the escalation did so the model can NARRATE it (owner:
        // "I can't tell if the read attempt happened before the tab open").
        let escalationNote: string | undefined;
        if (isBrowserRead && !researchRunRef.current) {
          const currentLen = outcome.content?.content?.trim().length ?? 0;
          if (!outcome.ok || currentLen < 800) {
            const launched = await launchTabAndRead(url);
            const launchedLen = launched.content?.content?.trim().length ?? 0;
            if (launched.ok && launchedLen > currentLen) {
              outcome = launched;
              escalationNote =
                "A normal read came back blocked/thin, so I opened a VISIBLE tab and read it there.";
            } else if (
              launched.reason &&
              /turned off|Browser Bookmarks/i.test(launched.reason)
            ) {
              escalationNote =
                "A normal read was blocked, and opening a tab to read blocked pages is turned off in the user's Browser Bookmarks settings.";
            } else if (launched.reason || launched.ok) {
              escalationNote =
                "A normal read was blocked, so I also opened a VISIBLE tab — but the page still couldn't be read (likely a human-verification captcha, which no tool can pass).";
            }
          }
        }
        if (outcome.ok && outcome.content) {
          // Count only SUCCESSFUL reads — a blocked/empty page can't eat budget.
          if (run) run.pagesUsed += 1;
          const c = outcome.content;
          // During an item iteration, a read that comes back near-empty (a search
          // page, a 404, a stub) is still an ATTEMPTED item. Nudge the model to
          // record it as unreadable BEFORE moving on — otherwise it silently skips
          // it and the ledger under-counts (observed live: a 190-char page dropped
          // from a 10-item run). Structural backstop to the prompt's "record every
          // attempt" rule.
          const thin = (c.content?.trim().length ?? 0) < 500;
          const iterationNote =
            iteration && thin
              ? "This page has no substantial job description (near-empty). It is still an attempted item — call record_item_result with status=unreadable and a one-line reason BEFORE reading the next tab. Do not skip it."
              : undefined;
          chat.addToolResult({
            tool: toolName,
            toolCallId: toolCall.toolCallId,
            output: {
              url: c.url,
              title: c.title,
              siteName: c.siteName,
              via: outcome.via,
              usedExtension: outcome.usedExtension,
              // Trust-labeled field name is load-bearing (prompt-injection
              // defense) — mirror read_page's `untrustedWebContent`.
              untrustedWebContent: c.content,
              // The escalation summary (if any) — the model relays it so the user
              // sees the steps (normal read → visible-tab open) it actually took.
              ...(escalationNote ? { escalationNote } : {}),
              ...(iterationNote ? { iterationNote } : {}),
            },
          });
        } else {
          chat.addToolResult({
            tool: toolName,
            toolCallId: toolCall.toolCallId,
            output:
              (isTabLaunch
                ? `Could not open a tab to read the page: ${outcome.reason ?? "unknown error"}.`
                : `Could not read the page: ${outcome.reason ?? "unknown error"}.${escalationNote ? ` ${escalationNote}` : ""}`) +
              // A failed read during an iteration is still an attempted item —
              // record it, don't silently skip (keeps the ledger complete).
              (iteration
                ? " This is an attempted iteration item — call record_item_result with status=unreadable (or blocked) for it before moving to the next tab."
                : ""),
          });
        }
      } catch (err) {
        chat.addToolResult({
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: err instanceof Error ? err.message : "browser read failed",
        });
      }
    },
    onError: (err) => {
      if (onError) {
        onError(err);
      } else {
        toast.error(err.message || "Chat request failed");
      }
    },
    onFinish: (event) => {
      const e = event as {
        message?: UIMessage;
        messages?: UIMessage[];
        finishReason?: string;
        isAbort?: boolean;
      };
      // Agentic Browsing Phase 1 — close the client-side research budget when its
      // findings are recorded (precise signal: a record_research_findings result
      // in the finished message). The next-user-turn backstop in handleSend
      // covers a run the model never closed. onToolCall owns opening + counting;
      // this only clears — so it can never mid-run reset the page count.
      const closedResearchRun = (e.message?.parts ?? []).some((part) => {
        const p = part as { type?: string; state?: string };
        return (
          p.type === "tool-record_research_findings" &&
          p.state === "output-available"
        );
      });
      if (closedResearchRun) researchRunRef.current = null;
      const isAbort = e.isAbort === true;
      const streamedMessages = e.messages ?? [];
      const finalMessages = isAbort
        ? stopPendingToolCalls(streamedMessages)
        : streamedMessages;
      const finalMessage =
        e.message && isAbort
          ? finalMessages.find((message) => message.id === e.message?.id) ??
            e.message
          : e.message;

      // AI SDK preserves partial tool input when a request is aborted. Replace
      // those live parts with terminal errors so tool cards and the thinking
      // indicator stop immediately instead of looking active indefinitely.
      if (isAbort) {
        setMessages(finalMessages);
      }

      // Forward to the consumer's onFinish (persistence, etc.) first.
      if (onFinish) {
        onFinish({
          messages: finalMessages,
          message: finalMessage,
          finishReason: e.finishReason,
          isAbort,
        });
      }

      // Surface AI note writes to any open MainPanelContent so the
      // chat's notes panel (or any other editor pointed at the same
      // contentId) reloads without a manual refresh. This MUST live
      // here (one-shot per real completion) instead of in ChatMessage
      // — putting it in the render path re-fires the dispatch every
      // time historical messages mount, which previously caused a
      // refetch loop on page open.
      try {
        const fresh = finalMessage;
        if (fresh && typeof window !== "undefined") {
          // Backstop only (v3.1 R2): the stream-time effect below has
          // usually dispatched these already as outputs arrived; the
          // shared seen-set makes this pass a no-op for anything it saw.
          for (const part of fresh.parts ?? []) {
            maybeDispatchArtifactRefresh(part, dispatchedArtifactToolCalls);
          }
        }
      } catch {
        /* never let dispatch errors break the chat */
      }

      // An aborted partial answer is not a completed state worth suggesting
      // next actions from. It also keeps the UI quiet after Stop.
      if (isAbort) {
        clearFollowUps();
        return;
      }

      // Fire suggested follow-ups (Session 7). Decorative, soft-fails
      // to an empty list — never blocks the chat UX.
      try {
        const settings = useSettingsStore.getState().ai;
        if (settings?.showFollowUps === false) return;
        void fetchFollowUps(finalMessages);
      } catch {
        // Settings store unavailable — skip silently.
      }
    },
  });

  const {
    messages,
    sendMessage,
    status,
    stop: stopRequest,
    error,
    setMessages,
    regenerate,
    addToolApprovalResponse,
    resumeStream,
  } = chat;

  // ── active playbook: derived phase index (AI v3.2 T3) ──
  // Phase index is DERIVED from the message history, not manually
  // incremented — the count of phase_checkpoint tool calls that have
  // resolved so far this conversation, mirroring ChatViewer's phaseTokens
  // bucketing. That keeps it correct across reloads/regenerate with no
  // separate state to desync.
  const resolvedPhaseIndex = useMemo(() => {
    let count = 0;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const part of m.parts ?? []) {
        const p = part as { type?: string; state?: string; output?: unknown };
        if (p.type !== "tool-phase_checkpoint") continue;
        // Count only APPROVED checkpoints. phase_checkpoint's execute() runs
        // ONLY on approval and returns an object carrying `__checkpoint`.
        // Revise and Approve-with-tweaks are BOTH `approved: false` (see
        // PhaseCheckpointCard) — their execute never runs, the phase is redone
        // and re-checkpointed. Counting every resolved part would advance the
        // index twice for one revised phase and inject the wrong phase. Gate
        // on the executed output shape so only genuine completions advance.
        const out = p.output;
        const executed =
          (typeof out === "object" &&
            out !== null &&
            (out as { __checkpoint?: unknown }).__checkpoint === true) ||
          (typeof out === "string" && out.includes('"__checkpoint"'));
        if (p.state === "output-available" && executed) count++;
      }
    }
    return count;
  }, [messages]);

  const activePlaybook = useMemo<ActivePlaybook | null>(() => {
    if (!activePlaybookId) return null;
    const phaseCount =
      playbooks.find((p) => p.id === activePlaybookId)?.phaseCount ?? 0;
    return {
      id: activePlaybookId,
      title: activePlaybookTitle ?? "",
      phaseIndex: resolvedPhaseIndex,
      phaseCount,
    };
  }, [activePlaybookId, activePlaybookTitle, playbooks, resolvedPhaseIndex]);

  // Stream-time freshness (v3.1 R2): dispatch artifact refresh as tool
  // outputs ARRIVE in the stream, not just at turn end — a playbook turn
  // can run for minutes, and the file tree stayed stale the whole time.
  // The onFinish pass above remains as the backstop; the shared seen-set
  // keeps the two from double-firing.
  useEffect(() => {
    // Active turns only — on conversation load (status "ready") historical
    // outputs must NOT dispatch, or every page open triggers a spurious
    // refetch (the original render-path-dispatch hazard). Turn-end outputs
    // are the onFinish backstop's job.
    if (status !== "streaming" && status !== "submitted") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    for (const part of last.parts ?? []) {
      maybeDispatchArtifactRefresh(part, dispatchedArtifactToolCalls);
    }
  }, [messages, status]);

  // Keep the transport's baseline body for this chat current. Internal
  // SDK sends (approval resume, regenerate) read it at request time.
  useEffect(() => {
    chatBodyResolvers.set(conversationKey, () => ({
      contentId,
      conversationId,
      contextId: activeContextId ?? null,
      providerId,
      modelId,
      mentionedContentIds: [] as string[],
      // Side-panel page context (B2). Null everywhere but the browser panel,
      // where the shell attaches what the extension captured. Read at send
      // time so the freshest capture rides the turn.
      pageContext: getAttachedPageContext(),
      // Lightweight current-page hint (url+title) so the model knows what page the
      // user is viewing even without the attach toggle — for "summarize this page".
      currentPage: getCurrentPageHint(),
      // The garden doc the user is actively viewing (focused tab) — lets the chat
      // resolve "this note/doc" without the user naming it (internal twin of
      // currentPage). Null in the embed panel and when nothing readable is focused.
      viewedContent: getActiveViewedContentHint(),
      // Attached playbook (AI v3.2 T3) — read at request time so approval
      // resumes / internal sends carry the same binding as the turn that
      // started them.
      playbookId: activePlaybookId,
      activePhaseIndex: resolvedPhaseIndex,
      // Output-target chip (WS7): where new content lands by default.
      outputTarget,
      // Model pin (AI 3.4): true ⇒ the user's pick is the ladder's top rung
      // and playbook phase directives are ignored for this conversation.
      modelPinned,
      // Agentic Browsing Phase 0: is the browser extension reachable right now?
      // Gates the client-executed read_page_in_browser tool. Read at send time.
      browserExtensionAvailable: isExtensionAcquireAvailable(),
      // Slice 5c: co-browse is trust-gated to the side panel — true only there.
      coBrowseAvailable: isCoBrowseAvailable(),
    }));
    return () => {
      chatBodyResolvers.delete(conversationKey);
      lastSentBodies.delete(conversationKey);
    };
  }, [
    conversationKey,
    contentId,
    conversationId,
    activeContextId,
    providerId,
    modelId,
    activePlaybookId,
    resolvedPhaseIndex,
    outputTarget,
    modelPinned,
  ]);

  // ── resumable streams (AI 3.3) ──
  // Re-attach to an in-flight server stream after a reload or in a
  // second tab. One attempt per conversationKey: fired the first time
  // this chat is bound + idle, then never again for the same instance.
  //
  // Deliberately NOT useChat's `resume: true` option: resumeStream()
  // replaces the transport's active response unconditionally, and
  // conversationId can bind mid-turn (fresh chat promoted after its
  // first send) — the option's mount-effect would then fire while a
  // stream is rendering and clobber it. Gating on idle status closes
  // that window; the server's 204 makes the no-stream case free.
  const resumableStreamsEnabled = useSettingsStore(
    (s) => s.ai?.resumableStreams !== false,
  );
  const resumeAttemptedForKeyRef = useRef<string | null>(null);
  // True while the active stream began as a resume (reload / second tab)
  // rather than a fresh send. Consumed by ChatPanel → ChatMessage so the
  // buffered flood renders settled instead of re-typing (AI 3.3). Reset
  // by every fresh user send (which has no buffer); this also clears the
  // no-stream 204 case, where the resume returns nothing and status never
  // leaves "ready".
  const streamStartedViaResumeRef = useRef(false);
  useEffect(() => {
    if (!resumableStreamsEnabled || !conversationId) return;
    if (status === "streaming" || status === "submitted") return;
    if (resumeAttemptedForKeyRef.current === conversationKey) return;
    resumeAttemptedForKeyRef.current = conversationKey;
    streamStartedViaResumeRef.current = true;
    void resumeStream();
  }, [
    resumableStreamsEnabled,
    conversationId,
    conversationKey,
    status,
    resumeStream,
  ]);

  const isActive = status === "streaming" || status === "submitted";
  const stop = useCallback(() => {
    // Settle synchronously for immediate visual feedback; the SDK's abort
    // onFinish path repeats the normalization on its authoritative snapshot
    // before persistence.
    stopRequest();
    setMessages((current) => stopPendingToolCalls(current));
    clearFollowUps();
  }, [stopRequest, setMessages, clearFollowUps]);

  // ── per-message provider + model stamping ──
  // AI SDK's UIMessage doesn't carry provider/model identity — we
  // attach our own map keyed by message id. When the user sends a turn
  // we capture the active provider AND model, then stamp both the
  // user's message and the assistant response that follows. This keeps
  // a message's visual identity (and metadata) stable even if the user
  // later switches providers mid-conversation.
  const [messageStamps, setMessageStamps] = useState<
    Record<string, MessageStamp>
  >({});

  /** Captured at handleSend; consumed by the messages-watcher effect. */
  const pendingStampRef = useRef<MessageStamp | null>(null);

  // Functional setState lets us drop `messageStamps` from the deps
  // array — the effect only re-runs when `messages` changes, and the
  // setter bails out (returns prev) when there's nothing new to stamp,
  // avoiding the React Compiler's "setState in effect cascades" rule.
  useEffect(() => {
    const pending = pendingStampRef.current;
    if (!pending) return;

    setMessageStamps((prev) => {
      let next: Record<string, MessageStamp> | null = null;
      for (const m of messages) {
        if (m.role !== "user" && m.role !== "assistant") continue;
        if (prev[m.id]) continue;
        if (!next) next = { ...prev };
        next[m.id] = pending;
      }
      return next ?? prev;
    });
  }, [messages]);

  const getMessageStamp = useCallback(
    (messageId: string, fallback: MessageStamp): MessageStamp => {
      return messageStamps[messageId] ?? fallback;
    },
    [messageStamps],
  );

  /** Back-compat shim — returns just the providerId. */
  const getProviderForMessage = useCallback(
    (messageId: string, fallback: string): string => {
      return messageStamps[messageId]?.providerId ?? fallback;
    },
    [messageStamps],
  );

  const seedMessageStamps = useCallback(
    (stamps: Record<string, MessageStamp>) => {
      setMessageStamps((prev) => {
        let next: Record<string, MessageStamp> | null = null;
        for (const [id, stamp] of Object.entries(stamps)) {
          if (prev[id]) continue; // never clobber a this-session stamp
          if (!next) next = { ...prev };
          next[id] = stamp;
        }
        return next ?? prev;
      });
    },
    [],
  );

  // No separate mention tracking — the composer's `value` is the
  // canonical `@[Title](id)` form, so handleSend extracts IDs directly.

  // ── attachments (Session 5b) ──
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const attachmentsUploading = attachments.some((a) => a.status === "uploading");

  // Does the active model accept image inputs? Drives the composer's
  // image affordance + the send-time guard.
  const supportsImageAttachments = useMemo(() => {
    const provider = PROVIDER_CATALOG.find((p) => p.id === providerId);
    const model = provider?.models.find((m) => m.id === modelId);
    return Boolean(model?.capabilities?.includes("vision"));
  }, [providerId, modelId]);

  // Does the active model accept audio inputs (audio-input capability)? Uses
  // effectiveCapabilities so id-inferred audio models (Gemini, gpt-4o-audio)
  // count even when the catalog row doesn't declare the flag.
  const supportsAudioAttachments = useMemo(() => {
    const provider = PROVIDER_CATALOG.find((p) => p.id === providerId);
    const model = provider?.models.find((m) => m.id === modelId);
    return effectiveCapabilities({
      id: modelId,
      capabilities: model?.capabilities,
    }).has("audio-input");
  }, [providerId, modelId]);

  const addAttachmentFiles = useCallback((files: File[] | FileList) => {
    const list = Array.from(files);
    for (const file of list) {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const initialKind: ChatAttachment["kind"] = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("audio/")
          ? "audio"
          : file.type === "application/pdf" ||
              file.name.toLowerCase().endsWith(".pdf")
            ? "document"
            : "text";
      setAttachments((prev) => [
        ...prev,
        { id, name: file.name, kind: initialKind, status: "uploading" },
      ]);
      void (async () => {
        try {
          // Convert Apple HEIC/HEIF to JPEG in the browser before upload so
          // it renders cross-browser and vision models can read it.
          const uploadFile = await convertHeicToJpegFile(file);
          const form = new FormData();
          form.append("file", uploadFile);
          const res = await fetch("/api/ai/attachments/upload", {
            method: "POST",
            credentials: "include",
            body: form,
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body?.error || "Upload failed");
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    status: "ready",
                    kind: body.kind,
                    url: body.url,
                    storageKey: body.key,
                    contentNodeId: body.contentNodeId,
                    mediaType: body.mediaType,
                    text: body.text,
                  }
                : a,
            ),
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : "Upload failed";
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, status: "error", error: message } : a,
            ),
          );
          toast.error(message);
        }
      })();
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ── Folder Studio tool invocation ──
  // A studio tool tile stashes its composed prompt in sessionStorage before
  // switching the sidebar to the chat tab; the engine consumes it exactly
  // once as soon as it can send. Storage (not a CustomEvent) makes the
  // hand-off survive the tab-mount race; removeItem-before-send makes it
  // single-shot even under StrictMode double-effects.
  useEffect(() => {
    if (!contentId || status !== "ready") return;
    let prompt: string | null = null;
    try {
      const key = `dg:studio-invoke:${contentId}`;
      prompt = window.sessionStorage.getItem(key);
      if (prompt) window.sessionStorage.removeItem(key);
    } catch {
      return; // storage unavailable — tile falls back to nothing sent
    }
    if (!prompt || !prompt.trim()) return;
    sendMessage(
      {
        parts: [
          createOutputTargetMessagePart(outputTarget),
          { type: "text", text: prompt },
        ],
      },
      {
        body: {
          contentId,
          conversationId,
          contextId: activeContextId ?? null,
          providerId,
          modelId,
          mentionedContentIds: [],
          outputTarget,
          // Model pin (AI 3.4) — see handleSend for why every per-call
          // body must carry it.
          modelPinned,
        },
      },
    );
  }, [
    contentId,
    status,
    sendMessage,
    conversationId,
    activeContextId,
    providerId,
    modelId,
    outputTarget,
    modelPinned,
  ]);

  // ── send ──
  // `input` is already canonical `@[Title](id)` (the composer's
  // contenteditable serializer emits that form). Dynamic request data
  // (contentId / provider / model / mentions) flows per-call via the
  // second arg's body — no transport-level refs needed.
  const handleSend = useCallback(() => {
    // A fresh user send has no buffered backlog — clear the resume flag so
    // this turn types normally (and un-stick the no-stream 204 case).
    streamStartedViaResumeRef.current = false;
    // Agentic Browsing Phase 1 — a fresh user turn ends any prior research run
    // (backstop for a run the model never closed via record_research_findings),
    // so this turn's reads are never charged to a stale budget.
    researchRunRef.current = null;
    const text = input.trim();
    const ready = attachments.filter((a) => a.status === "ready" && a.url);
    const hasImageParts = ready.some((a) => a.kind === "image");
    const hasAudioParts = ready.some((a) => a.kind === "audio");

    // Nothing to send (no text, no ready attachments).
    if (!text && ready.length === 0) return;
    // Don't send while uploads are still in flight.
    if (attachmentsUploading) return;

    // Drop any follow-up chips from the previous turn — they describe
    // a state that's about to change.
    clearFollowUps();

    // Vision guard: a text-only model can't read images.
    if (hasImageParts && !supportsImageAttachments) {
      toast.error(
        "The selected model can't read images. Switch to a vision-capable model or remove the image.",
      );
      return;
    }

    // Audio guard: only audio-input-capable models can hear a clip. Without
    // this the model silently gets a placeholder and ignores the audio.
    if (hasAudioParts && !supportsAudioAttachments) {
      toast.error(
        "The selected model can't process audio. Switch to an audio-input model (e.g. Gemini) or remove the audio.",
      );
      return;
    }

    // value is already canonical `@[Title](id)` — extract IDs for the
    // chat route's mentionedContentIds. Dedupe to avoid double-fetching.
    const ids: string[] = [];
    const seen = new Set<string>();
    const re = new RegExp(MENTION_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const id = m[2];
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }

    // Build the user message parts explicitly so attachments are
    // first-class, persisted file parts (a chip that survives reload) —
    // NOT folded into the visible text. For non-image attachments we stash
    // the extracted text in `providerMetadata.app.text`; the chat route
    // reads it to inline content for providers that can't consume the file
    // natively, while the displayed/persisted message stays a clean chip.
    const parts: UIMessage["parts"] = [
      createOutputTargetMessagePart(outputTarget),
    ];
    if (activePlaybookId) {
      // Unlike the composer-only chip, this data part belongs to the sent
      // user turn, survives persistence/reload, and renders alongside that
      // message. The server validates the id independently before adding
      // authoritative model context.
      parts.push(
        createPlaybookMessageAttachmentPart({
          id: activePlaybookId,
          title: activePlaybookTitle ?? "Attached playbook",
          phaseIndex: resolvedPhaseIndex,
          phaseCount: activePlaybook?.phaseCount ?? 0,
        }),
      );
    }
    if (text) parts.push({ type: "text", text });
    for (const a of ready) {
      const part: FileUIPart = {
        type: "file",
        url: a.url!,
        mediaType: a.mediaType ?? "application/octet-stream",
        filename: a.name,
      };
      // `app` metadata rides with the persisted part (stripped before it
      // reaches the provider): `text` for server-side inlining of
      // non-native files, `key` so trash purge can delete the blob.
      const app: Record<string, string> = {};
      if (a.kind !== "image" && a.text) app.text = a.text;
      if (a.storageKey) app.key = a.storageKey;
      if (a.contentNodeId) app.contentNodeId = a.contentNodeId;
      if (Object.keys(app).length > 0) part.providerMetadata = { app };
      parts.push(part);
    }

    // Capture the active provider + model for this turn — the watcher
    // effect stamps both the new user message and the assistant response.
    pendingStampRef.current = { providerId, modelId };

    // Hand the exact sent parts to the binding hook so attachments
    // persist even if AI SDK normalizes file parts out of the in-memory
    // message afterwards.
    if (pendingUserPartsRef) pendingUserPartsRef.current = parts;

    setInput("");
    setAttachments([]);
    // Sending implies the user wants to watch the reply — re-engage
    // auto-scroll even if they'd scrolled up reading earlier turns.
    pinnedRef.current = true;
    setShowJumpToLatest(false);
    sendMessage(
      { parts },
      {
        body: {
          contentId,
          conversationId,
          contextId: activeContextId ?? null,
          providerId,
          modelId,
          mentionedContentIds: ids,
          // Attached side-panel page context (B2). Null outside the panel.
          // Lives on the explicit send body because that becomes the
          // snapshotted per-call body — the resolver is only a fallback.
          pageContext: getAttachedPageContext(),
          currentPage: getCurrentPageHint(),
          // The garden doc the user is actively viewing (focused tab) — lets the
          // chat resolve "this note/doc" without the user naming it (internal twin
          // of currentPage). Null in the embed panel / when nothing readable.
          viewedContent: getActiveViewedContentHint(),
          // Attached playbook (AI v3.2 T3).
          playbookId: activePlaybookId,
          activePhaseIndex: resolvedPhaseIndex,
          // Output-target chip (WS7).
          outputTarget,
          // Model pin (AI 3.4). MUST live on every per-call body: the
          // transport snapshots this body into lastSentBodies BEFORE the
          // resolver baseline is consulted, so a flag that lives only in
          // the resolver never reaches the server after a real send.
          modelPinned,
          // Agentic Browsing Phase 0 — same per-call-body requirement as above.
          browserExtensionAvailable: isExtensionAcquireAvailable(),
          // Slice 5c co-browse gate — same per-call-body requirement.
          coBrowseAvailable: isCoBrowseAvailable(),
        },
      },
    );
  }, [
    input,
    attachments,
    attachmentsUploading,
    supportsImageAttachments,
    supportsAudioAttachments,
    pendingUserPartsRef,
    sendMessage,
    contentId,
    conversationId,
    activeContextId,
    providerId,
    modelId,
    activePlaybookId,
    activePlaybookTitle,
    activePlaybook,
    resolvedPhaseIndex,
    outputTarget,
    modelPinned,
    clearFollowUps,
  ]);

  // ── edit / regenerate (Session 5a) ──
  // Shared request body for re-runs (provider/model routing + association).
  const reRunBody = useCallback(
    () => ({
      contentId,
      conversationId,
      providerId,
      modelId,
      mentionedContentIds: [] as string[],
      // Edited/regenerated turns keep the attached page context too (B2).
      pageContext: getAttachedPageContext(),
      currentPage: getCurrentPageHint(),
      // The garden doc the user is actively viewing (focused tab) — lets the chat
      // resolve "this note/doc" without the user naming it (internal twin of
      // currentPage). Null in the embed panel and when nothing readable is focused.
      viewedContent: getActiveViewedContentHint(),
      // Attached playbook (AI v3.2 T3) rides re-runs too, for continuity.
      playbookId: activePlaybookId,
      activePhaseIndex: resolvedPhaseIndex,
      // Output-target chip (WS7).
      outputTarget,
      // Model pin (AI 3.4) — see handleSend for why every per-call body
      // must carry it.
      modelPinned,
    }),
    [
      contentId,
      conversationId,
      providerId,
      modelId,
      activePlaybookId,
      resolvedPhaseIndex,
      outputTarget,
      modelPinned,
    ],
  );

  const editMessage = useCallback(
    async (messageId: string, newText: string) => {
      const text = newText.trim();
      if (!text) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      // Supersede the old turn (inclusive) + everything after, server-side.
      await truncateRef?.current?.(messageId, true);

      // Truncate the visible list to before the edited message, then send
      // the new text as a fresh turn. Stamp it with the active selection.
      pendingStampRef.current = { providerId, modelId };
      setMessages(messages.slice(0, idx));
      // { parts } shape (matches handleSend / studio-invoke).
      const editedParts: UIMessage["parts"] = [
        createOutputTargetMessagePart(outputTarget),
      ];
      if (activePlaybookId) {
        editedParts.push(
          createPlaybookMessageAttachmentPart({
            id: activePlaybookId,
            title: activePlaybookTitle ?? "Attached playbook",
            phaseIndex: resolvedPhaseIndex,
            phaseCount: activePlaybook?.phaseCount ?? 0,
          }),
        );
      }
      editedParts.push({ type: "text", text });
      void sendMessage(
        { parts: editedParts },
        { body: reRunBody() }
      );
    },
    [
      messages,
      setMessages,
      sendMessage,
      reRunBody,
      providerId,
      modelId,
      truncateRef,
      activePlaybookId,
      activePlaybookTitle,
      activePlaybook,
      resolvedPhaseIndex,
      outputTarget,
    ],
  );

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      const target = messages.find((m) => m.id === messageId);
      if (!target || target.role !== "assistant") return;

      // A regenerated turn is freshly generated — no buffered backlog, so
      // it should type normally, not settle like a resume.
      streamStartedViaResumeRef.current = false;

      // Supersede the old answer (inclusive) + anything after, server-side.
      await truncateRef?.current?.(messageId, true);

      pendingStampRef.current = { providerId, modelId };
      void regenerate({ messageId, body: reRunBody() });
    },
    [messages, regenerate, reRunBody, providerId, modelId, truncateRef],
  );

  // ── cleanup mention timer ──
  useEffect(() => {
    return () => {
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    };
  }, []);

  // ── auto-scroll on new messages — only while pinned to the bottom ──
  useEffect(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return {
    messages,
    sendMessage,
    status,
    stop,
    error,
    setMessages,
    addToolApprovalResponse,
    isActive,
    // Only meaningful while a stream is active; the settle latch itself
    // lives per-message in the typewriter, so a stale-true ref between
    // turns is harmless, but gating on isActive keeps the contract clean.
    resumedStream: streamStartedViaResumeRef.current && isActive,
    input,
    setInput,
    handleSend,
    attachments,
    addAttachmentFiles,
    removeAttachment,
    attachmentsUploading,
    supportsImageAttachments,
    editMessage,
    regenerateMessage,
    providerId,
    modelId,
    handleModelChange,
    modelPinned,
    setModelPinned,
    mentionResults,
    handleMentionSearch,
    commandItems,
    activePlaybook,
    attachPlaybook,
    detachPlaybook,
    outputTarget,
    setOutputTarget,
    promoteOutputTarget,
    followUps,
    clearFollowUps,
    scrollRef,
    setScrollEl,
    showJumpToLatest,
    scrollToBottom,
    getMessageStamp,
    getProviderForMessage,
    seedMessageStamps,
  };
}
