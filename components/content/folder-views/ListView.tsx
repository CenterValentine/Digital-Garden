/**
 * List View
 *
 * Default folder view - displays children as a simple list.
 * M9 Phase 2: FolderPayload support
 */

"use client";

import { useState, useEffect } from "react";
import { Folder, FileText, File as FileIcon, Code, FileCode, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import type { FolderViewProps } from "./FolderViewContainer";
import { useContentStore } from "@/state/content-store";
import { getDisplayExtension } from "@/lib/domain/content/file-extension-utils";

interface ContentChild {
  id: string;
  title: string;
  contentType: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function ListView({
  folderId,
  folderTitle,
  sortMode,
  includeReferencedContent,
}: FolderViewProps) {
  const glass0 = getSurfaceStyles("glass-0");
  const [children, setChildren] = useState<ContentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedContentId } = useContentStore();

  useEffect(() => {
    loadChildren();
  }, [folderId, sortMode, includeReferencedContent]);

  const loadChildren = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/content/content?parentId=${folderId}`
      );

      if (!response.ok) {
        throw new Error("Failed to load folder contents");
      }

      const data = await response.json();
      let items = data.data?.items || data.items || [];

      // Apply sorting if specified
      if (sortMode === "asc") {
        items = items.sort((a: ContentChild, b: ContentChild) =>
          a.title.localeCompare(b.title)
        );
      } else if (sortMode === "desc") {
        items = items.sort((a: ContentChild, b: ContentChild) =>
          b.title.localeCompare(a.title)
        );
      } else {
        // null = manual order via displayOrder
        items = items.sort((a: ContentChild, b: ContentChild) =>
          a.displayOrder - b.displayOrder
        );
      }

      setChildren(items);
    } catch (error) {
      console.error("[ListView] Error loading children:", error);
      toast.error("Failed to load folder contents");
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (contentType: string) => {
    switch (contentType) {
      case "folder":
        return <Folder className="h-4 w-4" />;
      case "note":
        return <FileText className="h-4 w-4" />;
      case "file":
        return <FileIcon className="h-4 w-4" />;
      case "code":
        return <Code className="h-4 w-4" />;
      case "html":
      case "template":
        return <FileCode className="h-4 w-4" />;
      case "external":
        return <ExternalLink className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const handleItemClick = (child: ContentChild) => {
    // Trigger content selection
    window.dispatchEvent(
      new CustomEvent("content-selected", {
        detail: { contentId: child.id },
      })
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-600">Loading folder contents...</div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <Folder className="h-16 w-16 text-gray-400 mb-4" />
        <p className="text-sm text-gray-600 mb-2">This folder is empty</p>
        <p className="text-xs text-gray-500">
          Create new content using the "+" button or context menu
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-2">
        {children.map((child) => {
          const isSelected = child.id === selectedContentId;
          const displayExtension = getDisplayExtension(child);

          return (
            <button
              key={child.id}
              onClick={() => handleItemClick(child)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                  : "border-white/10 hover:bg-white/5"
              }`}
              style={
                isSelected
                  ? undefined
                  : {
                      background: glass0.background,
                      backdropFilter: glass0.backdropFilter,
                    }
              }
            >
              <div className={isSelected ? "text-primary" : "text-gray-600"}>
                {getIcon(child.contentType)}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-gray-900"}`}>
                  {child.title}
                  {displayExtension && (
                    <span className="text-gray-600">{displayExtension}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {child.contentType === "folder" ? "Folder" : "Document"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
