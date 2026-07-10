"use client";

/**
 * One notification row — shared by the bell popover and the inbox page.
 *
 * Renders through the kind registry (icon + Body + optional Actions). AI
 * actors get a sparkles chip so machine-generated notifications are always
 * visually distinct from human activity.
 */

import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Archive, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { NotificationDTO } from "@/lib/domain/notifications/types";
import {
  FALLBACK_RENDERER,
  useNotificationKindRenderers,
} from "@/lib/features/notifications/kind-registry";
import { useNotificationsStore } from "@/state/notifications-store";

export function NotificationListItem({
  notification,
  onNavigate,
}: {
  notification: NotificationDTO;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const renderers = useNotificationKindRenderers();
  const setRead = useNotificationsStore((state) => state.setRead);
  const archive = useNotificationsStore((state) => state.archive);

  const renderer = renderers[notification.kind] ?? FALLBACK_RENDERER;
  const Icon = renderer.icon;
  const Body = renderer.Body;
  const Actions = renderer.Actions;
  const href = renderer.getHref?.(notification) ?? null;
  const isUnread = notification.readAt === null;
  const isAiActor = notification.actor.type === "ai";

  const handleClick = () => {
    if (isUnread) void setRead(notification.id, true);
    if (href) {
      onNavigate?.();
      router.push(href);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
      className={`group relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${
        href ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isAiActor
            ? "bg-violet-500/15 text-violet-400"
            : "bg-white/10 text-muted-foreground"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <Body notification={notification} />
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(notification.createdAt), {
              addSuffix: true,
            })}
          </span>
          {isAiActor ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/10 px-1.5 py-px text-[10px] font-medium text-violet-400">
              <Sparkles className="h-2.5 w-2.5" />
              {notification.actor.label ?? "AI"}
            </span>
          ) : null}
        </div>
        {Actions ? (
          <div
            className="mt-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Actions notification={notification} />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {notification.archivedAt === null ? (
          <button
            type="button"
            aria-label="Archive notification"
            title="Archive"
            onClick={async (event) => {
              event.stopPropagation();
              const ok = await archive(notification.id);
              if (!ok) toast.error("Couldn't archive notification");
            }}
            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={isUnread ? "Mark as read" : "Mark as unread"}
          title={isUnread ? "Mark as read" : "Mark as unread"}
          onClick={async (event) => {
            event.stopPropagation();
            const ok = await setRead(notification.id, isUnread);
            if (!ok) toast.error("Couldn't update notification");
          }}
          className="rounded p-1"
        >
          <span
            className={`block h-2 w-2 rounded-full transition-colors ${
              isUnread
                ? "bg-sky-400"
                : "border border-white/25 bg-transparent opacity-0 group-hover:opacity-100"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
