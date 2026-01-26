/**
 * FileNode Component
 *
 * Renders individual nodes in the file tree.
 * Supports:
 * - Custom icons and colors
 * - Content type indicators
 * - Multi-selection (Cmd+Click, Shift+Click)
 * - Context menu (right-click)
 * - Keyboard navigation
 *
 * M4: File Tree Completion - Context Menu & Multi-Selection
 */

"use client";

import { type NodeRendererProps } from "react-arborist";
import {
  Folder,
  FolderOpen,
  FileText,
  File,
  FileCode,
  Code,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useContextMenuStore } from "@/state/context-menu-store";
import { useContentStore } from "@/state/content-store";
import type { TreeNode } from "@/lib/domain/content/types";

interface FileNodeProps extends NodeRendererProps<TreeNode> {
  onRename?: (id: string, name: string) => Promise<void>;
  onCreate?: (parentId: string | null, type: "folder" | "note" | "file" | "code" | "html" | "docx" | "xlsx") => Promise<void>;
  onDelete?: (id: string | string[]) => Promise<void>;
  onDuplicate?: (ids: string[]) => Promise<void>;
  onDownload?: (ids: string[]) => Promise<void>;
}

export function FileNode({ node, style, dragHandle, onRename, onCreate, onDelete, onDuplicate, onDownload }: FileNodeProps) {
  const { data } = node;
  const isFolder = data.contentType === "folder";
  const isOpen = node.isOpen;

  const { openMenu } = useContextMenuStore();
  const selectedContentId = useContentStore((state) => state.selectedContentId);

  // Three-state selection system:
  // 1. Active: This file is open in the editor (brightest)
  // 2. Selected: This file is selected in tree (medium)
  // 3. Multi-selected: Part of multi-selection (subtle)
  const isActive = data.id === selectedContentId;
  const isSelected = node.isSelected;
  const tree = node.tree;
  const isMultiSelected = isSelected && tree.selectedNodes && tree.selectedNodes.length > 1;

  // Get icon based on content type or custom icon
  const getIcon = () => {
    const iconSize = "h-4 w-4";
    const iconColor = data.iconColor || "text-gray-400";

    // If custom icon is set, you could render it here
    // For now, we'll use default icons based on content type

    if (isFolder) {
      return isOpen ? (
        <FolderOpen className={`${iconSize} ${iconColor}`} />
      ) : (
        <Folder className={`${iconSize} ${iconColor}`} />
      );
    }

    switch (data.contentType) {
      case "note":
        return <FileText className={`${iconSize} ${iconColor}`} />;
      case "file":
        return <File className={`${iconSize} ${iconColor}`} />;
      case "html":
      case "template":
        return <FileCode className={`${iconSize} ${iconColor}`} />;
      case "code":
        return <Code className={`${iconSize} ${iconColor}`} />;
      default:
        return <File className={`${iconSize} ${iconColor}`} />;
    }
  };

  // Get chevron for folders
  const getChevron = () => {
    if (!isFolder || !node.children || node.children.length === 0) {
      return <div className="h-4 w-4" />; // Empty space for alignment
    }

    return isOpen ? (
      <ChevronDown className="h-4 w-4 text-gray-400" />
    ) : (
      <ChevronRight className="h-4 w-4 text-gray-400" />
    );
  };

  // Handle click - handle both selection and folder toggle
  const handleClick = (e: React.MouseEvent) => {
    // Multi-selection with modifiers
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+Click: toggle this node in multi-selection
      e.preventDefault();
      e.stopPropagation();

      // Manual toggle: deselect if already selected, otherwise add to selection
      if (node.isSelected) {
        node.deselect();
      } else {
        node.selectMulti();
      }
      return;
    }

    if (e.shiftKey) {
      // Shift+Click: range selection
      e.preventDefault();
      e.stopPropagation();
      node.selectContiguous();
      return;
    }

    // Normal click
    // - For folders: toggle open/closed AND select
    // - For files: just select
    if (isFolder) {
      node.toggle(); // This will both select and toggle the folder
    } else {
      node.select(); // Just select the file
    }
  };

  // Handle context menu (right-click)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If right-clicking on a non-selected node, select it first
    if (!node.isSelected) {
      node.select();
    }

    // Get currently selected node IDs from the tree
    const tree = node.tree;
    const selectedIds = tree.selectedNodes?.map((n: any) => n.id) || [data.id];

    openMenu(
      "file-tree",
      { x: e.clientX, y: e.clientY },
      {
        selectedIds,
        clickedId: data.id,
        clickedNode: {
          id: data.id,
          title: data.title,
          contentType: data.contentType,
          isFolder,
          parentId: data.parentId, // Add parentId for sibling creation logic
        },
        // Pass callbacks to context menu
        onRename: () => {
          // Trigger inline edit mode for this node
          node.edit();
        },
        onDelete: onDelete ? async (ids: string[]) => {
          // Pass all IDs at once for batch delete with single confirmation
          await onDelete(ids);
        } : undefined,
        onDuplicate: onDuplicate ? async (ids: string[]) => {
          await onDuplicate(ids);
        } : undefined,
        onCreateNote: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateNote called with parentId:", parentId);
          await onCreate(parentId, "note");
        } : undefined,
        onCreateFolder: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateFolder called with parentId:", parentId);
          await onCreate(parentId, "folder");
        } : undefined,
        onCreateFile: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateFile called with parentId:", parentId);
          await onCreate(parentId, "file");
        } : undefined,
        onCreateCode: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateCode called with parentId:", parentId);
          await onCreate(parentId, "code");
        } : undefined,
        onCreateHtml: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateHtml called with parentId:", parentId);
          await onCreate(parentId, "html");
        } : undefined,
        onCreateDocument: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateDocument called with parentId:", parentId);
          await onCreate(parentId, "docx");
        } : undefined,
        onCreateSpreadsheet: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateSpreadsheet called with parentId:", parentId);
          await onCreate(parentId, "xlsx");
        } : undefined,
        onDownload: onDownload ? async (ids: string[]) => {
          await onDownload(ids);
        } : undefined,
      }
    );
  };

  // Three-state visual styling
  const getBackgroundStyle = () => {
    if (node.state.willReceiveDrop && isFolder) {
      return "bg-primary/30 ring-1 ring-primary/50"; // Drop target
    }
    if (isActive) {
      return "bg-primary/20 text-primary font-medium"; // Active in panel (brightest)
    }
    if (isMultiSelected) {
      return "bg-white/8 text-gray-300"; // Multi-selected (subtle)
    }
    if (isSelected) {
      return "bg-primary/10 text-primary"; // Selected but not active (medium)
    }
    return "hover:bg-white/5"; // Default hover
  };

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`
        flex items-center gap-2 px-2 py-1 cursor-pointer
        transition-colors duration-150
        ${getBackgroundStyle()}
        ${node.state.isDragging ? "opacity-50" : ""}
      `}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="flex items-center gap-1">
        {getChevron()}
        {getIcon()}
      </div>
      <span
        className={`
          flex-1 truncate text-sm
          ${node.isSelected ? "font-medium" : ""}
          ${data.deletedAt ? "line-through opacity-50" : ""}
        `}
      >
        {node.isEditing ? (
          <input
            type="text"
            defaultValue={data.title}
            onBlur={(e) => node.submit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                node.submit(e.currentTarget.value);
              } else if (e.key === "Escape") {
                node.reset();
              }
            }}
            autoFocus
            className="w-full bg-transparent border-b border-primary focus:outline-none"
          />
        ) : (
          data.title
        )}
      </span>

      {/* Upload status indicator for files */}
      {data.file && data.file.uploadStatus === "uploading" && (
        <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
      )}
      {data.file && data.file.uploadStatus === "failed" && (
        <div className="h-2 w-2 rounded-full bg-red-500" title="Upload failed" />
      )}

      {/* Published indicator */}
      {!data.isPublished && (
        <div
          className="h-2 w-2 rounded-full bg-gray-500"
          title="Draft (not published)"
        />
      )}
    </div>
  );
}
