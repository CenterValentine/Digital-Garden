"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
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

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
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
    <div
      className="flex shrink-0 items-center border-b border-white/10"
      style={{
        background: glass1.background,
        backdropFilter: glass1.backdropFilter,
      }}
    >
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-hidden">
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
              className={`group flex min-w-0 max-w-64 items-center gap-2 border-r border-white/10 px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "-mb-px border-b-2 border-gold-primary bg-black/[0.04] text-gold-primary shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                  : "text-gray-600 hover:bg-black/[0.035] hover:text-gray-900"
              } ${isDragging ? "cursor-grabbing opacity-60" : "cursor-grab"}`}
              data-pane-id={paneId}
              draggable
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
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
  );
}
