"use client";

/**
 * Co-browse indicator + Stop (Agentic Browsing Phase 2b, Slice 5d).
 *
 * The reliable, cross-browser "the agent is driving a tab / halt it" affordance —
 * the chrome.debugger banner is subtle and varies by browser (dark/easy-to-miss in
 * Vivaldi), so this in-app bar is the dependable control. Shown only while a
 * co-browse session is active; renders nothing otherwise (and never in the PWA,
 * which has no side panel and thus no co-browse session).
 */

import { useEffect, useState } from "react";
import { useCoBrowseStore, markCoBrowseInactive } from "@/state/co-browse-store";
import { coBrowseDetach, coBrowseReveal } from "@/lib/domain/browser-extension/co-browse";
import { isAllowedEmbedMessageOrigin } from "@/lib/domain/browser-extension/embed-message-origins";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function CoBrowseIndicator() {
  const active = useCoBrowseStore((s) => s.active);
  const host = useCoBrowseStore((s) => s.host);
  const waitUntil = useCoBrowseStore((s) => s.waitUntil);
  const waitLabel = useCoBrowseStore((s) => s.waitLabel);

  // Tick once a second while a timed-review wait is running, so the panel shows
  // the same countdown as the on-page overlay.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waitUntil) return;
    const tick = () => setNow(Date.now());
    // Deferred first tick (not a synchronous setState-in-effect) so the count is
    // fresh when a new wait starts, then once a second.
    const t0 = setTimeout(tick, 0);
    const iv = setInterval(tick, 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(iv);
    };
  }, [waitUntil]);
  const remaining = waitUntil ? Math.max(0, Math.ceil((waitUntil - now) / 1000)) : 0;

  // Drop the indicator when the session ends OUT OF BAND — the user clicks Cancel
  // on the debugger banner, or the driven tab closes. The extension broadcasts
  // `cobrowse-session-ended`; the panel host relays it here.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isAllowedEmbedMessageOrigin(event.origin)) return;
      const data = event.data;
      if (
        data?.v === 1 &&
        data.source === "dg-panel-host" &&
        data.type === "cobrowse-session-ended"
      ) {
        markCoBrowseInactive();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!active) return null;

  const stop = async () => {
    markCoBrowseInactive(); // optimistic — drop the bar immediately
    try {
      await coBrowseDetach();
    } catch {
      // detach is best-effort; the banner/session is gone regardless
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-100">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {waitUntil
          ? `⏱ ${waitLabel ? `${waitLabel} — ` : ""}${fmt(remaining)} left`
          : `Co-browsing${host ? ` — ${host}` : ""}`}
      </span>
      <button
        type="button"
        onClick={() => void coBrowseReveal()}
        className="shrink-0 rounded px-1.5 py-0.5 font-medium hover:bg-amber-500/20"
      >
        Show me
      </button>
      <button
        type="button"
        onClick={() => void stop()}
        className="shrink-0 rounded bg-amber-600 px-2 py-0.5 font-semibold text-white hover:bg-amber-700"
      >
        Stop
      </button>
    </div>
  );
}
