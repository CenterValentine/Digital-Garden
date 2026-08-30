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
  FileSpreadsheet,
  Presentation,
  FileType,
  FileCode,
  Code,
  Braces,
  ExternalLink,
  ArrowUpRight,
  MessagesSquare,
  BarChart3,
  Users,
  Table,
  Target,
  GitBranch,
  Network,
  Pencil,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export interface NewContentMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Hover tooltip. Rendered by the header menu; the context menu has no slot. */
  title?: string;
  shortcut?: string;
  onClick?: () => void; // Optional when submenu is present
  disabled?: boolean;
  submenu?: NewContentMenuItem[]; // NEW: Support for submenus
}

export interface PageTemplateMenuData {
  categories: { id: string; name: string; isSystem: boolean }[];
  templates: {
    id: string;
    title: string;
    categoryId: string;
    isSystem: boolean;
    defaultTitle?: string | null;
  }[];
}

export interface NewContentCallbacks {
  onCreateFolder?: (parentId: string | null) => void | Promise<void>;
  onCreateNote?: (parentId: string | null) => void | Promise<void>;
  onCreateNoteFromTemplate?: (
    parentId: string | null,
    templateId: string,
    defaultTitle?: string
  ) => void | Promise<void>;
  onOpenPageTemplate?: (
    templateId: string,
    title: string
  ) => void | Promise<void>;
  onCreateFile?: (parentId: string | null) => void | Promise<void>;
  onCreateCode?: (parentId: string | null) => void | Promise<void>;
  onCreateHtml?: (parentId: string | null) => void | Promise<void>;
  onCreateDocument?: (parentId: string | null) => void | Promise<void>;
  onCreateSpreadsheet?: (parentId: string | null) => void | Promise<void>;
  onCreateJson?: (parentId: string | null) => void | Promise<void>;
  onCreateExternal?: (parentId: string | null) => void | Promise<void>;
  /**
   * Opens the target picker. Creation happens on pick, not here — a shortcut
   * needs something to point at before it can exist, so it takes the same
   * dialog-first fork as External Link rather than the inline temp-node path.
   */
  onCreateShortcut?: (parentId: string | null) => void | Promise<void>;
  onCreateChat?: (parentId: string | null) => void | Promise<void>;
  onAddPeopleTarget?: (parentId: string | null) => void | Promise<void>;
  // NEW: Separate callbacks for each visualization engine
  onCreateVisualizationMermaid?: (parentId: string | null) => void | Promise<void>;
  onCreateVisualizationExcalidraw?: (parentId: string | null) => void | Promise<void>;
  onCreateVisualizationDiagramsNet?: (parentId: string | null) => void | Promise<void>;
  onCreateData?: (parentId: string | null) => void | Promise<void>;
  onCreateDataQuery?: (parentId: string | null) => void | Promise<void>;
  onCreateHope?: (parentId: string | null) => void | Promise<void>;
  onCreateWorkflow?: (parentId: string | null) => void | Promise<void>;
  onCreateN8nWorkflow?: (parentId: string | null) => void | Promise<void>;
  // AI category — initial entry is image generation; future entries
  // (audio, video, structured data) will share the same submenu.
  onCreateAiImage?: (parentId: string | null) => void | Promise<void>;
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
  pageTemplateData?: PageTemplateMenuData
): NewContentMenuItem[] {
  const items: NewContentMenuItem[] = [];
  // Normalize parentId: undefined becomes null
  const normalizedParentId = parentId ?? null;

  // Folder first — the organizing container.
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

  // Phase 1: Core content types
  if (callbacks.onCreateNote) {
    const hasTemplates = Boolean(
      pageTemplateData &&
        pageTemplateData.templates.length > 0 &&
        callbacks.onCreateNoteFromTemplate
    );

    if (hasTemplates) {
      const submenu: NewContentMenuItem[] = [
        {
          id: "new-note-blank",
          label: "Blank Note",
          icon: <File className="h-4 w-4" />,
          shortcut: "A",
          onClick: () => callbacks.onCreateNote?.(normalizedParentId),
        },
      ];

      const templatesByCategory = new Map<
        string,
        {
          name: string;
          templates: PageTemplateMenuData["templates"];
        }
      >();

      for (const category of pageTemplateData!.categories) {
        const matchingTemplates = pageTemplateData!.templates.filter(
          (template) => template.categoryId === category.id
        );
        if (matchingTemplates.length > 0) {
          templatesByCategory.set(category.id, {
            name: category.name,
            templates: matchingTemplates,
          });
        }
      }

      for (const [categoryId, { name, templates }] of templatesByCategory) {
        submenu.push({
          id: `new-note-cat-${categoryId}`,
          label: name,
          icon: <Folder className="h-4 w-4" />,
          submenu: templates.map((template) => {
            const canOpenTemplate = Boolean(callbacks.onOpenPageTemplate);

            return {
              id: `new-note-tpl-${template.id}`,
              label: template.title,
              icon: <FileText className="h-4 w-4" />,
              submenu: [
                {
                  id: `new-note-tpl-${template.id}-create`,
                  label: "Create Note",
                  icon: <File className="h-4 w-4" />,
                  onClick: () =>
                    callbacks.onCreateNoteFromTemplate?.(
                      normalizedParentId,
                      template.id,
                      template.defaultTitle || template.title
                    ),
                },
                {
                  id: `new-note-tpl-${template.id}-edit`,
                  label: template.isSystem ? "View Template" : "Edit Template",
                  icon: <Pencil className="h-4 w-4" />,
                  onClick: () =>
                    callbacks.onOpenPageTemplate?.(
                      template.id,
                      template.title
                    ),
                  disabled: !canOpenTemplate,
                },
              ],
            };
          }),
        });
      }

      items.push({
        id: "new-note",
        label: "Note",
        icon: <File className="h-4 w-4" />,
        submenu,
      });
    } else {
      items.push({
        id: "new-note",
        label: "Note",
        icon: <File className="h-4 w-4" />,
        shortcut: "A",
        onClick: () => callbacks.onCreateNote?.(normalizedParentId),
        disabled: !callbacks.onCreateNote,
      });
    }
  }

  // ── Most-used surfaces first ──

  // Chat
  items.push({
    id: "new-chat",
    label: "Chat",
    icon: <MessagesSquare className="h-4 w-4" />,
    onClick: () => callbacks.onCreateChat?.(normalizedParentId),
    disabled: !callbacks.onCreateChat,
  });

  // External Link
  if (callbacks.onCreateExternal) {
    items.push({
      id: "new-external",
      label: "External Link",
      icon: <ExternalLink className="h-4 w-4" />,
      onClick: () => callbacks.onCreateExternal?.(normalizedParentId),
      disabled: !callbacks.onCreateExternal,
    });
  }

  // Shortcut — sits next to External Link because both point at something
  // that lives elsewhere; one outside the garden, one inside it.
  //
  // Same glyph the tree draws on a shortcut row's corner badge, deliberately:
  // one mark for "this is a pointer" means the menu entry and the row it
  // produces teach each other. The bent arrow is the OS alias idiom (Finder's
  // alias badge, Windows' shortcut overlay). Not a chain link — that already
  // means External Link one item above, and referenced content in row badges.
  if (callbacks.onCreateShortcut) {
    items.push({
      id: "new-shortcut",
      label: "Shortcut…",
      icon: <ArrowUpRight className="h-4 w-4" />,
      title: "Graft a shortcut to content that lives elsewhere",
      onClick: () => callbacks.onCreateShortcut?.(normalizedParentId),
      disabled: !callbacks.onCreateShortcut,
    });
  }

  // File Upload
  if (callbacks.onCreateFile) {
    items.push({
      id: "new-file",
      label: "File Upload",
      icon: <FileText className="h-4 w-4" />,
      onClick: () => callbacks.onCreateFile?.(normalizedParentId),
      disabled: !callbacks.onCreateFile,
    });
  }

  // Visualization (submenu — engines)
  items.push({
    id: "new-visualization",
    label: "Visualization",
    icon: <BarChart3 className="h-4 w-4" />,
    submenu: [
      {
        id: "new-visualization-mermaid",
        label: "Mermaid Diagram",
        icon: <GitBranch className="h-4 w-4" />,
        onClick: () => callbacks.onCreateVisualizationMermaid?.(normalizedParentId),
        disabled: !callbacks.onCreateVisualizationMermaid,
      },
      {
        id: "new-visualization-excalidraw",
        label: "Excalidraw Drawing",
        icon: <Pencil className="h-4 w-4" />,
        onClick: () => callbacks.onCreateVisualizationExcalidraw?.(normalizedParentId),
        disabled: !callbacks.onCreateVisualizationExcalidraw,
      },
      {
        id: "new-visualization-diagrams-net",
        label: "Diagrams.net Diagram",
        icon: <Network className="h-4 w-4" />,
        onClick: () => callbacks.onCreateVisualizationDiagramsNet?.(normalizedParentId),
        disabled: !callbacks.onCreateVisualizationDiagramsNet,
      },
    ],
  });

  // AI — submenu houses AI-initiated content types. Image Generation is
  // the first child; future siblings can sit here without polluting the
  // top-level list.
  items.push({
    id: "new-ai",
    label: "AI",
    icon: <Sparkles className="h-4 w-4" />,
    submenu: [
      {
        id: "new-ai-image",
        label: "Image Generation",
        icon: <ImageIcon className="h-4 w-4" />,
        onClick: () => callbacks.onCreateAiImage?.(normalizedParentId),
        disabled: !callbacks.onCreateAiImage,
      },
    ],
  });

  // ── Less-used / specialized formats ──

  if (callbacks.onCreateCode) {
    items.push({
      id: "new-code",
      label: "Code Snippet",
      icon: <Code className="h-4 w-4" />,
      onClick: () => callbacks.onCreateCode?.(normalizedParentId),
      disabled: !callbacks.onCreateCode,
    });
  }

  // Documents — structured file formats grouped in one submenu.
  const documentChildren: NewContentMenuItem[] = [];
  if (callbacks.onCreateDocument) {
    documentChildren.push({
      id: "new-document",
      label: "Word Document (.docx)",
      icon: <FileType className="h-4 w-4" />,
      onClick: () => callbacks.onCreateDocument?.(normalizedParentId),
      disabled: !callbacks.onCreateDocument,
    });
  }
  if (callbacks.onCreateSpreadsheet) {
    documentChildren.push({
      id: "new-spreadsheet",
      label: "Excel Spreadsheet (.xlsx)",
      icon: <FileSpreadsheet className="h-4 w-4" />,
      onClick: () => callbacks.onCreateSpreadsheet?.(normalizedParentId),
      disabled: !callbacks.onCreateSpreadsheet,
    });
  }
  // PowerPoint — stub, not implemented yet.
  documentChildren.push({
    id: "new-powerpoint",
    label: "PowerPoint (.pptx)",
    icon: <Presentation className="h-4 w-4" />,
    onClick: () => undefined,
    disabled: true,
  });
  if (callbacks.onCreateHtml) {
    documentChildren.push({
      id: "new-html",
      label: "HTML Document",
      icon: <FileCode className="h-4 w-4" />,
      onClick: () => callbacks.onCreateHtml?.(normalizedParentId),
      disabled: !callbacks.onCreateHtml,
    });
  }
  if (callbacks.onCreateJson) {
    documentChildren.push({
      id: "new-json",
      label: "JSON File (.json)",
      icon: <Braces className="h-4 w-4" />,
      onClick: () => callbacks.onCreateJson?.(normalizedParentId),
      disabled: !callbacks.onCreateJson,
    });
  }
  if (documentChildren.length > 0) {
    items.push({
      id: "new-documents",
      label: "Documents",
      icon: <FileText className="h-4 w-4" />,
      submenu: documentChildren,
    });
  }

  // Workflow (submenu — one entry per workflow engine; Trellis is the
  // native graph-interpreter type, future engines slot in beneath it).
  items.push({
    id: "new-workflow",
    label: "Workflow",
    icon: <GitBranch className="h-4 w-4" />,
    submenu: [
      {
        id: "new-workflow-trellis",
        label: "Trellis Flow",
        icon: <GitBranch className="h-4 w-4" />,
        onClick: () => callbacks.onCreateWorkflow?.(normalizedParentId),
        disabled: !callbacks.onCreateWorkflow,
      },
      // n8n Flow only where the (heavier) create callback is wired — the header
      // + menu. The file-tree context menu routes through the content-POST path
      // and gets it once that path learns "n8n-workflow".
      ...(callbacks.onCreateN8nWorkflow
        ? [
            {
              id: "new-workflow-n8n",
              label: "n8n Flow",
              icon: <GitBranch className="h-4 w-4" />,
              onClick: () => callbacks.onCreateN8nWorkflow?.(normalizedParentId),
            },
          ]
        : []),
    ],
  });

  // Person / Group — last of the active content types.
  items.push({
    id: "add-people-target",
    label: "Person / Group",
    icon: <Users className="h-4 w-4" />,
    onClick: () => callbacks.onAddPeopleTarget?.(normalizedParentId),
    disabled: !callbacks.onAddPeopleTarget,
  });

  // Database — one entry, two flavors in a submenu (owner, 2026-08-27),
  // same pattern as Workflow. "Blank Database" owns its rows; "Query
  // Database" is a saved search over existing content (plan Phase 3) —
  // rows ARE the matching notes, nothing is copied.
  items.push({
    id: "new-database",
    label: "Database",
    icon: <Table className="h-4 w-4" />,
    disabled: !callbacks.onCreateData && !callbacks.onCreateDataQuery,
    submenu: [
      {
        id: "new-data",
        label: "Blank Database",
        icon: <Table className="h-4 w-4" />,
        onClick: () => callbacks.onCreateData?.(normalizedParentId),
        disabled: !callbacks.onCreateData,
      },
      {
        id: "new-data-query",
        label: "Query Database",
        icon: <Table className="h-4 w-4" />,
        onClick: () => callbacks.onCreateDataQuery?.(normalizedParentId),
        disabled: !callbacks.onCreateDataQuery,
      },
    ],
  });

  // Stubs — defined but not implemented yet.

  items.push({
    id: "new-hope",
    label: "Hope/Goal",
    icon: <Target className="h-4 w-4" />,
    onClick: () => callbacks.onCreateHope?.(normalizedParentId),
    disabled: true,
  });

  return items;
}
