/**
 * Left Sidebar Header (Server Component)
 *
 * Renders immediately to show structure before JS loads.
 */

import { Folder, Plus, MoreHorizontal } from "lucide-react";

export function LeftSidebarHeader() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
      <div className="flex items-center gap-2">
        <Folder className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold">Files</h2>
      </div>
      <div className="flex items-center gap-1">
        <button
          className="rounded p-1 transition-colors hover:bg-white/10"
          title="New file"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          className="rounded p-1 transition-colors hover:bg-white/10"
          title="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
