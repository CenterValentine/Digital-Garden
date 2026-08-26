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

import { useEffect, useRef } from "react";
import { type NodeRendererProps, type NodeApi } from "react-arborist";
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
  Image as ImageIcon,
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
  Table,
  MessageCircle,
  User,
  Users,
  BookMarked,
} from "lucide-react";
import { format } from "date-fns";
import { useLongPress } from "@/components/common/useLongPress";
import { useContextMenuStore } from "@/state/context-menu-store";
import { useContentStore } from "@/state/content-store";
import { useTreeStateStore } from "@/state/tree-state-store";
import { useTreeDragStore } from "@/state/tree-drag-store";
import { referenceGroupKey } from "@/lib/features/content/reference-group";
import { useFileTreeEditStore } from "@/state/file-tree-edit-store";
import { toast } from "sonner";
import type { TreeNode } from "@/lib/domain/content/types";
import { getDisplayExtension, splitFilenameForDisplay } from "@/lib/domain/content/file-extension-utils";
import { FileNameInput } from "@/components/common/FileNameInput";
import { clientLogger } from "@/lib/core/logger/client";
import { prefetchContent } from "@/lib/domain/content/prefetch";
import {
  copyTreeItems,
  pasteTreeClipboard,
  hasTreeClipboard,
  ensureAltTracker,
} from "@/lib/features/content/tree-clipboard";

/**
 * Row hover tooltip: modified + created, Obsidian-style. Answers "which of
 * these similarly-named files is the one I want?" during a scan of the tree,
 * without opening anything.
 *
 * `TreeNode` types these as `Date`, but the tree arrives over JSON so at
 * runtime they are ISO strings — parse rather than trusting the annotation.
 * A missing or unparseable date drops its line instead of rendering
 * "Invalid Date".
 */
function formatNodeTimestamps(data: TreeNode): string | undefined {
  const lines: string[] = [];

  const addLine = (label: string, value: Date | string | null | undefined) => {
    if (!value) return;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return;
    lines.push(`${label}: ${format(parsed, "MMM d, yyyy 'at' h:mm a")}`);
  };

  addLine("Last modified", data.updatedAt);
  addLine("Created", data.createdAt);

  return lines.length > 0 ? lines.join("\n") : undefined;
}

interface FileNodeProps extends NodeRendererProps<TreeNode> {
  onRename?: (id: string, name: string) => Promise<void>;
  onCreate?: (
    parentId: string | null,
    type: "folder" | "note" | "file" | "code" | "html" | "docx" | "xlsx" | "json" | "external" | "chat" | "visualization" | "data" | "hope" | "workflow"
  ) => Promise<void>;
  onDelete?: (id: string | string[]) => Promise<void>;
  onDuplicate?: (ids: string[]) => Promise<void>;
  onDownload?: (ids: string[]) => Promise<void>;
  onChangeIcon?: (id: string) => void;
  /** Phase 2: Folder view mode switching */
  onSetFolderView?: (id: string, viewMode: "list" | "gallery" | "kanban" | "dashboard" | "canvas") => Promise<void>;
  /** Visualization engine-specific creators */
  onCreateVisualizationMermaid?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationExcalidraw?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationDiagramsNet?: (parentId: string | null) => Promise<void>;
  /**
   * Image generation via the AI image dialog. Opens a modal seeded with
   * the given parentId — does not directly create a file (the dialog
   * does that on submit), so this is wired alongside the visualization
   * creators rather than the generic `onCreate(parentId, type)`.
   */
  onCreateAiImage?: (parentId: string | null) => Promise<void>;
  onAddPeopleTarget?: (parentId: string | null) => Promise<void>;
  /** Mark the next tree selection callback as selection-only (Shift-click). */
  onSelectionOnly?: () => void;
}

export function FileNode({ node, style, dragHandle, onRename, onCreate, onDelete, onDuplicate, onDownload, onChangeIcon, onSetFolderView, onCreateVisualizationMermaid, onCreateVisualizationExcalidraw, onCreateVisualizationDiagramsNet, onCreateAiImage, onAddPeopleTarget, onSelectionOnly }: FileNodeProps) {
  const { data } = node;
  const isFolder = data.contentType === "folder";
  const isPeopleNode = data.treeNodeKind === "peopleGroup" || data.treeNodeKind === "person";
  const isOpen = node.isOpen;

  // Reference block membership. `isNestedReference` is set by FileTree's
  // expandReferences transform, never by the API — a referenced node rendered
  // outside a block (e.g. at tree root, where there's no parent to host a chip)
  // deliberately renders as an ordinary row.
  const isNestedReference = data.isNestedReference === true;
  const referenceCount = data.references?.length ?? 0;
  const referencesExpanded = useTreeStateStore((state) =>
    state.expandedIds.has(referenceGroupKey(data.id)),
  );
  const referencesAtStart = useTreeStateStore((state) =>
    state.referencesAtStartIds.has(data.id),
  );
  /**
   * Whether this row has any content of its own to order the reference block
   * against. Reads the post-transform children: when the block is open its
   * rows are tagged `isNestedReference`, so filtering them leaves exactly the
   * primary children in both the open and closed states.
   *
   * A row whose ONLY children are references has nothing to reorder — the
   * block is the whole list, so it sits at the top either way. Showing a
   * placement control there offers a swap that visibly does nothing, which
   * reads as broken rather than as a no-op.
   */
  const hasPrimaryChildren = (data.children ?? []).some(
    (child) => !child.isNestedReference,
  );
  const toggleReferences = useTreeStateStore((state) => state.toggleExpanded);
  const setNodeExpanded = useTreeStateStore((state) => state.setExpanded);
  const toggleReferencePosition = useTreeStateStore(
    (state) => state.toggleReferencePosition,
  );

  const { openMenu } = useContextMenuStore();
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const openContentIds = useContentStore((state) => state.openContentIds);

  // Inline-rename draft lives in a store so a keystroke re-renders only THIS
  // node — not FileTree — keeping the react-arborist renderer stable so the
  // rename input isn't remounted (which snapped the caret to the end).
  const editingValue = useFileTreeEditStore((s) => s.drafts[data.id]);
  const setEditingDraft = useFileTreeEditStore((s) => s.setDraft);
  const clearEditingDraft = useFileTreeEditStore((s) => s.clearDraft);

  // Three-state selection system:
  // 1. Active: This file is open in the editor (brightest)
  // 2. Selected: This file is selected in tree (medium)
  // 3. Multi-selected: Part of multi-selection (subtle)
  const isActive = data.id === selectedContentId;
  const isOpenInTab = openContentIds.includes(data.id);
  // External (OS file) drag destination — selector returns a boolean so only
  // the rows whose target status flips re-render as the pointer moves.
  const isExternalDropTarget = useTreeDragStore(
    (state) => state.externalDropTargetId === data.id,
  );
  const isSelected = node.isSelected;
  const tree = node.tree;
  const isMultiSelected = isSelected && tree.selectedNodes && tree.selectedNodes.length > 1;

  // Get display extension for orthodox files
  const displayExtension = getDisplayExtension(data);
  const { basename, extension } = splitFilenameForDisplay(data.title, displayExtension);

  // Seed edit drafts from the current basename, but keep them outside the row
  // component so react-arborist row recycling doesn't wipe in-progress typing.
  useEffect(() => {
    if (node.isEditing && editingValue === undefined) {
      setEditingDraft(data.id, basename);
    }
  }, [basename, data.id, editingValue, node.isEditing, setEditingDraft]);

  const committedRef = useRef(false);

  useEffect(() => {
    if (node.isEditing) {
      committedRef.current = false;
    }
  }, [node.isEditing]);

  const activeEditingValue = editingValue ?? basename;

  const commitEdit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    node.submit(activeEditingValue);
    clearEditingDraft(data.id);
  };

  const cancelEdit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    node.reset();
    clearEditingDraft(data.id);
  };

  // Get icon based on content type or custom icon
  const getIcon = () => {
    const iconSize = "h-4 w-4";
    const iconColor = data.iconColor || "text-gray-600 dark:text-gray-400";

    // Render custom icon if set
    if (data.customIcon) {
      if (data.customIcon.startsWith("emoji:")) {
        const emoji = data.customIcon.replace("emoji:", "");
        return <span className="text-base">{emoji}</span>;
      } else if (data.customIcon.startsWith("lucide:")) {
        const iconName = data.customIcon.replace("lucide:", "");
        // Dynamically import the Lucide icon
        const LucideIcon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }> | undefined>)[iconName];
        if (LucideIcon) {
          return <LucideIcon className={`${iconSize} ${iconColor}`} />;
        }
      }
    }

    if (isFolder) {
      if (data.treeNodeKind === "peopleGroup") {
        return isOpen ? (
          <FolderOpen className={`${iconSize} text-gold-primary`} />
        ) : (
          <Users className={`${iconSize} text-gold-primary`} />
        );
      }

      if (data.treeNodeKind === "person") {
        return <User className={`${iconSize} text-blue-500`} />;
      }

      // Show different icon based on folder view mode
      const viewMode = data.folder?.viewMode;

      switch (viewMode) {
        case "gallery":
          return <ImageIcon className={`${iconSize} ${iconColor}`} />;
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
      case "data":
        return <Table className={`${iconSize} ${iconColor}`} />;
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

  // Get chevron for any node with children — folders, and notes whose
  // references display as children (2026-07-16 model). Wrapped in its own
  // button so clicks expand/collapse without selecting or bubbling.
  const getChevron = () => {
    if (!node.children || node.children.length === 0) {
      return <div className="h-4 w-4" />; // Empty space for alignment
    }

    return (
      <button
        type="button"
        className="h-4 w-4 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
        onClick={(e) => {
          e.stopPropagation(); // Prevent row onClick / onDoubleClick
          node.toggle();       // Expand/collapse only — no selection
        }}
        tabIndex={-1}
        aria-label={isOpen ? "Collapse" : "Expand"}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        )}
      </button>
    );
  };

  // Handle click — modifier keys for multi-selection; files select on single click.
  // Folders do NOT select on single click (use double-click via handleDoubleClick).
  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      if (node.isSelected) {
        node.deselect();
      } else {
        node.selectMulti();
      }
      return;
    }

    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      onSelectionOnly?.();
      node.selectContiguous();
      return;
    }

    // Files: select on single click (unchanged behaviour)
    if (!isFolder || isPeopleNode) {
      node.select();
    }
    // Folders: single click does nothing — double-click opens (see handleDoubleClick)
  };

  // Double-click on a folder: expand it AND navigate to it.
  // We use explicit open/close instead of toggle() to avoid react-arborist's
  // internal dblclick handler (which starts rename mode). stopPropagation()
  // prevents the event from reaching tree-level handlers.
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (isFolder) {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) {
        node.close();
      } else {
        node.open();
      }
      if (isPeopleNode) {
        return;
      }
      node.select();
    }
  };

  // Handle context menu (right-click)
  // Touch has no usable `contextmenu` event (iOS long-press raises the native
  // callout instead), so a long press re-dispatches a synthetic contextmenu at
  // the touch point — the same trick FileTree uses for its keyboard-driven
  // create menu. It bubbles into handleContextMenu below, so the menu payload
  // and all 33 actions stay in one place. Pairs with `touch-callout-none` on
  // the row so Apple's callout doesn't cover our menu.
  const longPressHandlers = useLongPress((x, y) => {
    const target = document.elementFromPoint(x, y);
    if (!target) return;
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    );
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    // Modifier key = pass through to browser's native context menu
    if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();

    // Previously this called `node.select()` when right-clicking a
    // non-selected node — which routed through the tree's `onSelect`,
    // which calls `setSelectedContentId`, which (for folders) navigates
    // the main panel and triggers `FolderView` to fetch the folder's
    // children. Right-clicking a folder shouldn't navigate to it; the
    // user expects ONLY the context menu. We now scope the menu via
    // `clickedId` instead — multi-select menus still work because we
    // honor the EXISTING selection when the click is inside it.
    const tree = node.tree;
    const isInExistingSelection = node.isSelected;
    const selectedIds = isInExistingSelection
      ? tree.selectedNodes?.map((n: NodeApi<TreeNode>) => n.id) || [data.id]
      : [data.id];

    // Tree clipboard (owner spec 2026-08-10): resolve ids to {id,title,type}
    // for the clipboard payload — titles come from the live selection, with
    // the clicked node as fallback.
    ensureAltTracker(); // Alt at Copy-click = strictly the URL
    const clipboardItems = (ids: string[]) => {
      const byId = new Map(
        (tree.selectedNodes ?? []).map((n: NodeApi<TreeNode>) => [n.id, n.data]),
      );
      return ids.map((id) => {
        const d = id === data.id ? data : byId.get(id);
        return {
          id,
          title: d?.title ?? "Untitled",
          contentType: d?.contentType ?? "note",
        };
      });
    };

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
          treeNodeKind: data.treeNodeKind,
          parentId: data.parentId, // Add parentId for sibling creation logic
          referenceCount,
          // Reports whether the block is actually ON SCREEN, not merely
          // flagged on — a row collapsed by its chevron hides an "expanded"
          // block, and the menu label has to say "Show" there because that is
          // what clicking will do.
          referencesExpanded: referencesExpanded && isOpen,
          referencesAtStart,
          // Gates the placement entry the same way the chip's arrow is gated,
          // so the menu never offers a reorder the row can't show.
          hasPrimaryChildren,
          externalUrl: data.external?.url, // Phase 2: External link URL
          file: data.file || null, // For supportsCustomIcon check
          isPlaybook: data.note?.playbook === true, // v3.6: state-aware Mark/Unmark
          playbookDescription:
            typeof data.note?.playbookDescription === "string"
              ? data.note.playbookDescription
              : "",
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
        // Clipboard (owner spec 2026-08-10). People nodes are synthetic —
        // no content ids to copy or move.
        onCopy: !isPeopleNode ? (ids: string[]) => {
          void copyTreeItems(clipboardItems(ids), "copy");
        } : undefined,
        onCut: !isPeopleNode ? (ids: string[]) => {
          void copyTreeItems(clipboardItems(ids), "cut");
        } : undefined,
        onPaste: !isPeopleNode ? async () => {
          await pasteTreeClipboard({
            id: data.id,
            parentId: data.parentId ?? null,
            isFolder,
            displayOrder: (data as { displayOrder?: number }).displayOrder,
          });
        } : undefined,
        hasClipboard: hasTreeClipboard(),
        onChangeIcon: onChangeIcon ? (id: string) => {
          onChangeIcon(id);
        } : undefined,
        onCreateNote: onCreate ? async (parentId: string | null) => {
          await onCreate(parentId, "note");
        } : undefined,
        onCreateFolder: onCreate ? async (parentId: string | null) => {
          await onCreate(parentId, "folder");
        } : undefined,
        onCreateFile: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "file");
        } : undefined,
        onCreateCode: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "code");
        } : undefined,
        onCreateHtml: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "html");
        } : undefined,
        onCreateDocument: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "docx");
        } : undefined,
        onCreateSpreadsheet: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "xlsx");
        } : undefined,
        onCreateExternal: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "external");
        } : undefined,
        // JSON was silently unreachable from the context menu: the shared
        // menu hides items whose callback is absent, and only the header
        // ever supplied this one (audit, 2026-08-27).
        onCreateJson: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "json");
        } : undefined,
        onCreateChat: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "chat");
        } : undefined,
        onCreateAiImage: onCreateAiImage && !isPeopleNode ? async (parentId: string | null) => {
          await onCreateAiImage(parentId);
        } : undefined,
        onAddPeopleTarget: onAddPeopleTarget && !isPeopleNode ? async (parentId: string | null) => {
          await onAddPeopleTarget(parentId);
        } : undefined,
        onCreateVisualizationMermaid: onCreateVisualizationMermaid && !isPeopleNode ? async (parentId: string | null) => {
          await onCreateVisualizationMermaid(parentId);
        } : undefined,
        onCreateVisualizationExcalidraw: onCreateVisualizationExcalidraw && !isPeopleNode ? async (parentId: string | null) => {
          await onCreateVisualizationExcalidraw(parentId);
        } : undefined,
        onCreateVisualizationDiagramsNet: onCreateVisualizationDiagramsNet && !isPeopleNode ? async (parentId: string | null) => {
          await onCreateVisualizationDiagramsNet(parentId);
        } : undefined,
        onCreateData: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "data");
        } : undefined,
        onCreateHope: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "hope");
        } : undefined,
        onCreateWorkflow: onCreate && !isPeopleNode ? async (parentId: string | null) => {
          await onCreate(parentId, "workflow");
        } : undefined,
        onDownload: onDownload ? async (ids: string[]) => {
          await onDownload(ids);
        } : undefined,
        onSetFolderView: onSetFolderView ? async (id: string, viewMode: "list" | "gallery" | "kanban" | "dashboard" | "canvas") => {
          await onSetFolderView(id, viewMode);
        } : undefined,
        onToggleReferences: (_id: string) => {
          // Same one-click reveal as the chip — the menu entry mirrors it
          // rather than reimplementing a half-open state. The id is always
          // this row's, which toggleReferenceBlock already closes over.
          toggleReferenceBlock();
        },
        onToggleReferencePosition: (id: string) => {
          toggleReferencePosition(id);
        },
        onEditExternal: async (id: string) => {
          // Dispatched to LeftSidebarContent via window event so the edit
          // dialog stays owned by the panel that hosts it.
          window.dispatchEvent(new CustomEvent('edit-external-link', { detail: { id } }));
        },
        onCopyExternalUrl: async (_id: string, url: string) => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("URL copied to clipboard");
          } catch (err) {
            clientLogger.error({
              layer: "ui",
              event: "clipboard:write_failed",
              summary: "copy URL failed",
              attrs: { component: "FileNode" },
              error: err,
            });
            toast.error("Failed to copy URL");
          }
        },
      }
    );
  };

  /**
   * Open the reference block AND the row that holds it, in one click.
   *
   * The block is spliced into this row's `children`, so flipping the block on
   * while the row itself is closed reveals nothing — it only makes the row's
   * chevron appear, leaving the user to click a second time to see anything.
   * Opening the row alongside it collapses those two steps into the one the
   * chip already promises.
   *
   * Collapsing is deliberately NOT symmetric: closing the row too would also
   * hide the primary children, which the user never asked to hide. A row whose
   * only children were references simply loses its chevron again.
   */
  const toggleReferenceBlock = () => {
    // react-arborist's tree.open() has no leaf/children guard, so opening is
    // safe even though the reference rows only land in `children` on the next
    // render. It also fires onToggle, which persists the row's own expansion;
    // setNodeExpanded is belt-and-braces and idempotent.
    const openRow = () => {
      if (node.isOpen) return;
      node.open();
      setNodeExpanded(data.id, true);
    };

    // Block already on, but the row was collapsed by its chevron: the chip
    // reads as active while showing nothing. Treat the click as "reveal"
    // rather than toggling references off — the chip always means "show me
    // these" whenever they aren't actually on screen.
    if (referencesExpanded && !node.isOpen) {
      openRow();
      return;
    }

    const willExpand = !referencesExpanded;
    toggleReferences(referenceGroupKey(data.id));
    if (willExpand) openRow();
  };

  // Reference-block chrome. Separation here is deliberately VISUAL, not
  // structural: these are ordinary tree nodes (same selection, drag and
  // context menu), drawn on a wash with a rail so system-generated
  // attachments read apart from content the user authored.
  const referenceBlockClasses = () => {
    if (!isNestedReference) return "";
    const edge = data.referenceEdge;
    const corners =
      edge === "only"
        ? "rounded-md"
        : edge === "first"
          ? "rounded-t-md"
          : edge === "last"
            ? "rounded-b-md"
            : "";
    return `bg-black/[0.035] dark:bg-white/[0.045] ${corners}`;
  };

  // Three-state visual styling
  const getBackgroundStyle = () => {
    if (node.state.willReceiveDrop && isFolder) {
      return "bg-primary/30 ring-1 ring-primary/50"; // Drop target
    }
    if (isExternalDropTarget) {
      return "bg-primary/30 ring-1 ring-primary/50"; // External file drop target
    }
    if (isActive) {
      return "bg-primary/20 text-primary font-medium"; // Active in panel (brightest)
    }
    if (isOpenInTab) {
      return "bg-gold-primary/8 text-gold-primary"; // Open in another tab
    }
    if (isMultiSelected) {
      return "bg-white/8 text-gray-300"; // Multi-selected (subtle)
    }
    if (isSelected) {
      return "bg-primary/10 text-primary"; // Selected but not active (medium)
    }
    return "hover:bg-black/[0.03] dark:hover:bg-black/[0.03] dark:bg-white/5"; // Default hover
  };

  return (
    <div
      ref={dragHandle}
      style={style}
      // Row identity for pointer hit-testing during external file drags
      // (react-arborist's row wrapper carries no id attribute).
      data-tree-node-id={data.id}
      // Native tooltip rather than a Radix one: this renders per row in a
      // virtualized tree, so a portal-backed tooltip per node would be a
      // real cost for a hover hint. Child badges keep their own `title`
      // (playbook, upload-failed, draft) and win when hovered directly.
      title={formatNodeTimestamps(data)}
      className={`
        touch-callout-none
        flex items-center gap-2 px-2 py-1 cursor-pointer
        transition-colors duration-150
        ${referenceBlockClasses()}
        ${getBackgroundStyle()}
        ${node.state.isDragging ? "opacity-50" : ""}
      `}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      {...longPressHandlers}
      onDragStart={() => {
        // Record the dragged node(s) so out-of-tree drop targets (the chat
        // composer, the workspace tab strips) can read them. People nodes are
        // synthetic and have no content id, so skip them.
        if (isPeopleNode) return;
        const primary = {
          id: node.id,
          title: data.title,
          contentType: data.contentType,
        };
        // Mirror react-arborist's dragIds: a drag that starts on a selected
        // row carries the whole selection (tree order), otherwise just the
        // grabbed row.
        const draggedNodes =
          node.isSelected && tree.selectedNodes && tree.selectedNodes.length > 1
            ? tree.selectedNodes
                .filter(
                  (selected: NodeApi<TreeNode>) =>
                    selected.data.treeNodeKind !== "peopleGroup" &&
                    selected.data.treeNodeKind !== "person"
                )
                .map((selected: NodeApi<TreeNode>) => ({
                  id: selected.id,
                  title: selected.data.title,
                  contentType: selected.data.contentType,
                }))
            : [primary];
        useTreeDragStore.getState().setDraggingNode(primary, draggedNodes);
      }}
      onDragEnd={() => useTreeDragStore.getState().setDraggingNode(null)}
      onPointerEnter={() => {
        // Best-effort prefetch — warms the server-side content cache so
        // the click that follows reads in <1ms. Skipped for synthetic
        // tree entries (people group / person nodes) that don't have a
        // corresponding /api/content/content/[id] route, and for
        // soft-deleted rows where a fresh GET should hit the DB.
        if (isPeopleNode) return;
        if (data.deletedAt) return;
        prefetchContent(node.id);
      }}
    >
      <div className="flex items-center gap-1">
        {/* Rail + half-step indent for reference-block rows. A half step (8px
            against the tree's 15px) separates the block without implying a
            parent row that doesn't exist. */}
        {isNestedReference && (
          <span aria-hidden className="flex h-full w-2 flex-none justify-center">
            <span className="w-px self-stretch bg-black/10 dark:bg-white/15" />
          </span>
        )}
        {getChevron()}
        {/* Corner badges use the OS-alias idiom: a small glyph on the icon's
            corner. Playbook takes precedence over the referenced marker — a
            note that's both is more usefully surfaced as a playbook. Both share
            the referenced badge's formatting; only the glyph differs (v3.6). */}
        {data.note?.playbook ? (
          <span data-file-icon className="relative inline-flex">
            {getIcon()}
            <span
              aria-hidden
              title="Playbook"
              className="absolute -bottom-0.5 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-white text-indigo-500 shadow-sm ring-1 ring-black/10 dark:bg-gray-800 dark:text-indigo-400 dark:ring-white/15"
            >
              <BookMarked className="h-2 w-2" />
            </span>
          </span>
        ) : data.role === "referenced" ? (
          <span data-file-icon className="relative inline-flex">
            {getIcon()}
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-black/10 dark:bg-gray-800 dark:text-gray-400 dark:ring-white/15"
            >
              <LucideIcons.Link className="h-2 w-2" />
            </span>
          </span>
        ) : (
          <span data-file-icon>{getIcon()}</span>
        )}
      </div>
      <span
        className={`
          flex-1 truncate text-sm
          ${node.isSelected ? "font-medium" : ""}
          ${data.deletedAt ? "line-through opacity-50" : ""}
          ${data.role === "referenced" && !data.deletedAt && !node.isSelected ? "text-gray-500 dark:text-gray-400" : ""}
        `}
      >
        {node.isEditing ? (
          <FileNameInput
            value={activeEditingValue}
            extension={extension}
            onChange={(value) => setEditingDraft(data.id, value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            autoFocus
            focusBehavior={editingValue === undefined ? "select" : "end"}
            className="w-full bg-transparent border-b border-primary focus:outline-none"
          />
        ) : (
          <>
            <span>{basename}</span>
            {extension && (
              <span className="text-gray-500 dark:text-gray-400">{extension}</span>
            )}
          </>
        )}
      </span>

      {/* Reference count chip — the affordance that opens this row's
          reference block. Allowed to compete for the trailing edge because it
          carries more than the draft dot it displaced. Right-click reaches the
          row's own menu, which grows reference-group actions when count > 0. */}
      {referenceCount > 0 && (
        <span
          className={`
            flex flex-none items-center rounded-full border
            text-[10px] leading-none tabular-nums transition-colors
            ${
              referencesExpanded
                ? "border-gold-primary/40 bg-gold-primary/15 text-gold-primary"
                : "border-black/10 bg-black/[0.04] text-gray-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-400"
            }
          `}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // never select or open the content itself
              toggleReferenceBlock();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            aria-expanded={referencesExpanded}
            aria-label={
              referencesExpanded
                ? `Hide ${referenceCount} referenced items`
                : `Show ${referenceCount} referenced items`
            }
            title={`${referenceCount} referenced item${referenceCount === 1 ? "" : "s"}`}
            className="flex items-center gap-1 rounded-full px-1.5 py-px transition-colors hover:text-gray-800 dark:hover:text-gray-200"
          >
            <LucideIcons.Link className="h-2 w-2" />
            {referenceCount}
          </button>

          {/* Placement toggle. Rendered only while the block is open AND this
              row has primary children to order it against — on a collapsed
              block, or a row that holds nothing but references, the control
              offers a swap with no visible outcome. */}
          {referencesExpanded && hasPrimaryChildren && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleReferencePosition(data.id);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              tabIndex={-1}
              aria-label={
                referencesAtStart
                  ? "Move referenced items below content"
                  : "Move referenced items above content"
              }
              title={
                referencesAtStart
                  ? "Referenced items first — click to move below"
                  : "Referenced items last — click to move above"
              }
              className="flex items-center rounded-full border-l border-gold-primary/30 px-1 py-px transition-opacity hover:opacity-100 opacity-70"
            >
              <LucideIcons.ArrowUpDown className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      )}

      {/* Upload status indicator for files */}
      {data.file && data.file.uploadStatus === "uploading" && (
        <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
      )}
      {data.file && data.file.uploadStatus === "failed" && (
        <div className="h-2 w-2 rounded-full bg-red-500" title="Upload failed" />
      )}

      {/* Publish status. Silent for the "never published" majority — the old
          dot fired on `!isPublished`, a legacy share-link boolean the
          publishing extension never writes, so it appeared on nearly every row
          and meant nothing. Only live and withdrawn earn a pixel now. */}
      {data.publishState === "live" && (
        <div
          className="h-2 w-2 flex-none rounded-full bg-emerald-500"
          title="Published"
        />
      )}
      {data.publishState === "withdrawn" && (
        <div
          className="h-2 w-2 flex-none rounded-full bg-amber-500"
          title="Unpublished — this was live"
        />
      )}
    </div>
  );
}
