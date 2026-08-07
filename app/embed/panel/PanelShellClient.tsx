"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DndWrapper } from "@/components/content/DndWrapper";
import { LeftSidebar } from "@/components/content/LeftSidebar";
import { MainPanelWorkspace } from "@/components/content/MainPanelWorkspace";
import { PanelQuickAccess } from "@/components/content/PanelQuickAccess";
import { PanelPageLinkButton } from "@/components/content/PanelPageLinkButton";
import { MultiConversationSidebar } from "@/components/content/ai/MultiConversationSidebar";
import { CoBrowseIndicator } from "@/components/content/ai/CoBrowseIndicator";
import { ContextMenu } from "@/components/content/context-menu/ContextMenu";
import { fileTreeActionProvider } from "@/components/content/context-menu/file-tree-actions";
import { editorActionProvider } from "@/components/content/context-menu/editor-actions";
import type { ContextMenuActionProvider } from "@/components/content/context-menu/types";
import { usePanelPageContextStore } from "@/state/panel-page-context-store";
import {
  requestOverlayOpen,
  requestResolvePageNode,
  requestPageCapture,
  requestCaptureSettings,
  requestAssociate,
  OVERLAY_CORNERS,
  type CaptureSettings,
} from "@/lib/domain/browser-extension/panel-bridge";
import { shouldCapturePage } from "@/lib/domain/browser-extension/capture-policy";
import { useContentStore, TOP_LEFT_PANE_ID } from "@/state/content-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { useSettingsStore } from "@/state/settings-store";
import { useExtensionShellNavigationControls } from "@/lib/extensions/client-registry";
import { isAllowedEmbedMessageOrigin } from "@/lib/domain/browser-extension/embed-message-origins";
import { createElement } from "react";

const TREE_COLLAPSED_KEY = "dg-panel-tree-collapsed";
const QUICK_ACCESS_COLLAPSED_KEY = "dg-panel-quick-access-collapsed";
// Short opener pre-filled (not sent) into the new chat when opened via "Ask AI
// about this page" — so a user who isn't expecting to type can just hit send.
const ASK_ABOUT_PAGE_PREFILL = "Give me a quick overview of this page.";
// B3-B settle window: how long a page URL must hold steady before auto-linking
// it to the open note. Long enough that flipping through tabs doesn't associate
// every page you glance at.
const AUTO_ASSOCIATE_DWELL_MS = 5000;

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
  // Always first-paint the Garden, even when opened via "Ask AI about this
  // page" (?view=chat). Cold-rendering the chat surface visible on the very
  // first paint — before the Garden view's layout/effects have settled —
  // tears the panel down. The requested view is applied one paint later in the
  // effect below, which mirrors the proven launcher→Chat-tab path.
  const [view, setView] = useState<PanelView>("garden");
  // "Ask AI about this page" bumps this to force a fresh conversation once the
  // page's content node is anchored; also gates the orchestration below.
  const [newChatNonce, setNewChatNonce] = useState(0);
  // True while we still owe a "new chat about this page" (intent seen, but the
  // page URL / resolved node isn't ready yet). A ref, not state, so the async
  // steps can read/clear it without re-render churn.
  const pageChatPendingRef = useRef(false);
  // The URL we asked the host to resolve a node for, so a late reply for a page
  // we've navigated away from is ignored.
  const pageChatUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "chat") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-paint-later switch; see comment above
      setView("chat");
    }
    if (params.get("intent") === "ask-about-page") {
      pageChatPendingRef.current = true;
    }
    // Cold-open from a tree-overlay click (PANEL-OVERLAY-PLAN Phase 1b): the panel
    // was closed, so the target rode in on the URL. Open it in the workspace; the
    // default Garden view shows it.
    const openId = params.get("open");
    if (openId) {
      useContentStore.getState().openContentInPane(openId, TOP_LEFT_PANE_ID, {
        contentType: params.get("openType"),
      });
    }
  }, []);

  const [pageContext, setPageContext] = useState<PanelPageContext | null>(null);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  // Quick access (Associated Content) starts collapsed: expanding it is what
  // triggers the resource-context fetch, so a collapsed default keeps the panel
  // from creating a WebResource row for every page you open.
  const [quickAccessCollapsed, setQuickAccessCollapsed] = useState(true);

  // ── "Ask AI about this page" orchestration ──────────────────────────────
  // Mirror pageContext into a ref so the (stable-closure) message listener and
  // async kickoff read the latest URL without re-subscribing.
  const pageContextRef = useRef<PanelPageContext | null>(null);
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  // Ask the host to resolve the current page's content node (reuse-or-create),
  // which returns as `page-node-resolved` and drives the anchor + new chat.
  const kickoffPageChat = useCallback(() => {
    const url = pageContextRef.current?.url;
    if (!url) return;
    pageChatUrlRef.current = url;
    requestResolvePageNode({ url, title: pageContextRef.current?.title ?? "" });
  }, []);

  // Cold-boot intent (?intent=ask-about-page) is seen before the page URL
  // arrives; fire the resolve as soon as the URL is known.
  useEffect(() => {
    if (!pageChatPendingRef.current) return;
    if (!pageContext?.url) return;
    pageChatPendingRef.current = false;
    kickoffPageChat();
  }, [pageContext, kickoffPageChat]);
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

  // ── B3-B settle-then-associate ────────────────────────────────────────────
  // Capture settings (killswitch + denylist) live in the extension's
  // chrome.storage; this partitioned iframe's own settings store is empty, so we
  // ask the host once (the reply is handled in the message listener below).
  const [captureSettings, setCaptureSettings] = useState<CaptureSettings | null>(
    null
  );
  // (url|contentId) pairs already auto-attempted this session, so a manual unlink
  // isn't immediately re-linked and the settle effect can't spam the host.
  const autoLinkedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    requestCaptureSettings();
  }, []);

  // When a page holds steady for the dwell window AND a note is open AND the
  // killswitch is on AND the page passes the capture policy (not DG's own
  // content, not a mailbox/auth page, not denylisted), link it to the note.
  // The note's link icon reflects it; unlinking there is the undo.
  useEffect(() => {
    const url = pageContext?.url;
    if (!url || !selectedContentId) return;
    if (!captureSettings?.autoAssociate) return;
    const key = `${url}|${selectedContentId}`;
    if (autoLinkedRef.current.has(key)) return;
    const decision = shouldCapturePage(url, {
      appOrigins: [window.location.origin],
      userDenylist: captureSettings.denylist,
    });
    if (!decision.capture) return;
    const title = pageContext?.title ?? "";
    const timer = setTimeout(() => {
      // Only associate while the user is actually looking at the panel.
      if (document.visibilityState !== "visible") return;
      autoLinkedRef.current.add(key);
      requestAssociate({ url, contentId: selectedContentId, title });
    }, AUTO_ASSOCIATE_DWELL_MS);
    return () => clearTimeout(timer);
  }, [pageContext?.url, pageContext?.title, selectedContentId, captureSettings]);

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
      // Absent key → keep the collapsed default; only an explicit "false" opens
      // it. (The disable above covers both setState calls in this effect.)
      setQuickAccessCollapsed(
        localStorage.getItem(QUICK_ACCESS_COLLAPSED_KEY) !== "false"
      );
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

  function toggleQuickAccessCollapsed() {
    setQuickAccessCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(QUICK_ACCESS_COLLAPSED_KEY, String(next));
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

      // Live view switch (host → embed). Sent when "Ask AI about this page"
      // fires while the panel is ALREADY open: the background can't re-open the
      // panel (that toggles it shut), so it asks us to switch to Chat in place.
      if (
        data.type === "set-view" &&
        (data.payload?.view === "chat" || data.payload?.view === "garden")
      ) {
        setView(data.payload.view);
        // Already-open "Ask AI about this page": kick off now if the page URL
        // is known, else defer to the pending effect once it arrives.
        if (data.payload.intent === "ask-about-page") {
          if (pageContextRef.current?.url) {
            pageChatPendingRef.current = false;
            kickoffPageChat();
          } else {
            pageChatPendingRef.current = true;
          }
        }
      }

      // Tree overlay (PANEL-OVERLAY-PLAN Phase 1b): a file-click relayed here
      // while the panel is already open. Open it in the workspace and show Garden.
      if (data.type === "open-content" && data.payload?.contentId) {
        useContentStore
          .getState()
          .openContentInPane(String(data.payload.contentId), TOP_LEFT_PANE_ID, {
            contentType: data.payload.contentType ?? null,
          });
        setView("garden");
      }

      // The page's content node was resolved (reused or created). Anchor the
      // chat to it, switch to Chat, start a fresh conversation, and capture the
      // page so its context rides the user's first message.
      if (data.type === "page-node-resolved") {
        if (data.payload?.url && data.payload.url !== pageChatUrlRef.current) {
          return;
        }
        pageChatUrlRef.current = null;
        const contentId = data.payload?.contentId;
        if (typeof contentId === "string" && contentId) {
          useContentStore
            .getState()
            .openContentInPane(contentId, TOP_LEFT_PANE_ID, {
              contentType: "external",
            });
          setView("chat");
          setNewChatNonce((n) => n + 1);
          requestPageCapture("full");
        }
      }

      if (data.type === "page-node-error") {
        if (data.payload?.url && data.payload.url !== pageChatUrlRef.current) {
          return;
        }
        pageChatUrlRef.current = null;
        // Couldn't anchor — still show Chat so the user isn't left on Garden.
        setView("chat");
      }

      if (data.type === "page-context" && data.payload?.url) {
        setPageContext({
          url: String(data.payload.url),
          title: String(data.payload.title ?? ""),
          faviconUrl: data.payload.faviconUrl
            ? String(data.payload.faviconUrl)
            : undefined,
        });
        // Also publish the lightweight current-page (url+title) to the store so the
        // conversation engine's current-page hint knows what page the user is on —
        // even without a full capture/attach. Powers "summarize this page".
        usePanelPageContextStore.getState().setCurrentPage({
          url: String(data.payload.url),
          title: String(data.payload.title ?? ""),
        });
      }

      // B3-B capture settings (killswitch + denylist) from chrome.storage.
      if (data.type === "capture-settings" && data.payload) {
        setCaptureSettings({
          autoAssociate: data.payload.autoAssociate === true,
          navHistory: data.payload.navHistory !== false,
          denylist: Array.isArray(data.payload.denylist)
            ? data.payload.denylist.map((entry: unknown) => String(entry))
            : [],
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
  }, [kickoffPageChat]);

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
      {/* Co-browse indicator + Stop (5d) — above both views, visible whenever a
          session is driving a tab. Renders nothing when inactive. */}
      <CoBrowseIndicator />
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
              // Grow to share the column (was a fixed 42%, which starved the
              // virtualized tree to ~5 rows). minHeight floors it when open;
              // the tree scrolls internally within whatever height it gets.
              flex: 1,
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
            {/* LeftSidebar's root is `h-full` (height:100%), which cannot
                resolve against a flex-basis:0 parent, so the virtualized tree
                sized to its own content (a circular 564px) instead of the
                available space. This relative box IS bounded (flex:1 shares the
                Files section); the absolutely-positioned inner fills it with a
                DEFINITE height that h-full resolves against → the tree gets a
                real height and scrolls. overflow:hidden guarantees nothing can
                spill into the workspace below even mid-measure. */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <LeftSidebar />
              </div>
            </div>
          </div>
          {/* Quick access — Associated Content ported from the overlay. Same
              disclosure design as Files (rotating chevron, CSS-var styling). */}
          <button
            type="button"
            onClick={toggleQuickAccessCollapsed}
            aria-expanded={!quickAccessCollapsed}
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
                transform: quickAccessCollapsed ? "rotate(-90deg)" : "none",
              }}
            >
              ▾
            </span>
            Quick access
          </button>
          <div
            style={{
              display: quickAccessCollapsed ? "none" : "block",
              maxHeight: 260,
              overflowY: "auto",
              flexShrink: 0,
              borderBottom: "1px solid var(--border-primary, #2a2a2a)",
            }}
          >
            <PanelQuickAccess
              pageUrl={pageContext?.url ?? null}
              pageTitle={pageContext?.title ?? ""}
              faviconUrl={pageContext?.faviconUrl}
              active={!quickAccessCollapsed}
            />
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* B3-B: note↔page link toggle. Renders only in the panel embed with
                both an open note and a current page (self-hides otherwise). */}
            <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
              <PanelPageLinkButton
                pageUrl={pageContext?.url ?? null}
                pageTitle={pageContext?.title ?? ""}
                contentId={selectedContentId}
              />
            </div>
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
          <MultiConversationSidebar
            contentId={selectedContentId}
            newChatNonce={newChatNonce}
            newChatPrefill={ASK_ABOUT_PAGE_PREFILL}
          />
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
