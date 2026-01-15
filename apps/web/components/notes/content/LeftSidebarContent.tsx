/**
 * Left Sidebar Content (Client Component)
 *
 * Loads file tree data and renders interactive tree.
 */

"use client";

import { File, Folder, ChevronRight } from "lucide-react";

export function LeftSidebarContent() {
  // TODO M4.4: Replace with react-arborist FileTree
  // For now, showing placeholder with same structure as before

  return (
    <div className="flex h-full flex-col p-4">
      {/* Placeholder tree structure */}
      <div className="flex-1 space-y-1 text-sm">
        <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/5">
          <ChevronRight className="h-3 w-3" />
          <Folder className="h-4 w-4" />
          <span>Notes</span>
        </div>
        <div className="ml-5 flex items-center gap-2 rounded px-2 py-1 hover:bg-white/5">
          <File className="h-4 w-4" />
          <span>Welcome.md</span>
        </div>
        <div className="ml-5 flex items-center gap-2 rounded px-2 py-1 hover:bg-white/5">
          <File className="h-4 w-4" />
          <span>Getting Started.md</span>
        </div>
      </div>

      <div className="mt-auto pt-4 text-xs text-gray-400">
        Virtualized tree coming in M4.4
      </div>
    </div>
  );
}

