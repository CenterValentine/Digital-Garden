/**
 * Shared New Content Menu Configuration
 *
 * Single source of truth for "New" menu items used by:
 * - Left sidebar + button (LeftSidebarHeaderActions)
 * - File tree context menu (file-tree-actions)
 *
 * This ensures consistency and reduces maintenance burden.
 */

import {
  File,
  Folder,
  FileText,
  Upload,
  FileSpreadsheet,
  FileType,
  FileCode,
  Code,
  Braces,
  ExternalLink,
  MessageSquare,
  BarChart3,
  Table,
  Target,
  GitBranch,
  Network,
  Pencil,
} from "lucide-react";
import type { ReactNode } from "react";

export interface NewContentMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  onClick?: () => void; // Optional when submenu is present
  disabled?: boolean;
  submenu?: NewContentMenuItem[]; // NEW: Support for submenus
}

/** Page template data passed to the menu for submenu generation */
export interface PageTemplateMenuData {
  categories: { id: string; name: string; isSystem: boolean }[];
  templates: { id: string; title: string; categoryId: string; defaultTitle?: string | null }[];
}

export interface NewContentCallbacks {
  onCreateFolder?: (parentId: string | null) => void | Promise<void>;
  onCreateNote?: (parentId: string | null) => void | Promise<void>;
  onCreateNoteFromTemplate?: (parentId: string | null, templateId: string, defaultTitle?: string) => void | Promise<void>;
  onCreateFile?: (parentId: string | null) => void | Promise<void>;
  onCreateCode?: (parentId: string | null) => void | Promise<void>;
  onCreateHtml?: (parentId: string | null) => void | Promise<void>;
  onCreateDocument?: (parentId: string | null) => void | Promise<void>;
  onCreateSpreadsheet?: (parentId: string | null) => void | Promise<void>;
  onCreateJson?: (parentId: string | null) => void | Promise<void>;
  onCreateExternal?: (parentId: string | null) => void | Promise<void>;
  onCreateChat?: (parentId: string | null) => void | Promise<void>;
  // NEW: Separate callbacks for each visualization engine
  onCreateVisualizationMermaid?: (parentId: string | null) => void | Promise<void>;
  onCreateVisualizationExcalidraw?: (parentId: string | null) => void | Promise<void>;
  onCreateVisualizationDiagramsNet?: (parentId: string | null) => void | Promise<void>;
  onCreateData?: (parentId: string | null) => void | Promise<void>;
  onCreateHope?: (parentId: string | null) => void | Promise<void>;
  onCreateWorkflow?: (parentId: string | null) => void | Promise<void>;
}

/**
 * Generate new content menu items
 *
 * @param callbacks - Creation callbacks for each content type
 * @param parentId - Target parent ID (null for root, string for specific folder)
 * @returns Array of menu items in display order
 */
export function getNewContentMenuItems(
  callbacks: NewContentCallbacks,
  parentId?: string | null,
  pageTemplateData?: PageTemplateMenuData,
): NewContentMenuItem[] {
  const items: NewContentMenuItem[] = [];
  // Normalize parentId: undefined becomes null
  const normalizedParentId = parentId ?? null;

  // Phase 1: Core content types
  if (callbacks.onCreateNote) {
    const hasTemplates = pageTemplateData && pageTemplateData.templates.length > 0;

    if (hasTemplates && callbacks.onCreateNoteFromTemplate) {
      // Build submenu: Blank Note + templates grouped by category
      const submenu: NewContentMenuItem[] = [
        {
          id: "new-note-blank",
          label: "Blank Note",
          icon: <File className="h-4 w-4" />,
          shortcut: "A",
          onClick: () => callbacks.onCreateNote?.(normalizedParentId),
        },
      ];

      // Group templates by category
      const byCategory = new Map<string, { name: string; isSystem: boolean; templates: typeof pageTemplateData.templates }>();
      for (const cat of pageTemplateData.categories) {
        const catTemplates = pageTemplateData.templates.filter((t) => t.categoryId === cat.id);
        if (catTemplates.length > 0) {
          byCategory.set(cat.id, { name: cat.name, isSystem: cat.isSystem, templates: catTemplates });
        }
      }

      for (const [catId, { name, templates }] of byCategory) {
        submenu.push({
          id: `new-note-cat-${catId}`,
          label: name,
          icon: <Folder className="h-4 w-4" />,
          submenu: templates.map((t) => ({
            id: `new-note-tpl-${t.id}`,
            label: t.title,
            icon: <FileText className="h-4 w-4" />,
            onClick: () => callbacks.onCreateNoteFromTemplate?.(normalizedParentId, t.id, t.defaultTitle || t.title),
          })),
        });
      }

      items.push({
        id: "new-note",
        label: "Note (Markdown)",
        icon: <File className="h-4 w-4" />,
        submenu,
      });
    } else {
      items.push({
        id: "new-note",
        label: "Note (Markdown)",
        icon: <File className="h-4 w-4" />,
        shortcut: "A",
        onClick: () => callbacks.onCreateNote?.(normalizedParentId),
        disabled: !callbacks.onCreateNote,
      });
    }
  }

  if (callbacks.onCreateFolder) {
    items.push({
      id: "new-folder",
      label: "Folder",
      icon: <Folder className="h-4 w-4" />,
      shortcut: "⇧A",
      onClick: () => callbacks.onCreateFolder?.(normalizedParentId),
      disabled: !callbacks.onCreateFolder,
    });
  }

  if (callbacks.onCreateFile) {
    items.push({
      id: "new-file",
      label: "File (Upload)",
      icon: <FileText className="h-4 w-4" />,
      onClick: () => callbacks.onCreateFile?.(normalizedParentId),
      disabled: !callbacks.onCreateFile,
    });
  }

  if (callbacks.onCreateCode) {
    items.push({
      id: "new-code",
      label: "Code Snippet",
      icon: <Code className="h-4 w-4" />,
      onClick: () => callbacks.onCreateCode?.(normalizedParentId),
      disabled: !callbacks.onCreateCode,
    });
  }

  if (callbacks.onCreateHtml) {
    items.push({
      id: "new-html",
      label: "HTML Document",
      icon: <FileCode className="h-4 w-4" />,
      onClick: () => callbacks.onCreateHtml?.(normalizedParentId),
      disabled: !callbacks.onCreateHtml,
    });
  }

  if (callbacks.onCreateDocument) {
    items.push({
      id: "new-document",
      label: "Word Document (.docx)",
      icon: <FileType className="h-4 w-4" />,
      onClick: () => callbacks.onCreateDocument?.(normalizedParentId),
      disabled: !callbacks.onCreateDocument,
    });
  }

  if (callbacks.onCreateSpreadsheet) {
    items.push({
      id: "new-spreadsheet",
      label: "Excel Spreadsheet (.xlsx)",
      icon: <FileSpreadsheet className="h-4 w-4" />,
      onClick: () => callbacks.onCreateSpreadsheet?.(normalizedParentId),
      disabled: !callbacks.onCreateSpreadsheet,
    });
  }

  if (callbacks.onCreateJson) {
    items.push({
      id: "new-json",
      label: "JSON File (.json)",
      icon: <Braces className="h-4 w-4" />,
      onClick: () => callbacks.onCreateJson?.(normalizedParentId),
      disabled: !callbacks.onCreateJson,
    });
  }

  // Phase 2: New content types

  // External Link - Implemented in M9 Phase 2
  if (callbacks.onCreateExternal) {
    items.push({
      id: "new-external",
      label: "External Link (Bookmark)",
      icon: <ExternalLink className="h-4 w-4" />,
      onClick: () => callbacks.onCreateExternal?.(normalizedParentId),
      disabled: !callbacks.onCreateExternal,
    });
  }

  // Stub payloads - Always show but disabled until implementation
  // These are defined in M9 Phase 2 plan but not yet implemented

  items.push({
    id: "new-chat",
    label: "Chat Conversation",
    icon: <MessageSquare className="h-4 w-4" />,
    onClick: () => callbacks.onCreateChat?.(normalizedParentId),
    disabled: !callbacks.onCreateChat,
  });

  // Visualization submenu with 3 engine choices
  items.push({
    id: "new-visualization",
    label: "Visualization",
    icon: <BarChart3 className="h-4 w-4" />,
    // No onClick - submenu will handle it
    submenu: [
      {
        id: "new-visualization-mermaid",
        label: "Mermaid Diagram",
        icon: <GitBranch className="h-4 w-4" />,
        onClick: () => callbacks.onCreateVisualizationMermaid?.(normalizedParentId),
        disabled: !callbacks.onCreateVisualizationMermaid, // Enabled when implemented
      },
      {
        id: "new-visualization-excalidraw",
        label: "Excalidraw Drawing",
        icon: <Pencil className="h-4 w-4" />,
        onClick: () => callbacks.onCreateVisualizationExcalidraw?.(normalizedParentId),
        disabled: !callbacks.onCreateVisualizationExcalidraw, // Enabled when implemented
      },
      {
        id: "new-visualization-diagrams-net",
        label: "Diagrams.net Diagram",
        icon: <Network className="h-4 w-4" />,
        onClick: () => callbacks.onCreateVisualizationDiagramsNet?.(normalizedParentId),
        disabled: !callbacks.onCreateVisualizationDiagramsNet, // Enabled when implemented
      },
    ],
  });

  items.push({
    id: "new-data",
    label: "Data Table",
    icon: <Table className="h-4 w-4" />,
    onClick: () => callbacks.onCreateData?.(normalizedParentId),
    disabled: true, // M9 Phase 2: Not implemented yet
  });

  items.push({
    id: "new-hope",
    label: "Hope/Goal",
    icon: <Target className="h-4 w-4" />,
    onClick: () => callbacks.onCreateHope?.(normalizedParentId),
    disabled: true, // M9 Phase 2: Not implemented yet
  });

  items.push({
    id: "new-workflow",
    label: "Workflow (Automation)",
    icon: <GitBranch className="h-4 w-4" />,
    onClick: () => callbacks.onCreateWorkflow?.(normalizedParentId),
    disabled: true, // M9 Phase 2: Not implemented yet
  });

  return items;
}
