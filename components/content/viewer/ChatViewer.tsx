/**
 * Chat Viewer Component
 *
 * Full-page persistent chat viewer for chat ContentNodes.
 *
 * Engine boilerplate lives in `useConversationEngine`. This file owns
 * full-page-specific concerns: ChatPayload persistence, chat-outline
 * sync (Sprint 41), and the scroll-to-message handler.
 */

"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { Bot, ChevronDown } from "lucide-react";
import { ChatMessage } from "../ai/ChatMessage";
import {
  ModelSwitchDivider,
  ModelRouteNotices,
} from "../ai/ModelSwitchDivider";
import { computeModelRouteDecorations } from "@/lib/domain/ai/model-directive";
import { findIterationFoldBoundary } from "@/lib/domain/ai/context-diet";
import { aggregateSessionUsage } from "@/lib/features/ai-connections/usage/pricing";
import { ChatControlPanel } from "../ai/ChatControlPanel";

/** Compact token formatting for the header meter (v3.1 R5). */
function formatTokenCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
import { deriveTargetSeed } from "@/lib/domain/ai/output-target";
import { ChatInput } from "../ai/ChatInput";
import { FolderContextChips } from "@/components/content/ai/FolderContextChips";
import { FollowUpsStrip } from "../ai/FollowUpsStrip";
import { ChatErrorBanner } from "../ai/ChatErrorBanner";
import { MakeAndModelPicker } from "../ai/MakeAndModelPicker";
import { AssociatedContentChips } from "../ai/AssociatedContentChips";
import { useConversationEngine } from "@/lib/domain/ai/use-conversation-engine";
import {
  useConversationBinding,
  type PersistFinishPayload,
} from "@/lib/domain/ai/use-conversation-binding";
import { useContentStore } from "@/state/content-store";
import { toast } from "sonner";
import {
  buildSurfaceBackground,
  detectMixedProvider,
} from "@/lib/design/system/ai-providers";
import { useResolvedTheme } from "@/lib/features/theme/useResolvedTheme";
import type { AIProviderId } from "@/lib/domain/ai/types";
import { extractChatOutline } from "@/lib/domain/ai/chat-outline";
import { useOutlineStore } from "@/state/outline-store";
import type { UIMessage } from "ai";
import type { StoredChatMessage } from "@/lib/domain/ai/types";
import { clientLogger } from "@/lib/core/logger/client";

interface ChatViewerProps {
  contentId: string;
  title: string;
  messages?: StoredChatMessage[];
  metadata?: Record<string, unknown>;
}

/** Convert stored messages to AI SDK UIMessage format */
function toUIMessages(stored: StoredChatMessage[]): UIMessage[] {
  return stored
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const parts: UIMessage["parts"] = [
        { type: "text" as const, text: m.content },
      ];

      // Reconstruct stored parts: attachment file parts + image-gen
      // payloads. (Legacy ChatPayload chats — Conversation-backed chats
      // load full parts directly via the binding hook.)
      if (m.parts && Array.isArray(m.parts)) {
        for (const stored of m.parts) {
          if (!stored || typeof stored !== "object") continue;
          const s = stored as Record<string, unknown>;
          if (s.type === "file" && typeof s.url === "string") {
            // User-attached file (image/pdf/text) — round-trips verbatim.
            parts.push(s as unknown as UIMessage["parts"][number]);
          } else if (s.__imagePayload) {
            // Reconstruct a synthetic tool part that ChatMessage detects
            // via "toolCallId" in part && "toolName" in part.
            const syntheticToolPart = {
              type: "tool-generate_image" as const,
              toolCallId: `restored-${s.contentId}`,
              toolName: "generate_image",
              state: "output-available",
              input: {},
              output: JSON.stringify(stored),
            };
            parts.push(syntheticToolPart as unknown as UIMessage["parts"][number]);
          }
        }
      }

      return {
        id: m.id || crypto.randomUUID(),
        role: m.role as "user" | "assistant",
        parts,
        // Legacy rows can carry metadata too — keep it for divider/usage
        // consumers (AI 3.4).
        ...(m.metadata != null ? { metadata: m.metadata } : {}),
      };
    });
}

/**
 * Outer ChatViewer — resolves whether this chat ContentNode is backed by
 * a live Conversation (promoted via the picker) before mounting the
 * engine. This gate matters: a backed chat must load/persist against the
 * Conversation store (the same one the sidebar uses) so the two surfaces
 * never diverge; an unbacked legacy chat falls back to ChatPayload.
 *
 * We render the inner surface only AFTER resolution, keyed by the binding
 * mode, so the engine is created once in the correct mode (no flash of
 * the wrong store, no double-mount).
 */
export function ChatViewer(props: ChatViewerProps) {
  const { contentId, title } = props;
  const [resolved, setResolved] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolved(false);
    setConversationId(null);
    (async () => {
      try {
        // Already promoted? Bind to the existing Conversation.
        const res = await fetch(
          `/api/conversations/by-archived-content?contentId=${encodeURIComponent(contentId)}`,
          { credentials: "include" },
        );
        if (cancelled) return;
        let id: string | null = res.ok
          ? ((await res.json())?.data?.conversationId ?? null)
          : null;

        // Promote-on-open: a legacy ChatPayload chat with no backing
        // Conversation gets promoted to one (idempotent — copies the
        // payload's messages into ConversationMessage rows and links via
        // archivedToContentNodeId). From here every chat is
        // Conversation-backed, so attachments, edit/regenerate, branch,
        // and cross-surface sync all work on a single path.
        if (!id && !cancelled) {
          const promote = await fetch("/api/conversations", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fromContentNodeId: contentId }),
          });
          if (promote.ok && !cancelled) {
            id = (await promote.json())?.data?.id ?? null;
          }
        }

        if (!cancelled) setConversationId(id);
      } catch {
        /* best-effort — fall back to legacy ChatPayload mode */
      } finally {
        if (!cancelled) setResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  if (!resolved) return <ChatViewerLoading title={title} />;

  return (
    <ChatViewerInner
      key={conversationId ?? contentId}
      {...props}
      conversationId={conversationId}
    />
  );
}

interface ChatViewerInnerProps extends ChatViewerProps {
  /** Resolved backing conversation id, or null for legacy ChatPayload mode. */
  conversationId: string | null;
}

function ChatViewerInner({
  contentId,
  title,
  messages: initialStoredMessages = [],
  metadata,
  conversationId,
}: ChatViewerInnerProps) {
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBound = Boolean(conversationId);

  // Initial messages: in bound mode the binding hook hydrates from the
  // Conversation, so we start empty; in legacy mode we seed from the
  // ChatPayload props.
  const initialMessages = useMemo(
    () => (isBound ? [] : toUIMessages(initialStoredMessages)),
    // Only compute once on mount — don't re-derive when parent re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentId]
  );

  // Stable onFinish that delegates to the ref-tracked persist function.
  // Bound mode → the binding hook claims this ref (Conversation persist).
  // Legacy mode → the ChatPayload debounced persist claims it below.
  const persistRef = useRef<(payload?: PersistFinishPayload) => void>(() => {});
  // Edit/regenerate supersession — populated by the binding hook in bound
  // mode; a no-op in legacy mode (edits there just re-save the ChatPayload).
  const truncateRef = useRef<(clientId: string, inclusive: boolean) => Promise<void>>(
    async () => {},
  );
  // Exact parts of the just-sent user turn (engine → binding) so
  // attachments persist reliably.
  const pendingUserPartsRef = useRef<UIMessage["parts"] | null>(null);

  // Selected custom-instruction context for this chat (seeded from the
  // bound conversation below, forwarded to the engine per turn).
  const [activeContextId, setActiveContextId] = useState<string | null>(null);

  // Hoisted above BOTH hooks: the binding (which loads history) mounts after
  // the engine (which reattaches to in-flight streams), so readiness has to
  // travel through the parent. The engine holds its resume until this is true.
  const [historyReady, setHistoryReady] = useState(false);

  const {
    messages,
    setMessages,
    status,
    stop,
    error,
    addToolApprovalResponse,
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
    modelPinned,
    setModelPinned,
    mentionResults,
    handleMentionSearch,
    handleResolveMention,
    notifyMentionInserted,
    folderGates,
    commandItems,
    activeCharter,
    attachCharter,
    detachCharter,
    outputTarget,
    setOutputTarget,
    followUps,
    clearFollowUps,
    scrollRef,
    setScrollEl,
    showJumpToLatest,
    scrollToBottom,
    getMessageStamp,
    seedMessageStamps,
  } = useConversationEngine({
    conversationKey: conversationId ?? contentId,
    contentId,
    conversationId: conversationId ?? undefined,
    activeContextId,
    initialMessages,
    historyReady,
    onFinish: (event) => {
      // Forward the SDK's fresh assistant message (with metadata) so
      // persistTurns can read it directly rather than from a stale
      // React closure. The SDK mutates state.message.metadata just
      // before firing onFinish; our `messages` array may not have
      // flushed yet at this synchronous call site.
      const fresh = event.message
        ? {
            id: event.message.id,
            parts: event.message.parts,
            metadata: (event.message as { metadata?: unknown }).metadata,
          }
        : undefined;
      persistRef.current({ freshAssistant: fresh });
    },
    truncateRef,
    pendingUserPartsRef,
  });

  // Bound mode: load/persist/title against the Conversation store — the
  // SAME hook the sidebar ChatPanel uses, so the surfaces stay identical.
  const {
    loadingInitial,
    conversationTitle,
    initialActiveContextId,
    initialTargetFolder,
    initialTargetInherited,
    initialTargetLocation,
  } = useConversationBinding({
      conversationId: conversationId ?? null,
      messages,
      setMessages: setMessages as unknown as (messages: unknown) => void,
      getMessageStamp,
      seedMessageStamps,
      providerId,
      modelId,
      persistRef,
      truncateRef,
      pendingUserPartsRef,
      onHistoryReady: setHistoryReady,
    });

  // Seed local context selection from the bound conversation on (re)load.
  useEffect(() => {
    setActiveContextId(initialActiveContextId);
  }, [initialActiveContextId]);

  // Target folder (AI v3 core S3): seed from the bound conversation;
  // user changes persist via PATCH (validated server-side).
  const [targetFolder, setTargetFolder] = useState<{
    id: string;
    title: string | null;
  } | null>(null);
  const [targetInherited, setTargetInherited] = useState(false);
  useEffect(() => {
    // Single-source with ChatPanel (AI 3.8 fix): no explicit target
    // inherits the chat's location, so expanding a panel chat to full
    // view keeps the inherited chip instead of dropping it.
    const seed = deriveTargetSeed({
      explicit: initialTargetFolder,
      explicitInherited: initialTargetInherited,
      location: initialTargetLocation,
    });
    setTargetFolder(seed.target);
    setTargetInherited(seed.inherited);
  }, [initialTargetFolder, initialTargetInherited, initialTargetLocation]);
  const handleTargetChange = useCallback(
    (next: { id: string; title: string | null } | null) => {
      if (next) {
        setTargetFolder(next);
        setTargetInherited(false);
      } else {
        // Clearing returns to the chat's location when it has one.
        setTargetFolder(initialTargetLocation);
        setTargetInherited(Boolean(initialTargetLocation));
      }
      if (!conversationId) return;
      void fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetFolderId: next?.id ?? null }),
      }).catch(() => {});
    },
    [conversationId, initialTargetLocation],
  );

  // Persist context changes to the conversation when bound; otherwise hold
  // in-session. Fire-and-forget.
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

  // Branch (bound mode only): fork up to the message, materialize the new
  // branch to its own content node, and navigate there.
  const handleBranch = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      // Helper: pull the most useful error string out of a non-OK response.
      // The server now returns shape `{ success: false, error: string }`
      // with a code-bearing tag (e.g. "Fork failed (P2002)"). Falling back
      // to status text + status code if the body isn't parseable keeps the
      // toast informative even when the server crashed pre-body.
      const readErr = async (res: Response, fallback: string) => {
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) return body.error;
        } catch {
          /* unparseable */
        }
        return `${fallback} (${res.status})`;
      };
      try {
        const forkRes = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/fork`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uptoMessageId: messageId }),
          },
        );
        if (!forkRes.ok) throw new Error(await readErr(forkRes, "Fork failed"));
        const newId = (await forkRes.json())?.data?.conversationId as
          | string
          | undefined;
        if (!newId) throw new Error("Fork returned no conversation id");

        const openRes = await fetch(
          `/api/conversations/${encodeURIComponent(newId)}/open-in-page`,
          { method: "POST", credentials: "include" },
        );
        if (!openRes.ok)
          throw new Error(await readErr(openRes, "Open-in-page failed"));
        const nodeId = (await openRes.json())?.data?.contentNodeId as
          | string
          | undefined;
        if (!nodeId) throw new Error("Open-in-page returned no content node id");

        toast.success("Branched into a new chat");
        useContentStore.getState().setSelectedContentId(nodeId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Branch failed");
      }
    },
    [conversationId],
  );

  // Persist messages to ChatPayload via PATCH (LEGACY / unbound mode only)
  const persistMessages = useCallback(async () => {
    if (isBound || messages.length === 0) return;

    const storedMessages: StoredChatMessage[] = messages.map((m) => {
      // Extract text content
      const content = m.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("");

      // Preserve parts that must survive refresh:
      //   - attachment file parts (user-attached images/PDFs/text), and
      //   - image-gen tool payloads (the generated-image cards).
      const storedParts: unknown[] = [];
      for (const part of m.parts) {
        const p = part as Record<string, unknown>;
        // User attachment — round-trips verbatim (incl. providerMetadata
        // carrying the storage key + extracted text).
        if (p.type === "file") {
          storedParts.push(p);
          continue;
        }
        // AI SDK v6: static tool parts have type "tool-{name}" with no toolName prop;
        // dynamic tool parts have type "dynamic-tool" with toolName prop.
        // Check for toolCallId (present on both) rather than toolName.
        if (
          "toolCallId" in p &&
          (p.state as string) === "output-available" &&
          "output" in p
        ) {
          const output = p.output;
          const str = typeof output === "string" ? output : JSON.stringify(output);
          if (str.includes('"__imagePayload"')) {
            try {
              const parsed = typeof output === "string" ? JSON.parse(output) : output;
              if (parsed?.__imagePayload) {
                storedParts.push(parsed);
              }
            } catch { /* skip */ }
          }
        }
      }

      return {
        id: m.id,
        role: m.role,
        content,
        createdAt: new Date().toISOString(),
        ...(storedParts.length > 0 ? { parts: storedParts } : {}),
      };
    });

    try {
      const res = await fetch(`/api/content/content/${contentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatMessages: storedMessages,
          chatMetadata: {
            ...((metadata as Record<string, unknown>) || {}),
            providerId,
            modelId,
            lastUpdated: new Date().toISOString(),
            messageCount: storedMessages.length,
          },
        }),
      });

      if (!res.ok) {
        clientLogger.error({
          layer: "ui",
          event: "chat_persist:failed",
          summary: "chat persist api non-ok",
          attrs: { content_id: contentId, status: res.status },
        });
      }
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "chat_persist:caught",
        summary: "chat persist handler caught",
        attrs: { content_id: contentId },
        error: err,
      });
    }
  }, [isBound, messages, contentId, metadata, providerId, modelId]);

  // Debounced persist (2s after last change, matching editor auto-save)
  const debouncedPersist = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      persistMessages();
    }, 2000);
  }, [persistMessages]);

  // Legacy mode only: claim the engine's persist ref for ChatPayload
  // auto-save. In bound mode the binding hook owns the ref (Conversation
  // persist), so we must not overwrite it.
  useEffect(() => {
    if (isBound) return;
    persistRef.current = debouncedPersist;
  }, [isBound, debouncedPersist]);

  // Cleanup persist timer on unmount
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  // ─── Sprint 41: Chat outline sync ───
  const setChatOutline = useOutlineStore((s) => s.setChatOutline);
  const chatOutlineGranularity = useOutlineStore(
    (s) => s.getViewState(contentId).chatOutlineGranularity
  );

  // Update outline store when messages or granularity changes (real-time)
  useEffect(() => {
    const entries = extractChatOutline(messages, chatOutlineGranularity);
    setChatOutline(contentId, entries);
  }, [contentId, messages, chatOutlineGranularity, setChatOutline]);

  // ─── Sprint 41: Scroll-to-message from outline clicks ───
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        messageIndex: number;
        entryId: string;
      };
      const container = scrollRef.current;
      if (!container) return;

      // Find the message element by data attribute
      const messageEl = container.querySelector(
        `[data-message-index="${detail.messageIndex}"]`
      );
      if (messageEl) {
        messageEl.scrollIntoView({ behavior: "smooth", block: "center" });
        // Brief highlight flash
        messageEl.classList.add("chat-outline-flash");
        setTimeout(() => messageEl.classList.remove("chat-outline-flash"), 1500);
      }
    };

    window.addEventListener("scroll-to-chat-message", handler);
    return () => window.removeEventListener("scroll-to-chat-message", handler);
  }, [scrollRef]);

  const hasMessages = messages.length > 0;

  // Model-switch dividers (AI 3.4): SHARED domain walk — the panel and this
  // viewer must never disagree about where a model switched.
  const messageRouteDecorations = useMemo(
    () => computeModelRouteDecorations(messages),
    [messages],
  );
  // P4c: the active iteration run's fold boundary — parts before it render
  // collapsed, mirroring exactly what the model-facing assembly stubs.
  const iterationFoldBoundary = useMemo(
    () => findIterationFoldBoundary(messages),
    [messages],
  );
  // P3 owner ask: cumulative session usage for the avatar popover.
  const sessionUsage = useMemo(
    () => aggregateSessionUsage(messages),
    [messages],
  );
  const charterAttached = useMemo(
    () =>
      messages.some(
        (m) =>
          m.role === "user" &&
          (m.parts ?? []).some(
            (p) => (p as { type?: string }).type === "data-charter",
          ),
      ),
    [messages],
  );

  // Mid-run review (v3.1 R1): the run counts as "active" while streaming
  // AND while parked on an unanswered approval (the stream has ended but
  // the procedure hasn't — an approval card is waiting). In either state,
  // artifact cards open in a split pane so review never displaces this
  // full-page conversation.
  const parkedOnApproval = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return false;
    return last.parts.some(
      (part) =>
        (part as { state?: string }).state === "approval-requested",
    );
  }, [messages]);
  const midRunPaneOpen = isActive || parkedOnApproval;

  // Basic per-run cost meter (S5, catalog F39): sums the token usage the
  // chat route stamps onto assistant message metadata. Client-side only —
  // the data already rides the loaded messages.
  const runTokens = useMemo(
    () =>
      messages.reduce((sum, m) => {
        const usage = (
          m as { metadata?: { usage?: { totalTokens?: number } } }
        ).metadata?.usage;
        return sum + (usage?.totalTokens ?? 0);
      }, 0),
    [messages],
  );

  // Tokens-per-phase (v3.1 R5): phases are delimited by phase_checkpoint
  // tool calls already in the stream — usage accumulates into the phase
  // the checkpoint closes. Client-side only; the server-side twin stamps
  // "tokens so far" into the Run Ledger at each checkpoint.
  const [showPhaseTokens, setShowPhaseTokens] = useState(false);
  const phaseTokens = useMemo(() => {
    const phases: Array<{ name: string; tokens: number }> = [];
    let bucket = 0;
    for (const m of messages) {
      bucket +=
        (m as { metadata?: { usage?: { totalTokens?: number } } }).metadata
          ?.usage?.totalTokens ?? 0;
      if (m.role !== "assistant") continue;
      for (const part of m.parts ?? []) {
        const p = part as {
          type?: string;
          state?: string;
          input?: { phase?: string };
        };
        if (
          p.type === "tool-phase_checkpoint" &&
          (p.state === "output-available" || p.state === "output-error")
        ) {
          phases.push({
            name: p.input?.phase ?? `Phase ${phases.length + 1}`,
            tokens: bucket,
          });
          bucket = 0;
        }
      }
    }
    if (bucket > 0) {
      phases.push({
        name: phases.length > 0 ? "Since last checkpoint" : "Run",
        tokens: bucket,
      });
    }
    return phases;
  }, [messages]);

  // Inline rename (double-click the header title). A local override wins
  // over the loaded title so the change shows instantly; it routes through
  // the conversation PATCH (bound) or the content PATCH (legacy), both of
  // which fan out to the sidebar tab, file tree, and workspace tab.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const resolvedTheme = useResolvedTheme();
  const displayTitle = titleOverride ?? conversationTitle ?? title;

  const beginRenameTitle = useCallback(() => {
    setTitleDraft(displayTitle);
    setRenamingTitle(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }, [displayTitle]);

  const commitRenameTitle = useCallback(async () => {
    const next = titleDraft.trim();
    setRenamingTitle(false);
    if (!next || next === displayTitle) return;
    setTitleOverride(next); // optimistic
    try {
      if (conversationId) {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: next }),
          },
        );
        if (!res.ok) throw new Error("Rename failed");
      } else {
        // Legacy chat (no Conversation) — rename the ContentNode directly.
        const res = await fetch(
          `/api/content/content/${encodeURIComponent(contentId)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: next }),
          },
        );
        if (!res.ok) throw new Error("Rename failed");
      }
      // Fan out to the file tree + workspace tab (this chat node is
      // `contentId`). The conversation PATCH also publishes the SSE event
      // that refreshes the sidebar tab.
      window.dispatchEvent(
        new CustomEvent("content-updated", {
          detail: { contentId, updates: { title: next } },
        }),
      );
      useContentStore.getState().updateContentTab(contentId, { title: next });
    } catch (e) {
      setTitleOverride(null); // roll back optimistic change
      toast.error(e instanceof Error ? e.message : "Rename failed");
    }
  }, [titleDraft, displayTitle, conversationId, contentId]);

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
  const surfaceBackground = buildSurfaceBackground(
    providerId,
    [providerId as AIProviderId],
    resolvedTheme,
  );

  return (
    <div
      className="flex h-full flex-col"
      style={{ background: surfaceBackground }}
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-black/10 dark:border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-green-600 dark:text-green-400" />
          <div className="min-w-0 flex-1">
            {renamingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitRenameTitle();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setRenamingTitle(false);
                  }
                }}
                onBlur={() => void commitRenameTitle()}
                className="w-full bg-transparent text-lg font-semibold text-gray-900 dark:text-white outline-none border-b border-black/30 dark:border-white/30 focus:border-black/60 dark:focus:border-white/60"
              />
            ) : (
              <h1
                className="text-lg font-semibold text-gray-900 dark:text-white truncate cursor-text"
                onDoubleClick={beginRenameTitle}
                title="Double-click to rename"
              >
                {displayTitle}
              </h1>
            )}
            <p className="relative text-xs text-gray-500">
              {hasMessages ? (
                <>
                  {messages.length} message{messages.length !== 1 ? "s" : ""}
                  {runTokens > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPhaseTokens((v) => !v)}
                      className="ml-1 rounded px-1 hover:bg-black/[0.05] dark:hover:bg-white/10 transition-colors"
                      title={
                        phaseTokens.length > 1
                          ? "Per-phase token breakdown"
                          : "Total token usage this conversation"
                      }
                    >
                      · ~{formatTokenCount(runTokens)} tokens
                      {phaseTokens.length > 1 ? " ▾" : ""}
                    </button>
                  )}
                  {showPhaseTokens && phaseTokens.length > 1 && (
                    <span className="absolute left-0 top-full z-20 mt-1 block min-w-[230px] rounded-lg border border-black/10 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-zinc-900">
                      {phaseTokens.map((ph, i) => (
                        <span
                          key={i}
                          className="flex justify-between gap-3 py-0.5"
                        >
                          <span className="min-w-0 truncate text-gray-600 dark:text-gray-300">
                            {ph.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-gray-500">
                            ~{formatTokenCount(ph.tokens)}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </>
              ) : (
                "New conversation"
              )}
            </p>
          </div>
        </div>
        {/* Reverse-view: which content this chat is pinned to. Renders
            nothing unless the chat is Conversation-backed with at least
            one association. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* AI 3.8 (owner): target chips live in the ChatControlPanel now —
              the header keeps only the association chips, which the panel
              does not host. */}
          {conversationId && (
            <AssociatedContentChips conversationId={conversationId} />
          )}
        </div>
      </div>

      {/* Error banner — parsed + CTA for BYOK setup */}
      {error && <ChatErrorBanner message={error.message} />}

      {/* Messages — bound mode shows a loader until the conversation
          history hydrates, so the user can't type into a soon-to-be-
          overwritten session. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={setScrollEl} className="scrollbar-hide flex-1 overflow-y-auto">
        {loadingInitial ? (
          <ChatLoadingBody />
        ) : hasMessages ? (
          <div className="space-y-1 py-4">
            {messages.map((message, i) => {
              const stamp = getMessageStamp(message.id, { providerId, modelId });
              const deco = messageRouteDecorations[message.id];
              return (
                <div key={message.id} data-message-index={i}>
                  {deco?.kind === "divider" && deco.route ? (
                    <ModelSwitchDivider
                      route={deco.route}
                      notices={deco.notices}
                    />
                  ) : deco?.kind === "notices" ? (
                    <ModelRouteNotices notices={deco.notices} />
                  ) : null}
                  <ChatMessage
                    message={message}
                    messageIndex={i}
                    foldBoundary={iterationFoldBoundary}
                    sessionUsage={sessionUsage}
                    charterAttached={charterAttached}
                    providerId={stamp.providerId}
                    modelId={stamp.modelId}
                    isStreaming={
                      isActive &&
                      i === messages.length - 1 &&
                      message.role === "assistant"
                    }
                    onEdit={(id, text) => void editMessage(id, text)}
                    onRegenerate={(id) => void regenerateMessage(id)}
                    onToolApprovalResponse={(opts) =>
                      void addToolApprovalResponse(opts)
                    }
                    approvalActionable={
                      i === messages.length - 1 &&
                      message.role === "assistant"
                    }
                    onBranch={
                      conversationId
                        ? (id) => void handleBranch(id)
                        : undefined
                    }
                    actionsDisabled={isActive}
                    midRunPaneOpen={midRunPaneOpen}
                    outputTarget={outputTarget}
                    conversationId={conversationId}
                    contentId={contentId}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title={displayTitle} />
        )}
      </div>
      {showJumpToLatest && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/15 bg-white/90 text-gray-700 hover:bg-black/[0.06] dark:border-white/15 dark:bg-[#1a1a1a]/90 dark:text-gray-200 dark:hover:bg-white/10 px-3 py-1 text-xs shadow-lg backdrop-blur transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" /> Jump to latest
        </button>
      )}
      </div>

      {/* Suggested follow-ups (Session 7) */}
      <FollowUpsStrip
        followUps={followUps}
        onPick={(text) => setInput(text)}
        onDismiss={clearFollowUps}
      />

      {/* Input — make/model picker lives inside the input frame footer */}
      <FolderContextChips gates={folderGates} />
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        onStop={stop}
        status={status}
        disabled={loadingInitial}
        placeholder="Continue the conversation..."
        onMentionSearch={handleMentionSearch}
        onResolveMention={handleResolveMention}
        onMentionInserted={notifyMentionInserted}
        mentionResults={mentionResults}
        commandItems={commandItems}
        onAttachCharter={attachCharter}
        activeCharter={activeCharter}
        onDetachCharter={detachCharter}
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
            />
            {/* AI 3.8: pin + context moved into the labeled control panel. */}
            <ChatControlPanel
              targetFolder={targetFolder}
              targetInherited={targetInherited}
              targetLocation={initialTargetLocation}
              onTargetChange={handleTargetChange}
              targetDisabled={!conversationId}
              outputTarget={outputTarget}
              onOutputTargetChange={setOutputTarget}
              hasOrigin={false}
              modelPinned={modelPinned}
              onModelPinnedChange={setModelPinned}
              activeContextId={activeContextId}
              onContextChange={handleContextChange}
              busy={isActive}
            />
          </div>
        }
      />
    </div>
  );
}

/** Header-only loading shell shown while the backing-conversation lookup
 *  resolves, before the engine mounts. Keeps the surface from flashing. */
function ChatViewerLoading({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-black/10 dark:border-white/10 px-6 py-4">
        <Bot className="h-5 w-5 text-green-600 dark:text-green-400" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
      </div>
      <ChatLoadingBody />
    </div>
  );
}

/** Skeleton body shown while conversation history hydrates. */
function ChatLoadingBody() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
      <div className="flex w-full max-w-[420px] flex-col gap-2 opacity-50 animate-pulse">
        <div className="ml-auto h-8 w-2/3 rounded-xl bg-blue-500/20" />
        <div className="h-10 w-3/4 rounded-xl bg-black/10 dark:bg-white/10" />
        <div className="ml-auto h-8 w-1/2 rounded-xl bg-blue-500/20" />
      </div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">
        Loading chat…
      </p>
    </div>
  );
}

/** Empty state for new chat nodes */
function EmptyState({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 mb-4">
        <Bot className="h-8 w-8 text-gray-500" />
      </div>
      <h2 className="text-lg font-medium text-gray-700 dark:text-gray-300">{title}</h2>
      <p className="mt-2 text-sm text-gray-500 max-w-sm">
        Start a conversation. Messages are automatically saved.
      </p>
    </div>
  );
}
