"use client";

/**
 * Inbox left-panel navigator.
 *
 * Rendered in the left sidebar when activeView === "inbox". A stacked tab
 * strip (Notifications / Messages / Connections) drives the inbox-view
 * store; the per-tab body is the navigator: Messages shows the thread list
 * (detail opens in the main panel), Connections is self-contained here, and
 * Notifications routes the full list to the main panel (a gear opens
 * preferences).
 */

import { Bell, MessageCircle, Settings2, Users } from "lucide-react";

import { cn } from "@/lib/core/utils";
import { useInboxViewStore, type InboxTab } from "@/state/inbox-view-store";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { DmThreadList } from "./DmThreadList";

const TABS: Array<{ id: InboxTab; label: string; icon: typeof Bell }> = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "connections", label: "Connections", icon: Users },
];

export function InboxLeftPanel() {
  const tab = useInboxViewStore((state) => state.tab);
  const threadId = useInboxViewStore((state) => state.threadId);
  const setTab = useInboxViewStore((state) => state.setTab);
  const openThread = useInboxViewStore((state) => state.openThread);
  const openPreferences = useInboxViewStore((state) => state.openPreferences);

  return (
    <div className="flex h-full flex-col">
      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-black/10 p-2 dark:border-white/10">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors",
                isActive
                  ? "bg-black/[0.06] text-foreground dark:bg-white/10"
                  : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "notifications" ? (
          <div className="space-y-3 p-3">
            <button
              type="button"
              onClick={openPreferences}
              className="flex w-full items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:hover:bg-white/5"
            >
              <Settings2 className="h-4 w-4" />
              Notification preferences
            </button>
            <p className="px-1 text-xs text-muted-foreground">
              Your notifications open in the main panel.
            </p>
          </div>
        ) : tab === "messages" ? (
          <DmThreadList activeThreadId={threadId} onSelect={openThread} />
        ) : (
          <ConnectionsPanel onMessage={openThread} />
        )}
      </div>
    </div>
  );
}
