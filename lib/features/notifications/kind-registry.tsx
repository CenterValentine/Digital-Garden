"use client";

/**
 * Core notification kind renderers + merge hook.
 *
 * Each kind maps to { icon, Body, Actions?, getHref? }. Extensions
 * contribute their own kinds via ExtensionRuntime.notificationKindRenderers;
 * useNotificationKindRenderers() merges them over this core map. Unknown
 * kinds render through FALLBACK_RENDERER so a client that lags behind the
 * server's kind registry degrades gracefully instead of crashing.
 */

import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  MessageCircle,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { NotificationDTO } from "@/lib/domain/notifications/types";
import { useNotificationsStore } from "@/state/notifications-store";
import { useExtensionNotificationKindRenderers } from "@/lib/extensions/client-registry";
import type { NotificationKindRenderer } from "./kind-renderer-types";

function payloadString(
  notification: NotificationDTO,
  key: string,
): string | null {
  const value = notification.payload[key];
  return typeof value === "string" ? value : null;
}

function ConnectionInviteBody({
  notification,
}: {
  notification: NotificationDTO;
}) {
  const inviter = payloadString(notification, "inviterUsername") ?? "Someone";
  const message = payloadString(notification, "message");
  return (
    <div className="min-w-0">
      <p className="text-sm">
        <span className="font-medium">{inviter}</span> wants to connect with
        you
      </p>
      {message ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          “{message}”
        </p>
      ) : null}
    </div>
  );
}

function ConnectionInviteActions({
  notification,
}: {
  notification: NotificationDTO;
}) {
  const [responding, setResponding] = useState(false);
  const [resolved, setResolved] = useState<"accepted" | "declined" | null>(
    null,
  );
  const setRead = useNotificationsStore((state) => state.setRead);

  const inviteId = payloadString(notification, "inviteId");
  if (!inviteId) return null;

  if (resolved) {
    return (
      <span className="text-xs text-muted-foreground">
        {resolved === "accepted" ? "Connected" : "Declined"}
      </span>
    );
  }

  const respond = async (action: "accept" | "decline") => {
    setResponding(true);
    try {
      const response = await fetch(
        `/api/connections/invites/${inviteId}/respond`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(json?.error ?? "Invite is no longer available");
      }
      setResolved(action === "accept" ? "accepted" : "declined");
      void setRead(notification.id, true);
      if (action === "accept") toast.success("Connection added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={responding}
        onClick={() => void respond("accept")}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        <Check className="h-3 w-3" />
        Accept
      </button>
      <button
        type="button"
        disabled={responding}
        onClick={() => void respond("decline")}
        className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-xs text-muted-foreground hover:bg-white/5 disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        Decline
      </button>
    </div>
  );
}

function ConnectionAcceptedBody({
  notification,
}: {
  notification: NotificationDTO;
}) {
  const accepter = payloadString(notification, "accepterUsername") ?? "Someone";
  return (
    <p className="text-sm">
      <span className="font-medium">{accepter}</span> accepted your connection
      invite
    </p>
  );
}

function DmMessageBody({ notification }: { notification: NotificationDTO }) {
  const sender = payloadString(notification, "senderUsername") ?? "Someone";
  const preview = payloadString(notification, "preview") ?? "";
  return (
    <div className="min-w-0">
      <p className="text-sm">
        New message from <span className="font-medium">{sender}</span>
      </p>
      {preview ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {preview}
        </p>
      ) : null}
    </div>
  );
}

function AiNotifyBody({ notification }: { notification: NotificationDTO }) {
  const title = payloadString(notification, "title") ?? "Notification";
  const body = payloadString(notification, "body");
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium">{title}</p>
      {body ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {body}
        </p>
      ) : null}
    </div>
  );
}

function SystemAnnouncementBody({
  notification,
}: {
  notification: NotificationDTO;
}) {
  const title = payloadString(notification, "title") ?? "Announcement";
  const body = payloadString(notification, "body");
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium">{title}</p>
      {body ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {body}
        </p>
      ) : null}
    </div>
  );
}

function FallbackBody({ notification }: { notification: NotificationDTO }) {
  const title =
    payloadString(notification, "title") ??
    payloadString(notification, "preview") ??
    "Notification";
  return (
    <div className="min-w-0">
      <p className="text-sm">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {notification.kind}
      </p>
    </div>
  );
}

export const FALLBACK_RENDERER: NotificationKindRenderer = {
  icon: Bell,
  Body: FallbackBody,
};

export const CORE_NOTIFICATION_RENDERERS: Record<
  string,
  NotificationKindRenderer
> = {
  "connection.invite": {
    icon: UserPlus,
    Body: ConnectionInviteBody,
    Actions: ConnectionInviteActions,
    getInboxTarget: () => ({ tab: "connections" }),
  },
  "connection.accepted": {
    icon: Users,
    Body: ConnectionAcceptedBody,
    getInboxTarget: () => ({ tab: "connections" }),
  },
  "dm.message": {
    icon: MessageCircle,
    Body: DmMessageBody,
    getInboxTarget: (notification) => {
      const threadId = payloadString(notification, "threadId");
      return threadId ? { tab: "messages", threadId } : { tab: "messages" };
    },
  },
  "ai.notify": {
    icon: Sparkles,
    Body: AiNotifyBody,
    getHref: (notification) => {
      const conversationId = payloadString(notification, "conversationId");
      return conversationId ? `/content?conversation=${conversationId}` : null;
    },
  },
  "system.announcement": {
    icon: Bell,
    Body: SystemAnnouncementBody,
    getHref: (notification) => payloadString(notification, "href"),
  },
};

export function useNotificationKindRenderers(): Record<
  string,
  NotificationKindRenderer
> {
  const extensionRenderers = useExtensionNotificationKindRenderers();
  return useMemo(
    () => ({ ...CORE_NOTIFICATION_RENDERERS, ...extensionRenderers }),
    [extensionRenderers],
  );
}
