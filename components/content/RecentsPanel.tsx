"use client";

/**
 * Recents Panel — Obsidian-style recently-viewed list for the left sidebar.
 *
 * App side: merges the navigation-history store (the back/forward stacks) across
 * panes, deduped by contentId (newest timestamp wins), sorted most-recent-first.
 * Clicking an item opens it in the active pane — the same path the back-history
 * dropdown uses.
 *
 * Panel embed (BROWSER-REACH B3-B): additionally surfaces the browser
 * page-history the extension recorded ("pages you visited"), behind a filter
 * that DEFAULTS TO SHOWN here and is absent in the standalone app. That history
 * lives only in the browser (never the server), which is exactly why it can only
 * appear in the panel — clicking an entry re-opens the URL in a new tab.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigationHistoryStore } from "@/state/navigation-history-store";
import { useContentStore } from "@/state/content-store";
import {
  isPanelEmbedSurface,
  requestPageHistory,
  requestOpenUrl,
  type PageHistoryEntry,
} from "@/lib/domain/browser-extension/panel-bridge";
import { shouldCapturePage } from "@/lib/domain/browser-extension/capture-policy";
import { isAllowedEmbedMessageOrigin } from "@/lib/domain/browser-extension/embed-message-origins";

const HISTORY_FILTER_KEY = "dg-panel-recents-show-history";

const TYPE_ICONS: Record<string, string> = {
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  note: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  external:
    "M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.102-1.101m9.554-9.554l1.102-1.101a4 4 0 015.656 5.656l-4 4a4 4 0 01-5.656 0",
};

const DEFAULT_ICON =
  "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";

const GLOBE_ICON =
  "M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18";

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

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function RecentsPanel() {
  const byPaneId = useNavigationHistoryStore((state) => state.byPaneId);
  const setSelectedContentId = useContentStore(
    (state) => state.setSelectedContentId
  );
  const inPanel = isPanelEmbedSurface();

  const [browserHistory, setBrowserHistory] = useState<PageHistoryEntry[]>([]);
  const [showBrowserHistory, setShowBrowserHistory] = useState(true);
  const [failedFavicons, setFailedFavicons] = useState<Set<string>>(new Set());

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

  // Panel-only: hydrate the filter preference and pull the browser page-history
  // from the extension (via the host bridge). No-ops entirely in the app.
  useEffect(() => {
    if (!inPanel) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration
      setShowBrowserHistory(localStorage.getItem(HISTORY_FILTER_KEY) !== "false");
    } catch {
      // Storage unavailable — keep the shown-by-default.
    }
    function onMessage(event: MessageEvent) {
      if (!isAllowedEmbedMessageOrigin(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.v !== 1 || data.source !== "dg-panel-host") return;
      if (data.type === "page-history" && Array.isArray(data.payload?.history)) {
        setBrowserHistory(data.payload.history as PageHistoryEntry[]);
      }
    }
    window.addEventListener("message", onMessage);
    requestPageHistory();
    return () => window.removeEventListener("message", onMessage);
  }, [inPanel]);

  // Defense-in-depth: even though the extension already filters at record time,
  // re-apply the full capture policy at display (adds mailbox/auth-suffix guards).
  const visibleHistory = useMemo(() => {
    if (!inPanel || !showBrowserHistory) return [] as PageHistoryEntry[];
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return browserHistory.filter(
      (entry) =>
        shouldCapturePage(entry.url, { appOrigins: origin ? [origin] : [] }).capture
    );
  }, [inPanel, showBrowserHistory, browserHistory]);

  function toggleShowHistory() {
    setShowBrowserHistory((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HISTORY_FILTER_KEY, String(next));
      } catch {
        // Non-fatal.
      }
      return next;
    });
  }

  // ── App side: original rendering, untouched (zero regression) ──────────────
  if (!inPanel) {
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

  // ── Panel embed: content recents + browser history + filter ────────────────
  const isEmpty = recents.length === 0 && visibleHistory.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <span>Recents</span>
        <button
          type="button"
          onClick={toggleShowHistory}
          aria-pressed={showBrowserHistory}
          className="rounded px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-gray-500 transition-colors hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5"
        >
          {showBrowserHistory ? "Hide history" : "Show history"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Recently viewed notes, files, and pages will appear here.
          </div>
        ) : (
          <>
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

            {visibleHistory.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Browser history
                </div>
                {visibleHistory.map((entry) => {
                  const showFavicon =
                    entry.favIconUrl && !failedFavicons.has(entry.url);
                  return (
                    <button
                      key={entry.normalizedUrl}
                      type="button"
                      onClick={() => requestOpenUrl(entry.url)}
                      title={entry.url}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {showFavicon ? (
                        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external favicon, not a project asset
                        <img
                          src={entry.favIconUrl ?? undefined}
                          alt=""
                          className="h-4 w-4 shrink-0 rounded-sm"
                          onError={() =>
                            setFailedFavicons((prev) => {
                              const next = new Set(prev);
                              next.add(entry.url);
                              return next;
                            })
                          }
                        />
                      ) : (
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
                            d={GLOBE_ICON}
                          />
                        </svg>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                        {entry.title?.trim() || hostnameOf(entry.url)}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                        {formatRelativeTime(new Date(entry.lastViewedAt).getTime())}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
