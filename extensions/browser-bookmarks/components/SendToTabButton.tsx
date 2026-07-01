"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MonitorPlay } from "lucide-react";
import { toast } from "sonner";

const APP_SOURCE = "dg-browser-bookmarks-app";
const EXTENSION_SOURCE = "dg-browser-bookmarks-extension";
const PRESENCE_NODE_ID = "dg-browser-bookmarks-extension-presence";

interface MruTab {
  tabId: number;
  title: string;
  favIconUrl: string | null;
  url: string;
  lastViewedAt: string;
}

function isExtensionInstalled(): boolean {
  return !!document.getElementById(PRESENCE_NODE_ID);
}

function sendBridgeMessage(type: string, payload?: unknown): void {
  window.postMessage({ source: APP_SOURCE, type, payload }, window.location.origin);
  document.dispatchEvent(
    new CustomEvent("dg-browser-bookmarks-request", {
      detail: { source: APP_SOURCE, type, payload },
    })
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  contentId: string;
  contentKind?: "note" | "external" | "embed";
}

export function SendToTabButton({ contentId, contentKind = "note" }: Props) {
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<MruTab[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Position popover below the button, escaping any overflow containers via portal
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPopoverStyle({
      position: "fixed",
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
      zIndex: 9999,
      width: 288,
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Listen for bridge responses
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.source !== EXTENSION_SOURCE) return;

      if (detail.type === "recent-viewed-tabs") {
        if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        setTabs(detail.payload?.tabs ?? []);
        setLoading(false);
        // Pre-select the most recent tab
        const first = detail.payload?.tabs?.[0];
        if (first) setSelected(new Set([first.tabId]));
        return;
      }

      if (detail.type === "send-note-to-tabs-result") {
        setSending(false);
        setOpen(false);
        const results: Array<{ tabId: number; success: boolean; title: string; error?: string }> =
          detail.payload?.results ?? [];
        const succeeded = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        if (succeeded.length > 0 && failed.length === 0) {
          const names = succeeded.map((r) => r.title || "a page").join(", ");
          toast.success(`Launched in ${succeeded.length === 1 ? names : `${succeeded.length} tabs`}`, {
            description: succeeded.length > 1 ? names : undefined,
          });
        } else if (succeeded.length > 0 && failed.length > 0) {
          toast.warning(`Sent to ${succeeded.length} tab${succeeded.length > 1 ? "s" : ""}`, {
            description: `${failed.length} tab${failed.length > 1 ? "s" : ""} had no active overlay`,
          });
        } else {
          toast.error("Could not launch — no active overlays on those pages");
        }
      }
    };

    document.addEventListener("dg-browser-bookmarks-response", handler as EventListener);
    return () =>
      document.removeEventListener("dg-browser-bookmarks-response", handler as EventListener);
  }, []);

  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = useCallback(() => {
    if (!isExtensionInstalled()) {
      toast.info("Browser extension not detected", {
        description: "Install the Digital Garden extension to launch notes in browser tabs.",
      });
      return;
    }
    const nextOpen = !open;
    if (nextOpen) {
      updatePosition();
      setLoading(true);
      setTabs([]);
      setSelected(new Set());
      sendBridgeMessage("get-recent-viewed-tabs");
      // If the extension service worker doesn't respond within 5s, show an actionable message
      fetchTimeoutRef.current = setTimeout(() => {
        setLoading(false);
        setTabs([]);
      }, 5000);
    } else {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    }
    setOpen(nextOpen);
  }, [open, updatePosition]);

  const toggleTab = useCallback((tabId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  }, []);

  const handleSend = useCallback(() => {
    if (selected.size === 0) return;
    setSending(true);
    sendBridgeMessage("send-note-to-tabs", {
      contentId,
      contentKind,
      tabIds: Array.from(selected),
    });
  }, [contentId, contentKind, selected]);

  const popover = open
    ? createPortal(
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-xs font-semibold text-foreground">Launch in browser tab</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Recent pages with the extension active
            </p>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {loading && (
              <p className="px-3 py-3 text-xs text-muted-foreground">Fetching recent tabs…</p>
            )}
            {!loading && tabs.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No recent pages found — browse a few pages with the extension active, then try again.
              </p>
            )}
            {tabs.map((tab) => (
              <button
                key={tab.tabId}
                type="button"
                onClick={() => toggleTab(tab.tabId)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted"
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    selected.has(tab.tabId)
                      ? "border-primary bg-primary"
                      : "border-border bg-transparent"
                  }`}
                >
                  {selected.has(tab.tabId) && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 fill-primary-foreground">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  )}
                </div>
                {tab.favIconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tab.favIconUrl} alt="" className="h-4 w-4 shrink-0 rounded-sm" />
                ) : (
                  <div className="h-4 w-4 shrink-0 rounded-sm bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {tab.title || "Untitled page"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {relativeTime(tab.lastViewedAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {!loading && tabs.length > 0 && (
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                disabled={selected.size === 0 || sending}
                onClick={handleSend}
                className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending
                  ? "Launching…"
                  : `Launch in ${selected.size === 0 ? "selected" : selected.size === 1 ? "1 tab" : `${selected.size} tabs`}`}
              </button>
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Launch in browser tab"
      >
        <MonitorPlay className="h-4 w-4" />
      </button>
      {popover}
    </>
  );
}
