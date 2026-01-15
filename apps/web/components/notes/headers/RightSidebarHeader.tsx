/**
 * Right Sidebar Header (Server Component)
 *
 * Renders immediately to show structure before JS loads.
 */

import { MessageSquare, Link, List, MoreHorizontal } from "lucide-react";

export function RightSidebarHeader() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
      <div className="flex items-center gap-2">
        <button
          className="rounded p-1 transition-colors hover:bg-white/10"
          title="Outline"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          className="rounded p-1 transition-colors hover:bg-white/10"
          title="Backlinks"
        >
          <Link className="h-4 w-4" />
        </button>
        <button
          className="rounded p-1 transition-colors hover:bg-white/10"
          title="AI Chat"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
      </div>
      <button
        className="rounded p-1 transition-colors hover:bg-white/10"
        title="More options"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}

