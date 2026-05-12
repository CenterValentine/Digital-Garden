"use client";

import { createElement, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  File,
  FileCode,
  FileText,
  Folder,
  MessageCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import {
  getPaneLabel,
  useContentStore,
  type WorkspacePaneId,
} from "@/state/content-store";
import { useExtensionShellTabMenuSections } from "@/lib/extensions/client-registry";
import { getCollaborationBrowserSessionId } from "@/lib/domain/collaboration/runtime";

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

interface PresenceDisplayGroup {
  key: string;
  displayName: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  surfaceCount: number;
  sessionCount: number;
  firstSeenAt: number;
  colorSeed: string;
}

interface PresenceSnapshotResponse {
  success: boolean;
  data?: {
    presenceByContentId: Record<string, TabPresenceSession[]>;
  };
}

const PRESENCE_POLL_INTERVAL_MS = 10_000;
const VISITOR_ADJECTIVES = ["Silver", "Quiet", "Golden", "Bright", "Gentle", "Blue"];
const VISITOR_TRAITS = ["Windy", "Curious", "Clever", "Sunny", "Brisk", "Calm"];
const VISITOR_ANIMALS = ["Raccoon", "Fox", "Heron", "Otter", "Finch", "Badger"];

function getTabIcon(contentType: string | null) {
  switch (contentType) {
    case "note":
    case "page-template":
      return FileText;
    case "folder":
      return Folder;
    case "code":
    case "html":
      return FileCode;
    case "external":
      return ExternalLink;
    case "chat":
      return MessageCircle;
    default:
      return File;
  }
}

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
        const colors = [
          "bg-blue-500",
          "bg-emerald-500",
          "bg-violet-500",
          "bg-amber-500",
          "bg-rose-500",
        ];

        return (
          <div
            key={group.key}
            className="group/card relative -ml-2 first:ml-0 transition-all duration-150 group-hover/presence:ml-1"
            style={{ zIndex: groups.length - index }}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-background text-[10px] font-semibold uppercase text-white shadow-sm ${
                colors[colorIndex]
              }`}
              aria-label={group.displayName}
            >
              {group.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={group.avatarUrl} alt="" className="h-full w-full object-cover" />
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
                    {group.sessionCount} {group.sessionCount === 1 ? "session" : "sessions"} ·{" "}
                    {group.surfaceCount} active {group.surfaceCount === 1 ? "view" : "views"}
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
  const tabsById = useContentStore((state) => state.tabs);
  const activateContentTab = useContentStore((state) => state.activateContentTab);
  const closeContentTab = useContentStore((state) => state.closeContentTab);
  const updateContentTab = useContentStore((state) => state.updateContentTab);
  const shellTabMenuSections = useExtensionShellTabMenuSections();

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

  const updateTabRects = useCallback(() => {
    const nextRects: Record<string, DOMRect | null> = {};
    for (const tab of tabs) {
      nextRects[tab.id] = tabElementsRef.current.get(tab.id)?.getBoundingClientRect() ?? null;
    }
    setTabRects(nextRects);
  }, [tabs]);

  useEffect(() => {
    updateTabRects();

    const handleWindowChange = () => updateTabRects();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleWindowChange);
    for (const tab of tabs) {
      const element = tabElementsRef.current.get(tab.id);
      if (element) resizeObserver?.observe(element);
    }

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
      resizeObserver?.disconnect();
    };
  }, [tabs, updateTabRects]);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActivePane) return;
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() !== "e") return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;

      const activeTabId = pane?.activeTabId;
      if (!activeTabId) return;

      event.preventDefault();
      closeContentTab(activeTabId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeContentTab, isActivePane, pane?.activeTabId]);

  useEffect(() => {
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
  }, [tabs, updateContentTab]);

  return (
    <>
      <div
        className="relative z-40 flex w-full max-w-full shrink-0 items-center overflow-hidden border-b border-white/10 bg-white/[0.06] dark:bg-black/[0.5]"
        style={{
          backdropFilter: glass1.backdropFilter,
        }}
      >
        <div className="flex min-w-0 max-w-full flex-1 items-stretch overflow-x-auto scrollbar-hide pr-1">
          {tabs.length === 0 ? (
            <div className="flex items-center px-2 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
              {getPaneLabel(layoutMode, paneId)}
            </div>
          ) : tabs.map((tab) => {
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
                    ? "border-b-2 border-gold-primary bg-black/[0.04] text-gold-primary shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    : "text-gray-600 hover:bg-black/[0.035] hover:text-gray-900"
                } ${isDragging ? "cursor-grabbing opacity-60" : "cursor-grab"}`}
                data-pane-id={paneId}
                draggable
                onContextMenu={(event) => {
                  if (shellTabMenuSections.length === 0) return;
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
        </div>
      </div>
      {tabMenu && tabMenuTab ? (
        <div
          className="fixed z-50 min-w-56 rounded-md border border-white/10 bg-white/95 p-1 text-sm text-gray-900 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 dark:text-gray-100"
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
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
