"use client";

/**
 * Full notification list for the inbox page — same rows as the popover,
 * plus the Archived view and cursor-based "Load more".
 */

import { useEffect } from "react";
import { CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import type { NotificationListFilter } from "@/lib/domain/notifications/types";
import { useNotificationsStore } from "@/state/notifications-store";
import { NotificationListItem } from "@/components/client/notifications/NotificationListItem";

const FILTERS: Array<{ id: NotificationListFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "archived", label: "Archived" },
];

export function NotificationsPane() {
  const items = useNotificationsStore((state) => state.items);
  const filter = useNotificationsStore((state) => state.filter);
  const isLoading = useNotificationsStore((state) => state.isLoading);
  const nextCursor = useNotificationsStore((state) => state.nextCursor);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const loadList = useNotificationsStore((state) => state.loadList);
  const loadMore = useNotificationsStore((state) => state.loadMore);
  const markAllRead = useNotificationsStore((state) => state.markAllRead);

  useEffect(() => {
    void loadList("all");
  }, [loadList]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => void loadList(id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                filter === id
                  ? "bg-white/10 font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {id === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={async () => {
            const ok = await markAllRead();
            if (!ok) toast.error("Couldn't mark all read");
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all read
        </button>
      </div>

      {isLoading && items.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-lg bg-white/5"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">
              {filter === "archived"
                ? "Nothing archived"
                : filter === "unread"
                  ? "You're all caught up"
                  : "No notifications yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connection invites, messages, and AI updates will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-0.5">
          {items.map((notification) => (
            <NotificationListItem
              key={notification.id}
              notification={notification}
            />
          ))}
          {nextCursor ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void loadMore()}
              className="mt-2 w-full rounded-lg border border-white/10 py-2 text-sm text-muted-foreground hover:bg-white/5 disabled:opacity-50"
            >
              {isLoading ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
