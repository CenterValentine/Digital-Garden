/**
 * useConversationBinding — Session 4b (parity extraction).
 *
 * Encapsulates the "this surface is bound to a Conversation entity"
 * behavior so the sidebar `ChatPanel` and the full-page `ChatViewer`
 * share ONE implementation — guaranteeing they read and write the same
 * store. Before this hook the two surfaces persisted to different
 * backends (ConversationMessage vs ChatPayload), so renaming or adding a
 * turn in one left the other stale.
 *
 * Responsibilities:
 *   1. Initial load — fetch `/api/conversations/[id]`, hydrate messages,
 *      seed per-conversation provider memory, capture the title.
 *   2. Persist-on-finish — append unsaved turns to
 *      `/api/conversations/[id]/messages`. AI-SDK ids are tracked locally
 *      for dedup; the DB generates the row UUID (AI-SDK nanoids are NOT
 *      valid uuids, so we must never send them as the id).
 *   3. Auto-title — one idempotent attempt per mount after the first
 *      assistant turn lands.
 *
 * The caller owns the `useChat` engine and passes a `persistRef` (a ref
 * the engine's `onFinish` closes over) plus the engine's message state.
 * This hook populates `persistRef.current` with the persister.
 */

"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { clientLogger } from "@/lib/core/logger/client";
import { useAIChatStore } from "@/state/ai-chat-store";
import { useSettingsStore } from "@/state/settings-store";

/**
 * Optional payload that flows through `persistRef.current(...)` to
 * give persistTurns access to the SDK's onFinish snapshot — specifically
 * the fresh assistant message with its `metadata` already populated.
 * React's useCallback closure for persistTurns can capture a stale
 * `messages` array when the SDK fires onFinish before React commits
 * its metadata update; reading from this payload bypasses that race.
 */
export interface PersistFinishPayload {
  /** Fresh assistant UIMessage from the AI SDK's onFinish event. */
  freshAssistant?: {
    id: string;
    metadata?: Record<string, unknown> | unknown;
  };
}

interface MessageLike {
  id: string;
  role: string;
  parts: unknown;
}

interface UseConversationBindingParams {
  conversationId: string | null;
  /** Engine messages (AI SDK UIMessage[]). */
  messages: MessageLike[];
  /** Engine setMessages — typed loosely to avoid coupling to the SDK shape. */
  setMessages: (messages: unknown) => void;
  /** Resolve the persisted provider/model stamp for a message id. */
  getMessageStamp: (
    id: string,
    fallback: { providerId: string; modelId: string },
  ) => { providerId: string; modelId: string };
  /**
   * Seed per-message stamps from loaded history so the avatar tooltip
   * reflects the model that actually answered (not the active selection).
   */
  seedMessageStamps?: (
    stamps: Record<string, { providerId: string; modelId: string }>,
  ) => void;
  providerId: string;
  modelId: string;
  /** Stable ref the engine's onFinish closes over; we populate `.current`. */
  persistRef: RefObject<(payload?: PersistFinishPayload) => void>;
  /**
   * Stable ref the engine's edit/regenerate handlers call to supersede
   * messages server-side (reconcile model). We populate `.current` with
   * a function that resolves the client id to its DB row and hides from
   * there onward. No-op in transient/unbound mode.
   */
  truncateRef?: RefObject<
    (clientId: string, inclusive: boolean) => Promise<void>
  >;
  /**
   * Exact parts of the just-sent user turn (set by the engine). Used to
   * persist attachment file parts reliably, since AI SDK may drop them
   * from the in-memory message after the turn completes.
   */
  pendingUserPartsRef?: RefObject<unknown[] | null>;
  /** Notified after a successful auto-title so the caller can refresh UI. */
  onTitleChanged?: (conversationId: string) => void;
}

interface UseConversationBindingResult {
  /** True while the initial conversation load is in flight. */
  loadingInitial: boolean;
  /** The loaded conversation title (null until loaded / for transient). */
  conversationTitle: string | null;
}

export function useConversationBinding({
  conversationId,
  messages,
  setMessages,
  getMessageStamp,
  seedMessageStamps,
  providerId,
  modelId,
  persistRef,
  truncateRef,
  pendingUserPartsRef,
  onTitleChanged,
}: UseConversationBindingParams): UseConversationBindingResult {
  // Ids already persisted to the DB — populated on load + each append.
  const savedIdsRef = useRef<Set<string>>(new Set());
  // client (AI-SDK) message id → DB row id. Loaded messages map to
  // themselves (their client id IS the DB uuid); session-created messages
  // get their mapping from the persist response. Used to resolve the
  // truncate anchor for edit/regenerate.
  const dbIdByClientIdRef = useRef<Map<string, string>>(new Map());
  const [loadingInitial, setLoadingInitial] = useState<boolean>(
    Boolean(conversationId),
  );
  const [conversationTitle, setConversationTitle] = useState<string | null>(
    null,
  );
  const triedAutoTitleRef = useRef<string | null>(null);
  const setActiveModelSelection = useAIChatStore(
    (s) => s.setActiveModelSelection,
  );

  // ─── Initial load ───
  useEffect(() => {
    if (!conversationId) {
      savedIdsRef.current = new Set();
      dbIdByClientIdRef.current = new Map();
      setLoadingInitial(false);
      setConversationTitle(null);
      return;
    }
    savedIdsRef.current = new Set();
    dbIdByClientIdRef.current = new Map();
    setLoadingInitial(true);
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/conversations/${encodeURIComponent(conversationId)}`;
        let res: Response;
        try {
          res = await fetch(url, { credentials: "include" });
        } catch (err) {
          clientLogger.error({
            layer: "ui",
            event: "chat_load:network",
            summary: `network error loading conversation ${conversationId}`,
            attrs: { conversation_id: conversationId },
            error: err,
          });
          return;
        }
        if (!res.ok) {
          clientLogger.warn({
            layer: "ui",
            event: "chat_load:non_ok",
            summary: `${res.status} loading conversation ${conversationId}`,
            attrs: { conversation_id: conversationId, status: res.status },
          });
          return;
        }
        let body: unknown;
        try {
          body = await res.json();
        } catch (err) {
          clientLogger.error({
            layer: "ui",
            event: "chat_load:json_parse",
            summary: "could not parse conversation response",
            attrs: { conversation_id: conversationId },
            error: err,
          });
          return;
        }
        if (cancelled) return;
        const data = (body as {
          data?: { messages?: unknown[]; title?: string | null };
        })?.data;
        const stored = data?.messages ?? [];
        setConversationTitle(data?.title ?? null);

        clientLogger.info({
          layer: "ui",
          event: "chat_load:ok",
          summary: `loaded ${stored.length} messages for ${conversationId}`,
          attrs: {
            conversation_id: conversationId,
            message_count: stored.length,
          },
        });

        // Every loaded message is already saved — track by DB UUID.
        for (const m of stored as Array<{ id: string }>) {
          savedIdsRef.current.add(m.id);
        }

        // Seed per-message stamps from the persisted provider/model so the
        // avatar tooltip shows who actually answered, not the active pick.
        const stampSeed: Record<
          string,
          { providerId: string; modelId: string }
        > = {};
        for (const m of stored as Array<{
          id: string;
          providerId?: string | null;
          modelId?: string | null;
        }>) {
          if (m.providerId && m.modelId) {
            stampSeed[m.id] = { providerId: m.providerId, modelId: m.modelId };
          }
        }
        if (Object.keys(stampSeed).length > 0) {
          seedMessageStamps?.(stampSeed);
        }

        // Per-conversation provider memory:
        //   - Existing messages → restore the most recent stamp.
        //   - No messages yet → reset to the user's settings default.
        const stamped = (stored as Array<{
          providerId?: string | null;
          modelId?: string | null;
        }>).filter((m) => m.providerId && m.modelId);
        const lastStamp = stamped[stamped.length - 1];
        if (lastStamp?.providerId && lastStamp?.modelId) {
          setActiveModelSelection(lastStamp.providerId, lastStamp.modelId);
        } else {
          const ai = useSettingsStore.getState().ai;
          if (ai?.providerId && ai?.modelId) {
            setActiveModelSelection(ai.providerId, ai.modelId);
          }
        }

        if (stored.length === 0) return;
        const ui = (stored as Array<{
          id: string;
          role: string;
          parts: unknown;
        }>)
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: Array.isArray(m.parts)
              ? (m.parts as Array<{ type: string; text?: string }>)
              : [{ type: "text" as const, text: "" }],
          }));
        setMessages(ui);
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, setMessages, setActiveModelSelection, seedMessageStamps]);

  // ─── Persist-on-finish ───
  const persistTurns = useCallback(async (payload?: PersistFinishPayload) => {
    if (!conversationId || messages.length === 0) return;
    for (const m of messages) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      if (savedIdsRef.current.has(m.id)) continue;
      const stamp = getMessageStamp(m.id, { providerId, modelId });
      // Prefer the exact parts the engine sent for a fresh user turn —
      // they reliably include attachment file parts, which AI SDK's
      // in-memory message can drop after the turn. Consumed once.
      let partsToSave: unknown = m.parts;
      if (m.role === "user" && pendingUserPartsRef?.current) {
        partsToSave = pendingUserPartsRef.current;
        pendingUserPartsRef.current = null;
      }
      // Forward UIMessage.metadata when present. The chat route's
      // `messageMetadata` callback in toUIMessageStreamResponse populates
      // `metadata.usage` (input/output/total tokens) + `finishReason` on
      // the assistant message — the meter adapter reads those back for
      // per-Connection $ figures.
      //
      // Read order:
      //   1. The fresh assistant from the SDK's onFinish event (when
      //      this is the assistant turn AND payload.freshAssistant
      //      matches by id). The SDK applies metadata to its internal
      //      state object just before firing onFinish, but the React
      //      `messages` array we close over may not have flushed the
      //      change yet. The event payload is fresher.
      //   2. The closure UIMessage's own metadata field as a fallback.
      let metadata =
        (m as { metadata?: Record<string, unknown> | undefined }).metadata;
      if (
        m.role === "assistant" &&
        payload?.freshAssistant &&
        payload.freshAssistant.id === m.id &&
        payload.freshAssistant.metadata != null
      ) {
        metadata = payload.freshAssistant.metadata as Record<string, unknown>;
      }
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // id deliberately omitted — DB generates a UUID
              role: m.role,
              providerId: stamp.providerId,
              modelId: stamp.modelId,
              parts: partsToSave,
              metadata: metadata ?? undefined,
            }),
          },
        );
        if (res.ok) {
          savedIdsRef.current.add(m.id);
          // Capture the DB-generated row id so a later edit/regenerate
          // can resolve this session-created message to its DB anchor.
          try {
            const saved = await res.json();
            const dbId: string | undefined = saved?.data?.id;
            if (dbId) dbIdByClientIdRef.current.set(m.id, dbId);
          } catch {
            /* response body optional — dedup still works via savedIds */
          }
        }
      } catch {
        // Keep id out of saved set so it retries on next persist.
      }
    }

    // Auto-title after the first complete turn. Idempotent server-side.
    if (
      conversationId &&
      triedAutoTitleRef.current !== conversationId &&
      messages.some((m) => m.role === "assistant")
    ) {
      triedAutoTitleRef.current = conversationId;
      void (async () => {
        try {
          const r = await fetch(
            `/api/conversations/${encodeURIComponent(conversationId)}/auto-title`,
            { method: "POST", credentials: "include" },
          );
          if (r.ok) {
            const titleBody = await r.json();
            if (titleBody?.data?.title && titleBody?.data?.skipped === false) {
              setConversationTitle(titleBody.data.title);
              onTitleChanged?.(conversationId);
            }
          }
        } catch {
          /* silent — retried on next mount */
        }
      })();
    }
  }, [conversationId, messages, getMessageStamp, providerId, modelId, onTitleChanged, pendingUserPartsRef]);

  // Only claim the engine's persist ref when actually bound to a
  // conversation. In transient/unbound mode the caller (e.g. ChatViewer
  // in legacy ChatPayload mode) owns the ref, so we must not overwrite
  // it with our no-op persister.
  useEffect(() => {
    if (!conversationId) return;
    persistRef.current = persistTurns;
  }, [persistTurns, persistRef, conversationId]);

  // Truncate (edit/regenerate supersession): resolve the client id to its
  // DB anchor and hide from there onward. Claimed only when bound; the
  // engine's edit/regenerate handlers are otherwise client-only.
  useEffect(() => {
    if (!conversationId || !truncateRef) return;
    truncateRef.current = async (clientId: string, inclusive: boolean) => {
      const dbId = dbIdByClientIdRef.current.get(clientId) ?? clientId;
      try {
        await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/messages/truncate`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fromMessageId: dbId, inclusive }),
          },
        );
      } catch {
        /* best-effort — the new turn still persists; reload reconciles */
      }
    };
  }, [conversationId, truncateRef]);

  // Live title sync: subscribe to /api/conversations/events for
  // `conversation.updated` matching THIS conversationId. Without this,
  // renaming the underlying ContentNode (which now mirrors title to the
  // Conversation server-side) wouldn't reach an already-open ChatViewer —
  // it only refetches `/api/conversations/[id]` on mount. The cache store
  // also subscribes to the same endpoint; the duplicate EventSource is
  // acceptable here because (a) the work this effect does is tiny, (b) we
  // need a focused subscription tied to ChatViewer's lifecycle, and (c)
  // HTTP/2 multiplexes the two streams over one connection in dev/prod.
  //
  // NB: the server uses NAMED SSE events (`event: conversation\ndata: …`)
  // not generic messages, so we must `addEventListener(EVENT_NAME)` —
  // `es.onmessage` would silently drop every event (and produced the
  // initial "title doesn't update in the header" report).
  useEffect(() => {
    if (!conversationId) return;
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/conversations/events", {
      withCredentials: true,
    });
    const handler = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as
          | { type: string; conversationId?: string; title?: string | null }
          | null;
        if (!event) return;
        if (
          event.type === "conversation.updated" &&
          event.conversationId === conversationId
        ) {
          setConversationTitle(event.title ?? null);
        }
      } catch {
        /* malformed event — ignore */
      }
    };
    es.addEventListener("conversation", handler as EventListener);
    return () => {
      es.removeEventListener("conversation", handler as EventListener);
      es.close();
    };
  }, [conversationId]);

  return { loadingInitial, conversationTitle };
}
