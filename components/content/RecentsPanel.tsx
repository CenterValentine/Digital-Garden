"use client";

/**
 * Recents Panel — Obsidian-style recently-viewed list for the left sidebar.
 *
 * Reuses the navigation-history store (the back/forward stacks): entries from
 * every pane are merged, deduped by contentId (keeping the newest timestamp),
 * and sorted most-recent-first. Clicking an item opens it in the active pane —
 * the same path the back-history dropdown uses.
 */

import { useMemo } from "react";
import { useNavigationHistoryStore } from "@/state/navigation-history-store";
import { useContentStore } from "@/state/content-store";

const TYPE_ICONS: Record<string, string> = {
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  note: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  external:
    "M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.102-1.101m9.554-9.554l1.102-1.101a4 4 0 015.656 5.656l-4 4a4 4 0 01-5.656 0",
};

const DEFAULT_ICON =
  "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";

function formatRelativeTime(timestamp: number): string {
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const table: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  for (const [unit, seconds] of table) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return rtf.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return "just now";
}

export function RecentsPanel() {
  const byPaneId = useNavigationHistoryStore((state) => state.byPaneId);
  const setSelectedContentId = useContentStore(
    (state) => state.setSelectedContentId
  );

  const recents = useMemo(() => {
    const newestById = new Map<
      string,
      { contentId: string; timestamp: number; title?: string; contentType?: string }
    >();
    for (const paneState of Object.values(byPaneId)) {
      for (const item of paneState.history) {
        if (!item.contentId) continue;
        const existing = newestById.get(item.contentId);
        if (!existing || item.timestamp > existing.timestamp) {
          newestById.set(item.contentId, {
            contentId: item.contentId,
            timestamp: item.timestamp,
            title: item.title,
            contentType: item.contentType,
          });
        }
      }
    }
    return [...newestById.values()].sort((a, b) => b.timestamp - a.timestamp);
  }, [byPaneId]);

  if (recents.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Recently viewed notes and files will appear here.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1">
      {recents.map((item) => (
        <button
          key={item.contentId}
          type="button"
          onClick={() => setSelectedContentId(item.contentId)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          <svg
            className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={TYPE_ICONS[item.contentType ?? ""] ?? DEFAULT_ICON}
            />
          </svg>
          <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
            {item.title ?? "Untitled"}
          </span>
          <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
            {formatRelativeTime(item.timestamp)}
          </span>
        </button>
      ))}
    </div>
  );
}
