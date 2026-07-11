"use client";

/**
 * Bell popover — the quick inbox.
 *
 * All/Unread tabs, Today/Earlier grouping, ~15 most recent items with
 * inline actions, mark-all-read, and a "View all" link into /inbox.
 * Positioned absolutely under the bell (house pattern: ProfileMenu).
 */

import { useRouter } from "next/navigation";
import { CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import type { NotificationDTO } from "@/lib/domain/notifications/types";
import { useNotificationsStore } from "@/state/notifications-store";
import { useInboxViewStore } from "@/state/inbox-view-store";
import { NotificationListItem } from "./NotificationListItem";

function groupByRecency(items: NotificationDTO[]): {
  today: NotificationDTO[];
  earlier: NotificationDTO[];
} {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const cutoff = startOfToday.toISOString();
  return {
    today: items.filter((item) => item.createdAt >= cutoff),
    earlier: items.filter((item) => item.createdAt < cutoff),
  };
}

export function NotificationPopover({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const openInbox = useInboxViewStore((state) => state.openInbox);
  const glass1 = getSurfaceStyles("glass-1");
  const items = useNotificationsStore((state) => state.items);
  const filter = useNotificationsStore((state) => state.filter);
  const isLoading = useNotificationsStore((state) => state.isLoading);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const loadList = useNotificationsStore((state) => state.loadList);
  const markAllRead = useNotificationsStore((state) => state.markAllRead);

  const { today, earlier } = groupByRecency(items);

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full z-[110] mt-2 w-96 overflow-hidden rounded-xl border border-white/10"
      style={{
        background: glass1.background,
        backdropFilter: glass1.backdropFilter,
        boxShadow: glass1.boxShadow,
      }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-1">
          {(["all", "unread"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => void loadList(tab)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                filter === tab
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
              {tab === "unread" && unreadCount > 0 ? ` (${unreadCount})` : ""}
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
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Mark all read
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-1.5">
        {isLoading && items.length === 0 ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-lg bg-white/5"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {filter === "unread" ? "You're all caught up" : "No notifications yet"}
            </p>
          </div>
        ) : (
          <>
            {today.length > 0 ? (
              <>
                <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Today
                </p>
                {today.map((notification) => (
                  <NotificationListItem
                    key={notification.id}
                    notification={notification}
                    onNavigate={onClose}
                  />
                ))}
              </>
            ) : null}
            {earlier.length > 0 ? (
              <>
                <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Earlier
                </p>
                {earlier.map((notification) => (
                  <NotificationListItem
                    key={notification.id}
                    notification={notification}
                    onNavigate={onClose}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </div>

      <div className="border-t border-white/10 p-1.5">
        <button
          type="button"
          onClick={() => {
            openInbox("notifications");
            router.push("/content");
            onClose();
          }}
          className="block w-full rounded-md px-3 py-1.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          View all in Inbox
        </button>
      </div>
    </div>
  );
}
