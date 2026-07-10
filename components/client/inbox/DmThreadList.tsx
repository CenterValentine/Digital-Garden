"use client";

/**
 * DM thread list — master pane of the Messages tab. Rows show the other
 * user, last-message preview, relative time, and per-thread unread badge.
 */

import { useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle } from "lucide-react";
import { useDmStore } from "@/state/dm-store";

export function DmThreadList({
  activeThreadId,
  onSelect,
}: {
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
}) {
  const threads = useDmStore((state) => state.threads);
  const isLoadingThreads = useDmStore((state) => state.isLoadingThreads);
  const loadThreads = useDmStore((state) => state.loadThreads);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  if (isLoadingThreads && threads.length === 0) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-16 animate-pulse rounded-lg bg-white/5" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No conversations yet</p>
        <p className="text-xs text-muted-foreground">
          Message a connection from the Connections tab.
        </p>
      </div>
    );
  }

  return (
    <div className="p-2">
      {threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => onSelect(thread.id)}
          className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
            activeThreadId === thread.id
              ? "bg-white/10"
              : "hover:bg-white/5"
          }`}
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-medium">
            {thread.otherUser.username.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">
                {thread.otherUser.username}
              </span>
              {thread.lastMessageAt ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(thread.lastMessageAt), {
                    addSuffix: false,
                  })}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground">
                {thread.lastMessagePreview ?? "No messages yet"}
              </span>
              {thread.unreadCount > 0 ? (
                <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-semibold text-white">
                  {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
                </span>
              ) : null}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
