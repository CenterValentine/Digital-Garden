/**
 * Chat Viewer Component
 *
 * Full-page persistent chat viewer for chat ContentNodes.
 * Uses AI SDK v6 `useChat()` with auto-persistence to ChatPayload.
 *
 * v6 API: sendMessage({ text }) replaces the old input/setInput/handleSubmit.
 * Messages load from the API on mount and auto-save after each exchange.
 */

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ChatMessage } from "../ai/ChatMessage";
import { ChatInput } from "../ai/ChatInput";
import { ModelPicker, useModelSelection } from "../ai/ModelPicker";
import { BASE_TOOL_METADATA, BASE_TOOL_IDS } from "@/lib/domain/ai/tools/metadata";
import { extractChatOutline } from "@/lib/domain/ai/chat-outline";
import { useOutlineStore } from "@/state/outline-store";
import type { SuggestionItem } from "../ai/ChatSuggestionMenu";
import type { UIMessage } from "ai";
import type { StoredChatMessage } from "@/lib/domain/ai/types";

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

      // Reconstruct image payload tool parts from stored data.
      // These are saved as lightweight __imagePayload objects in `parts`.
      if (m.parts && Array.isArray(m.parts)) {
        for (const stored of m.parts) {
          if (
            stored &&
            typeof stored === "object" &&
            (stored as Record<string, unknown>).__imagePayload
          ) {
            // Reconstruct a synthetic tool part that ChatMessage can detect
            // via its structural typing check ("toolCallId" in part && "toolName" in part)
            const syntheticToolPart = {
              type: "tool-generate_image" as const,
              toolCallId: `restored-${(stored as Record<string, unknown>).contentId}`,
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
      };
    });
}

export function ChatViewer({
  contentId,
  title,
  messages: initialStoredMessages = [],
  metadata,
}: ChatViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [input, setInput] = useState("");

  // Model selection — defaults from user settings, overridable per-session
  const { providerId, modelId, handleChange: handleModelChange } = useModelSelection();

  // Convert stored messages to UIMessage format
  const initialMessages = useMemo(
    () => toUIMessages(initialStoredMessages),
    // Only compute once on mount — don't re-derive when parent re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentId]
  );

  // Use refs for dynamic values in the memoized transport closure
  const providerIdRef = useRef(providerId);
  providerIdRef.current = providerId;
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  const mentionedIdsRef = useRef<string[]>([]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        body: () => ({
          contentId,
          providerId: providerIdRef.current,
          modelId: modelIdRef.current,
          mentionedContentIds: mentionedIdsRef.current,
        }),
      }),
    [contentId]
  );

  // ─── @ Mention search ───
  const [mentionResults, setMentionResults] = useState<SuggestionItem[]>([]);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleMentionSearch = useCallback((query: string) => {
    if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    mentionTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/content/content?search=${encodeURIComponent(query)}&limit=8`,
          { credentials: "include" }
        );
        if (!res.ok) return;
        const data = await res.json();
        const items: SuggestionItem[] = (data.data?.items || []).map(
          (item: { id: string; title: string; contentType: string }) => ({
            id: item.id,
            label: item.title,
            contentType: item.contentType,
            description: item.contentType,
          })
        );
        setMentionResults(items);
      } catch {
        /* silently fail */
      }
    }, 150);
  }, []);

  // ─── / Command items (static) ───
  const commandItems = useMemo<SuggestionItem[]>(() => {
    const promptHints: Record<string, string> = {
      searchNotes: "Search my notes for ",
      getCurrentNote: "Read the current note",
      createNote: "Create a new note titled ",
    };
    return BASE_TOOL_IDS.map((id) => ({
      id,
      label: BASE_TOOL_METADATA[id].name,
      description: BASE_TOOL_METADATA[id].description,
      insertText: promptHints[id] ?? BASE_TOOL_METADATA[id].name,
    }));
  }, []);

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
  } = useChat({
    transport,
    id: contentId,
    messages: initialMessages,
    // Batch UI updates every 100ms for smooth, readable streaming
    experimental_throttle: 100,
    onError: (err) => {
      toast.error(err.message || "Chat request failed");
    },
    onFinish: () => {
      // Auto-persist after each AI response completes
      debouncedPersist();
    },
  });

  // Track mentions inserted via @ suggestion (ChatInput shows clean @Title)
  const trackedMentionsRef = useRef<Array<{ id: string; label: string }>>([]);

  const handleMentionInserted = useCallback((item: SuggestionItem) => {
    trackedMentionsRef.current.push({ id: item.id, label: item.label });
  }, []);

  // Send message — reconstructs @[Title](id) tokens from tracked mentions
  const handleSend = useCallback(() => {
    let text = input.trim();
    if (!text) return;

    // Reconstruct full mention tokens so ChatMessage can render pills
    const ids: string[] = [];
    for (const mention of trackedMentionsRef.current) {
      const clean = `@${mention.label}`;
      if (text.includes(clean)) {
        text = text.replace(clean, `@[${mention.label}](${mention.id})`);
        ids.push(mention.id);
      }
    }
    mentionedIdsRef.current = ids;
    trackedMentionsRef.current = [];

    setInput("");
    sendMessage({ text });
  }, [input, sendMessage]);

  // Persist messages to ChatPayload via PATCH
  const persistMessages = useCallback(async () => {
    if (messages.length === 0) return;

    const storedMessages: StoredChatMessage[] = messages.map((m) => {
      // Extract text content
      const content = m.parts
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("");

      // Preserve tool parts with image payloads so image cards survive refresh.
      // We save a lightweight representation — just enough to reconstruct the card.
      const imagePayloads: unknown[] = [];
      for (const part of m.parts) {
        // AI SDK v6: static tool parts have type "tool-{name}" with no toolName prop;
        // dynamic tool parts have type "dynamic-tool" with toolName prop.
        // Check for toolCallId (present on both) rather than toolName.
        const p = part as Record<string, unknown>;
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
                imagePayloads.push(parsed);
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
        ...(imagePayloads.length > 0 ? { parts: imagePayloads } : {}),
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
        console.error("[ChatViewer] Failed to persist messages:", res.status);
      }
    } catch (err) {
      console.error("[ChatViewer] Persist error:", err);
    }
  }, [messages, contentId, metadata, providerId, modelId]);

  // Debounced persist (2s after last change, matching editor auto-save)
  const debouncedPersist = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      persistMessages();
    }, 2000);
  }, [persistMessages]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    };
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

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
  }, []);

  const isActive = status === "streaming" || status === "submitted";
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-6 py-4">
        <Bot className="h-5 w-5 text-green-400" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-white truncate">
            {title}
          </h1>
          <p className="text-xs text-gray-500">
            {hasMessages
              ? `${messages.length} message${messages.length !== 1 ? "s" : ""}`
              : "New conversation"}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error.message}</span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {hasMessages ? (
          <div className="space-y-1 py-4">
            {messages.map((message, i) => (
              <div key={message.id} data-message-index={i}>
                <ChatMessage
                  message={message}
                  isStreaming={
                    isActive &&
                    i === messages.length - 1 &&
                    message.role === "assistant"
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={title} />
        )}
      </div>

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        onStop={stop}
        status={status}
        placeholder="Continue the conversation..."
        onMentionSearch={handleMentionSearch}
        mentionResults={mentionResults}
        commandItems={commandItems}
        onMentionInserted={handleMentionInserted}
      />

      {/* Model picker — compact, below input */}
      <div className="border-t border-white/5">
        <ModelPicker
          providerId={providerId}
          modelId={modelId}
          onChange={handleModelChange}
          disabled={isActive}
        />
      </div>
    </div>
  );
}

/** Empty state for new chat nodes */
function EmptyState({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 border border-white/10 mb-4">
        <Bot className="h-8 w-8 text-gray-500" />
      </div>
      <h2 className="text-lg font-medium text-gray-300">{title}</h2>
      <p className="mt-2 text-sm text-gray-500 max-w-sm">
        Start a conversation. Messages are automatically saved.
      </p>
    </div>
  );
}
