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
import { usePathname } from "next/navigation";
import { Trash2, Bot, Pencil, Maximize2, ChevronDown } from "lucide-react";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import { getProviderTheme } from "@/lib/design/system/ai-providers";
import { useResolvedTheme } from "@/lib/features/theme/useResolvedTheme";
import { ProviderIcon } from "./ProviderIcon";
import { toast } from "sonner";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { AiEditOrchestrator, parseEditPayload } from "@/lib/domain/editor/ai";
import { ChatMessage } from "./ChatMessage";
import {
  ModelSwitchDivider,
  ModelRouteNotices,
} from "./ModelSwitchDivider";
import { ModelPinToggle } from "./ModelPinToggle";
import { computeModelRouteDecorations } from "@/lib/domain/ai/model-directive";
import { REVERT_SNAPSHOT_KEY } from "@/lib/domain/ai/compact-tool-outputs";
import { TargetFolderChip } from "./TargetFolderChip";
import { OutputTargetChip } from "./OutputTargetChip";
import { ChatInput } from "./ChatInput";
import { FolderContextChips } from "@/components/content/ai/FolderContextChips";
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
import type { JSONContent } from "@tiptap/core";

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

/**
 * Browser side panel only: the last target folder the user picked there.
 * App chats derive their target from the content they're rooted to, but a
 * browser chat has no such root — remembering the pick is what keeps it
 * placeful across pages and sessions (BROWSER-REACH decision #7).
 */
const PANEL_TARGET_KEY = "dg-panel-target-folder";

function readRememberedPanelTarget(): {
  id: string;
  title: string | null;
} | null {
  try {
    const raw = localStorage.getItem(PANEL_TARGET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown; title?: unknown };
    if (typeof parsed?.id !== "string") return null;
    return {
      id: parsed.id,
      title: typeof parsed.title === "string" ? parsed.title : null,
    };
  } catch {
    return null;
  }
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
  // pendingTransientInputRef carries the EXACT submitted first prompt across
  // the null → set transition. A boolean is insufficient: conversationId
  // changes the engine's draft-storage key, whose rehydration can replace the
  // in-memory input with the new conversation's empty draft before the queued
  // send fires. The effect below restores this snapshot first, then sends it
  // through the now-bound engine.
  //
  // promotingInFlightRef guards against double-clicks during the brief
  // POST window so we don't kick off two concurrent createConversation
  // requests.
  const skipNextLoadRef = useRef(false);
  const pendingTransientInputRef = useRef<string | null>(null);
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

  // Hoisted above BOTH hooks: the binding (which loads history) mounts after
  // the engine (which reattaches to in-flight streams), so readiness has to
  // travel through the parent. The engine holds its resume until this is true.
  const [historyReady, setHistoryReady] = useState(false);

  const {
    messages,
    status,
    stop,
    error,
    setMessages,
    addToolApprovalResponse,
    isActive,
    resumedStream,
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
    notifyMentionInserted,
    folderGates,
    commandItems,
    activePlaybook,
    attachPlaybook,
    detachPlaybook,
    outputTarget,
    setOutputTarget,
    promoteOutputTarget,
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
    historyReady,
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
                parts: event.message.parts,
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
  const {
    loadingInitial,
    initialActiveContextId,
    initialTargetFolder,
    initialTargetInherited,
    initialTargetLocation,
  } = useConversationBinding({
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
    onHistoryReady: setHistoryReady,
  });

  // Seed the local context selection from the bound conversation whenever
  // it (re)loads. Transient mode resolves to null. User changes after load
  // are owned by `handleContextChange` below.
  useEffect(() => {
    setActiveContextId(initialActiveContextId);
  }, [initialActiveContextId]);

  // Target folder (AI v3 core S3): seed from the bound conversation; user
  // changes persist via PATCH (owner+is-folder validated server-side).
  // Browser side panel gets target persistence the app doesn't need.
  const chatPathname = usePathname();
  const isPanelEmbed = chatPathname?.startsWith("/embed/panel") ?? false;

  const [targetFolder, setTargetFolder] = useState<{
    id: string;
    title: string | null;
  } | null>(null);
  const [targetInherited, setTargetInherited] = useState(false);

  // Location fallback (v3 ship fix, 2026-07-18): the service can only
  // infer location for content-bound (full-page) conversations — sidebar
  // chats have no archived chat node, and just-created conversations skip
  // the initial load entirely, so new chats showed BLANK targets. "Chats
  // serve their location": derive it from the open content — a folder is
  // its own location, anything else locates to its parent. Keyed on
  // contentId, so moving the chat/content re-derives it naturally.
  const [locationFallback, setLocationFallback] = useState<{
    id: string;
    title: string | null;
  } | null>(null);
  useEffect(() => {
    setLocationFallback(null);
    if (!contentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/content/content/${encodeURIComponent(contentId)}`,
          { credentials: "include" },
        );
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          data?: {
            contentType?: string;
            title?: string | null;
            parentId?: string | null;
          };
        };
        const node = body?.data;
        if (!node || cancelled) return;
        if (node.contentType === "folder") {
          setLocationFallback({ id: contentId, title: node.title ?? null });
          return;
        }
        if (!node.parentId) return;
        const parentRes = await fetch(
          `/api/content/content/${encodeURIComponent(node.parentId)}`,
          { credentials: "include" },
        );
        if (!parentRes.ok || cancelled) return;
        const parentBody = (await parentRes.json()) as {
          data?: { title?: string | null };
        };
        if (cancelled) return;
        setLocationFallback({
          id: node.parentId,
          title: parentBody?.data?.title ?? null,
        });
      } catch {
        // Best-effort — an unresolved location just leaves the chip
        // untargeted; the server route has its own fallback for tools.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const effectiveLocation = initialTargetLocation ?? locationFallback;
  useEffect(() => {
    if (initialTargetFolder) {
      setTargetFolder(initialTargetFolder);
      setTargetInherited(initialTargetInherited);
    } else if (effectiveLocation) {
      // No explicit target: inherit the chat's location instead of
      // rendering blank.
      setTargetFolder(effectiveLocation);
      setTargetInherited(true);
    } else if (isPanelEmbed) {
      // Browser panel: no conversation and nothing to inherit from, so fall
      // back to the last target the user picked here. Browser chats aren't
      // rooted in content the way app chats are — the panel's remembered
      // target is what makes them placeful.
      const remembered = readRememberedPanelTarget();
      setTargetFolder(remembered);
      setTargetInherited(false);
    } else {
      setTargetFolder(null);
      setTargetInherited(false);
    }
  }, [initialTargetFolder, initialTargetInherited, effectiveLocation, isPanelEmbed]);
  const handleTargetChange = useCallback(
    (next: { id: string; title: string | null } | null) => {
      // Browser panel only: remember the pick so the next chat opened in the
      // side panel starts already targeted. The app's own chats keep deriving
      // their target from the content they're rooted to.
      if (isPanelEmbed) {
        try {
          if (next) {
            localStorage.setItem(PANEL_TARGET_KEY, JSON.stringify(next));
          } else {
            localStorage.removeItem(PANEL_TARGET_KEY);
          }
        } catch {
          // Storage unavailable in a partitioned iframe — selection still
          // applies for this session.
        }
      }
      // Explicit pick overrides inheritance; clearing an override falls
      // back to the location-inferred target (chats serve their location).
      if (next) {
        setTargetFolder(next);
        setTargetInherited(false);
      } else {
        // Clearing returns to the chat's location when it has one.
        setTargetFolder(effectiveLocation);
        setTargetInherited(Boolean(effectiveLocation));
      }
      if (!conversationId) return;
      void fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetFolderId: next?.id ?? null }),
      }).catch(() => {});
    },
    [conversationId, effectiveLocation, isPanelEmbed],
  );

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
  // pendingTransientInputRef, fire the callback so the parent updates
  // activeId, and let the useEffect below resend through the bound
  // engine once conversationId flips from null → set.
  const wrappedHandleSend = useCallback(() => {
    if (
      !conversationId &&
      onTransientPromoted &&
      !promotingInFlightRef.current &&
      input.trim().length > 0
    ) {
      // Snapshot at submission time. Do not rely on `input` surviving the
      // transient → conversation draft-key transition.
      pendingTransientInputRef.current = input;
      promotingInFlightRef.current = true;
      void (async () => {
        try {
          const res = await fetch("/api/conversations", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(contentId
                ? {
                    snapshotContentNodeIds: [contentId],
                    // WS6: the content this side chat was started FROM — the
                    // server materializes the chat as a referenced node nested
                    // under it (so it appears in the tree and owns its outputs).
                    originContentNodeId: contentId,
                  }
                : {}),
              // Carry a target chosen before the conversation existed
              // (the chip is now usable in transient chats) so the very
              // first turn already files its outputs in the right place.
              ...(targetFolder && !targetInherited
                ? { targetFolderId: targetFolder.id }
                : {}),
            }),
          });
          if (!res.ok) throw new Error("Couldn't save the chat");
          const body = (await res.json()) as { data?: { id?: string } };
          const newId = body?.data?.id;
          if (!newId) throw new Error("Server didn't return a conversation id");
          // Explicitly carry the transient selection into the new
          // conversation before rebinding. The engine owns both sides of this
          // transfer, so a storage read cannot reset the visible chip while
          // promotion is in flight; storage remains the remount fallback.
          promoteOutputTarget(newId);
          // Seed the destination draft BEFORE rebinding. The conversation
          // engine hydrates per-key drafts on conversationId changes; without
          // this, that valid hydration replaces the submitted transient text
          // with an empty string and the queued first turn disappears.
          try {
            const queuedInput = pendingTransientInputRef.current;
            if (queuedInput !== null) {
              window.localStorage.setItem(
                `dg:chat-draft:conv:${newId}`,
                queuedInput,
              );
            }
            if (contentId) {
              window.localStorage.removeItem(
                `dg:chat-draft:content:${contentId}`,
              );
            }
          } catch {
            // The in-memory snapshot below remains authoritative.
          }
          // The skip flag prevents the binding hook from fetching the
          // (empty) just-created conversation and wiping our in-flight
          // input. pendingTransientInputRef tells the resend effect to restore
          // and send the exact submitted prompt once conversationId catches up.
          skipNextLoadRef.current = true;
          onTransientPromoted(newId);
          // WS6: creating the conversation materialized a referenced chat node
          // under the origin content — refresh the tree so it appears.
          window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
        } catch (err) {
          // Promote failed — fall back to sending transient so the user
          // doesn't lose their message. The chat won't persist this
          // turn, but at least they get a response.
          pendingTransientInputRef.current = null;
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
    // targetFolder/targetInherited are real deps: a stale closure would create
    // the conversation without a target the user picked before sending.
  }, [
    conversationId,
    onTransientPromoted,
    contentId,
    input,
    handleSend,
    targetFolder,
    targetInherited,
    promoteOutputTarget,
  ]);

  // Restore, then send, the queued first prompt once conversationId catches
  // up. This is deliberately a two-render state machine when draft hydration
  // cleared the input: first restore the snapshot, then invoke the newly-bound
  // handleSend closure. The ref is consumed before sending to prevent repeats.
  useEffect(() => {
    const queuedInput = pendingTransientInputRef.current;
    if (!conversationId || queuedInput === null) return;
    if (input !== queuedInput) {
      setInput(queuedInput);
      return;
    }
    pendingTransientInputRef.current = null;
    handleSend();
  }, [conversationId, input, setInput, handleSend]);

  // ─── AI Edit Orchestrator ───
  const isAiEditing = useEditorInstanceStore((s) =>
    s.isAiEditingFor(contentId)
  );

  const orchestratorRef = useRef<AiEditOrchestrator | null>(null);
  const contentIdRef = useRef(contentId);
  useEffect(() => {
    contentIdRef.current = contentId;
  }, [contentId]);

  // Revert snapshots — keyed by toolCallId, holds the document state before each edit.
  // Ref for the map (stable read in the revert callback) + state for the Set of IDs
  // (drives ChatMessage re-renders so the undo button appears as edits complete).
  const revertSnapshotsRef = useRef<Map<string, { snapshot: JSONContent; action: string }>>(new Map());
  const [revertableToolIds, setRevertableToolIds] = useState<ReadonlySet<string>>(new Set());

  const revertEdit = useCallback((toolCallId: string) => {
    const entry = revertSnapshotsRef.current.get(toolCallId);
    if (!entry) return;
    const editor = useEditorInstanceStore.getState().getEditor(contentIdRef.current);
    if (!editor) {
      toast.error("Editor not available — open the document and try again.");
      return;
    }
    editor.commands.setContent(entry.snapshot);
    toast.success("Reverted to before this edit");
  }, []);

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
          if (result.success && result.snapshot && result.toolCallId) {
            revertSnapshotsRef.current.set(result.toolCallId, {
              snapshot: result.snapshot,
              action: result.action,
            });
            setRevertableToolIds(new Set(revertSnapshotsRef.current.keys()));
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
              orchestratorRef.current.enqueue({ ...payload, toolCallId: toolPart.toolCallId });
            }
          }
        }
      }
    }
  }, [messages]);

  // Undo-chip parity for write tools (AI collab write path, D10).
  //
  // Orchestrator edits register their pre-edit snapshot via onEditResult above. A
  // write applied server-side through the collaborative document never reaches the
  // orchestrator, so before this it had no Undo chip — and once those writes became
  // VISIBLE (they used to be masked by the open editor) the missing affordance
  // became conspicuous. The snapshot rides in the tool output under
  // REVERT_SNAPSHOT_KEY and is stripped from the wire and from persistence, so it
  // exists only here, in memory, exactly like the orchestrator's.
  //
  // Functional setState + a ref-tracked seen-set keeps this effect idempotent and
  // lets it bail out (returns prev) when there is nothing new to register.
  const registeredSnapshotIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let added = false;
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (
          !("toolCallId" in part) ||
          !("state" in part) ||
          (part as { state: string }).state !== "output-available" ||
          !("output" in part)
        ) {
          continue;
        }
        const toolPart = part as { toolCallId: string; output: unknown };
        if (typeof toolPart.output !== "string") continue;
        if (registeredSnapshotIdsRef.current.has(toolPart.toolCallId)) continue;
        if (!toolPart.output.includes(REVERT_SNAPSHOT_KEY)) continue;

        try {
          const parsed = JSON.parse(toolPart.output) as Record<string, unknown>;
          const snapshot = parsed[REVERT_SNAPSHOT_KEY];
          if (!snapshot || typeof snapshot !== "object") continue;
          registeredSnapshotIdsRef.current.add(toolPart.toolCallId);
          revertSnapshotsRef.current.set(toolPart.toolCallId, {
            snapshot: snapshot as JSONContent,
            action:
              typeof parsed.editMode === "string"
                ? `${parsed.editMode} note`
                : "update note",
          });
          added = true;
        } catch {
          /* not JSON — nothing to register */
        }
      }
    }
    if (added) {
      setRevertableToolIds(new Set(revertSnapshotsRef.current.keys()));
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
      // WS6: deleting a side chat also retires its materialized tree node +
      // owned outputs (server-side) — refresh so they disappear immediately.
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
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

  // Model-switch dividers (AI 3.4): derived from the server's per-turn route
  // stamp via the SHARED domain walk (one implementation for both surfaces).
  const messageRouteDecorations = useMemo(
    () => computeModelRouteDecorations(messages),
    [messages],
  );

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
        <div className="flex min-w-0 items-center gap-2">
          <HeaderTitle providerId={providerId} modelId={modelId} />
          <TargetFolderChip
            target={targetFolder}
            inherited={targetInherited}
            location={effectiveLocation}
            // Selectable before the conversation exists: the pick is held in
            // local state, carried into the POST that creates the conversation,
            // and (in the browser panel) remembered for the next chat.
            disabled={false}
            onChange={handleTargetChange}
          />
          {/* WS7: where generated content lands by default. */}
          <OutputTargetChip
            value={outputTarget}
            onChange={setOutputTarget}
            hasOrigin={Boolean(contentId)}
          />
        </div>
        <div className="flex items-center gap-1">
          {conversationId && (
            <button
              onClick={() => void handleOpenInPage()}
              title="Open in full view"
              className="rounded p-1.5 text-gray-600 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
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
              const deco = messageRouteDecorations[message.id];
              return (
                <div key={message.id}>
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
                  providerId={stamp.providerId}
                  modelId={stamp.modelId}
                  isStreaming={
                    isActive &&
                    i === messages.length - 1 &&
                    message.role === "assistant"
                  }
                  resumedStream={resumedStream}
                  onEdit={(id, text) => void editMessage(id, text)}
                  onRegenerate={(id) => void regenerateMessage(id)}
                  onBranch={(id) => void handleBranch(id)}
                  actionsDisabled={isActive}
                  outputTarget={outputTarget}
                  conversationId={conversationId}
                  contentId={contentId}
                  onRevertEdit={revertEdit}
                  onToolApprovalResponse={(opts) =>
                    void addToolApprovalResponse(opts)
                  }
                  approvalActionable={
                    i === messages.length - 1 &&
                    message.role === "assistant"
                  }
                  revertableToolIds={revertableToolIds}
                />
                </div>
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
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/15 bg-white/90 text-gray-700 hover:bg-black/[0.06] dark:border-white/15 dark:bg-[#1a1a1a]/90 dark:text-gray-200 dark:hover:bg-white/10 px-2.5 py-1 text-[11px] shadow-lg backdrop-blur transition-colors"
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
      <FolderContextChips gates={folderGates} />
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={wrappedHandleSend}
        onStop={stop}
        status={status}
        disabled={loadingInitial}
        onMentionSearch={handleMentionSearch}
        onMentionInserted={notifyMentionInserted}
        mentionResults={mentionResults}
        commandItems={commandItems}
        onAttachPlaybook={attachPlaybook}
        activePlaybook={activePlaybook}
        onDetachPlaybook={detachPlaybook}
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
            <ModelPinToggle pinned={modelPinned} onToggle={setModelPinned} />
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
  const theme = getProviderTheme(providerId, useResolvedTheme());
  const provider = useMemo(
    () => PROVIDER_CATALOG.find((p) => p.id === providerId),
    [providerId],
  );
  const modelName = useMemo(
    () => provider?.models.find((m) => m.id === modelId)?.name ?? modelId,
    [provider, modelId],
  );
  return (
    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 min-w-0">
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
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-500/30 hover:bg-red-500/25 dark:hover:bg-red-500/30 transition-colors"
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
        <div className="h-8 w-3/4 rounded-xl bg-black/10 dark:bg-white/10" />
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
