/**
 * BorrowedTabBadge — expiry warning for a borrowed (temporary) tab.
 *
 * Lazy + non-blocking by construction: it derives the borrow expiry from the
 * already-loaded workspace store (a synchronous selector — no fetch, no effect),
 * so it never slows tab loading. Renders nothing unless this content is a
 * borrowed item with an expiry. Selecting the `expiresAt` string (not the item
 * object) keeps the selector's equality stable, so a tab re-renders only when
 * its own expiry changes.
 *
 * The tooltip shows the ABSOLUTE expiry time — deriving a relative "in 2h"
 * countdown would require `Date.now()` during render (impure; the React Compiler
 * rejects it), and the absolute time answers "when" precisely anyway.
 */

"use client";

import { AlertTriangle } from "lucide-react";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";

export function BorrowedTabBadge({ contentId }: { contentId: string }) {
  const expiresAt = useWorkspaceStore((state) => {
    const workspace = state.workspaces.find(
      (w) => w.id === state.activeWorkspaceId,
    );
    const item = workspace?.items.find(
      (i) => i.contentId === contentId && i.assignmentType === "borrowed",
    );
    return item?.expiresAt ?? null;
  });

  if (!expiresAt) return null;

  const absolute = new Date(expiresAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const title = `Borrowed tab — expires ${absolute}. Releases automatically when the window ends.`;

  return (
    <span
      title={title}
      aria-label={title}
      className="flex shrink-0 items-center text-amber-500"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}
