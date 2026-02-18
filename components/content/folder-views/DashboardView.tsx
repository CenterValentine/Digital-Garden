/**
 * Dashboard View
 *
 * Rearrangeable tile layout using react-grid-layout.
 * Displays content as tiles that can be resized and repositioned.
 * M9 Phase 2: FolderPayload support
 */

"use client";

import { useState, useEffect } from "react";
import GridLayout, { Layout, verticalCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { FileText, Folder, File as FileIcon, Image as ImageIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import type { FolderViewProps } from "./FolderViewContainer";
import { getDisplayExtension } from "@/lib/domain/content/file-extension-utils";

interface ContentChild {
  id: string;
  title: string;
  contentType: string;
  displayOrder: number;
  note?: {
    searchText: string;
  };
  file?: {
    mimeType: string;
    url?: string | null;
    thumbnailUrl?: string | null;
  };
}

export function DashboardView({
  folderId,
  folderTitle,
  viewPrefs = {},
  onUpdateView,
}: FolderViewProps) {
  const glass0 = getSurfaceStyles("glass-0");
  const [items, setItems] = useState<ContentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<Layout>([]);

  useEffect(() => {
    loadItems();
  }, [folderId]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/content/content?parentId=${folderId}`);

      if (!response.ok) {
        throw new Error("Failed to load folder contents");
      }

      const data = await response.json();
      const loadedItems = data.data?.items || data.items || [];
      setItems(loadedItems);

      // Initialize grid layout from viewPrefs or create default
      const savedLayout = viewPrefs.layout as Layout | undefined;
      if (savedLayout && savedLayout.length > 0) {
        setLayout(savedLayout);
      } else {
        // Create default grid layout
        const defaultLayout = loadedItems.map((item: ContentChild, index: number) => ({
          i: item.id,
          x: (index % 3) * 4,
          y: Math.floor(index / 3) * 3,
          w: 4,
          h: 3,
        }));
        setLayout(defaultLayout);
      }
    } catch (error) {
      console.error("[DashboardView] Error loading items:", error);
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleLayoutChange = (newLayout: Layout) => {
    setLayout(newLayout);

    // Save layout to viewPrefs (debounced)
    if (onUpdateView) {
      // Use setTimeout to debounce saves during drag
      setTimeout(async () => {
        try {
          await onUpdateView({
            viewPrefs: {
              ...viewPrefs,
              layout: newLayout,
            },
          });
        } catch (error) {
          console.error("[DashboardView] Failed to save layout:", error);
        }
      }, 500);
    }
  };

  const handleItemClick = (item: ContentChild) => {
    // Trigger content selection
    window.dispatchEvent(
      new CustomEvent("content-selected", {
        detail: { contentId: item.id },
      })
    );
  };

  const getIcon = (contentType: string) => {
    switch (contentType) {
      case "folder":
        return <Folder className="h-5 w-5" />;
      case "note":
        return <FileText className="h-5 w-5" />;
      case "file":
        return <FileIcon className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const renderTileContent = (item: ContentChild) => {
    if (item.contentType === "file" && item.file) {
      const mimeType = item.file.mimeType.toLowerCase();
      if (mimeType.startsWith("image/")) {
        const imageUrl = item.file.thumbnailUrl || item.file.url;
        if (imageUrl) {
          return (
            <div className="h-full flex flex-col">
              <div className="flex-1 bg-black/5 rounded overflow-hidden">
                <img
                  src={imageUrl}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          );
        }
      }
    }

    if (item.contentType === "note" && item.note) {
      const preview = item.note.searchText.substring(0, 150);
      return (
        <div className="h-full flex flex-col">
          <p className="text-xs text-gray-600 line-clamp-4 flex-1">
            {preview}
          </p>
        </div>
      );
    }

    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400">{getIcon(item.contentType)}</div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <ImageIcon className="h-16 w-16 text-gray-400 mb-4" />
        <p className="text-sm text-gray-600 mb-2">No items in this folder</p>
        <p className="text-xs text-gray-500">
          Create content to see it displayed as dashboard tiles
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <GridLayout
        className="layout"
        layout={layout}
        width={1200}
        gridConfig={{
          cols: 12,
          rowHeight: 100,
          margin: [10, 10],
          containerPadding: null,
          maxRows: Infinity,
        }}
        dragConfig={{
          enabled: true,
          handle: ".drag-handle",
          bounded: false,
          threshold: 3,
        }}
        compactor={verticalCompactor}
        onLayoutChange={handleLayoutChange}
      >
        {items.map((item) => {
          const displayExtension = getDisplayExtension(item);

          return (
          <div
            key={item.id}
            className="rounded-lg border border-white/10 overflow-hidden cursor-pointer hover:border-primary/30 transition-colors"
            style={{
              background: glass0.background,
              backdropFilter: glass0.backdropFilter,
            }}
            onClick={() => handleItemClick(item)}
          >
            <div className="drag-handle cursor-move border-b border-white/10 px-3 py-2 bg-white/5">
              <div className="flex items-center gap-2">
                <div className="text-gray-600">{getIcon(item.contentType)}</div>
                <h4 className="text-sm font-medium text-gray-900 truncate flex-1">
                  {item.title}
                  {displayExtension && (
                    <span className="text-gray-600">{displayExtension}</span>
                  )}
                </h4>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleItemClick(item);
                  }}
                  className="flex-shrink-0 p-1 rounded hover:bg-white/20 transition-colors"
                  title="Open in main panel"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-gray-600" />
                </button>
              </div>
            </div>
            <div className="p-3">{renderTileContent(item)}</div>
          </div>
          );
        })}
      </GridLayout>
    </div>
  );
}
