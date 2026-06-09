/**
 * ChatPanel (Right Sidebar)
 *
 * Transient streaming chat panel. Messages are per-session and reset when
 * the user switches to a different content node.
 * "Save conversation" creates a persistent chat ContentNode.
 *
 * Engine boilerplate (useChat setup, mention search, command items,
 * input state, auto-scroll) lives in `useConversationEngine`. This file
 * owns sidebar-specific concerns: AI editor orchestration, tool-result
 * interception for edit payloads, content-switch reset, save-to-node.
 */

"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { Trash2, Bot, Pencil, Maximize2, ChevronDown } from "lucide-react";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import { getProviderTheme } from "@/lib/design/system/ai-providers";
import { ProviderIcon } from "./ProviderIcon";
import { toast } from "sonner";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { AiEditOrchestrator, parseEditPayload } from "@/lib/domain/editor/ai";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { FollowUpsStrip } from "./FollowUpsStrip";
import { ChatErrorBanner } from "./ChatErrorBanner";
import { MakeAndModelPicker } from "./MakeAndModelPicker";
import { ChatContextPicker } from "./ChatContextPicker";
import { useConversationEngine } from "@/lib/domain/ai/use-conversation-engine";
import {
  useConversationBinding,
  type PersistFinishPayload,
} from "@/lib/domain/ai/use-conversation-binding";
import { useContentStore } from "@/state/content-store";
import { detectMixedProvider } from "@/lib/design/system/ai-providers";
import type { AIProviderId } from "@/lib/domain/ai/types";
import type { UIMessage } from "ai";

interface ChatPanelProps {
  contentId?: string | null;
  /**
   * When set, the panel is bound to this Conversation entity:
   *   - Messages load from `/api/conversations/[id]` on mount
   *   - New turns persist to `/api/conversations/[id]/messages` via onFinish
   *   - The conversationId is forwarded to the chat route in the body
   *     so the mention interceptor can write auto-associations
   *
   * Without it, the panel is transient (existing behavior).
   */
  conversationId?: string | null;
  /**
   * Called when the user confirms deletion of the bound conversation.
   * The parent (`MultiConversationSidebar`) issues the DELETE API call
   * and refreshes its tab list. Without this prop, the trash button
   * just clears the local message view (transient-mode semantics).
   */
  onDeleteConversation?: (conversationId: string) => Promise<void> | void;
  /**
   * Called after a successful auto-title generation so the parent can
   * refresh its tab list (the tab label reflects the new title).
   */
  onTitleChanged?: (conversationId: string) => void;
  /**
   * Called after a branch/fork creates a new conversation, so the parent
   * (`MultiConversationSidebar`) can refresh its tabs and activate it.
   */
  onForked?: (newConversationId: string) => void;
  /**
   * Stage 2 (transient auto-promote). When the panel is in transient
   * mode (no conversationId yet) and the user sends a first message,
   * the panel POSTs `/api/conversations` to create a new conversation,
   * then fires this callback so the parent can `setActiveId(newId)`
   * and refresh tabs. The first message is queued and re-sent through
   * the now-bound engine, so the response streams + persists normally.
   *
   * Without this prop, the panel stays transient (legacy scratch-pad
   * behavior) — messages live in memory only and disappear on reload.
   */
  onTransientPromoted?: (newConversationId: string) => void;
}

export function ChatPanel({
  contentId,
  conversationId,
  onDeleteConversation,
  onTitleChanged,
  onForked,
  onTransientPromoted,
}: ChatPanelProps) {
  // ─── Stage 2: transient auto-promote refs ───
  //
  // skipNextLoadRef tells the binding hook to skip its initial fetch
  // for the just-promoted conversation (server has zero messages; the
  // local in-memory chat is authoritative for the in-flight first
  // message).
  //
  // pendingTransientSendRef carries a queued first message across the
  // null → set transition. When the conversationId prop updates, the
  // useEffect below fires handleSend() to actually send the queued
  // message through the now-bound engine.
  //
  // promotingInFlightRef guards against double-clicks during the brief
  // POST window so we don't kick off two concurrent createConversation
  // requests.
  const skipNextLoadRef = useRef(false);
  const pendingTransientSendRef = useRef(false);
  const promotingInFlightRef = useRef(false);
  // Distinct useChat key per conversation so message arrays don't bleed
  // across tabs. Falls back to contentId for transient mode.
  const conversationKey = conversationId
    ? `sidebar-chat:conv:${conversationId}`
    : contentId
    ? `sidebar-chat:${contentId}`
    : "sidebar-chat";

  // Persist-on-finish for conversation-bound mode (ChatViewer-pattern).
  const persistRef = useRef<(payload?: PersistFinishPayload) => void>(() => {});
  // Edit/regenerate supersession — populated by the binding hook.
  const truncateRef = useRef<(clientId: string, inclusive: boolean) => Promise<void>>(
    async () => {},
  );
  // Exact parts of the just-sent user turn (engine → binding) so
  // attachments persist reliably.
  const pendingUserPartsRef = useRef<UIMessage["parts"] | null>(null);

  // Selected custom-instruction context for this chat. Seeded from the
  // bound conversation's persisted value (below) and forwarded to the
  // engine so each turn carries it to the chat route.
  const [activeContextId, setActiveContextId] = useState<string | null>(null);

  const {
    messages,
    status,
    stop,
    error,
    setMessages,
    isActive,
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
    mentionResults,
    handleMentionSearch,
    commandItems,
    followUps,
    clearFollowUps,
    setScrollEl,
    showJumpToLatest,
    scrollToBottom,
    getMessageStamp,
    seedMessageStamps,
  } = useConversationEngine({
    conversationKey,
    contentId,
    conversationId,
    activeContextId,
    onFinish: conversationId
      ? (event) => {
          // Forward the SDK's fresh assistant message so persistTurns
          // can read its metadata directly (bypasses React closure
          // staleness — the SDK mutates state.message.metadata just
          // before this fires, but our `messages` array may not have
          // flushed yet).
          const fresh = event.message
            ? {
                id: event.message.id,
                metadata: (event.message as { metadata?: unknown }).metadata,
              }
            : undefined;
          persistRef.current({ freshAssistant: fresh });
        }
      : undefined,
    truncateRef,
    pendingUserPartsRef,
  });

  // ─── Conversation binding (load + persist + auto-title + provider
  // memory) — shared with the full-page ChatViewer via this hook so both
  // surfaces operate on the SAME Conversation store. `persistRef` is the
  // ref the engine's onFinish closes over; the hook populates it.
  const { loadingInitial, initialActiveContextId } = useConversationBinding({
    conversationId: conversationId ?? null,
    messages,
    setMessages: setMessages as (messages: unknown) => void,
    getMessageStamp,
    seedMessageStamps,
    providerId,
    modelId,
    persistRef,
    truncateRef,
    pendingUserPartsRef,
    onTitleChanged,
    skipNextLoadRef,
  });

  // Seed the local context selection from the bound conversation whenever
  // it (re)loads. Transient mode resolves to null. User changes after load
  // are owned by `handleContextChange` below.
  useEffect(() => {
    setActiveContextId(initialActiveContextId);
  }, [initialActiveContextId]);

  // Change handler: update local state immediately (drives the engine body)
  // and, when bound, persist the choice to the conversation so reopening it
  // restores the context. Fire-and-forget — a failed write only loses
  // persistence, not the active selection for this session.
  const handleContextChange = useCallback(
    (id: string | null) => {
      setActiveContextId(id);
      if (!conversationId) return;
      void fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activeContextId: id }),
      }).catch(() => {});
    },
    [conversationId],
  );

  // ─── Stage 2: wrap handleSend for transient auto-promote ───
  //
  // When the panel is in transient mode AND the parent opted in via
  // onTransientPromoted, the first send triggers a conversation create
  // BEFORE the message goes out. We queue the user's text in
  // pendingTransientSendRef, fire the callback so the parent updates
  // activeId, and let the useEffect below resend through the bound
  // engine once conversationId flips from null → set.
  const wrappedHandleSend = useCallback(() => {
    if (
      !conversationId &&
      onTransientPromoted &&
      !promotingInFlightRef.current &&
      input.trim().length > 0
    ) {
      promotingInFlightRef.current = true;
      void (async () => {
        try {
          const res = await fetch("/api/conversations", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              contentId ? { snapshotContentNodeIds: [contentId] } : {},
            ),
          });
          if (!res.ok) throw new Error("Couldn't save the chat");
          const body = (await res.json()) as { data?: { id?: string } };
          const newId = body?.data?.id;
          if (!newId) throw new Error("Server didn't return a conversation id");
          // The skip flag prevents the binding hook from fetching the
          // (empty) just-created conversation and wiping our in-flight
          // input. pendingTransientSendRef tells the resend useEffect
          // to fire once the conversationId prop catches up.
          skipNextLoadRef.current = true;
          pendingTransientSendRef.current = true;
          onTransientPromoted(newId);
        } catch (err) {
          // Promote failed — fall back to sending transient so the user
          // doesn't lose their message. The chat won't persist this
          // turn, but at least they get a response.
          toast.error(
            err instanceof Error
              ? `${err.message} — sending as scratch chat`
              : "Couldn't save the chat — sending as scratch chat",
          );
          handleSend();
        } finally {
          promotingInFlightRef.current = false;
        }
      })();
      return;
    }
    handleSend();
  }, [conversationId, onTransientPromoted, contentId, input, handleSend]);

  // Resend the queued transient first message once conversationId catches up.
  useEffect(() => {
    if (conversationId && pendingTransientSendRef.current) {
      pendingTransientSendRef.current = false;
      handleSend();
    }
  }, [conversationId, handleSend]);

  // ─── AI Edit Orchestrator ───
  const isAiEditing = useEditorInstanceStore((s) =>
    s.isAiEditingFor(contentId)
  );

  const orchestratorRef = useRef<AiEditOrchestrator | null>(null);
  const contentIdRef = useRef(contentId);
  useEffect(() => {
    contentIdRef.current = contentId;
  }, [contentId]);

  // Create orchestrator on mount, destroy on unmount
  useEffect(() => {
    const orchestrator = new AiEditOrchestrator(
      () => useEditorInstanceStore.getState().getEditor(contentIdRef.current),
      {
        onStateChange: (editing) => {
          if (contentIdRef.current) {
            useEditorInstanceStore
              .getState()
              .setAiEditing(contentIdRef.current, editing);
          }
        },
        onEditResult: (result) => {
          if (!result.success && result.error) {
            toast.error(result.error);
          }
        },
      }
    );
    orchestratorRef.current = orchestrator;

    return () => {
      orchestrator.destroy();
      orchestratorRef.current = null;
    };
  }, []);

  // Intercept tool results for edit payloads.
  // AI SDK v6: tool results appear as DynamicToolUIPart with type 'dynamic-tool',
  // state 'output-available', and output containing the tool's return value.
  const processedToolIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!orchestratorRef.current) return;

    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.parts) {
        // DynamicToolUIPart: type='dynamic-tool', toolCallId, state, output
        if (
          "toolCallId" in part &&
          "state" in part &&
          (part as { state: string }).state === "output-available" &&
          "output" in part
        ) {
          const toolPart = part as { toolCallId: string; output: unknown };
          const outputStr = typeof toolPart.output === "string"
            ? toolPart.output
            : null;

          if (
            outputStr &&
            !processedToolIdsRef.current.has(toolPart.toolCallId)
          ) {
            const payload = parseEditPayload(outputStr);
            if (payload) {
              processedToolIdsRef.current.add(toolPart.toolCallId);
              orchestratorRef.current.enqueue(payload);
            }
          }
        }
      }
    }
  }, [messages]);

  // Reset chat when switching content nodes
  const prevContentIdRef = useRef(contentId);
  useEffect(() => {
    if (contentId !== prevContentIdRef.current) {
      prevContentIdRef.current = contentId;
      // Abort any in-progress AI edits when switching documents
      orchestratorRef.current?.abort();
      processedToolIdsRef.current.clear();
      setMessages([]);
      setInput("");
    }
  }, [contentId, setMessages, setInput]);

  // Flashcard "Ask for next batch" affordance. The CardProposalList
  // dispatches this event when the model truncated to the per-batch
  // limit; we pre-fill the chat input so the user can review the
  // request (and edit it) before sending. Deliberate model-loop-back
  // pattern for batch pagination — the only place in the flashcard
  // flow that a card button feeds back into the model.
  useEffect(() => {
    function handleNextBatch(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { deckPath?: string; batchLimit?: number }
        | undefined;
      const deckPath = detail?.deckPath ?? "this deck";
      const batchLimit = detail?.batchLimit ?? 10;
      setInput(
        `Propose the next ${batchLimit} cards for ${deckPath}.`,
      );
    }
    window.addEventListener("flashcard-request-next-batch", handleNextBatch);
    return () =>
      window.removeEventListener(
        "flashcard-request-next-batch",
        handleNextBatch,
      );
  }, [setInput]);

  // Trash button semantics:
  //   - Transient mode (no conversationId): clear local messages
  //   - Conversation-bound: delete the Conversation entirely and let
  //     the parent (MultiConversationSidebar) refresh its tab list
  const handleClearOrDelete = useCallback(async () => {
    if (conversationId && onDeleteConversation) {
      await onDeleteConversation(conversationId);
      return;
    }
    setMessages([]);
  }, [conversationId, onDeleteConversation, setMessages]);

  // Branch: fork the conversation up to a message, then let the parent
  // activate the new tab.
  const handleBranch = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/fork`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uptoMessageId: messageId }),
          },
        );
        if (!res.ok) throw new Error("Branch failed");
        const body = await res.json();
        const newId: string | undefined = body?.data?.conversationId;
        if (newId) {
          toast.success("Branched into a new chat");
          onForked?.(newId);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Branch failed");
      }
    },
    [conversationId, onForked],
  );

  // Open this chat in the full-page viewer: ensure a backing content node
  // exists, then soft-navigate to it.
  const handleOpenInPage = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/open-in-page`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) throw new Error("Could not open in full view");
      const body = await res.json();
      const nodeId: string | undefined = body?.data?.contentNodeId;
      if (nodeId) {
        useContentStore.getState().setSelectedContentId(nodeId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open in full view");
    }
  }, [conversationId]);

  const hasMessages = messages.length > 0;

  // Surface follows the *active* provider — selecting OpenAI tints
  // immediately even if previous messages were from Claude. Per-message
  // stamps drive bubble identity; the Mixed chip surfaces actual
  // conversation contributors. This split keeps the picker reactive.
  const mixed = detectMixedProvider(
    messages.map((m) => ({
      role: m.role,
      providerId: getMessageStamp(m.id, { providerId, modelId }).providerId,
    })),
  );
  if (!contentId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Select content to start an AI chat
        </div>
      </div>
    );
  }

  // The provider surface gradient lives on the MultiConversationSidebar
  // wrapper (so the tab strip and chat content share one painted
  // surface). This root paints transparent and inherits the wrapper's bg.
  return (
    <div className="flex h-full flex-col">
      {/* Header — shows active provider/model. Save button removed:
          chats auto-save to the bound Conversation. Delete is protected
          by a two-step confirm. */}
      <div className="flex shrink-0 items-center justify-between border-b border-black/10 dark:border-white/10 px-3 py-2">
        <HeaderTitle providerId={providerId} modelId={modelId} />
        <div className="flex items-center gap-1">
          {conversationId && (
            <button
              onClick={() => void handleOpenInPage()}
              title="Open in full view"
              className="rounded p-1.5 text-gray-600 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gray-200 transition-colors"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          {hasMessages && (
            <>
              <DeleteWithConfirm
                onConfirm={() => void handleClearOrDelete()}
                destructive={Boolean(conversationId && onDeleteConversation)}
              />
            </>
          )}
        </div>
      </div>

      {/* Error banner — parses the structured chat-route error JSON
          (raw blob otherwise; AI SDK passes the body through verbatim)
          and surfaces a CTA when the cause is missing BYOK setup. */}
      {error && <ChatErrorBanner message={error.message} />}

      {/* AI editing indicator */}
      {isAiEditing && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
          <Pencil className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          <span>AI is editing the document...</span>
        </div>
      )}

      {/* Messages — loading state takes precedence so the user can't
          accidentally type into a fresh useChat session that's about to
          be overwritten by the historical load. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={setScrollEl} className="scrollbar-hide flex-1 overflow-y-auto">
        {loadingInitial ? (
          <LoadingMessages />
        ) : hasMessages ? (
          <div className="space-y-1 py-2">
            {messages.map((message, i) => {
              const stamp = getMessageStamp(message.id, { providerId, modelId });
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  providerId={stamp.providerId}
                  modelId={stamp.modelId}
                  isStreaming={
                    isActive &&
                    i === messages.length - 1 &&
                    message.role === "assistant"
                  }
                  onEdit={(id, text) => void editMessage(id, text)}
                  onRegenerate={(id) => void regenerateMessage(id)}
                  onBranch={(id) => void handleBranch(id)}
                  actionsDisabled={isActive}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
      {showJumpToLatest && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-[#1a1a1a]/90 px-2.5 py-1 text-[11px] text-gray-200 shadow-lg backdrop-blur transition-colors hover:bg-white/10"
        >
          <ChevronDown className="h-3 w-3" /> Jump to latest
        </button>
      )}
      </div>

      {/* Suggested follow-ups (Session 7) — appears between the
          messages list and the composer when the engine returns
          chips for the latest assistant turn. */}
      <FollowUpsStrip
        followUps={followUps}
        onPick={(text) => setInput(text)}
        onDismiss={clearFollowUps}
      />

      {/* Input — make/model picker lives inside the input frame footer.
          Disabled while initial messages are loading so typed input
          can't be overwritten by setMessages mid-stream. */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={wrappedHandleSend}
        onStop={stop}
        status={status}
        disabled={loadingInitial}
        onMentionSearch={handleMentionSearch}
        mentionResults={mentionResults}
        commandItems={commandItems}
        attachments={attachments}
        onAddFiles={addAttachmentFiles}
        onRemoveAttachment={removeAttachment}
        attachmentsUploading={attachmentsUploading}
        supportsImages={supportsImageAttachments}
        footerLeading={
          <div className="flex min-w-0 items-center">
            <MakeAndModelPicker
              providerId={providerId}
              modelId={modelId}
              onChange={handleModelChange}
              disabled={isActive}
              contributors={mixed.contributors as AIProviderId[]}
              compact
            />
            <ChatContextPicker
              value={activeContextId}
              onChange={handleContextChange}
              disabled={isActive}
              compact
            />
          </div>
        }
      />
    </div>
  );
}

/**
 * Header title — shows the active provider's brand icon + the model
 * display name. Replaces the generic "AI Chat" so users see which model
 * is answering them, à la ChatGPT/Claude.
 */
function HeaderTitle({
  providerId,
  modelId,
}: {
  providerId: string;
  modelId: string;
}) {
  const theme = getProviderTheme(providerId);
  const provider = useMemo(
    () => PROVIDER_CATALOG.find((p) => p.id === providerId),
    [providerId],
  );
  const modelName = useMemo(
    () => provider?.models.find((m) => m.id === modelId)?.name ?? modelId,
    [provider, modelId],
  );
  return (
    <div className="flex items-center gap-2 text-sm text-gray-300 min-w-0">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{
          background: theme.bubbleTint,
          color: theme.brandColor,
        }}
      >
        <ProviderIcon providerId={providerId} className="h-3 w-3" />
      </span>
      <span className="font-medium truncate" style={{ color: theme.brandColor }}>
        {modelName}
      </span>
    </div>
  );
}

/**
 * Two-step delete: first click arms the action and shows an
 * "Are you sure?" confirm button; second click clears messages. A
 * 3-second timeout auto-disarms so the user doesn't end up with a
 * permanently-armed dangerous button.
 */
function DeleteWithConfirm({
  onConfirm,
  destructive,
}: {
  onConfirm: () => void;
  /**
   * When true, the confirm pill says "Delete chat" — the action will
   * remove the Conversation entirely. When false, it says "Clear" —
   * the action only resets the local message view.
   */
  destructive: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        title={destructive ? "Delete chat" : "Clear chat"}
        className="rounded p-1.5 text-gray-600 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-red-400 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <button
      onClick={() => {
        setArmed(false);
        onConfirm();
      }}
      title={
        destructive
          ? "Confirm delete (click again, auto-cancels in 3s)"
          : "Confirm clear (click again, auto-cancels in 3s)"
      }
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors"
    >
      <Trash2 className="h-3 w-3" />
      {destructive ? "Delete" : "Confirm"}
    </button>
  );
}

/**
 * Skeleton placeholder shown while initial chat history is loading
 * from the API. Two-bubble pattern (user-tinted right, assistant-tinted
 * left) approximates what the real messages will look like, so the
 * panel doesn't "pop" when content arrives.
 */
function LoadingMessages() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
      <div className="flex w-full max-w-[280px] flex-col gap-2 opacity-50 animate-pulse">
        <div className="ml-auto h-7 w-2/3 rounded-xl bg-blue-500/20" />
        <div className="h-8 w-3/4 rounded-xl bg-white/10" />
        <div className="ml-auto h-7 w-1/2 rounded-xl bg-blue-500/20" />
      </div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">
        Loading chat…
      </p>
    </div>
  );
}

/** Welcome state when no messages */
function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 mb-3">
        <Bot className="h-6 w-6 text-gray-500" />
      </div>
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
        How can I help?
      </p>
      <p className="mt-1 text-xs text-gray-600 max-w-48">
        Ask about your notes, get summaries, or explore ideas.
      </p>
    </div>
  );
}
