/**
 * Notes Loading State
 *
 * Shows panel structure with skeletons while the route segment renders.
 *
 * Right-panel intentionally omitted: its default persisted state is
 * `isCollapsed: true` (see state/right-panel-collapse-store.ts), so
 * painting a fake 300px right sidebar here would visibly collapse
 * on hydration. The main panel claims that space; if the user has the
 * right panel expanded, it slides in once on hydration — a single
 * one-directional appearance, not a double layout swap.
 */

import { getSurfaceStyles } from "@/lib/design/system";
import { FileTreeSkeleton } from "@/components/content/skeletons/FileTreeSkeleton";
import { EditorSkeleton } from "@/components/content/skeletons/EditorSkeleton";

export default function NotesLoading() {
  const glass0 = getSurfaceStyles("glass-0");
  const glass1 = getSurfaceStyles("glass-1");

  // Default left width — matches left-panel-collapse-store's "full" default.
  const leftWidth = 200;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Main panel area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div
          className="flex h-full flex-col overflow-hidden border-r border-border"
          style={{
            width: `${leftWidth}px`,
            minWidth: `${leftWidth}px`,
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2">
              {/* Folder icon */}
              <svg
                className="h-4 w-4 text-muted-foreground"
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
          {/* Tab bar — neutral skeleton (no fake filename to avoid title flicker on hydrate) */}
          <div
            className="flex h-9 shrink-0 items-center border-b border-border"
            style={{
              background: glass1.background,
              backdropFilter: glass1.backdropFilter,
            }}
          >
            <div className="flex items-center gap-2 border-r border-border px-3 py-2">
              <div className="h-4 w-4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
          </div>

          {/* Editor skeleton */}
          <EditorSkeleton />
        </div>

        {/* Right sidebar intentionally omitted — see file-level comment. */}
      </div>

      {/* Status bar */}
      <div
        className="h-6 border-t border-border px-4 py-1 text-xs"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex items-center justify-between text-muted-foreground">
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
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
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
