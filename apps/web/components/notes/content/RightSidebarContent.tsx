/**
 * Right Sidebar Content (Client Component)
 *
 * Shows outline, backlinks, and AI chat.
 */

"use client";

export function RightSidebarContent() {
  // TODO M6: Implement outline extraction, backlinks, AI chat

  return (
    <div className="flex h-full flex-col p-4">
      {/* Outline */}
      <div className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">
          Outline
        </h3>
        <div className="space-y-1 text-sm">
          <div className="rounded px-2 py-1 hover:bg-white/5">Introduction</div>
          <div className="ml-4 rounded px-2 py-1 hover:bg-white/5">Overview</div>
          <div className="rounded px-2 py-1 hover:bg-white/5">Features</div>
        </div>
      </div>

      {/* Backlinks */}
      <div className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">
          Backlinks
        </h3>
        <div className="text-sm text-gray-400">No backlinks yet</div>
      </div>

      <div className="mt-auto pt-4 text-xs text-gray-400">
        Outline, backlinks, AI chat (M6)
      </div>
    </div>
  );
}

