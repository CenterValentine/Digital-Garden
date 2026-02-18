/**
 * File Tree Context Menu Actions
 *
 * Provides context menu actions for the file tree panel.
 * Supports single and multi-selection operations.
 * Uses shared menu configuration from new-content-menu.tsx
 *
 * M4: File Tree Completion - File Tree Context Menu
 */

import {
  Edit,
  Trash2,
  Copy,
  Scissors,
  Star,
  Palette,
  Share2,
  Download,
  RefreshCw,
  Plus,
  List,
  LayoutGrid,
  Columns3,
  LayoutDashboard,
  Network,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import type { ContextMenuActionProvider, ContextMenuSection, ContextMenuAction } from "./types";
import { getNewContentMenuItems, type NewContentCallbacks } from "@/components/content/menu-items/new-content-menu";
import { supportsCustomIcon } from "@/lib/domain/content/file-extension-utils";

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
    includeReferencedContent?: boolean; // Phase 2: Folder setting
    externalUrl?: string; // Phase 2: External link URL
    file?: { mimeType?: string } | null; // For supportsCustomIcon check
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
  /** Phase 2: Folder view mode switching */
  onSetFolderView?: (id: string, viewMode: "list" | "gallery" | "kanban" | "dashboard" | "canvas") => Promise<void>;
  /** Phase 2: Toggle referenced content visibility for folder */
  onToggleReferencedContent?: (id: string, currentValue: boolean) => Promise<void>;
  /** Phase 2: Edit external link */
  onEditExternal?: (id: string) => Promise<void>;
  /** Phase 2: Copy external link URL */
  onCopyExternalUrl?: (id: string, url: string) => Promise<void>;
  onCreateNote?: (parentId: string | null) => Promise<void>;
  onCreateFolder?: (parentId: string | null) => Promise<void>;
  onCreateFile?: (parentId: string | null) => Promise<void>;
  onCreateCode?: (parentId: string | null) => Promise<void>;
  onCreateHtml?: (parentId: string | null) => Promise<void>;
  onCreateDocument?: (parentId: string | null) => Promise<void>;
  onCreateSpreadsheet?: (parentId: string | null) => Promise<void>;
  /** Phase 2: New content type creators */
  onCreateExternal?: (parentId: string | null) => Promise<void>;
  onCreateChat?: (parentId: string | null) => Promise<void>;
  /** Visualization engine-specific creators */
  onCreateVisualizationMermaid?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationExcalidraw?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationDiagramsNet?: (parentId: string | null) => Promise<void>;
  onCreateData?: (parentId: string | null) => Promise<void>;
  onCreateHope?: (parentId: string | null) => Promise<void>;
  onCreateWorkflow?: (parentId: string | null) => Promise<void>;
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
    onSetFolderView,
    onToggleReferencedContent,
    onEditExternal,
    onCopyExternalUrl,
    onCreateNote,
    onCreateFolder,
    onCreateFile,
    onCreateCode,
    onCreateHtml,
    onCreateDocument,
    onCreateSpreadsheet,
    onCreateExternal,
    onCreateChat,
    onCreateVisualizationMermaid,
    onCreateVisualizationExcalidraw,
    onCreateVisualizationDiagramsNet,
    onCreateData,
    onCreateHope,
    onCreateWorkflow,
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

    // Generate menu items from shared configuration
    const callbacks: NewContentCallbacks = {
      onCreateNote,
      onCreateFolder,
      onCreateFile,
      onCreateCode,
      onCreateHtml,
      onCreateDocument,
      onCreateSpreadsheet,
      onCreateExternal,
      onCreateChat,
      onCreateVisualizationMermaid,
      onCreateVisualizationExcalidraw,
      onCreateVisualizationDiagramsNet,
      onCreateData,
      onCreateHope,
      onCreateWorkflow,
    };

    const newMenuItems = getNewContentMenuItems(callbacks, targetId);

    sections.push({
      title: "New",
      actions: [
        {
          id: "create-submenu",
          label: "New",
          icon: <Plus className="h-4 w-4" />,
          submenu: newMenuItems.map((item) => ({
            id: item.id,
            label: item.label,
            icon: item.icon,
            shortcut: item.shortcut,
            onClick: item.onClick,
            disabled: item.disabled,
            submenu: item.submenu ? item.submenu.map((subItem) => ({
              id: subItem.id,
              label: subItem.label,
              icon: subItem.icon,
              shortcut: subItem.shortcut,
              onClick: subItem.onClick,
              disabled: subItem.disabled,
            })) : undefined,
          })),
          divider: true,
        },
      ],
    });
  }

  // Section 2: Folder view mode (folder only, single selection)
  if (isSingleSelection && clickedId && isFolder && onSetFolderView) {
    sections.push({
      title: "View",
      actions: [
        {
          id: "set-view",
          label: "Set View",
          icon: <LayoutGrid className="h-4 w-4" />,
          submenu: [
            {
              id: "view-list",
              label: "List",
              icon: <List className="h-4 w-4" />,
              onClick: async () => await onSetFolderView(clickedId, "list"),
            },
            {
              id: "view-gallery",
              label: "Gallery",
              icon: <LayoutGrid className="h-4 w-4" />,
              onClick: async () => await onSetFolderView(clickedId, "gallery"),
            },
            {
              id: "view-kanban",
              label: "Kanban",
              icon: <Columns3 className="h-4 w-4" />,
              onClick: async () => await onSetFolderView(clickedId, "kanban"),
            },
            {
              id: "view-dashboard",
              label: "Dashboard",
              icon: <LayoutDashboard className="h-4 w-4" />,
              onClick: async () => await onSetFolderView(clickedId, "dashboard"),
            },
            {
              id: "view-canvas",
              label: "Canvas",
              icon: <Network className="h-4 w-4" />,
              onClick: async () => await onSetFolderView(clickedId, "canvas"),
            },
          ],
          divider: true,
        },
        {
          id: "toggle-referenced",
          label: clickedNode?.includeReferencedContent ? "Hide Referenced Content" : "Show Referenced Content",
          icon: clickedNode?.includeReferencedContent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
          onClick: async () => {
            if (onToggleReferencedContent) {
              await onToggleReferencedContent(clickedId, clickedNode?.includeReferencedContent || false);
            }
          },
          disabled: !onToggleReferencedContent,
        },
      ],
    });
  }

  // Section 2.5: External link actions (external links only, single selection)
  if (isSingleSelection && clickedId && clickedNode?.contentType === "external") {
    sections.push({
      title: "External Link",
      actions: [
        {
          id: "edit-external",
          label: "Edit Link",
          icon: <Edit className="h-4 w-4" />,
          shortcut: "R",
          onClick: async () => {
            if (onEditExternal) {
              await onEditExternal(clickedId);
            }
          },
          disabled: !onEditExternal,
        },
        {
          id: "copy-url",
          label: "Copy URL",
          icon: <Copy className="h-4 w-4" />,
          onClick: async () => {
            if (onCopyExternalUrl && clickedNode.externalUrl) {
              await onCopyExternalUrl(clickedId, clickedNode.externalUrl);
            }
          },
          disabled: !onCopyExternalUrl || !clickedNode.externalUrl,
          divider: true,
        },
      ],
    });
  }

  // Section 3: Edit actions (single selection only, exclude external links)
  if (isSingleSelection && clickedId && clickedNode?.contentType !== "external") {
    const canCustomizeIcon = clickedNode && supportsCustomIcon(clickedNode);

    const editActions: ContextMenuAction[] = [
      {
        id: "rename",
        label: "Rename",
        icon: <Edit className="h-4 w-4" />,
        shortcut: "R",
        onClick: () => onRename?.(clickedId),
        disabled: !onRename,
      },
    ];

    // Only show Change Icon for eligible content types (notes, .docx, .xlsx, .json)
    if (canCustomizeIcon) {
      editActions.push({
        id: "change-icon",
        label: "Change Icon",
        icon: <Palette className="h-4 w-4" />,
        onClick: () => onChangeIcon?.(clickedId),
        disabled: !onChangeIcon,
      });
    }

    sections.push({
      title: "Edit",
      actions: editActions,
    });
  }

  // Section 4: Clipboard actions
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

  // Section 5: Organization actions
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

  // Section 6: Share & Export
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

  // Section 7: Destructive actions
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

  // Section 8: Refresh (always available, no shortcut to avoid browser reload conflict)
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
