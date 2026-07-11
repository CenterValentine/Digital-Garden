"use client";

/**
 * Inbox main-panel workspace.
 *
 * Rendered in the main panel when activeView === "inbox" (top-left pane).
 * Shows the detail/full view for the current inbox state: notification
 * preferences, a selected DM conversation, the full notifications list, or
 * a contextual empty state. The left-panel navigator (InboxLeftPanel)
 * drives the inbox-view store this reads.
 */

import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Settings2, Users } from "lucide-react";

import { useInboxViewStore } from "@/state/inbox-view-store";
import { DmThreadView } from "./DmThreadView";
import { NotificationPreferences } from "./NotificationPreferences";
import { NotificationsPane } from "./NotificationsPane";

function useCurrentUserId(): string | null {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "include" })
      .then((response) => response.json())
      .then((json: { success: boolean; data?: { user?: { id?: string } } }) => {
        if (!cancelled && json.success && json.data?.user?.id) {
          setCurrentUserId(json.data.user.id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return currentUserId;
}

function EmptyState({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="text-muted-foreground/40 [&_svg]:h-10 [&_svg]:w-10">
        {icon}
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export function InboxMainWorkspace() {
  const tab = useInboxViewStore((state) => state.tab);
  const threadId = useInboxViewStore((state) => state.threadId);
  const showPreferences = useInboxViewStore((state) => state.showPreferences);
  const closePreferences = useInboxViewStore((state) => state.closePreferences);
  const openPreferences = useInboxViewStore((state) => state.openPreferences);
  const currentUserId = useCurrentUserId();

  if (showPreferences) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-black/10 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            onClick={closePreferences}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-sm font-semibold">Notification preferences</h1>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-6">
            <NotificationPreferences />
          </div>
        </div>
      </div>
    );
  }

  if (threadId) {
    return (
      <DmThreadView
        key={threadId}
        threadId={threadId}
        currentUserId={currentUserId}
      />
    );
  }

  if (tab === "notifications") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <h1 className="text-sm font-semibold">Notifications</h1>
          <button
            type="button"
            onClick={openPreferences}
            aria-label="Notification preferences"
            title="Notification preferences"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            <Settings2 className="h-4 w-4" />
            Preferences
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-6">
            <NotificationsPane />
          </div>
        </div>
      </div>
    );
  }

  if (tab === "messages") {
    return (
      <EmptyState
        icon={<MessageCircle />}
        text="Select a conversation, or start one from the Connections tab."
      />
    );
  }

  return (
    <EmptyState
      icon={<Users />}
      text="Manage your connections in the panel on the left."
    />
  );
}
