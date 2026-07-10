"use client";

/**
 * InboxShell — the unified inbox body.
 *
 * Three tabs (Notifications / Messages / Connections) with URL state
 * (?tab=&thread=) so DM threads are deep-linkable from notification
 * click-throughs. Messages renders a two-pane master/detail layout; the
 * other tabs use a single centered column.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, MessageCircle, Users } from "lucide-react";
import { getSurfaceStyles } from "@/lib/design/system";
import { NotificationsPane } from "./NotificationsPane";
import { DmThreadList } from "./DmThreadList";
import { DmThreadView } from "./DmThreadView";
import { ConnectionsPanel } from "./ConnectionsPanel";

type InboxTab = "notifications" | "messages" | "connections";

const TABS: Array<{ id: InboxTab; label: string; icon: typeof Bell }> = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "connections", label: "Connections", icon: Users },
];

function parseTab(value: string | null): InboxTab {
  return value === "messages" || value === "connections"
    ? value
    : "notifications";
}

export function InboxShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const glass0 = getSurfaceStyles("glass-0");

  const tab = parseTab(searchParams.get("tab"));
  const threadId = searchParams.get("thread");

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then((response) => response.json())
      .then((json: { success: boolean; data?: { user?: { id?: string } } }) => {
        if (json.success && json.data?.user?.id) {
          setCurrentUserId(json.data.user.id);
        }
      })
      .catch(() => undefined);
  }, []);

  const setTab = useCallback(
    (next: InboxTab) => {
      router.replace(next === "notifications" ? "/inbox" : `/inbox?tab=${next}`);
    },
    [router],
  );

  const openThread = useCallback(
    (nextThreadId: string) => {
      router.replace(`/inbox?tab=messages&thread=${nextThreadId}`);
    },
    [router],
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className="flex shrink-0 items-center gap-1 border-b border-white/10 px-4 py-2"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h1 className="mr-4 text-sm font-semibold">Inbox</h1>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              tab === id
                ? "bg-white/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "messages" ? (
        <div className="flex min-h-0 flex-1">
          <div
            className="w-80 shrink-0 overflow-y-auto border-r border-white/10"
            style={{
              background: glass0.background,
              backdropFilter: glass0.backdropFilter,
            }}
          >
            <DmThreadList activeThreadId={threadId} onSelect={openThread} />
          </div>
          <div className="min-w-0 flex-1">
            {threadId ? (
              <DmThreadView
                key={threadId}
                threadId={threadId}
                currentUserId={currentUserId}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Select a conversation, or start one from the Connections tab
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-6">
            {tab === "notifications" ? (
              <NotificationsPane />
            ) : (
              <ConnectionsPanel onMessage={openThread} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
