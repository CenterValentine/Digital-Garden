/**
 * File Tree Context Menu Actions
 *
 * Provides context menu actions for the file tree panel.
 * Supports single and multi-selection operations.
 *
 * M4: File Tree Completion - File Tree Context Menu
 */

import {
  File,
  Folder,
  Edit,
  Trash2,
  Copy,
  Scissors,
  Star,
  Palette,
  Share2,
  Download,
  RefreshCw,
  FileCode,
  Code,
  Plus,
  FileType,
  FileSpreadsheet,
} from "lucide-react";
import type { ContextMenuActionProvider, ContextMenuSection } from "./types";

/**
 * Context passed to file tree action provider
 */
export interface FileTreeContext {
  /** Selected node IDs */
  selectedIds: string[];
  /** Clicked node ID (may not be selected) */
  clickedId?: string;
  /** Node data for clicked node */
  clickedNode?: {
    id: string;
    title: string;
    contentType: string;
    isFolder: boolean;
    parentId?: string | null;
  };
  /** Callbacks */
  onRename?: (id: string) => void; // Triggers inline edit mode
  onDelete?: (ids: string[]) => Promise<void>;
  onDuplicate?: (ids: string[]) => Promise<void>;
  onCopy?: (ids: string[]) => void;
  onCut?: (ids: string[]) => void;
  onPaste?: (parentId: string) => Promise<void>;
  onToggleStar?: (ids: string[]) => Promise<void>;
  onChangeIcon?: (id: string) => void;
  onShare?: (ids: string[]) => void;
  onDownload?: (ids: string[]) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onCreateNote?: (parentId: string | null) => Promise<void>;
  onCreateFolder?: (parentId: string | null) => Promise<void>;
  onCreateFile?: (parentId: string | null) => Promise<void>;
  onCreateCode?: (parentId: string | null) => Promise<void>;
  onCreateHtml?: (parentId: string | null) => Promise<void>;
  onCreateDocument?: (parentId: string | null) => Promise<void>;
  onCreateSpreadsheet?: (parentId: string | null) => Promise<void>;
  /** Clipboard state */
  hasClipboard?: boolean;
}

/**
 * File tree action provider
 *
 * Adapts menu based on:
 * - Single vs. multi-selection
 * - Folder vs. file
 * - Clipboard state
 */
export const fileTreeActionProvider: ContextMenuActionProvider = (ctx) => {
  const context = ctx as FileTreeContext;
  const {
    selectedIds = [],
    clickedId,
    clickedNode,
    onRename,
    onDelete,
    onDuplicate,
    onCopy,
    onCut,
    onPaste,
    onToggleStar,
    onChangeIcon,
    onShare,
    onDownload,
    onRefresh,
    onCreateNote,
    onCreateFolder,
    onCreateFile,
    onCreateCode,
    onCreateHtml,
    onCreateDocument,
    onCreateSpreadsheet,
    hasClipboard = false,
  } = context;

  const sections: ContextMenuSection[] = [];
  const isSingleSelection = selectedIds.length === 1;
  const isMultiSelection = selectedIds.length > 1;
  const isFolder = clickedNode?.isFolder || false;

  // Section 1: Create actions (always show for single selection or empty space)
  // Behavior:
  // - Right-click on folder → Create inside folder (as children)
  // - Right-click on file → Create as sibling (same parent as file)
  // - Right-click on empty space → Create at root level
  if (isSingleSelection || !clickedId) {
    // Determine target parent ID based on what was clicked
    let targetId: string | null;

    if (!clickedId) {
      // Empty space → root level
      targetId = null;
    } else if (isFolder) {
      // Folder → create inside it (children)
      targetId = clickedId;
    } else {
      // File → create as sibling (same parent)
      targetId = clickedNode?.parentId || null;
    }

    sections.push({
      title: "New",
      actions: [
        {
          id: "create-submenu",
          label: "New",
          icon: <Plus className="h-4 w-4" />,
          submenu: [
            {
              id: "new-note",
              label: "Note (Markdown)",
              icon: <File className="h-4 w-4" />,
              shortcut: "A",
              onClick: () => {
                console.log("[file-tree-actions] Note clicked, targetId:", targetId, "onCreateNote:", !!onCreateNote);
                onCreateNote?.(targetId || null);
              },
              disabled: !onCreateNote,
            },
            {
              id: "new-folder",
              label: "Folder",
              icon: <Folder className="h-4 w-4" />,
              shortcut: "⇧A",
              onClick: () => {
                console.log("[file-tree-actions] Folder clicked, targetId:", targetId, "onCreateFolder:", !!onCreateFolder);
                onCreateFolder?.(targetId || null);
              },
              disabled: !onCreateFolder,
            },
            {
              id: "new-file",
              label: "File (Upload)",
              icon: <File className="h-4 w-4" />,
              onClick: () => onCreateFile?.(targetId || null),
              disabled: !onCreateFile,
            },
            {
              id: "new-code",
              label: "Code Snippet",
              icon: <Code className="h-4 w-4" />,
              onClick: () => onCreateCode?.(targetId || null),
              disabled: !onCreateCode,
            },
            {
              id: "new-html",
              label: "HTML Document",
              icon: <FileCode className="h-4 w-4" />,
              onClick: () => onCreateHtml?.(targetId || null),
              disabled: !onCreateHtml,
            },
            {
              id: "new-document",
              label: "Word Document (.docx)",
              icon: <FileType className="h-4 w-4" />,
              onClick: () => onCreateDocument?.(targetId || null),
              disabled: !onCreateDocument,
            },
            {
              id: "new-spreadsheet",
              label: "Excel Spreadsheet (.xlsx)",
              icon: <FileSpreadsheet className="h-4 w-4" />,
              onClick: () => onCreateSpreadsheet?.(targetId || null),
              disabled: !onCreateSpreadsheet,
            },
          ],
          divider: true,
        },
      ],
    });
  }

  // Section 2: Edit actions (single selection only)
  if (isSingleSelection && clickedId) {
    sections.push({
      title: "Edit",
      actions: [
        {
          id: "rename",
          label: "Rename",
          icon: <Edit className="h-4 w-4" />,
          shortcut: "R",
          onClick: () => onRename?.(clickedId),
          disabled: !onRename,
        },
        {
          id: "change-icon",
          label: "Change Icon",
          icon: <Palette className="h-4 w-4" />,
          onClick: () => onChangeIcon?.(clickedId),
          disabled: !onChangeIcon,
          divider: true,
        },
      ],
    });
  }

  // Section 3: Clipboard actions
  if (selectedIds.length > 0) {
    const itemLabel = isMultiSelection ? `${selectedIds.length} items` : "item";
    sections.push({
      title: "Clipboard",
      actions: [
        {
          id: "copy",
          label: `Copy ${itemLabel}`,
          icon: <Copy className="h-4 w-4" />,
          shortcut: "⌘C",
          onClick: () => onCopy?.(selectedIds),
          disabled: !onCopy,
        },
        {
          id: "cut",
          label: `Cut ${itemLabel}`,
          icon: <Scissors className="h-4 w-4" />,
          shortcut: "⌘X",
          onClick: () => onCut?.(selectedIds),
          disabled: !onCut,
        },
        {
          id: "paste",
          label: "Paste",
          shortcut: "⌘V",
          onClick: () => onPaste?.(clickedId || ""),
          disabled: !onPaste || !hasClipboard,
          divider: true,
        },
      ],
    });
  }

  // Section 4: Organization actions
  if (selectedIds.length > 0) {
    const itemLabel = isMultiSelection ? `${selectedIds.length} items` : "item";
    sections.push({
      title: "Organize",
      actions: [
        {
          id: "duplicate",
          label: `Duplicate ${itemLabel}`,
          shortcut: "⌘D",
          onClick: async () => await onDuplicate?.(selectedIds),
          disabled: !onDuplicate,
        },
        {
          id: "star",
          label: `Toggle Star`,
          icon: <Star className="h-4 w-4" />,
          onClick: async () => await onToggleStar?.(selectedIds),
          disabled: !onToggleStar,
          divider: true,
        },
      ],
    });
  }

  // Section 5: Share & Export
  if (selectedIds.length > 0) {
    const itemLabel = isMultiSelection ? `${selectedIds.length} items` : "item";
    sections.push({
      title: "Share",
      actions: [
        {
          id: "share",
          label: `Share ${itemLabel}`,
          icon: <Share2 className="h-4 w-4" />,
          onClick: () => onShare?.(selectedIds),
          disabled: !onShare,
        },
        {
          id: "download",
          label: `Download ${itemLabel}`,
          icon: <Download className="h-4 w-4" />,
          onClick: async () => await onDownload?.(selectedIds),
          disabled: !onDownload,
          divider: true,
        },
      ],
    });
  }

  // Section 6: Destructive actions
  if (selectedIds.length > 0) {
    const itemLabel = isMultiSelection ? `${selectedIds.length} items` : "item";
    sections.push({
      actions: [
        {
          id: "delete",
          label: `Delete ${itemLabel}`,
          icon: <Trash2 className="h-4 w-4" />,
          shortcut: "D",
          onClick: async () => await onDelete?.(selectedIds),
          disabled: !onDelete,
          destructive: true,
        },
      ],
    });
  }

  // Section 7: Refresh (always available, no shortcut to avoid browser reload conflict)
  sections.push({
    actions: [
      {
        id: "refresh",
        label: "Refresh Tree",
        icon: <RefreshCw className="h-4 w-4" />,
        onClick: async () => await onRefresh?.(),
        disabled: !onRefresh,
      },
    ],
  });

  return sections;
};
