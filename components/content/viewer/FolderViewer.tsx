/**
 * Folder Viewer Component
 *
 * Displays folder contents with configurable view modes:
 * - list (default): Simple list view
 * - gallery: Media-focused grid
 * - kanban: Drag-drop cards
 * - dashboard: Rearrangeable tiles
 * - canvas: Visual graph
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Folder, List, LayoutGrid, Columns3, LayoutDashboard, Network } from "lucide-react";
import { FolderViewContainer } from "@/components/content/folder-views/FolderViewContainer";
import { toast } from "sonner";

interface FolderViewerProps {
  contentId: string;
  title: string;
  viewMode?: "list" | "gallery" | "kanban" | "dashboard" | "canvas";
  sortMode?: string | null;
  viewPrefs?: Record<string, unknown>;
  includeReferencedContent?: boolean;
}

export function FolderViewer({
  contentId,
  title,
  viewMode: initialViewMode = "list",
  sortMode = null,
  viewPrefs: initialViewPrefs = {},
  includeReferencedContent = false,
}: FolderViewerProps) {
  const [viewMode, setViewMode] = useState<"list" | "gallery" | "kanban" | "dashboard" | "canvas">(initialViewMode);
  const [viewPrefs, setViewPrefs] = useState<Record<string, unknown>>(initialViewPrefs);

  // Sync local viewMode and viewPrefs state with prop changes (for persistence)
  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  useEffect(() => {
    setViewPrefs(initialViewPrefs);
  }, [initialViewPrefs]);

  // Callback to update folder view settings
  const handleUpdateView = useCallback(
    async (updates: {
      viewMode?: "list" | "gallery" | "kanban" | "dashboard" | "canvas";
      sortMode?: string | null;
      viewPrefs?: Record<string, unknown>;
      includeReferencedContent?: boolean;
    }) => {
      try {
        const response = await fetch(`/api/content/folder/${contentId}/view`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || "Failed to update folder view");
        }

        const result = await response.json();
        console.log("[FolderViewer] View updated:", result.data);

        // Update local state
        if (updates.viewMode) {
          setViewMode(updates.viewMode);
        }
        if (updates.viewPrefs) {
          setViewPrefs(updates.viewPrefs);
        }

        toast.success("Folder view updated");
      } catch (err) {
        console.error("[FolderViewer] Failed to update view:", err);
        toast.error("Failed to update folder view", {
          description: err instanceof Error ? err.message : "An unexpected error occurred",
        });
      }
    },
    [contentId]
  );

  // Handler for view mode toggle buttons
  const handleViewModeChange = async (newMode: "list" | "gallery" | "kanban" | "dashboard" | "canvas") => {
    await handleUpdateView({ viewMode: newMode });
  };

  // View mode icons
  const viewModeIcons = {
    list: <List className="h-4 w-4" />,
    gallery: <LayoutGrid className="h-4 w-4" />,
    kanban: <Columns3 className="h-4 w-4" />,
    dashboard: <LayoutDashboard className="h-4 w-4" />,
    canvas: <Network className="h-4 w-4" />,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-2">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-gray-600" />
          <h1 className="text-sm font-medium text-gray-900 leading-tight">{title}</h1>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-1">
          {(["list", "gallery", "kanban", "dashboard", "canvas"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleViewModeChange(mode)}
              className={`rounded p-1.5 transition-colors ${
                viewMode === mode
                  ? "bg-primary/20 text-primary"
                  : "text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
              title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view`}
            >
              {viewModeIcons[mode]}
            </button>
          ))}
        </div>
      </div>

      {/* Content - Delegated to FolderViewContainer */}
      <div className="flex-1 overflow-hidden">
        <FolderViewContainer
          viewMode={viewMode}
          folderId={contentId}
          folderTitle={title}
          viewPrefs={viewPrefs}
          sortMode={sortMode}
          includeReferencedContent={includeReferencedContent}
          onUpdateView={handleUpdateView}
        />
      </div>
    </div>
  );
}
