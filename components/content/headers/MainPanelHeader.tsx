"use client";

import { createElement, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useDrop } from "react-dnd";
import { usePathname } from "next/navigation";
import { requestOverlayOpen } from "@/lib/domain/browser-extension/panel-bridge";
import { X } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import {
  getPaneLabel,
  useContentStore,
  type WorkspacePaneId,
} from "@/state/content-store";
import { useWorkspaceStore } from "@/state/workspace-store";
import { useTreeDragStore } from "@/state/tree-drag-store";
import {
  collectPaneAttachedTabs,
  getEffectiveTabFilters,
  isTabGroupVisible,
  selectActiveTabFilters,
  useWorkspaceTabFilterStore,
} from "@/state/workspace-tab-filter-store";
import { getTabIcon, getTabIconGroupKey } from "./tab-icons";
import { useExtensionShellTabMenuSections } from "@/lib/extensions/client-registry";
import { getCollaborationBrowserSessionId } from "@/lib/domain/collaboration/runtime";
import { prefetchContent } from "@/lib/domain/content/prefetch";
import { BorrowedTabBadge } from "@/extensions/workplaces/components/BorrowedTabBadge";

interface TabPresenceSession {
  sessionId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  surfaceCount: number;
  transportState: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

// Transport states that represent an actively-synced collaboration connection.
// Anything else (localOnly, coolingDown, disconnectedButDirty) renders as dormant/grey.
const ACTIVE_TRANSPORT_STATES = new Set(["synced", "connected", "connecting", "promoting"]);

function isActiveTransport(transportState: string | undefined): boolean {
  return ACTIVE_TRANSPORT_STATES.has(transportState ?? "");
}

interface PresenceDisplayGroup {
  key: string;
  displayName: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  surfaceCount: number;
  sessionCount: number;
  firstSeenAt: number;
  colorSeed: string;
  /** true if at least one session in this group has an active WebSocket to Hocuspocus */
  hasActiveTransport: boolean;
}

interface PresenceSnapshotResponse {
  success: boolean;
  data?: {
    presenceByContentId: Record<string, TabPresenceSession[]>;
  };
}

// react-arborist's drag source type. Must match `type: "NODE"` in
// node_modules/react-arborist/dist/main/dnd/drag-hook.js so the tab strip
// registers as a valid drop target — otherwise react-dnd's window-level
// dragover handler stamps dropEffect="none" and the browser silently
// suppresses the drop event (same constraint as the chat composer's target).
const ARBORIST_DRAG_TYPE = "NODE";

interface ArboristDragItem {
  id: string;
  dragIds: string[];
}

const PRESENCE_POLL_INTERVAL_MS = 10_000;
const VISITOR_ADJECTIVES = ["Silver", "Quiet", "Golden", "Bright", "Gentle", "Blue"];
const VISITOR_TRAITS = ["Windy", "Curious", "Clever", "Sunny", "Brisk", "Calm"];
const VISITOR_ANIMALS = ["Raccoon", "Fox", "Heron", "Otter", "Finch", "Badger"];

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  return (words[0]?.slice(0, 2) || "?").toUpperCase();
}

function getVisitorName(seed: string) {
  const hash = hashString(seed);
  return [
    VISITOR_ADJECTIVES[hash % VISITOR_ADJECTIVES.length],
    VISITOR_TRAITS[Math.floor(hash / 7) % VISITOR_TRAITS.length],
    VISITOR_ANIMALS[Math.floor(hash / 17) % VISITOR_ANIMALS.length],
  ].join(" ");
}

function formatSessionStart(firstSeenAt: number) {
  if (!firstSeenAt) return "Viewing now";
  return `Viewing since ${new Date(firstSeenAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function groupPresenceSessions(sessions: TabPresenceSession[]): PresenceDisplayGroup[] {
  const groups = new Map<string, PresenceDisplayGroup>();

  for (const session of sessions) {
    const displayName =
      session.displayName?.trim() || getVisitorName(session.sessionId || session.userId);
    const key = session.isAnonymous
      ? session.userId || session.sessionId
      : session.userId || displayName;
    const existing = groups.get(key);

    if (existing) {
      existing.surfaceCount += session.surfaceCount;
      existing.sessionCount += 1;
      existing.firstSeenAt = Math.min(existing.firstSeenAt, session.firstSeenAt || Date.now());
      if (!existing.avatarUrl && session.avatarUrl) {
        existing.avatarUrl = session.avatarUrl;
      }
      // Promote to active if any session in the group is actively synced.
      if (isActiveTransport(session.transportState)) {
        existing.hasActiveTransport = true;
      }
    } else {
      groups.set(key, {
        key,
        displayName,
        avatarUrl: session.avatarUrl,
        isAnonymous: session.isAnonymous,
        surfaceCount: session.surfaceCount,
        sessionCount: 1,
        firstSeenAt: session.firstSeenAt || Date.now(),
        colorSeed: session.userId || session.sessionId,
        hasActiveTransport: isActiveTransport(session.transportState),
      });
    }
  }

  return Array.from(groups.values()).sort((left, right) => left.firstSeenAt - right.firstSeenAt);
}

function TabPresenceDiscs({
  sessions,
  anchorRect,
}: {
  sessions: TabPresenceSession[];
  anchorRect: DOMRect | null;
}) {
  if (sessions.length === 0) return null;
  if (!anchorRect || typeof document === "undefined") return null;

  const groups = groupPresenceSessions(sessions);
  const visibleGroups = groups.slice(0, 4);
  const hiddenGroups = groups.slice(4);
  const top = Math.max(4, anchorRect.top - 10);
  const left = Math.min(
    window.innerWidth - 36,
    Math.max(4, anchorRect.right - 68)
  );

  return createPortal(
    <div
      className="group/presence fixed z-40 flex max-w-[8rem] items-center overflow-visible pr-1"
      style={{ left, top }}
    >
      {visibleGroups.map((group, index) => {
        const initials = getInitials(group.displayName);
        const colorIndex = hashString(group.colorSeed) % 5;
        const activeColors = [
          "bg-blue-500",
          "bg-emerald-500",
          "bg-violet-500",
          "bg-amber-500",
          "bg-rose-500",
        ];
        // Active transport → coloured avatar. Dormant (sleeping/cooling down) → grey.
        const avatarColorClass = group.hasActiveTransport
          ? activeColors[colorIndex]
          : "bg-gray-400 dark:bg-gray-500";

        return (
          <div
            key={group.key}
            className="group/card relative -ml-2 first:ml-0 transition-all duration-150 group-hover/presence:ml-1"
            style={{ zIndex: groups.length - index }}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-background text-[10px] font-semibold uppercase text-white shadow-sm transition-colors duration-300 ${avatarColorClass}`}
              aria-label={group.displayName}
            >
              {group.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.avatarUrl}
                  alt=""
                  className={`h-full w-full object-cover ${group.hasActiveTransport ? "" : "opacity-60"}`}
                />
              ) : (
                initials
              )}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-7 z-50 w-44 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity delay-300 group-hover/card:opacity-100">
              <p className="truncate font-medium">{group.displayName}</p>
              {group.isAnonymous ? (
                <p className="text-muted-foreground">Public viewer</p>
              ) : (
                <>
                  <p className="text-muted-foreground">{formatSessionStart(group.firstSeenAt)}</p>
                  <p className="text-muted-foreground">
                    {group.hasActiveTransport ? "Live" : "Idle"} ·{" "}
                    {group.sessionCount} {group.sessionCount === 1 ? "session" : "sessions"} ·{" "}
                    {group.surfaceCount} {group.surfaceCount === 1 ? "view" : "views"}
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })}
      {hiddenGroups.length > 0 ? (
        <div className="group/card relative -ml-2 transition-all duration-150 group-hover/presence:ml-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground">
            +{hiddenGroups.length}
          </div>
          <div className="pointer-events-none absolute left-1/2 top-7 z-50 w-52 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity delay-300 group-hover/card:opacity-100">
            <p className="mb-1 font-medium">Other viewers</p>
            {hiddenGroups.slice(0, 8).map((group) => (
              <p key={group.key} className="truncate text-muted-foreground">
                {group.displayName}
                {group.sessionCount > 1 ? ` · ${group.sessionCount} sessions` : ""}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}

interface MainPanelHeaderProps {
  paneId: WorkspacePaneId;
  draggedTabId: string | null;
  onTabDragStart: (tabId: string, paneId: WorkspacePaneId) => void;
  onTabDragEnd: () => void;
  onTabDrop: (paneId: WorkspacePaneId, beforeTabId?: string | null) => void;
}

export function MainPanelHeader({
  paneId,
  draggedTabId,
  onTabDragStart,
  onTabDragEnd,
  onTabDrop,
}: MainPanelHeaderProps) {
  const glass1 = getSurfaceStyles("glass-1");
  const layoutMode = useContentStore((state) => state.layoutMode);
  const activePaneId = useContentStore((state) => state.activePaneId);
  const pane = useContentStore((state) => state.panes[paneId]);
  const allPanes = useContentStore((state) => state.panes);
  const tabsById = useContentStore((state) => state.tabs);
  const activateContentTab = useContentStore((state) => state.activateContentTab);
  const closeContentTab = useContentStore((state) => state.closeContentTab);
  const updateContentTab = useContentStore((state) => state.updateContentTab);
  const openContentInPane = useContentStore((state) => state.openContentInPane);
  // True while any file-tree node drag is in flight (people nodes never
  // publish to the drag store, so they read as "no drag").
  const isTreeNodeDragging = useTreeDragStore((state) => state.draggingNode !== null);
  // Gate the per-tab title back-fill until the workspace snapshot has resolved:
  // it names every open tab from contentMeta, so back-filling earlier would fire
  // one redundant content fetch per tab on every cold load.
  const workspaceStoreReady = useWorkspaceStore((state) => state.hasLoadedOnce);
  const shellTabMenuSections = useExtensionShellTabMenuSections();
  const headerPathname = usePathname();
  const isPanelEmbed = headerPathname?.startsWith("/embed/panel") ?? false;

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [tabMenu, setTabMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const [presenceByContentId, setPresenceByContentId] = useState<
    Record<string, TabPresenceSession[]>
  >({});
  const [tabRects, setTabRects] = useState<Record<string, DOMRect | null>>({});
  const renameInputRef = useRef<HTMLInputElement>(null);
  const tabElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const tabScrollerRef = useRef<HTMLDivElement | null>(null);
  // Insertion point for a file-tree drag hovering this strip: `index` is the
  // slot the tab would land in (0..tabs.length), `left` the caret's x offset
  // in the scroller's content coordinates.
  const [treeDropTarget, setTreeDropTarget] = useState<{
    index: number;
    left: number;
  } | null>(null);
  const treeDropIndexRef = useRef<number | null>(null);
  const isActivePane = activePaneId === paneId;

  const startRename = useCallback((tabId: string, currentTitle: string) => {
    setEditingTabId(tabId);
    setEditingTitle(currentTitle);
    // Focus input on next tick after render
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(async (
    tab: { id: string; contentId: string; title: string; contentType: string | null }
  ) => {
    const newTitle = editingTitle.trim();
    setEditingTabId(null);
    if (!newTitle || newTitle === tab.title) return;

    // Optimistic update
    updateContentTab(tab.contentId, { title: newTitle });

    try {
      const isPageTemplate = tab.contentType === "page-template";
      const response = await fetch(
        isPageTemplate
          ? `/api/content/page-templates/${tab.contentId}`
          : `/api/content/content/${tab.contentId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || (!isPageTemplate && !result?.success)) {
        throw new Error(
          isPageTemplate
            ? result?.error || "Failed to rename template"
            : result?.error?.message || "Failed to rename"
        );
      }
      if (!isPageTemplate) {
        window.dispatchEvent(
          new CustomEvent("content-updated", {
            detail: {
              contentId: tab.contentId,
              updates: { title: newTitle },
            },
          }),
        );
      }
    } catch {
      // Revert on failure
      updateContentTab(tab.contentId, { title: tab.title });
      toast.error("Failed to rename");
    }
  }, [editingTitle, updateContentTab]);

  const cancelRename = useCallback(() => {
    setEditingTabId(null);
  }, []);

  const tabs = useMemo(
    () =>
      (pane?.tabIds ?? [])
        .map((tabId) => tabsById[tabId])
        .filter(Boolean),
    [pane?.tabIds, tabsById]
  );
  const tabContentIds = useMemo(
    () => Array.from(new Set(tabs.map((tab) => tab.contentId).filter(Boolean))),
    [tabs]
  );
  const tabMenuTab = tabMenu ? tabsById[tabMenu.tabId] : null;

  const tabFilters = useWorkspaceTabFilterStore(selectActiveTabFilters);
  // The active workspace's filters apply, but only for types that still have
  // a pane-attached tab — a saved filter whose affordance is gone from the
  // bar must not keep hiding tabs (it stays stored and re-applies visibly
  // when a tab of its type opens again). Pane-attached, not tabsById: the
  // tabs record accumulates entries across workspace switches.
  const effectiveTabFilters = useMemo(() => {
    const presentKeys = new Set(
      collectPaneAttachedTabs(allPanes, tabsById).map((tab) =>
        getTabIconGroupKey(tab.contentType)
      )
    );
    return getEffectiveTabFilters(tabFilters, presentKeys);
  }, [tabFilters, allPanes, tabsById]);
  // View-only filter: hidden tabs stay open (and active content stays put);
  // they just don't render in the strip.
  const visibleTabs = useMemo(
    () =>
      tabs.filter((tab) =>
        isTabGroupVisible(effectiveTabFilters, getTabIconGroupKey(tab.contentType))
      ),
    [tabs, effectiveTabFilters]
  );

  // Map a drag's viewport x to the tab slot it would insert into: a cursor
  // past a tab's midpoint pushes the insertion point behind that tab. Also
  // yields the caret position (boundary between the neighboring tabs) in the
  // scroller's content coordinates, so the indicator scrolls with the tabs.
  const computeTreeDropTarget = useCallback(
    (clientX: number): { index: number; left: number } | null => {
      const scroller = tabScrollerRef.current;
      if (!scroller) return null;
      const scrollerRect = scroller.getBoundingClientRect();
      const toLocalX = (viewportX: number) =>
        viewportX - scrollerRect.left + scroller.scrollLeft;

      let index = 0;
      let boundary = 5; // empty strip: caret sits at the leading edge
      for (const tab of visibleTabs) {
        const element = tabElementsRef.current.get(tab.id);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (clientX >= rect.left + rect.width / 2) {
          index += 1;
          boundary = toLocalX(rect.right);
        } else {
          boundary = toLocalX(rect.left);
          break;
        }
      }
      return { index, left: Math.max(0, boundary - 1) };
    },
    [visibleTabs]
  );

  const handleTreeNodeDrop = useCallback(
    (clientX: number) => {
      const { draggingNode, draggingNodes } = useTreeDragStore.getState();
      const nodesToOpen =
        draggingNodes.length > 0
          ? draggingNodes
          : draggingNode
            ? [draggingNode]
            : [];
      if (nodesToOpen.length === 0) return;

      const target = computeTreeDropTarget(clientX);
      const beforeTabId = target ? visibleTabs[target.index]?.id ?? null : null;

      // Each node opens before the same anchor, so a multi-drag lands in
      // selection order. Pinned + non-temporary: an explicit drop is a
      // deliberate open, not a preview.
      for (const dropped of nodesToOpen) {
        openContentInPane(dropped.id, paneId, {
          title: dropped.title,
          contentType: dropped.contentType,
          pin: true,
          temporary: false,
          beforeTabId,
        });
      }
    },
    [computeTreeDropTarget, openContentInPane, paneId, visibleTabs]
  );

  const [{ isTreeDropHover }, connectTreeDrop] = useDrop<
    ArboristDragItem,
    void,
    { isTreeDropHover: boolean }
  >(
    () => ({
      accept: ARBORIST_DRAG_TYPE,
      canDrop: () => useTreeDragStore.getState().draggingNode !== null,
      hover: (_item, monitor) => {
        const offset = monitor.getClientOffset();
        if (!offset) return;
        const target = computeTreeDropTarget(offset.x);
        if (!target) return;
        if (treeDropIndexRef.current !== target.index) {
          treeDropIndexRef.current = target.index;
          setTreeDropTarget(target);
        }
      },
      drop: (_item, monitor) => {
        const offset = monitor.getClientOffset();
        if (offset) handleTreeNodeDrop(offset.x);
      },
      collect: (monitor) => ({
        isTreeDropHover: monitor.isOver() && monitor.canDrop(),
      }),
    }),
    [computeTreeDropTarget, handleTreeNodeDrop]
  );

  useEffect(() => {
    if (isTreeDropHover) return;
    treeDropIndexRef.current = null;
    setTreeDropTarget(null);
  }, [isTreeDropHover]);

  const updateTabRects = useCallback(() => {
    const nextRects: Record<string, DOMRect | null> = {};
    for (const tab of visibleTabs) {
      nextRects[tab.id] = tabElementsRef.current.get(tab.id)?.getBoundingClientRect() ?? null;
    }
    setTabRects(nextRects);
  }, [visibleTabs]);

  useEffect(() => {
    updateTabRects();

    const handleWindowChange = () => updateTabRects();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleWindowChange);
    for (const tab of visibleTabs) {
      const element = tabElementsRef.current.get(tab.id);
      if (element) resizeObserver?.observe(element);
    }

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
      resizeObserver?.disconnect();
    };
  }, [visibleTabs, updateTabRects]);

  useEffect(() => {
    if (tabContentIds.length === 0) {
      setPresenceByContentId({});
      return;
    }

    let isCancelled = false;
    const sessionId = getCollaborationBrowserSessionId();

    const fetchPresence = async () => {
      try {
        const params = new URLSearchParams({
          contentIds: tabContentIds.join(","),
          excludeSessionId: sessionId,
        });
        const response = await fetch(`/api/collaboration/presence?${params.toString()}`, {
          credentials: "include",
        });
        if (!response.ok) return;

        const result = (await response.json()) as PresenceSnapshotResponse;
        if (!result.success || !result.data || isCancelled) return;

        setPresenceByContentId(result.data.presenceByContentId);
      } catch {
        // Presence is advisory; the tab UI should not block navigation.
      }
    };

    void fetchPresence();
    const interval = window.setInterval(fetchPresence, PRESENCE_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [tabContentIds]);

  useEffect(() => {
    if (!tabMenu) return;

    const closeMenu = () => setTabMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [tabMenu]);

  // Close the active tab. Cmd+W and Cmd+Shift+W never reach the page — browsers
  // reserve them for Close Tab / Close Window — so we bind the two W chords that
  // do survive:
  //   Cmd+Alt+W  / Ctrl+Alt+W — primary; unbound in Chrome, Vivaldi, Edge, Firefox
  //   Cmd+Ctrl+W             — macOS fallback, since Safari takes Cmd+Alt+W
  //                            for Close Other Tabs
  // Deliberately no isTyping guard: neither chord means anything to a text field,
  // and the tab you want to close is usually the one you're editing.
  useEffect(() => {
    if (!isActivePane) return;
    const activeTabId = pane?.activeTabId;
    if (!activeTabId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;

      // Alt rewrites event.key on macOS (Alt+W yields "∑"), so match the physical
      // key first and fall back to the character for non-QWERTY layouts.
      if (event.code !== "KeyW" && event.key.toLowerCase() !== "w") return;

      // Cmd+Alt+W / Ctrl+Alt+W, or Cmd+Ctrl+W on macOS.
      if (!event.altKey && !(event.metaKey && event.ctrlKey)) return;

      event.preventDefault();
      closeContentTab(activeTabId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeContentTab, isActivePane, pane?.activeTabId]);

  useEffect(() => {
    // Wait for the workspace snapshot: backfillTabMeta names tabs from
    // contentMeta, which resolves the common case without a fetch. Only tabs
    // genuinely uncovered by the snapshot fall through to this per-tab fetch.
    if (!workspaceStoreReady) return;
    const pendingTabs = tabs.filter((tab) => tab.title === "Loading...");
    if (pendingTabs.length === 0) return;

    let isCancelled = false;

    void Promise.all(
      pendingTabs.map(async (tab) => {
        try {
          const response = await fetch(
            tab.contentType === "page-template"
              ? `/api/content/page-templates/${tab.contentId}`
              : `/api/content/content/${tab.contentId}`,
            {
              credentials: "include",
            }
          );
          if (!response.ok) return;

          const result = await response.json();
          if (isCancelled) return;

          if (tab.contentType === "page-template") {
            updateContentTab(tab.contentId, {
              title: result.title,
              contentType: "page-template",
            });
            return;
          }

          if (!result.success) return;
          updateContentTab(tab.contentId, {
            title: result.data.title,
            contentType: result.data.contentType,
          });
        } catch {
          // Ignore hydration failures for unloaded tabs.
        }
      })
    );

    return () => {
      isCancelled = true;
    };
  }, [tabs, updateContentTab, workspaceStoreReady]);

  return (
    <>
      <div
        className={`relative z-40 flex w-full max-w-full shrink-0 items-center overflow-hidden border-b transition-colors ${
          isTreeDropHover
            ? "border-gold-primary/50 bg-gold-primary/[0.08] dark:bg-gold-primary/[0.12]"
            : isTreeNodeDragging
              ? "border-gold-primary/25 bg-gold-primary/[0.03] dark:bg-gold-primary/[0.06]"
              : "border-white/10 bg-white/[0.06] dark:bg-black/[0.5]"
        }`}
        style={{
          backdropFilter: glass1.backdropFilter,
        }}
      >
        <div
          ref={(element) => {
            tabScrollerRef.current = element;
            connectTreeDrop(element);
          }}
          className="relative flex min-w-0 max-w-full flex-1 items-stretch overflow-x-auto scrollbar-hide pr-1"
        >
          {visibleTabs.length === 0 ? (
            <div className="flex items-center px-2 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {tabs.length === 0
                ? getPaneLabel(layoutMode, paneId)
                : `${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"} hidden by filters`}
            </div>
          ) : visibleTabs.map((tab) => {
            const Icon = getTabIcon(tab.contentType);
            const isActive = tab.id === pane?.activeTabId;
            const isDragging = draggedTabId === tab.id;

            return (
              <div
                key={tab.id}
                ref={(node) => {
                  if (node) {
                    tabElementsRef.current.set(tab.id, node);
                  } else {
                    tabElementsRef.current.delete(tab.id);
                  }
                }}
                className={`group relative flex min-w-[6rem] max-w-[22rem] shrink items-center gap-1.5 overflow-hidden border-r border-r-black/[0.08] px-2 py-1.5 text-[13px] transition-colors dark:border-r-white/10 ${
                  isActive
                    ? "border-b-2 border-gold-primary bg-black/[0.04] text-gold-primary shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-white/[0.04]"
                    : "text-gray-600 hover:bg-black/[0.035] hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05] dark:hover:text-white"
                } ${isDragging ? "cursor-grabbing opacity-60" : "cursor-grab"}`}
                data-pane-id={paneId}
                draggable
                onPointerEnter={() => {
                  // Best-effort prefetch for inactive tabs — the active tab
                  // is already loaded. Warms the server cache so a click
                  // hits in <1ms.
                  if (!isActive && tab.contentId) {
                    prefetchContent(tab.contentId);
                  }
                }}
                onContextMenu={(event) => {
                  if (shellTabMenuSections.length === 0 && !isPanelEmbed) return;
                  event.preventDefault();
                  setTabMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", tab.id);
                  onTabDragStart(tab.id, paneId);
                }}
                onDragEnd={onTabDragEnd}
                onDragOver={(event) => {
                  if (!draggedTabId || draggedTabId === tab.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  if (!draggedTabId) return;
                  if (draggedTabId === tab.id) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onTabDrop(paneId, tab.id);
                }}
              >
                <TabPresenceDiscs
                  sessions={presenceByContentId[tab.contentId] ?? []}
                  anchorRect={tabRects[tab.id] ?? null}
                />
                {/* Lazy expiry warning for borrowed (temporary) tabs */}
                <BorrowedTabBadge contentId={tab.contentId} />
                {editingTabId === tab.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => commitRename(tab)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitRename(tab); }
                      if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none border-b border-gold-primary/60 focus:border-gold-primary"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left"
                    onClick={() => activateContentTab(tab.id)}
                    onDoubleClick={(e) => { e.preventDefault(); startRename(tab.id, tab.title); }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{tab.title}</span>
                  </button>
                )}
                <span className="absolute inset-y-0 right-0 flex items-center px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    type="button"
                    className={`rounded p-0.5 transition-colors ${
                      isActive
                        ? "bg-[#f5f1e8] text-gold-primary hover:bg-[#ede7d5] dark:bg-[#2a2218]"
                        : "bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:bg-[#1e2830] dark:text-gray-300 dark:hover:bg-[#253340]"
                    }`}
                    aria-label={`Close ${tab.title}`}
                    onClick={() => closeContentTab(tab.id)}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              </div>
            );
          })}
          {isTreeDropHover && treeDropTarget ? (
            // Insertion caret for a file-tree drop: marks the exact slot the
            // tab will land in — before a tab, between tabs, or at the end.
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0.5 z-50 w-0.5 rounded-full bg-gold-primary shadow-[0_0_6px_rgba(201,168,108,0.6)]"
              style={{ left: treeDropTarget.left }}
            />
          ) : null}
        </div>
      </div>
      {tabMenu && tabMenuTab ? (
        <div
          className="fixed z-50 min-w-56 rounded-md border border-white/10 bg-white/95 p-1 text-sm text-gray-900 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 dark:text-gray-100"
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Side panel only: project this tab onto the page. Drag-to-corner
              gives precise placement; this is the one-click default. */}
          {isPanelEmbed && tabMenuTab.contentId ? (
            <>
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Page
              </div>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => {
                  requestOverlayOpen(tabMenuTab.contentId as string);
                  setTabMenu(null);
                }}
              >
                Open as overlay
              </button>
            </>
          ) : null}
          {shellTabMenuSections.map((Section) =>
            createElement(Section, {
              key: Section.displayName ?? Section.name,
              tab: tabMenuTab,
              closeMenu: () => setTabMenu(null),
            })
          )}
        </div>
      ) : null}
    </>
  );
}
