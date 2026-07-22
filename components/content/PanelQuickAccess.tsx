"use client";

/**
 * Quick access — Associated Content, ported into the side-panel embed.
 *
 * This is the React port of the browser-extension overlay's associated-content
 * panel (overlay/index.js `renderAssociationsPopover` / `renderDomainBody`).
 * The overlay is being disbanded, but the concept it embodied — connecting the
 * external page you're on to your notes system — is preserved here.
 *
 * Read + navigate scope: it shows the associations for the current page URL,
 * "More from {hostname}", and a "Flashcard from page" entry, and opening any
 * item routes it into the panel workspace. The write flows (authoring a
 * flashcard, adding/removing associations) are intentionally deferred.
 *
 * Auth boundary: the embed runs on the app's session cookie and can't call the
 * bearer-authed resource-context route directly, so data is relayed through the
 * extension (embed → panel host → background) exactly like B2 page-capture.
 * Requests go out via the panel-bridge helpers; results arrive as versioned,
 * exact-origin-validated postMessages handled by the listener below.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  requestResourceContext,
  requestDomainAssociations,
} from "@/lib/domain/browser-extension/panel-bridge";
import { isAllowedEmbedMessageOrigin } from "@/lib/domain/browser-extension/embed-message-origins";
import { useContentStore, TOP_LEFT_PANE_ID } from "@/state/content-store";

// ── Shapes returned by /api/integrations/browser-extension/resource-context ──

interface ResourceRef {
  id: string;
  sourceHostname: string | null;
  sourceDomain: string | null;
}

interface AssociationEntry {
  id: string;
  content: {
    id: string;
    title: string;
    slug: string;
    contentType: string;
  };
}

interface ExternalContentEntry {
  id: string;
  title: string;
  contentType: string;
}

interface ResourceContext {
  resource: ResourceRef;
  associations: AssociationEntry[];
  externalContents: ExternalContentEntry[];
}

interface DomainItem {
  contentId: string;
  contentTitle: string;
  contentType: string;
  normalizedUrl?: string | null;
}

interface DomainResult {
  items: DomainItem[];
}

// ── Styling — mirrors the panel's inline design language (CSS vars, 11px) ─────

const SECTION_LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 10px",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-secondary, #9a9a9a)",
};

const STATUS_STYLE: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--text-secondary, #9a9a9a)",
};

const LIST_ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 10px",
  border: 0,
  background: "transparent",
  color: "var(--text-primary, #e5e5e5)",
  cursor: "pointer",
  textAlign: "left",
};

const CHIP_STYLE: React.CSSProperties = {
  fontSize: 9,
  padding: "1px 6px",
  borderRadius: 4,
  background: "var(--surface-secondary, rgba(255,255,255,0.06))",
  color: "var(--text-secondary, #9a9a9a)",
  flexShrink: 0,
  textTransform: "lowercase",
};

const SUB_TOGGLE_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  padding: "5px 10px",
  fontSize: 11,
  border: 0,
  borderTop: "1px solid var(--border-primary, #2a2a2a)",
  background: "transparent",
  color: "var(--text-secondary, #9a9a9a)",
  cursor: "pointer",
};

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        border: 0,
        borderRadius: 4,
        background: "transparent",
        color: "var(--text-secondary, #9a9a9a)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function PanelQuickAccess({
  pageUrl,
  pageTitle,
  faviconUrl,
  active,
}: {
  pageUrl: string | null;
  pageTitle: string;
  faviconUrl?: string;
  /** True when the Quick access accordion is expanded — gates fetching so we
   *  don't create a WebResource row for every page while collapsed. */
  active: boolean;
}) {
  const [context, setContext] = useState<ResourceContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domainExpanded, setDomainExpanded] = useState(false);
  const [domainData, setDomainData] = useState<DomainResult | "loading" | null>(
    null
  );
  const [domainError, setDomainError] = useState<string | null>(null);

  const [flashcardExpanded, setFlashcardExpanded] = useState(false);

  // The URL a request was issued for, so late-arriving responses for a stale
  // page (the user navigated on) are ignored.
  const requestedUrlRef = useRef<string | null>(null);

  const load = useCallback(() => {
    if (!pageUrl) return;
    setLoading(true);
    setError(null);
    setContext(null);
    setDomainExpanded(false);
    setDomainData(null);
    setDomainError(null);
    requestedUrlRef.current = pageUrl;
    requestResourceContext({ url: pageUrl, title: pageTitle, faviconUrl });
  }, [pageUrl, pageTitle, faviconUrl]);

  // Fetch when the section is open and we have a URL — and refetch on URL
  // change while open. Collapsed → no network, no resource-row creation.
  useEffect(() => {
    if (!active || !pageUrl) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch trigger: resets loading/context state, gated by active+url deps
    load();
  }, [active, pageUrl, load]);

  // Response listener — versioned envelope + exact-origin validation, matching
  // the shell's own listener. Other message types fall through untouched.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isAllowedEmbedMessageOrigin(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.v !== 1 || data.source !== "dg-panel-host") return;

      if (data.type === "resource-context") {
        // Drop responses for a page we've since navigated away from.
        if (data.payload?.url && data.payload.url !== requestedUrlRef.current) {
          return;
        }
        setContext((data.payload?.context as ResourceContext) ?? null);
        setLoading(false);
        setError(null);
      }

      if (data.type === "resource-context-error") {
        if (data.payload?.url && data.payload.url !== requestedUrlRef.current) {
          return;
        }
        setLoading(false);
        setError(
          typeof data.payload?.message === "string"
            ? data.payload.message
            : "Couldn't load associated content"
        );
      }

      if (data.type === "domain-associations") {
        setDomainData((data.payload?.result as DomainResult) ?? { items: [] });
        setDomainError(null);
      }

      if (data.type === "domain-associations-error") {
        setDomainData({ items: [] });
        setDomainError(
          typeof data.payload?.message === "string"
            ? data.payload.message
            : "Couldn't load domain content"
        );
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const openContent = useCallback((contentId: string, contentType: string) => {
    useContentStore
      .getState()
      .openContentInPane(contentId, TOP_LEFT_PANE_ID, { contentType });
  }, []);

  const toggleDomain = useCallback(() => {
    setDomainExpanded((prev) => {
      const next = !prev;
      // Lazy-load on first expand.
      if (next && domainData === null && pageUrl) {
        setDomainData("loading");
        requestDomainAssociations({
          url: pageUrl,
          excludeResourceId: context?.resource?.id,
        });
      }
      return next;
    });
  }, [domainData, pageUrl, context]);

  const hostname = context?.resource?.sourceHostname ?? null;
  const associations = context?.associations ?? [];
  const externalContents = context?.externalContents ?? [];
  const hasAssociations = associations.length > 0 || externalContents.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* ASSOCIATED CONTENT header + refresh */}
      <div style={SECTION_LABEL_STYLE}>
        <span>Associated content</span>
        <IconButton title="Refresh for current URL" onClick={load}>
          {/* refresh glyph */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 4v6h-6" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </IconButton>
      </div>

      {!pageUrl && (
        <div style={STATUS_STYLE}>Open a webpage to see its associated content.</div>
      )}

      {pageUrl && loading && <div style={STATUS_STYLE}>Loading…</div>}

      {pageUrl && !loading && error && (
        <div style={{ ...STATUS_STYLE, color: "var(--intent-danger, #e5695f)" }}>
          {error}
        </div>
      )}

      {pageUrl && !loading && !error && context && !hasAssociations && (
        <div style={STATUS_STYLE}>
          No associated content was found for this webpage yet. Use the content
          tree to associate a note or content item.
        </div>
      )}

      {pageUrl && !loading && !error && hasAssociations && (
        <div>
          {externalContents.map((entry) => (
            <button
              key={entry.id}
              type="button"
              style={LIST_ITEM_STYLE}
              onClick={() => openContent(entry.id, entry.contentType || "external")}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.title || "External link"}
              </span>
              <span style={CHIP_STYLE}>external</span>
            </button>
          ))}
          {associations.map((entry) => (
            <button
              key={entry.id}
              type="button"
              style={LIST_ITEM_STYLE}
              onClick={() => openContent(entry.content.id, entry.content.contentType)}
            >
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, overflow: "hidden" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.content.title}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-secondary, #9a9a9a)" }}>
                  {entry.content.contentType}
                </span>
              </span>
              <span style={CHIP_STYLE}>associated</span>
            </button>
          ))}
        </div>
      )}

      {/* More from {hostname} — lazy domain associations */}
      {pageUrl && hostname && (
        <div>
          <button type="button" style={SUB_TOGGLE_STYLE} onClick={toggleDomain} aria-expanded={domainExpanded}>
            <span style={{ display: "inline-block", width: 10 }}>{domainExpanded ? "▾" : "▸"}</span>
            <span>More from {hostname}</span>
          </button>
          {domainExpanded && (
            <div>
              {domainData === "loading" && <div style={STATUS_STYLE}>Loading…</div>}
              {domainData !== "loading" && domainError && (
                <div style={{ ...STATUS_STYLE, color: "var(--intent-danger, #e5695f)" }}>{domainError}</div>
              )}
              {domainData !== "loading" && domainData && !domainError && domainData.items.length === 0 && (
                <div style={STATUS_STYLE}>No other content on this domain.</div>
              )}
              {domainData !== "loading" && domainData && !domainError && domainData.items.map((item) => (
                <button
                  key={item.contentId}
                  type="button"
                  style={LIST_ITEM_STYLE}
                  onClick={() => openContent(item.contentId, item.contentType)}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.contentTitle}
                  </span>
                  <span style={{ ...CHIP_STYLE, background: "rgba(99,131,196,0.14)", color: "#b8cef2" }}>domain</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Flashcard from page — header preserved; authoring deferred */}
      {pageUrl && (
        <div>
          <button
            type="button"
            style={SUB_TOGGLE_STYLE}
            onClick={() => setFlashcardExpanded((p) => !p)}
            aria-expanded={flashcardExpanded}
          >
            <span style={{ display: "inline-block", width: 10 }}>{flashcardExpanded ? "▾" : "▸"}</span>
            <span>Flashcard from page</span>
          </button>
          {flashcardExpanded && (
            <div style={STATUS_STYLE}>
              Authoring a flashcard from the page you&apos;re on is coming to the
              panel. For now, create cards from the Flashcards panel.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
