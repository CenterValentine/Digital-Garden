/**
 * Notes Loading State
 *
 * Shows panel structure with skeletons while page loads.
 * Reads panel widths from localStorage to maintain layout consistency.
 */

import { getSurfaceStyles } from "@/lib/design-system";
import { FileTreeSkeleton } from "@/components/notes/skeletons/FileTreeSkeleton";
import { OutlineSkeleton } from "@/components/notes/skeletons/OutlineSkeleton";
import { EditorSkeleton } from "@/components/notes/skeletons/EditorSkeleton";

export default function NotesLoading() {
  const glass0 = getSurfaceStyles("glass-0");
  const glass1 = getSurfaceStyles("glass-1");

  // Default widths (will be overridden by client-side hydration)
  const leftWidth = 200;
  const rightWidth = 300;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Main panel area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div
          className="flex h-full flex-col overflow-hidden border-r border-white/10"
          style={{
            width: `${leftWidth}px`,
            minWidth: `${leftWidth}px`,
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <div className="flex items-center gap-2">
              {/* Folder icon */}
              <svg
                className="h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <h2 className="text-sm font-semibold">Files</h2>
            </div>
            <div className="flex items-center gap-1">
              <button className="rounded p-1">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
              <button className="rounded p-1">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Skeleton */}
          <FileTreeSkeleton />
        </div>

        {/* Main Content */}
        <div className="flex h-full flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <div
            className="flex shrink-0 items-center border-b border-white/10"
            style={{
              background: glass1.background,
              backdropFilter: glass1.backdropFilter,
            }}
          >
            <div className="flex items-center gap-1 border-r border-white/10 px-3 py-2 text-sm">
              {/* FileText icon */}
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>Welcome.md</span>
              <button className="ml-2 rounded p-0.5">
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Editor skeleton */}
          <EditorSkeleton />
        </div>

        {/* Right Sidebar */}
        <div
          className="flex h-full flex-col overflow-hidden border-l border-white/10"
          style={{
            width: `${rightWidth}px`,
            minWidth: `${rightWidth}px`,
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <div className="flex items-center gap-2">
              <button className="rounded p-1">
                {/* List icon */}
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <button className="rounded p-1">
                {/* Link icon */}
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              </button>
              <button className="rounded p-1">
                {/* MessageSquare icon */}
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </button>
            </div>
            <button className="rounded p-1">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
                />
              </svg>
            </button>
          </div>

          {/* Skeleton */}
          <OutlineSkeleton />
        </div>
      </div>

      {/* Status bar */}
      <div
        className="h-6 border-t border-white/10 px-4 py-1 text-xs"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex items-center justify-between text-gray-400">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>Markdown</span>
            </div>
            <div className="flex items-center gap-1">
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Loading...</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-3 w-16 animate-pulse rounded bg-white/5" />
            <div className="flex items-center gap-1">
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>Synced</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
