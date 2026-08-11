"use client";

/**
 * DM conversation hosted as a main-panel content tab.
 *
 * Rendered by MainPanelContent for a `dm:<threadId>` selection
 * (contentType "dm-thread"). Reuses DmThreadView verbatim — the same
 * component the inbox view uses — plus a participant header. Works in any
 * pane, so a chat can sit in a split alongside a note.
 */

import { DmThreadHeader } from "./DmThreadHeader";
import { DmThreadView } from "./DmThreadView";
import { useCurrentUserId } from "./use-current-user-id";

export function DmThreadTab({ threadId }: { threadId: string }) {
  const currentUserId = useCurrentUserId();

  return (
    <div className="flex h-full flex-col">
      <DmThreadHeader threadId={threadId} />
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
