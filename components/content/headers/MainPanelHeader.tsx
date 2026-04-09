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
  const tabMenuTab = tabMenu ? tabsById[tabMenu.tabId] : null;

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
        className="flex w-full max-w-full shrink-0 items-center overflow-hidden border-b border-white/10 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),0_2px_6px_rgba(15,23,42,0.04)]"
        style={{
          background: glass1.background,
          backdropFilter: glass1.backdropFilter,
        }}
      >
        <div className="flex min-w-0 max-w-full flex-1 items-stretch overflow-hidden pr-1">
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
                className={`group flex min-w-0 max-w-[14rem] shrink items-center gap-2 overflow-hidden border-r border-white/10 px-3 py-2 text-sm transition-colors ${
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
