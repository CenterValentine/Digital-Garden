"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DndWrapper } from "@/components/content/DndWrapper";
import { LeftSidebar } from "@/components/content/LeftSidebar";
import { MainPanelWorkspace } from "@/components/content/MainPanelWorkspace";
import { MultiConversationSidebar } from "@/components/content/ai/MultiConversationSidebar";
import { ContextMenu } from "@/components/content/context-menu/ContextMenu";
import { fileTreeActionProvider } from "@/components/content/context-menu/file-tree-actions";
import { editorActionProvider } from "@/components/content/context-menu/editor-actions";
import type { ContextMenuActionProvider } from "@/components/content/context-menu/types";
import { usePanelPageContextStore } from "@/state/panel-page-context-store";
import {
  requestOverlayOpen,
  OVERLAY_CORNERS,
} from "@/lib/domain/browser-extension/panel-bridge";
import { useContentStore, TOP_LEFT_PANE_ID } from "@/state/content-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { useSettingsStore } from "@/state/settings-store";
import { useExtensionShellNavigationControls } from "@/lib/extensions/client-registry";
import { isAllowedEmbedMessageOrigin } from "@/lib/domain/browser-extension/embed-message-origins";
import { createElement } from "react";

const TREE_COLLAPSED_KEY = "dg-panel-tree-collapsed";

/**
 * The full file-tree menu is nearly as tall as the panel itself. Trim the
 * actions that don't apply here: clipboard operations (the panel isn't where
 * you shuffle files around) and "Open In Pane" (the panel is single-pane by
 * necessity, so it offers a choice that can't be honored).
 */
const PANEL_HIDDEN_ACTION_IDS = new Set([
  "copy",
  "cut",
  "paste",
  "open-in-pane",
]);

/**
 * Panel-only "Open as overlay": project a tree item onto the page. Added as
 * its own section right after the first so it sits near the top of a menu
 * that's already tall at panel width.
 */
function withOverlayAction(
  sections: ReturnType<ContextMenuActionProvider>,
  contentIds: string[]
): ReturnType<ContextMenuActionProvider> {
  if (contentIds.length === 0) return sections;
  const label =
    contentIds.length > 1
      ? `Open ${contentIds.length} as overlays`
      : "Open as overlay";
  const overlaySection = {
    actions: [
      {
        id: "open-as-overlay",
        label,
        sectionLabel: "PAGE",
        onClick: () => {
          // Stagger corners so a multi-select doesn't stack every panel in
          // the same spot.
          contentIds.forEach((contentId, index) => {
            requestOverlayOpen(contentId, {
              corner: OVERLAY_CORNERS[index % OVERLAY_CORNERS.length],
            });
          });
        },
      },
    ],
  };
  return [sections[0], overlaySection, ...sections.slice(1)].filter(Boolean);
}

const compactFileTreeActionProvider: ContextMenuActionProvider = (ctx) => {
  const context = ctx as unknown as {
    selectedIds?: string[];
    clickedId?: string | null;
  };
  const targetIds =
    context.selectedIds && context.selectedIds.length > 0
      ? context.selectedIds
      : context.clickedId
        ? [context.clickedId]
        : [];
  return withOverlayAction(
    baseCompactSections(ctx),
    targetIds
  );
};

const baseCompactSections: ContextMenuActionProvider = (ctx) => {
  return fileTreeActionProvider(ctx)
    .map((section) => {
      const actions = section.actions.filter(
        (action) => !PANEL_HIDDEN_ACTION_IDS.has(action.id)
      );
      // An item-level heading rides on the first action of its group; if that
      // action is dropped, hand the heading to the next survivor so the rest
      // of the group isn't orphaned.
      const orphanedLabel = section.actions.find(
        (action) =>
          PANEL_HIDDEN_ACTION_IDS.has(action.id) && action.sectionLabel
      )?.sectionLabel;
      if (orphanedLabel && actions.length > 0 && !actions[0].sectionLabel) {
        actions[0] = { ...actions[0], sectionLabel: orphanedLabel };
      }
      return { ...section, actions };
    })
    // Drop sections emptied by the filter so no stray heading remains.
    .filter((section) => section.actions.length > 0);
};
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
  // Initial view: "chat" when opened via "Ask AI about this page" (the host
  // appends ?view=chat), else the Garden. Read once at mount.
  const [view, setView] = useState<PanelView>(() => {
    if (typeof window === "undefined") return "garden";
    return new URLSearchParams(window.location.search).get("view") === "chat"
      ? "chat"
      : "garden";
  });
  const [pageContext, setPageContext] = useState<PanelPageContext | null>(null);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  // Page-context capture results flow into the store; the context bar now
  // lives in the composer (PanelPageContextBar) and drives capture itself.
  // This shell only relays the host's responses in via getState() (below),
  // so the listener effect needs no store deps.
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

      // Captured page content (B2). Store it and mark attached so it rides
      // the next chat turn. The scope requested is echoed back on payload.
      if (data.type === "page-content" && typeof data.payload?.content === "string") {
        const p = data.payload;
        const store = usePanelPageContextStore.getState();
        store.setPageContext({
          title: typeof p.title === "string" ? p.title : null,
          byline: typeof p.byline === "string" ? p.byline : null,
          siteName: typeof p.siteName === "string" ? p.siteName : null,
          excerpt: typeof p.excerpt === "string" ? p.excerpt : null,
          content: p.content,
          quality: p.quality === "readable" || p.quality === "empty" ? p.quality : "raw",
          scope: p.scope === "selection" || p.scope === "viewport" ? p.scope : "full",
          url: typeof p.url === "string" ? p.url : "",
          capturedAt: typeof p.capturedAt === "number" ? p.capturedAt : Date.now(),
        });
        store.setAttached(true);
        store.setBusy(false);
        store.setError(null);
      }

      if (data.type === "page-content-error") {
        const store = usePanelPageContextStore.getState();
        store.setBusy(false);
        store.setError(
          typeof data.payload?.message === "string"
            ? data.payload.message
            : "Couldn't read this page"
        );
      }

      // Screenshot arrived — hand it to the composer via the store; the
      // context bar converts it to a File and attaches it.
      if (data.type === "screenshot" && typeof data.payload?.dataUrl === "string") {
        const store = usePanelPageContextStore.getState();
        store.setPendingScreenshot(data.payload.dataUrl);
        store.setScreenshotBusy(false);
      }
      if (data.type === "screenshot-error") {
        const store = usePanelPageContextStore.getState();
        store.setScreenshotBusy(false);
        store.setError(
          typeof data.payload?.message === "string"
            ? data.payload.message
            : "Couldn't screenshot this page"
        );
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
        {/* Page-context bar now lives INSIDE the composer (ChatInput →
            PanelPageContextBar), per owner direction — closer to where the
            user types, and self-contained. */}
        {/* Full multi-conversation surface (tabs + picker + new chat), the
            same component the right sidebar mounts — a bare ChatPanel gave
            no way to open or start conversations. Bound to whatever content
            is active in the panel, so chats follow the Garden selection.
            Wrapped in flex:1/min-height:0 so it takes the space LEFT of the
            context bar — its own `h-full` would otherwise claim the full
            parent height and push the composer off the bottom. */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <MultiConversationSidebar contentId={selectedContentId} />
        </div>
      </div>
      </DndWrapper>

      {/* Global context menu — the app mounts this in ResizablePanels, which
          the panel doesn't use. Without it, right-click fell through to the
          browser's native menu. It portals to document.body at z-120 (above
          #embed-root's 100) and menu-positioning flips/shifts against
          window.innerWidth/Height — inside the iframe that IS the panel
          viewport, so it stays in bounds at panel width for free. */}
      <ContextMenu
        actionProviders={{
          "file-tree": compactFileTreeActionProvider,
          "main-editor": editorActionProvider,
        }}
      />
    </div>
  );
}
