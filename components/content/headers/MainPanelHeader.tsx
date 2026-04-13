"use client";

import { createElement, useEffect, useMemo, useState, useRef, useCallback } from "react";
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

interface PresenceSnapshotResponse {
  success: boolean;
  data?: {
    presenceByContentId: Record<string, TabPresenceSession[]>;
  };
}

const PRESENCE_POLL_INTERVAL_MS = 15_000;
const VISITOR_ADJECTIVES = ["Silver", "Quiet", "Golden", "Bright", "Gentle", "Blue"];
const VISITOR_TRAITS = ["Windy", "Curious", "Clever", "Sunny", "Brisk", "Calm"];
const VISITOR_ANIMALS = ["Raccoon", "Fox", "Heron", "Otter", "Finch", "Badger"];

function getTabIcon(contentType: string | null) {
  switch (contentType) {
    case "note":
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

function TabPresenceDiscs({ sessions }: { sessions: TabPresenceSession[] }) {
  if (sessions.length === 0) return null;

  return (
    <div className="group/presence absolute -top-2 right-7 z-20 flex max-w-[8rem] items-center overflow-visible pr-1">
      {sessions.slice(0, 5).map((session, index) => {
        const displayName =
          session.displayName?.trim() || getVisitorName(session.sessionId || session.userId);
        const initials = getInitials(displayName);
        const colorIndex = hashString(session.userId || session.sessionId) % 5;
        const colors = [
          "bg-blue-500",
          "bg-emerald-500",
          "bg-violet-500",
          "bg-amber-500",
          "bg-rose-500",
        ];

        return (
          <div
            key={session.sessionId}
            className="group/card relative -ml-2 first:ml-0 transition-all duration-150 group-hover/presence:ml-1"
            style={{ zIndex: sessions.length - index }}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-background text-[10px] font-semibold uppercase text-white shadow-sm ${
                colors[colorIndex]
              }`}
              aria-label={displayName}
            >
              {session.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-7 z-50 w-44 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity delay-300 group-hover/card:opacity-100">
              <p className="truncate font-medium">{displayName}</p>
              {session.isAnonymous ? (
                <p className="text-muted-foreground">Public viewer</p>
              ) : (
                <>
                  <p className="text-muted-foreground">{formatSessionStart(session.firstSeenAt)}</p>
                  <p className="text-muted-foreground">
                    {session.surfaceCount} active {session.surfaceCount === 1 ? "view" : "views"}
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })}
      {sessions.length > 5 ? (
        <div className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground transition-all duration-150 group-hover/presence:ml-1">
          +{sessions.length - 5}
        </div>
      ) : null}
    </div>
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
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback((tabId: string, currentTitle: string) => {
    setEditingTabId(tabId);
    setEditingTitle(currentTitle);
    // Focus input on next tick after render
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(async (tab: { id: string; contentId: string; title: string }) => {
    const newTitle = editingTitle.trim();
    setEditingTabId(null);
    if (!newTitle || newTitle === tab.title) return;

    // Optimistic update
    updateContentTab(tab.contentId, { title: newTitle });

    try {
      const response = await fetch(`/api/content/content/${tab.contentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!response.ok) throw new Error("Failed to rename");
      // Notify tree to refresh title
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
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
    const pendingTabs = tabs.filter((tab) => tab.title === "Loading...");
    if (pendingTabs.length === 0) return;

    let isCancelled = false;

    void Promise.all(
      pendingTabs.map(async (tab) => {
        try {
          const response = await fetch(`/api/content/content/${tab.contentId}`, {
            credentials: "include",
          });
          if (!response.ok) return;

          const result = await response.json();
          if (!result.success || isCancelled) return;

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
        className="flex w-full max-w-full shrink-0 items-center overflow-visible border-b border-white/10"
        style={{
          background: glass1.background,
          backdropFilter: glass1.backdropFilter,
        }}
      >
        <div className="flex min-w-0 max-w-full flex-1 items-stretch overflow-visible pr-1">
          {tabs.length === 0 ? (
            <div className="flex items-center px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
              {getPaneLabel(layoutMode, paneId)}
            </div>
          ) : tabs.map((tab) => {
            const Icon = getTabIcon(tab.contentType);
            const isActive = tab.id === pane?.activeTabId;
            const isDragging = draggedTabId === tab.id;

            return (
              <div
                key={tab.id}
                className={`group relative flex min-w-0 max-w-[14rem] shrink items-center gap-2 overflow-visible border-r border-white/10 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "-mb-px border-b-2 border-gold-primary bg-black/[0.04] text-gold-primary shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
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
                <TabPresenceDiscs sessions={presenceByContentId[tab.contentId] ?? []} />
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
                    className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left"
                    onClick={() => activateContentTab(tab.id)}
                    onDoubleClick={(e) => { e.preventDefault(); startRename(tab.id, tab.title); }}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{tab.title}</span>
                  </button>
                )}
                <span
                  className={`ml-auto flex shrink-0 items-center ${
                    isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                  }`}
                >
                  <span
                    className={`mr-1 h-1.5 w-1.5 rounded-full ${
                      tab.isPinned ? "bg-gold-primary/80" : "bg-transparent"
                    }`}
                  />
                  <button
                    type="button"
                    className={`rounded p-0.5 transition-colors ${
                      isActive
                        ? "hover:bg-gold-primary/10 hover:text-gold-primary"
                        : "hover:bg-black/[0.05] hover:text-gray-900"
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
