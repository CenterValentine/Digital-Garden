/**
 * ChatPanel (Right Sidebar)
 *
 * Transient streaming chat panel. Messages are per-session and reset when
 * the user switches to a different content node.
 * "Save conversation" creates a persistent chat ContentNode.
 *
 * Uses AI SDK v6 `useChat()` for streaming transport.
 * v6 API: sendMessage({ text }) replaces the old input/setInput/handleSubmit pattern.
 */

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Save, Trash2, AlertCircle, Bot } from "lucide-react";
import { toast } from "sonner";
import { useContentStore } from "@/state/content-store";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ModelPicker, useModelSelection } from "./ModelPicker";
import { BASE_TOOL_METADATA, BASE_TOOL_IDS } from "@/lib/domain/ai/tools/metadata";
import type { SuggestionItem } from "./ChatSuggestionMenu";

/** Extract plain text from a UIMessage's parts array */
function getMessageText(message: { parts: Array<{ type: string; text?: string }> }): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && !!p.text)
    .map((p) => p.text)
    .join(" ")
    .trim();
}

export function ChatPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const [input, setInput] = useState("");

  // Model selection — defaults from user settings, overridable per-session
  const { providerId, modelId, handleChange: handleModelChange } = useModelSelection();
  const providerIdRef = useRef(providerId);
  providerIdRef.current = providerId;
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;

  // Keep refs for the memoized transport closure
  const contentIdRef = useRef(selectedContentId);
  contentIdRef.current = selectedContentId;
  const mentionedIdsRef = useRef<string[]>([]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        body: () => ({
          contentId: contentIdRef.current,
          providerId: providerIdRef.current,
          modelId: modelIdRef.current,
          mentionedContentIds: mentionedIdsRef.current,
        }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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

  // Cleanup mention timer
  useEffect(() => {
    return () => {
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
    };
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
    setMessages,
  } = useChat({
    transport,
    id: "sidebar-chat",
    // Batch UI updates every 100ms for smooth, readable streaming
    experimental_throttle: 100,
    onError: (err) => {
      toast.error(err.message || "Chat request failed");
    },
  });

  // Reset chat when switching content nodes
  const prevContentIdRef = useRef(selectedContentId);
  useEffect(() => {
    if (selectedContentId !== prevContentIdRef.current) {
      prevContentIdRef.current = selectedContentId;
      setMessages([]);
      setInput("");
    }
  }, [selectedContentId, setMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

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

  // Save conversation — creates a chat ContentNode
  const handleSaveConversation = useCallback(async () => {
    if (messages.length === 0) {
      toast.error("No messages to save");
      return;
    }

    try {
      // Derive title from first user message
      const firstUserMsg = messages.find((m) => m.role === "user");
      const rawText = firstUserMsg ? getMessageText(firstUserMsg) : "";
      const titleBase = rawText || "Chat conversation";
      const title =
        titleBase.length > 50 ? titleBase.slice(0, 50) + "..." : titleBase;
      const dateSuffix = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const fullTitle = `${title} — ${dateSuffix}`;

      // Convert UIMessages to StoredChatMessage format
      const storedMessages = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: getMessageText(m),
          createdAt: new Date().toISOString(),
        }))
        .filter((m) => m.content); // Skip empty messages (tool-only turns)

      const res = await fetch("/api/content/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fullTitle,
          contentType: "chat",
          chatMessages: storedMessages,
          chatMetadata: {
            providerId,
            modelId,
            savedFrom: "sidebar",
            savedAt: new Date().toISOString(),
            messageCount: storedMessages.length,
          },
          parentId: null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to save conversation");
      }

      const data = await res.json();

      // Refresh the file tree so the new chat node appears
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));

      toast.success("Conversation saved", {
        description: `Created "${title}"`,
        action: {
          label: "Open",
          onClick: () => {
            useContentStore.getState().setSelectedContentId(data.data.id);
          },
        },
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save conversation"
      );
    }
  }, [messages, providerId, modelId]);

  // Clear chat
  const handleClear = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  const hasMessages = messages.length > 0;
  const isActive = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Bot className="h-4 w-4 text-green-400" />
          <span className="font-medium">AI Chat</span>
        </div>
        <div className="flex items-center gap-1">
          {hasMessages && (
            <>
              <button
                onClick={handleSaveConversation}
                title="Save conversation"
                className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleClear}
                title="Clear chat"
                className="rounded p-1.5 text-gray-400 hover:bg-white/10 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error.message}</span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {hasMessages ? (
          <div className="space-y-1 py-2">
            {messages.map((message, i) => (
              <ChatMessage
                key={message.id}
                message={message}
                isStreaming={
                  isActive &&
                  i === messages.length - 1 &&
                  message.role === "assistant"
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        onStop={stop}
        status={status}
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

/** Welcome state when no messages */
function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10 mb-3">
        <Bot className="h-6 w-6 text-gray-500" />
      </div>
      <p className="text-sm font-medium text-gray-400">
        How can I help?
      </p>
      <p className="mt-1 text-xs text-gray-600 max-w-48">
        Ask about your notes, get summaries, or explore ideas.
      </p>
    </div>
  );
}
