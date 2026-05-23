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
import { DefaultChatTransport, type UIMessage, type FileUIPart } from "ai";
import { toast } from "sonner";
import type { ChatStatus } from "ai";
import {
  BASE_TOOL_METADATA,
  BASE_TOOL_IDS,
} from "@/lib/domain/ai/tools/metadata";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import {
  useModelSelection,
} from "@/components/content/ai/ModelPicker";
import type { SuggestionItem } from "@/components/content/ai/ChatSuggestionMenu";
import { useSettingsStore } from "@/state/settings-store";

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
const chatTransport = new DefaultChatTransport({
  api: "/api/ai/chat",
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
  finishReason?: string;
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
  /** True while the model is processing (submitted or streaming). */
  isActive: boolean;

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

  // ── suggestions ──
  mentionResults: SuggestionItem[];
  handleMentionSearch: (query: string) => void;
  commandItems: SuggestionItem[];

  // ── suggested follow-ups (Session 7) ──
  /** 2-3 chip suggestions generated after the last assistant turn. */
  followUps: string[];
  /** Clear the chips (parent calls on new send or explicit dismiss). */
  clearFollowUps: () => void;

  // ── scroll ──
  scrollRef: React.RefObject<HTMLDivElement | null>;

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
   * text  → inlined into the prompt;
   * document (PDF) → native file part for capable models, else inlined
   * extracted text.
   */
  kind: "image" | "text" | "document";
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


export function useConversationEngine({
  conversationKey,
  contentId,
  conversationId,
  initialMessages,
  onFinish,
  onError,
  truncateRef,
  pendingUserPartsRef,
}: UseConversationEngineParams): UseConversationEngineResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const { providerId, modelId, handleChange: handleModelChange } =
    useModelSelection();

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

  // ── / command items (static) ──
  const commandItems = useMemo<SuggestionItem[]>(() => {
    return BASE_TOOL_IDS.map((id) => ({
      id,
      label: BASE_TOOL_METADATA[id].name,
      description: BASE_TOOL_METADATA[id].description,
      insertText: COMMAND_HINTS[id] ?? BASE_TOOL_METADATA[id].name,
    }));
  }, []);

  // ── suggested follow-ups (Session 7) ──
  const [followUps, setFollowUps] = useState<string[]>([]);
  const clearFollowUps = useCallback(() => setFollowUps([]), []);

  /**
   * Extract the text content of the latest user + assistant messages and
   * call /api/ai/follow-ups. The endpoint soft-fails to an empty list,
   * so we never need a UI error state for this.
   */
  const fetchFollowUps = useCallback(
    async (finalMessages: UIMessage[]) => {
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
        setFollowUps(cleaned);
      } catch {
        /* soft-fail */
      }
    },
    [providerId, modelId],
  );

  // ── useChat ──
  const chat = useChat({
    transport: chatTransport,
    id: conversationKey,
    messages: initialMessages,
    experimental_throttle: 100,
    onError: (err) => {
      if (onError) {
        onError(err);
      } else {
        toast.error(err.message || "Chat request failed");
      }
    },
    onFinish: (event) => {
      const e = event as {
        messages?: UIMessage[];
        finishReason?: string;
      };
      const finalMessages = e.messages ?? [];

      // Forward to the consumer's onFinish (persistence, etc.) first.
      if (onFinish) {
        onFinish({
          messages: finalMessages,
          finishReason: e.finishReason,
        });
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

  const { messages, sendMessage, status, stop, error, setMessages, regenerate } =
    chat;
  const isActive = status === "streaming" || status === "submitted";

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

  const addAttachmentFiles = useCallback((files: File[] | FileList) => {
    const list = Array.from(files);
    for (const file of list) {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const initialKind: ChatAttachment["kind"] = file.type.startsWith("image/")
        ? "image"
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
          const form = new FormData();
          form.append("file", file);
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

  // ── send ──
  // `input` is already canonical `@[Title](id)` (the composer's
  // contenteditable serializer emits that form). Dynamic request data
  // (contentId / provider / model / mentions) flows per-call via the
  // second arg's body — no transport-level refs needed.
  const handleSend = useCallback(() => {
    const text = input.trim();
    const ready = attachments.filter((a) => a.status === "ready" && a.url);
    const hasImageParts = ready.some((a) => a.kind === "image");

    // Nothing to send (no text, no ready attachments).
    if (!text && ready.length === 0) return;
    // Don't send while uploads are still in flight.
    if (attachmentsUploading) return;

    // Drop any follow-up chips from the previous turn — they describe
    // a state that's about to change.
    setFollowUps([]);

    // Vision guard: a text-only model can't read images.
    if (hasImageParts && !supportsImageAttachments) {
      toast.error(
        "The selected model can't read images. Switch to a vision-capable model or remove the image.",
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
    const parts: UIMessage["parts"] = [];
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
    sendMessage(
      { parts },
      {
        body: {
          contentId,
          conversationId,
          providerId,
          modelId,
          mentionedContentIds: ids,
        },
      },
    );
  }, [
    input,
    attachments,
    attachmentsUploading,
    supportsImageAttachments,
    pendingUserPartsRef,
    sendMessage,
    contentId,
    conversationId,
    providerId,
    modelId,
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
    }),
    [contentId, conversationId, providerId, modelId],
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
      void sendMessage({ text }, { body: reRunBody() });
    },
    [messages, setMessages, sendMessage, reRunBody, providerId, modelId, truncateRef],
  );

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      const target = messages.find((m) => m.id === messageId);
      if (!target || target.role !== "assistant") return;

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

  // ── auto-scroll on new messages ──
  useEffect(() => {
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
    scrollRef,
    getMessageStamp,
    getProviderForMessage,
    seedMessageStamps,
  };
}
