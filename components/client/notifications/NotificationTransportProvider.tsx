"use client";

/**
 * Starts the shared NotificationTransport and pipes its events into the
 * zustand stores:
 *   badge            → notifications-store (unread count / latest timestamp)
 *   thread-messages  → dm-store (live message append)
 *
 * Mounted once by NotificationBell (which lives in NotesNavBar, present on
 * every authenticated page). The transport itself is a module singleton, so
 * components outside this subtree — e.g. the inbox DM view — can register
 * scopes via useThreadLiveScope without React context plumbing.
 */

import { useEffect, type ReactNode } from "react";
import {
  getSharedNotificationTransport,
  type NotificationTransport,
} from "@/lib/features/notifications/transport";
import { useNotificationsStore } from "@/state/notifications-store";
import { useDmStore } from "@/state/dm-store";

export function useNotificationTransport(): NotificationTransport {
  return getSharedNotificationTransport();
}

/** Register a fast-poll scope for an open DM thread while mounted. */
export function useThreadLiveScope(threadId: string | null): void {
  useEffect(() => {
    if (!threadId) return;
    const release = getSharedNotificationTransport().addScope({
      kind: "thread",
      threadId,
    });
    return release;
  }, [threadId]);
}

export function NotificationTransportProvider({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    const transport = getSharedNotificationTransport();
    const unsubscribe = transport.subscribe((event) => {
      if (event.type === "badge") {
        useNotificationsStore.getState().applyPoll({
          unreadCount: event.unreadCount,
          latestCreatedAt: event.latestCreatedAt,
        });
      } else if (event.type === "thread-messages") {
        useDmStore
          .getState()
          .appendLiveMessages(event.threadId, event.messages);
      }
    });
    const releaseBadge = transport.addScope({ kind: "badge" });
    transport.start();
    return () => {
      releaseBadge();
      unsubscribe();
      transport.stop();
    };
  }, []);

  return <>{children}</>;
}
