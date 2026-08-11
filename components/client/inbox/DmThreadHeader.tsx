"use client";

import type { ReactNode } from "react";

import { useDmStore } from "@/state/dm-store";

/**
 * Compact header for a DM conversation: participant avatar + name, with an
 * optional right-aligned action slot (e.g. "Open as tab"). Shared by the
 * inbox main view and the DM content tab, since DmThreadView itself is
 * headerless and participant-agnostic.
 */
export function DmThreadHeader({
  threadId,
  action,
}: {
  threadId: string;
  action?: ReactNode;
}) {
  const username = useDmStore(
    (state) =>
      state.threads.find((thread) => thread.id === threadId)?.otherUser
        .username ?? null,
  );

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/10 px-4 py-2.5 dark:border-white/10">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs font-medium text-muted-foreground dark:bg-white/10">
          {(username ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-sm font-semibold">
          {username ? `@${username}` : "Conversation"}
        </span>
      </div>
      {action}
    </div>
  );
}
