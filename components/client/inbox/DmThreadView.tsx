"use client";

/**
 * DM thread view — message history + composer.
 *
 * While mounted it registers a fast-poll scope (~2.5s) via the shared
 * transport, so replies from the other side appear near-instantly and the
 * server-side heartbeat suppresses bell notifications for this thread.
 * Opening and closing both mark the thread read.
 */

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDmStore } from "@/state/dm-store";
import { useThreadLiveScope } from "@/components/client/notifications/NotificationTransportProvider";

export function DmThreadView({
  threadId,
  currentUserId,
}: {
  threadId: string;
  currentUserId: string | null;
}) {
  const messages = useDmStore(
    (state) => state.messagesByThread[threadId] ?? [],
  );
  const nextCursor = useDmStore(
    (state) => state.nextCursorByThread[threadId] ?? null,
  );
  const isLoadingMessages = useDmStore((state) => state.isLoadingMessages);
  const openThread = useDmStore((state) => state.openThread);
  const closeThread = useDmStore((state) => state.closeThread);
  const loadOlderMessages = useDmStore((state) => state.loadOlderMessages);
  const sendMessage = useDmStore((state) => state.sendMessage);
  const deleteMessage = useDmStore((state) => state.deleteMessage);

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useThreadLiveScope(threadId);

  useEffect(() => {
    void openThread(threadId);
    return () => closeThread();
  }, [threadId, openThread, closeThread]);

  const messageCount = messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || isSending) return;
    setIsSending(true);
    setDraft("");
    const result = await sendMessage(threadId, body, currentUserId ?? undefined);
    setIsSending(false);
    if (!result.ok) {
      setDraft(body);
      toast.error(result.error ?? "Failed to send message");
    }
  };

  const isOwn = (senderId: string | null, id: string) =>
    id.startsWith("temp-") ||
    (currentUserId !== null && senderId === currentUserId);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {nextCursor ? (
          <button
            type="button"
            onClick={() => void loadOlderMessages(threadId)}
            className="mx-auto mb-4 block rounded-md border border-black/10 dark:border-white/10 px-3 py-1 text-xs text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
          >
            Load earlier messages
          </button>
        ) : null}

        {isLoadingMessages && messages.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className={`h-10 w-1/2 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5 ${
                  index % 2 ? "ml-auto" : ""
                }`}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => {
              const own = isOwn(message.senderId, message.id);
              const pending = message.id.startsWith("temp-");
              return (
                <div
                  key={message.id}
                  className={`group flex items-end gap-2 ${own ? "justify-end" : "justify-start"}`}
                >
                  {own && !message.deletedAt && !pending ? (
                    <button
                      type="button"
                      aria-label="Delete message"
                      title="Delete message"
                      onClick={async () => {
                        const ok = await deleteMessage(threadId, message.id);
                        if (!ok) toast.error("Couldn't delete message");
                      }}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <div
                    className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                      message.deletedAt
                        ? "border border-dashed border-black/10 dark:border-white/10 italic text-muted-foreground"
                        : own
                          ? `bg-sky-600/80 text-white ${pending ? "opacity-60" : ""}`
                          : "bg-black/10 dark:bg-white/10"
                    }`}
                  >
                    {message.deletedAt ? (
                      "Message deleted"
                    ) : (
                      <>
                        <span className="whitespace-pre-wrap break-words">
                          {message.body}
                        </span>
                        <span
                          className={`mt-0.5 block text-right text-[10px] ${
                            own ? "text-white/60" : "text-muted-foreground"
                          }`}
                        >
                          {format(new Date(message.createdAt), "HH:mm")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-black/10 dark:border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Write a message…"
            rows={Math.min(4, Math.max(1, draft.split("\n").length))}
            className="min-h-9 flex-1 resize-none rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-black/25 dark:border-white/25"
          />
          <button
            type="button"
            disabled={!draft.trim() || isSending}
            onClick={() => void handleSend()}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 px-1 text-[10px] text-muted-foreground">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}
