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

import { useState, useEffect } from "react";
import { type NodeRendererProps } from "react-arborist";
import * as LucideIcons from "lucide-react";
import {
  Folder,
  FolderOpen,
  FileText,
  File,
  FileCode,
  Code,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Image,
  Columns3,
  LayoutDashboard,
  Network,
  FileVideo,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  Braces,
  Archive,
  FileType,
  Pencil,
  GitBranch,
  BarChart3,
  MessageCircle,
} from "lucide-react";
import { useContextMenuStore } from "@/state/context-menu-store";
import { useContentStore } from "@/state/content-store";
import { toast } from "sonner";
import type { TreeNode } from "@/lib/domain/content/types";
import { getDisplayExtension, splitFilenameForDisplay } from "@/lib/domain/content/file-extension-utils";
import { FileNameInput } from "@/components/common/FileNameInput";

interface FileNodeProps extends NodeRendererProps<TreeNode> {
  onRename?: (id: string, name: string) => Promise<void>;
  onCreate?: (
    parentId: string | null,
    type: "folder" | "note" | "file" | "code" | "html" | "docx" | "xlsx" | "external" | "chat" | "visualization" | "data" | "hope" | "workflow"
  ) => Promise<void>;
  onDelete?: (id: string | string[]) => Promise<void>;
  onDuplicate?: (ids: string[]) => Promise<void>;
  onDownload?: (ids: string[]) => Promise<void>;
  onChangeIcon?: (id: string) => void;
  /** Phase 2: Folder view mode switching */
  onSetFolderView?: (id: string, viewMode: "list" | "gallery" | "kanban" | "dashboard" | "canvas") => Promise<void>;
  /** Phase 2: Toggle referenced content visibility for folder */
  onToggleReferencedContent?: (id: string, currentValue: boolean) => Promise<void>;
  /** Visualization engine-specific creators */
  onCreateVisualizationMermaid?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationExcalidraw?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationDiagramsNet?: (parentId: string | null) => Promise<void>;
}

export function FileNode({ node, style, dragHandle, onRename, onCreate, onDelete, onDuplicate, onDownload, onChangeIcon, onSetFolderView, onToggleReferencedContent, onCreateVisualizationMermaid, onCreateVisualizationExcalidraw, onCreateVisualizationDiagramsNet }: FileNodeProps) {
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

  // Get display extension for orthodox files
  const displayExtension = getDisplayExtension(data);
  const { basename, extension } = splitFilenameForDisplay(data.title, displayExtension);

  // Local state for editing value (controlled input)
  const [editingValue, setEditingValue] = useState(basename);

  // Reset editing value when entering edit mode
  useEffect(() => {
    if (node.isEditing) {
      setEditingValue(basename);
    }
  }, [node.isEditing, basename]);

  // Get icon based on content type or custom icon
  const getIcon = () => {
    const iconSize = "h-4 w-4";
    const iconColor = data.iconColor || "text-gray-400";

    // Render custom icon if set
    if (data.customIcon) {
      if (data.customIcon.startsWith("emoji:")) {
        const emoji = data.customIcon.replace("emoji:", "");
        return <span className="text-base">{emoji}</span>;
      } else if (data.customIcon.startsWith("lucide:")) {
        const iconName = data.customIcon.replace("lucide:", "");
        // Dynamically import the Lucide icon
        const LucideIcon = (LucideIcons as any)[iconName];
        if (LucideIcon) {
          return <LucideIcon className={`${iconSize} ${iconColor}`} />;
        }
      }
    }

    if (isFolder) {
      // Show different icon based on folder view mode
      const viewMode = data.folder?.viewMode;

      switch (viewMode) {
        case "gallery":
          return <Image className={`${iconSize} ${iconColor}`} />;
        case "kanban":
          return <Columns3 className={`${iconSize} ${iconColor}`} />;
        case "dashboard":
          return <LayoutDashboard className={`${iconSize} ${iconColor}`} />;
        case "canvas":
          return <Network className={`${iconSize} ${iconColor}`} />;
        case "list":
        default:
          // Default folder icon (open/closed)
          return isOpen ? (
            <FolderOpen className={`${iconSize} ${iconColor}`} />
          ) : (
            <Folder className={`${iconSize} ${iconColor}`} />
          );
      }
    }

    switch (data.contentType) {
      case "note":
        return <FileText className={`${iconSize} ${iconColor}`} />;
      case "file":
        // Check mimeType for specific file type icons
        if (data.file?.mimeType) {
          const mimeType = data.file.mimeType.toLowerCase();

          // Video files
          if (mimeType.startsWith("video/")) {
            return <FileVideo className={`${iconSize} ${iconColor}`} />;
          }

          // Audio files
          if (mimeType.startsWith("audio/")) {
            return <FileAudio className={`${iconSize} ${iconColor}`} />;
          }

          // Image files
          if (mimeType.startsWith("image/")) {
            return <FileImage className={`${iconSize} ${iconColor}`} />;
          }

          // JSON files
          if (mimeType === "application/json") {
            return <Braces className={`${iconSize} ${iconColor}`} />;
          }

          // Spreadsheet files
          if (
            mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            mimeType === "application/vnd.ms-excel" ||
            mimeType === "text/csv"
          ) {
            return <FileSpreadsheet className={`${iconSize} ${iconColor}`} />;
          }

          // Word documents
          if (
            mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            mimeType === "application/msword"
          ) {
            return <FileText className={`${iconSize} ${iconColor}`} />;
          }

          // PDF files
          if (mimeType === "application/pdf") {
            return <FileType className={`${iconSize} ${iconColor}`} />;
          }

          // Archive files
          if (
            mimeType === "application/zip" ||
            mimeType === "application/x-zip-compressed" ||
            mimeType === "application/x-rar-compressed" ||
            mimeType === "application/x-7z-compressed" ||
            mimeType === "application/gzip" ||
            mimeType === "application/x-tar"
          ) {
            return <Archive className={`${iconSize} ${iconColor}`} />;
          }
        }

        // Default file icon
        return <File className={`${iconSize} ${iconColor}`} />;
      case "html":
      case "template":
        return <FileCode className={`${iconSize} ${iconColor}`} />;
      case "code":
        return <Code className={`${iconSize} ${iconColor}`} />;
      case "external":
        return <ExternalLink className={`${iconSize} ${iconColor}`} />;
      case "chat":
        return <MessageCircle className={`${iconSize} ${iconColor}`} />;
      case "visualization":
        // Show engine-specific icon
        const engine = data.visualization?.engine;
        switch (engine) {
          case "diagrams-net":
            return <Network className={`${iconSize} ${iconColor}`} />;
          case "excalidraw":
            return <Pencil className={`${iconSize} ${iconColor}`} />;
          case "mermaid":
            return <GitBranch className={`${iconSize} ${iconColor}`} />;
          default:
            return <BarChart3 className={`${iconSize} ${iconColor}`} />;
        }
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
          includeReferencedContent: data.folder?.includeReferencedContent || false, // Phase 2: Folder setting
          externalUrl: data.external?.url, // Phase 2: External link URL
          file: data.file || null, // For supportsCustomIcon check
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
        onChangeIcon: onChangeIcon ? (id: string) => {
          onChangeIcon(id);
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
        // Phase 2: New content types
        onCreateExternal: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateExternal called with parentId:", parentId);
          await onCreate(parentId, "external");
        } : undefined,
        onCreateChat: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateChat called with parentId:", parentId);
          await onCreate(parentId, "chat");
        } : undefined,
        // Visualization engine-specific callbacks
        onCreateVisualizationMermaid: onCreateVisualizationMermaid ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateVisualizationMermaid called with parentId:", parentId);
          await onCreateVisualizationMermaid(parentId);
        } : undefined,
        onCreateVisualizationExcalidraw: onCreateVisualizationExcalidraw ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateVisualizationExcalidraw called with parentId:", parentId);
          await onCreateVisualizationExcalidraw(parentId);
        } : undefined,
        onCreateVisualizationDiagramsNet: onCreateVisualizationDiagramsNet ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateVisualizationDiagramsNet called with parentId:", parentId);
          await onCreateVisualizationDiagramsNet(parentId);
        } : undefined,
        onCreateData: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateData called with parentId:", parentId);
          await onCreate(parentId, "data");
        } : undefined,
        onCreateHope: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateHope called with parentId:", parentId);
          await onCreate(parentId, "hope");
        } : undefined,
        onCreateWorkflow: onCreate ? async (parentId: string | null) => {
          console.log("[FileNode] onCreateWorkflow called with parentId:", parentId);
          await onCreate(parentId, "workflow");
        } : undefined,
        onDownload: onDownload ? async (ids: string[]) => {
          await onDownload(ids);
        } : undefined,
        /** Phase 2: Folder view mode switching */
        onSetFolderView: onSetFolderView ? async (id: string, viewMode: "list" | "gallery" | "kanban" | "dashboard" | "canvas") => {
          console.log("[FileNode] onSetFolderView called with id:", id, "viewMode:", viewMode);
          await onSetFolderView(id, viewMode);
        } : undefined,
        /** Phase 2: Toggle referenced content visibility */
        onToggleReferencedContent: onToggleReferencedContent ? async (id: string, currentValue: boolean) => {
          console.log("[FileNode] onToggleReferencedContent called with id:", id, "currentValue:", currentValue);
          await onToggleReferencedContent(id, currentValue);
        } : undefined,
        /** Phase 2: Edit external link */
        onEditExternal: async (id: string) => {
          console.log("[FileNode] onEditExternal called with id:", id);
          // This will be handled by LeftSidebarContent
          // Trigger a custom event that LeftSidebarContent can listen for
          window.dispatchEvent(new CustomEvent('edit-external-link', { detail: { id } }));
        },
        /** Phase 2: Copy external URL */
        onCopyExternalUrl: async (_id: string, url: string) => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("URL copied to clipboard");
          } catch (err) {
            console.error("[FileNode] Failed to copy URL:", err);
            toast.error("Failed to copy URL");
          }
        },
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
        <span data-file-icon>{getIcon()}</span>
      </div>
      <span
        className={`
          flex-1 truncate text-sm
          ${node.isSelected ? "font-medium" : ""}
          ${data.deletedAt ? "line-through opacity-50" : ""}
        `}
      >
        {node.isEditing ? (
          <FileNameInput
            value={editingValue}
            extension={extension}
            onChange={(value) => {
              setEditingValue(value);
            }}
            onBlur={() => {
              node.submit(editingValue);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                node.submit(editingValue);
              } else if (e.key === "Escape") {
                node.reset();
              }
            }}
            autoFocus
            className="w-full bg-transparent border-b border-primary focus:outline-none"
          />
        ) : (
          <>
            <span>{basename}</span>
            {extension && (
              <span className="text-gray-500">{extension}</span>
            )}
          </>
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
