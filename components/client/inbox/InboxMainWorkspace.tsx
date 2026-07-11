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

import {
  ArrowLeft,
  MessageCircle,
  Settings2,
  SquareArrowOutUpRight,
  Users,
} from "lucide-react";

import { useContentStore } from "@/state/content-store";
import { useDmStore } from "@/state/dm-store";
import { useInboxViewStore } from "@/state/inbox-view-store";
import { DmThreadHeader } from "./DmThreadHeader";
import { DmThreadView } from "./DmThreadView";
import { NotificationPreferences } from "./NotificationPreferences";
import { NotificationsPane } from "./NotificationsPane";
import { useCurrentUserId } from "./use-current-user-id";

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
  const setSelectedContentId = useContentStore(
    (state) => state.setSelectedContentId,
  );
  const currentUserId = useCurrentUserId();

  const openThreadInTab = (id: string) => {
    const thread = useDmStore
      .getState()
      .threads.find((entry) => entry.id === id);
    setSelectedContentId(`dm:${id}`, {
      title: thread ? `@${thread.otherUser.username}` : "Conversation",
      contentType: "dm-thread",
    });
  };

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
      <div className="flex h-full flex-col">
        <DmThreadHeader
          threadId={threadId}
          action={
            <button
              type="button"
              onClick={() => openThreadInTab(threadId)}
              aria-label="Open conversation as a tab"
              title="Open as tab"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            >
              <SquareArrowOutUpRight className="h-4 w-4" />
              Open as tab
            </button>
          }
        />
        <div className="min-h-0 flex-1">
          <DmThreadView
            key={threadId}
            threadId={threadId}
            currentUserId={currentUserId}
          />
        </div>
      </div>
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
