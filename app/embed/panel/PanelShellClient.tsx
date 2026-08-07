"use client";

import {
  createElement,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { DndWrapper } from "@/components/content/DndWrapper";
import { MainPanelWorkspace } from "@/components/content/MainPanelWorkspace";
import { PanelPageLinkButton } from "@/components/content/PanelPageLinkButton";
import { RightSidebar } from "@/components/content/RightSidebar";
import { STUDIO_TAB_KEY } from "@/extensions/studio/manifest";
import { DeferredStoreHydrator } from "@/lib/features/stores/deferred-store-hydrator";
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
import { useSettingsStore } from "@/state/settings-store";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import { useExtensionShellNavigationControls } from "@/lib/extensions/client-registry";
import { isAllowedEmbedMessageOrigin } from "@/lib/domain/browser-extension/embed-message-origins";

// The panel = content workspace (top) + the real RightSidebar as a bottom strip
// (chat + backlinks/outline/tags). Studio is trimmed — heavy for a short strip.
// Module constant so RightSidebar's tab memo stays referentially stable.
const PANEL_EXCLUDED_SIDEBAR_TABS = [STUDIO_TAB_KEY];
// The sidebar strip is drag-resizable but CLAMPED so it never starves the
// workspace or gets too cramped to use. Fraction of the split's height.
const SIDEBAR_MIN_FRAC = 0.22;
const SIDEBAR_MAX_FRAC = 0.5;
const SIDEBAR_DEFAULT_FRAC = 0.34;
const SIDEBAR_FRAC_KEY = "dg-panel-sidebar-frac";
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

export function PanelShellClient({
  themePreference = "system",
}: {
  themePreference?: "light" | "dark" | "system";
}) {
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
    if (params.get("intent") === "ask-about-page") {
      pageChatPendingRef.current = true;
    }
    // Cold-open from a tree-overlay click (PANEL-OVERLAY-PLAN Phase 1b): the panel
    // was closed, so the target rode in on the URL. Open it in the workspace; the
    // content pane reveals when a selection exists.
    const openId = params.get("open");
    if (openId) {
      useContentStore.getState().openContentInPane(openId, TOP_LEFT_PANE_ID, {
        contentType: params.get("openType"),
      });
    }
  }, []);

  const [pageContext, setPageContext] = useState<PanelPageContext | null>(null);

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

  // Phase 2b: launch the right-side tree overlay from inside the panel — the
  // "panel only" handle's companion. Posts to the host, which relays the existing
  // show-tree-panel message to the background → the active tab's overlay.
  const launchTree = useCallback(() => {
    window.parent.postMessage(
      { v: 1, source: "dg-panel-embed", type: "show-tree" },
      "*",
    );
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
  const layoutMode = useContentStore((s) => s.layoutMode);
  const setLayoutMode = useContentStore((s) => s.setLayoutMode);
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  // Workspace selector — belongs where the tabs are: switching it runs
  // content-store.restoreWorkspace() in THIS iframe, loading that workspace's
  // tabs (the machinery WorkplacesShellController already drives here). It was
  // dropped when Phase 3 stripped the Garden view; restore it in the top bar.
  const shellNavigationControls = useExtensionShellNavigationControls();

  // ── workspace sync (panel ↔ tree overlay) ──
  // The panel selector and the tree-overlay selector must MIRROR at all times:
  // one workspace choice drives the tabs (here) AND the tree (overlay). They're
  // separate partitioned iframes, so carry the switch through the host →
  // background. Broadcast local switches; apply remote ones via the SAME
  // activateWorkspace(). A guard stops the applied change from echoing back.
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const applyingRemoteWsRef = useRef(false);
  const lastWsRef = useRef<string | null>(null);
  useEffect(() => {
    if (applyingRemoteWsRef.current) {
      applyingRemoteWsRef.current = false;
      lastWsRef.current = activeWorkspaceId;
      return;
    }
    if (!activeWorkspaceId || activeWorkspaceId === lastWsRef.current) return;
    lastWsRef.current = activeWorkspaceId;
    window.parent.postMessage(
      {
        v: 1,
        source: "dg-panel-embed",
        type: "workspace-changed",
        payload: { workspaceId: activeWorkspaceId },
      },
      "*",
    );
  }, [activeWorkspaceId]);

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

  // Single-pane by necessity at panel width. Enforced silently through the
  // store's own setLayoutMode (which reflows tabs into one pane), so nothing
  // app-side is overridden — the panel context just never leaves "single".
  useEffect(() => {
    if (layoutMode !== "single") setLayoutMode("single");
  }, [layoutMode, setLayoutMode]);

  // C2-hardened message listener: exact-origin validation, versioned envelope.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isAllowedEmbedMessageOrigin(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.v !== 1 || data.source !== "dg-panel-host") return;

      // "Ask AI about this page" fired while the panel is ALREADY open. With the
      // toggle retired, chat is always visible — no view switch needed; just kick
      // off the page chat. (Message type kept for host compatibility.)
      if (data.type === "set-view") {
        if (data.payload?.intent === "ask-about-page") {
          if (pageContextRef.current?.url) {
            pageChatPendingRef.current = false;
            kickoffPageChat();
          } else {
            pageChatPendingRef.current = true;
          }
        }
      }

      // Tree overlay (PANEL-OVERLAY-PLAN Phase 1b): a file-click relayed here
      // while the panel is already open. Open it in the workspace; the content
      // pane reveals automatically when a selection exists.
      if (data.type === "open-content" && data.payload?.contentId) {
        useContentStore
          .getState()
          .openContentInPane(String(data.payload.contentId), TOP_LEFT_PANE_ID, {
            contentType: data.payload.contentType ?? null,
          });
      }

      // Workspace sync: the tree overlay (or another surface) switched workspace;
      // mirror it here so the tabs follow. Apply the SAME activateWorkspace; the
      // guard ref stops it echoing back out.
      if (data.type === "workspace-changed" && data.payload?.workspaceId) {
        const id = String(data.payload.workspaceId);
        if (useWorkspaceStore.getState().activeWorkspaceId !== id) {
          applyingRemoteWsRef.current = true;
          void useWorkspaceStore.getState().activateWorkspace(id);
        }
      }

      // The page's content node was resolved (reused or created). Anchor the
      // chat to it, start a fresh conversation, and capture the page so its
      // context rides the user's first message. (Chat is always visible now.)
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
          requestPageCapture("full");
        }
      }

      if (data.type === "page-node-error") {
        if (data.payload?.url && data.payload.url !== pageChatUrlRef.current) {
          return;
        }
        pageChatUrlRef.current = null;
        // Couldn't anchor — chat stays visible, nothing to switch.
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

  // ── content ↕ sidebar split ──
  // The sidebar strip is drag-resizable but CLAMPED (SIDEBAR_MIN/MAX_FRAC) so it
  // can't starve the workspace or get too cramped. Persisted per embed context.
  const splitRef = useRef<HTMLDivElement>(null);
  const [sidebarFrac, setSidebarFrac] = useState(SIDEBAR_DEFAULT_FRAC);
  const sidebarFracRef = useRef(SIDEBAR_DEFAULT_FRAC);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_FRAC_KEY);
      const f = raw ? Number.parseFloat(raw) : Number.NaN;
      if (!Number.isNaN(f)) {
        const clamped = Math.min(SIDEBAR_MAX_FRAC, Math.max(SIDEBAR_MIN_FRAC, f));
        sidebarFracRef.current = clamped;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration
        setSidebarFrac(clamped);
      }
    } catch {
      // Storage unavailable — keep the default.
    }
  }, []);
  const startSidebarDrag = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect || rect.height === 0) return;
      const frac = (rect.bottom - ev.clientY) / rect.height;
      const clamped = Math.min(SIDEBAR_MAX_FRAC, Math.max(SIDEBAR_MIN_FRAC, frac));
      sidebarFracRef.current = clamped;
      setSidebarFrac(clamped);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        localStorage.setItem(SIDEBAR_FRAC_KEY, String(sidebarFracRef.current));
      } catch {
        // Non-fatal.
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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
      {/* Rehydrate the deferred (skipHydration) stores — the app mounts this in
          its layout, but the panel embed doesn't, so without it the RightSidebar's
          right-sidebar-state store never hydrates and rightPanelReady sticks
          false → the strip is stuck on its skeleton. Renders null. */}
      <DeferredStoreHydrator />
      {/* Co-browse indicator + Stop (5d) — above both views, visible whenever a
          session is driving a tab. Renders nothing when inactive. */}
      <CoBrowseIndicator />
      {/* Slim top bar — the Garden/Chat toggle is retired (content + chat now
          share the panel). Only the tree-launch handle remains here. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "4px 8px",
          borderBottom: "1px solid var(--border-primary, #2a2a2a)",
          flexShrink: 0,
        }}
      >
        {/* Workspace selector — switching it loads that workspace's tabs here. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {shellNavigationControls.map((Control) =>
            createElement(Control, {
              key: Control.displayName ?? Control.name,
              paneId: TOP_LEFT_PANE_ID,
            }),
          )}
        </div>
        {/* Phase 2b: launch the right-side file-tree overlay from the panel. */}
        <button
          type="button"
          onClick={launchTree}
          title="Open file tree"
          aria-label="Open file tree"
          style={{
            flexShrink: 0,
            width: 30,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            border: "1px solid transparent",
            background: "transparent",
            color: "var(--text-secondary, #9a9a9a)",
            cursor: "pointer",
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
        </button>
      </div>

      {/* The panel = the content workspace (top) + the real RightSidebar as a
          bottom strip (chat + backlinks/outline/tags), the app's layout inverted
          to a column. Both regions are minHeight:0 + overflow:hidden so nothing
          can ever oversize past the panel. The strip is drag-resizable, clamped.
          DndWrapper is required above both: ChatInput's useDrop throws without it. */}
      <DndWrapper>
        <div
          ref={splitRef}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Content workspace — grows to fill above the sidebar strip. */}
          <div
            style={{
              flex: "1 1 0",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            data-page-context-url={pageContext?.url ?? undefined}
          >
            {/* B3-B: note↔page link toggle. Self-hides without an open note + page. */}
            <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
              <PanelPageLinkButton
                pageUrl={pageContext?.url ?? null}
                pageTitle={pageContext?.title ?? ""}
                contentId={selectedContentId}
              />
            </div>
            <MainPanelWorkspace />
          </div>

          {/* Drag handle — resize the sidebar strip within its clamped range. */}
          <div
            onPointerDown={startSidebarDrag}
            role="separator"
            aria-orientation="horizontal"
            title="Drag to resize"
            style={{
              flexShrink: 0,
              height: 6,
              cursor: "row-resize",
              background: "var(--border-primary, #2a2a2a)",
              borderTop: "1px solid var(--border-primary, #2a2a2a)",
            }}
          />

          {/* Sidebar strip — chat + backlinks/outline/tags (Studio trimmed).
              Clamped, bounded, never oversizes. */}
          <div
            style={{
              flexBasis: `${sidebarFrac * 100}%`,
              flexGrow: 0,
              flexShrink: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <RightSidebar excludeTabs={PANEL_EXCLUDED_SIDEBAR_TABS} />
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
