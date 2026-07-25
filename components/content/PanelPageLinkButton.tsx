"use client";

/**
 * Panel note ↔ page link toggle (BROWSER-REACH B3-B).
 *
 * A small link affordance shown on the note open in the side panel. It reflects
 * whether the page you're currently viewing is linked to that note, and clicking
 * it links/unlinks — the manual, always-available control (auto-associate on
 * settle is a separate, opt-in accelerator). The click always acts on the CURRENT
 * page URL passed in, never a stale one.
 *
 * The association itself is a WebResourceContentLink, created/deleted through the
 * extension (the embed runs on session auth and relays via the panel host, which
 * resolves the URL → webResourceId and calls the existing background handlers).
 * Off-panel this renders nothing.
 */

import { useCallback, useEffect, useState } from "react";
import { Link2, Link2Off, Loader2 } from "lucide-react";
import {
  requestAssociate,
  requestUnassociate,
  isPanelEmbedSurface,
} from "@/lib/domain/browser-extension/panel-bridge";
import { isAllowedEmbedMessageOrigin } from "@/lib/domain/browser-extension/embed-message-origins";

/** Loose page identity: host + pathname, case-insensitive, no trailing slash. */
function samePage(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const norm = (u: URL) =>
      `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
    return norm(ua) === norm(ub);
  } catch {
    return false;
  }
}

export function PanelPageLinkButton({
  pageUrl,
  pageTitle,
  contentId,
}: {
  pageUrl: string | null;
  pageTitle: string;
  contentId: string | null;
}) {
  // null = unknown/loading; true/false = resolved link state for the current page.
  const [linked, setLinked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the current link state: does the open note already associate this
  // page? Reads the note's links (session-authed; does NOT create a WebResource,
  // unlike resource-context) and matches the current page URL against them.
  useEffect(() => {
    if (!pageUrl || !contentId) {
      setLinked(null);
      return;
    }
    let cancelled = false;
    setLinked(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/content/links/${contentId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("links fetch failed");
        const body = await res.json();
        const resources: Array<{ normalizedUrl?: string; canonicalUrl?: string }> =
          body?.data?.associatedWebResources ?? [];
        const isLinked = resources.some(
          (r) =>
            (r.normalizedUrl && samePage(r.normalizedUrl, pageUrl)) ||
            (r.canonicalUrl && samePage(r.canonicalUrl, pageUrl))
        );
        if (!cancelled) setLinked(isLinked);
      } catch {
        // Non-fatal — leave state unknown; the toggle still works (upsert/delete).
        if (!cancelled) setLinked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageUrl, contentId]);

  // Ack from the host after a link/unlink relay resolves.
  useEffect(() => {
    function handle(event: MessageEvent) {
      if (!isAllowedEmbedMessageOrigin(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.v !== 1 || data.source !== "dg-panel-host") return;
      if (data.type === "association-changed" && data.payload?.contentId === contentId) {
        setBusy(false);
        setError(null);
        if (typeof data.payload.linked === "boolean") setLinked(data.payload.linked);
      }
      if (data.type === "association-error" && data.payload?.contentId === contentId) {
        setBusy(false);
        setError(
          typeof data.payload?.message === "string"
            ? data.payload.message
            : "Couldn't update the link"
        );
      }
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [contentId]);

  const toggle = useCallback(() => {
    if (!pageUrl || !contentId || busy) return;
    setBusy(true);
    setError(null);
    if (linked) {
      requestUnassociate({ url: pageUrl, contentId });
    } else {
      requestAssociate({ url: pageUrl, contentId, title: pageTitle });
    }
  }, [pageUrl, contentId, busy, linked, pageTitle]);

  // Only meaningful in the panel embed, with both a page and an open note.
  if (!isPanelEmbedSurface() || !pageUrl || !contentId) return null;

  const label = error
    ? error
    : linked
      ? "Linked to this page — click to unlink"
      : "Link this page to the note";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={label}
      aria-label={label}
      aria-pressed={linked === true}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        fontSize: 11,
        border: 0,
        background: "transparent",
        cursor: busy ? "default" : "pointer",
        color: error
          ? "var(--intent-danger, #e5695f)"
          : linked
            ? "var(--gold-primary, #c8a04f)"
            : "var(--text-secondary, #9a9a9a)",
      }}
    >
      {busy ? (
        <Loader2 size={13} className="animate-spin" />
      ) : linked ? (
        <Link2 size={13} />
      ) : (
        <Link2Off size={13} />
      )}
      <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {linked ? "Linked" : "Link page"}
      </span>
    </button>
  );
}
