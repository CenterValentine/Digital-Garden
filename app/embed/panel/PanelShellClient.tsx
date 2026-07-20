"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DndWrapper } from "@/components/content/DndWrapper";
import { LeftSidebar } from "@/components/content/LeftSidebar";
import { MainPanelWorkspace } from "@/components/content/MainPanelWorkspace";
import { MultiConversationSidebar } from "@/components/content/ai/MultiConversationSidebar";
import { useContentStore, TOP_LEFT_PANE_ID } from "@/state/content-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { useSettingsStore } from "@/state/settings-store";
import { useExtensionShellNavigationControls } from "@/lib/extensions/client-registry";
import { isAllowedEmbedMessageOrigin } from "@/lib/domain/browser-extension/embed-message-origins";
import { createElement } from "react";

const TREE_COLLAPSED_KEY = "dg-panel-tree-collapsed";
const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function subscribeToColorScheme(onChange: () => void) {
  const query = window.matchMedia(COLOR_SCHEME_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSystemPrefersDark() {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches;
}

/**
 * Mini-DG shell for the extension side panel (BROWSER-REACH B1).
 *
 * Two views over one persistent mount (display-toggled so state survives):
 *   Garden — file tree stacked over the tabbed content workspace. Single-click
 *            in the tree opens content as a workspace tab (decision #12's
 *            default dispatch comes free from the app's normal behavior).
 *   Chat   — the app chat surface (transient in B1; conversation binding and
 *            target-chip work arrive with the core-plan surfaces).
 *
 * postMessage protocol (versioned envelope, C2):
 *   in  ← {v:1, source:"dg-panel-host", type:"page-context", payload:{url,title,faviconUrl}}
 *   out → {v:1, source:"dg-panel-embed", type:"ready"}
 * Incoming messages are dropped unless their origin passes
 * isAllowedEmbedMessageOrigin (exact chrome-extension origin allowlist).
 */

interface PanelPageContext {
  url: string;
  title: string;
  faviconUrl?: string;
}

type PanelView = "garden" | "chat";

export function PanelShellClient({
  themePreference = "system",
}: {
  themePreference?: "light" | "dark" | "system";
}) {
  const [view, setView] = useState<PanelView>("garden");
  const [pageContext, setPageContext] = useState<PanelPageContext | null>(null);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const setRightCollapsed = useRightPanelCollapseStore((s) => s.setCollapsed);
  const layoutMode = useContentStore((s) => s.layoutMode);
  const setLayoutMode = useContentStore((s) => s.setLayoutMode);
  // Shell-slot navigation controls (the workspace chooser lives here) —
  // rendered above the file tree per owner direction; the full navigation
  // bar (back/forward, pane layout) is suppressed in the panel.
  const shellNavigationControls = useExtensionShellNavigationControls();
  const selectedContentId = useContentStore((s) => s.selectedContentId);

  // Server-resolved preference; "system" defers to the iframe's own media
  // query, subscribed through useSyncExternalStore so it stays SSR-safe and
  // needs no setState-in-effect.
  const systemPrefersDark = useSyncExternalStore(
    subscribeToColorScheme,
    getSystemPrefersDark,
    () => false
  );
  const isDark =
    themePreference === "system" ? systemPrefersDark : themePreference === "dark";

  // Two consumers read the theme from different places: Tailwind's `dark:`
  // variants need a `.dark` ancestor class, while JS-computed styles (the chat
  // gradient) read useResolvedTheme → the settings store, which is empty in the
  // partitioned iframe. The class is applied in render below; seed the store here.
  useEffect(() => {
    useSettingsStore.setState((state) => ({
      ui: { ...state.ui, theme: isDark ? "dark" : "light" },
    }));
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // The panel has no room for the right sidebar; keep it collapsed.
  useEffect(() => {
    setRightCollapsed(true);
  }, [setRightCollapsed]);

  // Single-pane by necessity at panel width. Enforced silently through the
  // store's own setLayoutMode (which reflows tabs into one pane), so nothing
  // app-side is overridden — the panel context just never leaves "single".
  useEffect(() => {
    if (layoutMode !== "single") setLayoutMode("single");
  }, [layoutMode, setLayoutMode]);

  // Tree collapse preference persists per embed context.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration
      setTreeCollapsed(localStorage.getItem(TREE_COLLAPSED_KEY) === "true");
    } catch {
      // Storage unavailable (partitioned iframe edge cases) — default open.
    }
  }, []);

  function toggleTreeCollapsed() {
    setTreeCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TREE_COLLAPSED_KEY, String(next));
      } catch {
        // Non-fatal.
      }
      return next;
    });
  }

  // C2-hardened message listener: exact-origin validation, versioned envelope.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isAllowedEmbedMessageOrigin(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.v !== 1 || data.source !== "dg-panel-host") return;

      if (data.type === "page-context" && data.payload?.url) {
        setPageContext({
          url: String(data.payload.url),
          title: String(data.payload.title ?? ""),
          faviconUrl: data.payload.faviconUrl
            ? String(data.payload.faviconUrl)
            : undefined,
        });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Announce readiness to the panel host (extension page). The host validates
  // our origin on its side; the envelope is versioned from day one.
  useEffect(() => {
    window.parent.postMessage(
      { v: 1, source: "dg-panel-embed", type: "ready" },
      "*"
    );
  }, []);

  return (
    <div
      className={isDark ? "dark" : undefined}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Slim view switcher — app chrome, not extension chrome */}
      <div
        role="tablist"
        aria-label="Panel view"
        style={{
          display: "flex",
          gap: 4,
          padding: "6px 8px",
          borderBottom: "1px solid var(--border-primary, #2a2a2a)",
          flexShrink: 0,
        }}
      >
        {(
          [
            ["garden", "Garden"],
            ["chat", "Chat"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            style={{
              flex: 1,
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid transparent",
              cursor: "pointer",
              background:
                view === key
                  ? "var(--surface-secondary, #1e1e1e)"
                  : "transparent",
              color:
                view === key
                  ? "var(--text-primary, #f5f5f5)"
                  : "var(--text-secondary, #9a9a9a)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* DndWrapper spans BOTH views: the tree needs it for drag-and-drop, and
          ChatInput's useDrop (drag a note onto the composer) throws
          "Expected drag drop context" without a provider above it. */}
      <DndWrapper>
      {/* Garden view: tree over tabbed workspace. Kept mounted when hidden. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: view === "garden" ? "flex" : "none",
          flexDirection: "column",
        }}
      >
        <>
          {/* Slim collapse bar — reclaims the tree's space for notes. */}
          <button
            type="button"
            onClick={toggleTreeCollapsed}
            aria-expanded={!treeCollapsed}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px",
              fontSize: 11,
              border: 0,
              borderBottom: "1px solid var(--border-primary, #2a2a2a)",
              background: "transparent",
              color: "var(--text-secondary, #9a9a9a)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                display: "inline-block",
                transition: "transform 0.15s",
                transform: treeCollapsed ? "rotate(-90deg)" : "none",
              }}
            >
              ▾
            </span>
            Files
          </button>
          {/* No overflow:auto here — LeftSidebar's virtualized tree owns its
              scrolling and needs a bounded flex box (minHeight:0), not a
              scrollable ancestor competing with it. */}
          <div
            style={{
              flexBasis: "42%",
              minHeight: treeCollapsed ? 0 : 120,
              display: treeCollapsed ? "none" : "flex",
              flexDirection: "column",
              overflow: "hidden",
              borderBottom: "1px solid var(--border-primary, #2a2a2a)",
            }}
          >
            {/* Workspace chooser — top of the collapsible Files section, so it
                collapses away with the tree (owner direction 2026-07-20) */}
            {shellNavigationControls.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderBottom: "1px solid var(--border-primary, #2a2a2a)",
                  flexShrink: 0,
                }}
              >
                {shellNavigationControls.map((Control) =>
                  createElement(Control, {
                    key: Control.displayName ?? Control.name,
                    paneId: TOP_LEFT_PANE_ID,
                  })
                )}
              </div>
            )}
            <LeftSidebar />
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <MainPanelWorkspace />
          </div>
        </>
      </div>

      {/* Chat view. Kept mounted when hidden so the conversation survives
          view switches. pageContext is held for B2 (context scopes); the
          page pill itself is extension chrome per decision #10. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: view === "chat" ? "flex" : "none",
          flexDirection: "column",
        }}
        data-page-context-url={pageContext?.url ?? undefined}
      >
        {/* Full multi-conversation surface (tabs + picker + new chat), the
            same component the right sidebar mounts — a bare ChatPanel gave
            no way to open or start conversations. Bound to whatever content
            is active in the panel, so chats follow the Garden selection. */}
        <MultiConversationSidebar contentId={selectedContentId} />
      </div>
      </DndWrapper>
    </div>
  );
}
