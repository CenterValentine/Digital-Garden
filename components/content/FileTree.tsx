/**
 * FileTree Component
 *
 * Virtualized file tree using react-arborist.
 * Supports:
 * - Drag-and-drop reordering
 * - Custom icons and hierarchical navigation
 * - Keyboard navigation (Arrow keys, Enter, Space)
 * - Multi-selection (Cmd+Click, Shift+Click)
 * - Context menu (right-click)
 *
 * M4: File Tree Completion - Full Interaction Support
 */

"use client";

import { useRef, useEffect, useMemo } from "react";
import { Tree, type NodeApi, type TreeApi, type NodeRendererProps } from "react-arborist";
import type { useDragDropManager } from "react-dnd";
import { dropRowFor, resolveDropAnchor } from "@/lib/domain/content/sibling-order";
import { FileNode } from "./FileNode";
import { useSpringOpen } from "./use-spring-open";
import { useTreeStateStore } from "@/state/tree-state-store";
import { useTreeRevealStore, type TreeRevealRequest } from "@/state/tree-reveal-store";
import { clientLogger } from "@/lib/core/logger/client";
import type { TreeNode } from "@/lib/domain/content/types";
import { expandReferences } from "@/lib/features/content/reference-group";
import {
  expandShortcutMirrors,
  buildTreeIndex,
  resolveDropForwardTarget,
} from "@/lib/features/content/shortcut-mirror";
import {
  acceptsDropInto,
  besideRowIndex,
  dropRefused,
  isUndraggableRow,
  realIdOfRow,
  wouldNestInItself,
} from "@/lib/features/content/drop-rules";
import { dropEdgeFor } from "@/lib/features/content/drop-edge";
import { showKeptSorts } from "@/lib/features/content/kept-sort-display";
import { showInTextEdits } from "@/lib/features/content/in-text-media";
import { useSettingsStore } from "@/state/settings-store";
import { useInTextMediaStore } from "@/state/in-text-media-store";
import type { KeptSort } from "@/lib/domain/content/sibling-order";

/** A stable empty map, so the mirror memo doesn't rebuild for "no sorts". */
const NO_SHORTCUT_SORTS: Readonly<Record<string, KeptSort>> = {};
const NO_CARRIED_TARGETS: TreeNode[] = [];

interface FileTreeProps {
  data: TreeNode[];
  /**
   * Folders that shortcuts in a view-scoped tree point at but the view leaves
   * out (tree API `shortcutTargets`). Only the shortcut mirror reads them.
   */
  shortcutTargets?: TreeNode[];
  /**
   * The sort the top level keeps — the view root's (tree API `rootTreeSort`).
   * Folders below carry their own (`folder.treeSort`).
   */
  rootTreeSort?: KeptSort | null;
  /** The view root, then its ancestors (tree API `rootAncestry`; empty when unscoped). */
  rootAncestry?: string[];
  onMove?: (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
    /**
     * The row the drop landed after (null = first of its kind), read from the
     * rows ON SCREEN. `index` counts those rows too — including a spliced-in
     * reference block — so it is only meaningful in this list; the anchor
     * means the same thing to the server. Absent when it can't be resolved.
     */
    afterId?: string | null;
  }) => Promise<void>;
  onSelect?: (
    nodes: TreeNode[],
    options?: { openContent: boolean },
  ) => void;
  onRename?: (id: string, name: string) => Promise<void>;
  onCreate?: (parentId: string | null, type: "folder" | "note" | "file" | "code" | "html" | "docx" | "xlsx" | "json" | "external" | "shortcut" | "chat" | "visualization" | "data" | "hope" | "workflow") => Promise<void>;
  onDelete?: (ids: string | string[]) => Promise<void>; // Support both single ID and batch delete
  onDuplicate?: (ids: string[]) => Promise<void>; // Duplicate content node(s)
  onDownload?: (ids: string[]) => Promise<void>; // Download file(s)
  onChangeIcon?: (id: string) => void; // Change custom icon
  /** Phase 2: Folder view mode switching */
  onSetFolderView?: (id: string, viewMode: "list" | "gallery" | "kanban" | "dashboard" | "canvas") => Promise<void>;
  /** Visualization engine-specific creators */
  onCreateVisualizationMermaid?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationExcalidraw?: (parentId: string | null) => Promise<void>;
  onCreateVisualizationDiagramsNet?: (parentId: string | null) => Promise<void>;
  onCreateAiImage?: (parentId: string | null) => Promise<void>;
  onAddPeopleTarget?: (parentId: string | null) => Promise<void>;
  height?: number;
  editingNodeId?: string; // If set, automatically triggers edit mode on this node
  expandNodeId?: string | null; // If set, imperatively expands this node
  onExpandComplete?: () => void; // Called after expansion completes
  /**
   * If set, opens ancestors, scrolls to (per `align`), selects this node and
   * optionally flashes it. The caller passes a request only when the node is
   * in `data` — see LeftSidebarContent.
   */
  revealRequest?: TreeRevealRequest | null;
  onRevealComplete?: () => void; // Called after the reveal request is consumed
  /** Optional: the DnD manager of a parent DndProvider (FileTreeWithDropZone). */
  dndManager?: ReturnType<typeof useDragDropManager>;
}

export function FileTree({
  data,
  shortcutTargets,
  rootTreeSort,
  rootAncestry,
  onMove,
  onSelect,
  onRename,
  onCreate,
  onDelete,
  onDuplicate,
  onDownload,
  onChangeIcon,
  onSetFolderView,
  onCreateVisualizationMermaid,
  onCreateVisualizationExcalidraw,
  onCreateVisualizationDiagramsNet,
  onCreateAiImage,
  onAddPeopleTarget,
  height = 600,
  editingNodeId,
  expandNodeId,
  onExpandComplete,
  revealRequest,
  onRevealComplete,
  dndManager,
}: FileTreeProps) {
  const treeRef = useRef<TreeApi<TreeNode> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    expandedIds,
    referencesAtStartIds,
    hiddenNestedShortcutIds,
    setExpanded,
    selectedIds,
    setSelectedIds,
    scrollOffset,
    setScrollOffset,
    restoreVersion,
  } = useTreeStateStore();
  const hasRestoredRef = useRef(false);
  const isRestoringScrollRef = useRef(false);
  // React Arborist emits one onSelect callback for both navigation clicks
  // and range-selection clicks. FileNode marks Shift-clicks immediately
  // before selectContiguous() so this callback can persist the selection
  // without asking the parent to open any content.
  const selectionOnlyRef = useRef(false);

  useEffect(() => {
    const targetOffset = scrollOffset;
    let frameId = 0;
    let attempts = 0;
    isRestoringScrollRef.current = true;

    const restore = () => {
      treeRef.current?.list.current?.scrollTo(targetOffset);
      attempts += 1;

      if (attempts < 4) {
        frameId = requestAnimationFrame(restore);
        return;
      }

      isRestoringScrollRef.current = false;
    };

    frameId = requestAnimationFrame(restore);

    return () => {
      cancelAnimationFrame(frameId);
      isRestoringScrollRef.current = false;
    };
  }, [restoreVersion]);

  // Restore selection ONCE on initial mount from persisted IDs
  useEffect(() => {
    // Only restore once when component first mounts
    if (hasRestoredRef.current || selectedIds.length === 0 || !treeRef.current) return;

    const tree = treeRef.current;
    if (!tree || !tree.visibleNodes) return;

    // Build a set of all valid IDs in current tree data
    const allIds = new Set<string>();
    // Walks `references` as well as `children`: this set decides which
    // persisted selections survive, and a row inside a reference block would
    // otherwise be judged stale and silently deselected.
    const collectIds = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.id);
        if (node.children) {
          collectIds(node.children);
        }
        if (node.references) {
          collectIds(node.references);
        }
      });
    };
    collectIds(data);

    // Filter out stale IDs that no longer exist
    const validIds = selectedIds.filter(id => allIds.has(id));

    // If any IDs were removed, update the store
    if (validIds.length !== selectedIds.length) {
      setSelectedIds(validIds);
      return; // Will re-run with cleaned IDs
    }

    // Mark as restored before attempting restore to prevent loops
    hasRestoredRef.current = true;

    // Restore selection programmatically using tree API
    const timeoutId = setTimeout(() => {
      const tree = treeRef.current;
      if (!tree || !tree.visibleNodes) return;

      const nodesToSelect = tree.visibleNodes.filter((node: NodeApi<TreeNode>) =>
        validIds.includes(node.id)
      );

      if (nodesToSelect.length > 0) {
        // Select each node using the node's select method
        nodesToSelect.forEach((node: NodeApi<TreeNode>, index: number) => {
          if (node && node.select) {
            // First node: regular select, rest: selectMulti to add to selection
            if (index === 0) {
              node.select();
            } else {
              node.selectMulti();
            }
          }
        });

        // Also trigger the onSelect callback to update parent state
        if (onSelect) {
          const selectedNodes = nodesToSelect.map((n: NodeApi<TreeNode>) => n.data);
          onSelect(selectedNodes);
        }
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [data]); // Only run when data changes (initial load and refetch)

  // Handle selection changes from external sources (like search panel)
  // This runs AFTER initial restoration to handle programmatic selection updates
  useEffect(() => {
    if (!hasRestoredRef.current || !treeRef.current || selectedIds.length === 0) return;

    const tree = treeRef.current;
    if (!tree || !tree.visibleNodes) return;

    // Get currently selected node IDs from the tree
    const currentlySelected = tree.selectedNodes?.map((n: NodeApi<TreeNode>) => n.id) || [];

    // Check if selection actually changed (avoid loops)
    const selectedIdsSet = new Set(selectedIds);
    const currentlySelectedSet = new Set(currentlySelected);
    const hasChanged = selectedIds.length !== currentlySelected.length ||
      selectedIds.some(id => !currentlySelectedSet.has(id));

    if (!hasChanged) return;

    // Find nodes to select
    const nodesToSelect = tree.visibleNodes.filter((node: NodeApi<TreeNode>) =>
      selectedIdsSet.has(node.id)
    );

    if (nodesToSelect.length > 0) {
      // Select nodes programmatically
      nodesToSelect.forEach((node: NodeApi<TreeNode>, index: number) => {
        if (node && node.select) {
          if (index === 0) {
            node.select();
          } else {
            node.selectMulti();
          }
        }
      });

      // Trigger onSelect callback
      if (onSelect) {
        const selectedNodes = nodesToSelect.map((n: NodeApi<TreeNode>) => n.data);
        onSelect(selectedNodes);
      }
    }
  }, [selectedIds]); // React to selectedIds changes

  // Node renderer. Inline-rename drafts live in `useFileTreeEditStore`
  // (read inside FileNode), NOT in this component's state — so a keystroke
  // re-renders only the editing node and never re-creates this renderer or
  // remounts rows (which used to snap the rename caret to the end).
  const NodeWithCallbacks = (props: NodeRendererProps<TreeNode>) => {
    return (
      <FileNode
        {...props}
        onRename={onRename}
        onCreate={onCreate}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onDownload={onDownload}
        onChangeIcon={onChangeIcon}
        onSetFolderView={onSetFolderView}
        onCreateVisualizationMermaid={onCreateVisualizationMermaid}
        onCreateVisualizationExcalidraw={onCreateVisualizationExcalidraw}
        onCreateVisualizationDiagramsNet={onCreateVisualizationDiagramsNet}
        onCreateAiImage={onCreateAiImage}
        onAddPeopleTarget={onAddPeopleTarget}
        onSelectionOnly={() => {
          selectionOnlyRef.current = true;
        }}
      />
    );
  };

  // Reference blocks are a DATA transform, not tree open-state: the chip
  // rewrites what `children` contains rather than asking react-arborist to
  // open anything, which is why references need no node of their own.
  //
  // Shortcut mirroring runs AFTER, over the result, for two reasons: the index
  // it builds must see the same `children` react-arborist will, and a mirrored
  // row then never has to reason about reference blocks. Both transforms
  // preserve object identity when nothing changed — see their identity
  // contracts — so this pair still re-renders no more rows than it must.
  //
  // Folders that keep a sort are shown in it FIRST (kept-sort-display.ts), so
  // an optimistic change takes its sorted place at once and a shortcut's
  // contents follow the folder's own sort.
  //
  // Before that: media a note's text just gained or lost is shown with that
  // note now, not after the save (in-text-media.ts). Across both forests, so
  // an image can move between the tree and a carried shortcut target.
  const inTextEdits = useInTextMediaStore((state) => state.edits);
  const [editedData, editedTargets] = useMemo(() => {
    const [tree, targets] = showInTextEdits([data, shortcutTargets ?? NO_CARRIED_TARGETS], inTextEdits);
    return [tree, shortcutTargets ? targets : shortcutTargets] as const;
  }, [data, shortcutTargets, inTextEdits]);
  const shownData = useMemo(
    () => showKeptSorts(editedData, rootTreeSort ?? null),
    [editedData, rootTreeSort],
  );
  // Shortcuts' own sorts (view-only — they never change the folder).
  const shortcutSorts = useSettingsStore((state) => state.ui?.shortcutSorts ?? NO_SHORTCUT_SORTS);
  // Real parent of every loaded row (mirror rows excluded — they are views),
  // plus the view root's ancestors: what `wouldNestInItself` walks.
  const realParentOf = useMemo(() => {
    const parents = new Map<string, string | null>();
    const index = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (!node.isShortcutMirror) parents.set(node.id, node.parentId ?? null);
        if (node.children?.length) index(node.children);
        if (node.references?.length) index(node.references);
      }
    };
    index(data);
    if (shortcutTargets) index(shortcutTargets);
    (rootAncestry ?? []).forEach((id, i) => {
      if (!parents.has(id)) parents.set(id, rootAncestry?.[i + 1] ?? null);
    });
    return parents;
  }, [data, shortcutTargets, rootAncestry]);
  const shownTargets = useMemo(
    () => (editedTargets ? showKeptSorts(editedTargets, null) : editedTargets),
    [editedTargets],
  );
  const treeData = useMemo(() => {
    const withReferences = expandReferences(
      shownData,
      expandedIds,
      referencesAtStartIds,
    );
    return expandShortcutMirrors(
      withReferences,
      expandedIds,
      buildTreeIndex(withReferences, shownTargets),
      hiddenNestedShortcutIds,
      0,
      shortcutSorts,
    );
  }, [shownData, shownTargets, expandedIds, referencesAtStartIds, hiddenNestedShortcutIds, shortcutSorts]);

  // Get initial open state from persisted IDs
  const initialOpenState = useMemo(() => {
    const openState: Record<string, boolean> = {};
    expandedIds.forEach((id) => {
      openState[id] = true;
    });
    return openState;
  }, [expandedIds]);

  const handleMove = async (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
    parentNode?: NodeApi<TreeNode> | null;
    dragNodes?: NodeApi<TreeNode>[];
  }) => {
    if (onMove) {
      try {
        let parentNode = args.parentNode ?? null;
        let parentId = args.parentId;
        let index = args.index;
        // Released over the middle of a row that can't take the drop (a note,
        // a file): disableDrop only lets that through as "beside the row", so
        // place it there — above or below, by the half the pointer was in,
        // the same half the row drew its line on.
        const drags = (args.dragNodes ?? []).map((dragNode) => dragNode.data);
        if (parentNode && !parentNode.isRoot && !acceptsDropInto(parentNode.data, drags)) {
          const row = parentNode;
          const holder = row.parent && !row.parent.isRoot ? row.parent : null;
          const siblings = (holder ? holder.children : treeRef.current?.root?.children) ?? [];
          const rowIndex = siblings.findIndex((sibling) => sibling.id === row.id);
          parentNode = holder;
          parentId = holder ? holder.id : null;
          index = besideRowIndex(rowIndex, dropEdgeFor(row.id));
        }
        // The rows the drop index counts: the new parent's rendered children
        // (reference block and mirrors included), or the top level.
        const visible: NodeApi<TreeNode>[] =
          (parentNode
            ? parentNode.children
            : treeRef.current?.root?.children) ?? [];
        const first = args.dragNodes?.[0]?.data;
        // A referenced row dropped under a parent joins its reference block
        // and is ordered among references; everything else among primaries.
        // The top level has no block, so everything there is primary.
        const kind =
          parentId !== null && first?.role === "referenced" ? "reference" : "primary";
        const afterId = resolveDropAnchor(
          visible.map((row) => dropRowFor(row.data)),
          index,
          new Set(args.dragIds),
          kind,
        );
        // A shortcut's row stands for real content: move THAT. (The anchor
        // above still skips the dragged rows by their on-screen ids.)
        const realDragIds = args.dragNodes?.length
          ? [
              ...new Set(
                args.dragNodes.map((node) =>
                  node.data.isShortcutMirror && node.data.mirrorOf ? node.data.mirrorOf : node.id,
                ),
              ),
            ]
          : args.dragIds;
        await onMove({
          dragIds: realDragIds,
          parentId,
          index,
          afterId,
        });
      } catch (error) {
        clientLogger.error({
          layer: "ui",
          event: "filetree_move:caught",
          summary: "filetree move handler caught",
          error,
        });
      }
    }
  };

  const handleSelect = (nodes: NodeApi<TreeNode>[]) => {
    const nodeIds = nodes.map(n => n.id);
    const openContent = !selectionOnlyRef.current;
    selectionOnlyRef.current = false;

    // Persist selection state
    setSelectedIds(nodeIds);

    // Notify parent
    if (onSelect) {
      const selectedNodes = nodes.map(n => n.data);
      onSelect(selectedNodes, { openContent });
    }
  };

  // Persist toggle state
  const handleToggle = (id: string) => {
    // Toggle in the store when a node is toggled
    // Note: We need to check the CURRENT state in expandedIds, not the node state
    const isCurrentlyExpanded = expandedIds.has(id);
    setExpanded(id, !isCurrentlyExpanded);
  };

  const handleScroll = ({ scrollOffset: nextScrollOffset }: { scrollOffset: number }) => {
    if (isRestoringScrollRef.current) return;
    setScrollOffset(nextScrollOffset);
  };

  /**
   * Whether `node` is `ancestor` or sits anywhere under it. (The function this
   * replaces walked up from the DRAGGED row, so it refused a drop into any
   * folder that already held the item — every reorder — but it lived in a
   * `canDrop` react-arborist never called, so it never ran.)
   */
  const isWithin = (node: NodeApi<TreeNode> | null, ancestor: NodeApi<TreeNode>): boolean => {
    for (let at = node; at; at = at.parent) {
      if (at.id === ancestor.id) return true;
    }
    return false;
  };

  /**
   * react-arborist asks this on every hover; `true` refuses the drop (no line,
   * no highlight, nothing sent). It is the only drop hook react-arborist 3.4
   * reads — the `canDrop` prop FileTree used to pass was never called, so the
   * drop rules never ran and the server refused what they were meant to stop.
   * The decision is `dropRefused` (drop-rules.ts); react-arborist itself
   * already refuses a drop into the dragged rows or anything under them.
   */
  const disableDrop = ({
    parentNode,
    dragNodes,
  }: {
    parentNode: NodeApi<TreeNode>;
    dragNodes: NodeApi<TreeNode>[];
    index: number;
  }): boolean => {
    const holder = parentNode.isRoot || !parentNode.parent || parentNode.parent.isRoot
      ? null
      : parentNode.parent;
    const drags = dragNodes.map((dragNode) => dragNode.data);
    const refused = dropRefused({
      target: parentNode.isRoot ? null : parentNode.data,
      holder: holder?.data ?? null,
      drags,
      // The pointer is over the MIDDLE of the row: react-arborist reports
      // that as "inside it" with no index.
      insideRow: treeRef.current?.state.dnd.index === null,
      holderWithinDrags: holder !== null && dragNodes.some((dragNode) => isWithin(holder, dragNode)),
    });
    if (refused) return true;
    // Never a folder inside itself, judged by REAL ids: through a shortcut
    // the same folder shows twice, so the on-screen check above can't see it
    // (drop-rules.ts `wouldNestInItself`). The drop lands inside the row when
    // the row takes it, otherwise beside it — in the row's own list.
    const destination = parentNode.isRoot
      ? null
      : acceptsDropInto(parentNode.data, drags)
        ? parentNode
        : holder;
    const destinationRealId = destination
      ? (resolveDropForwardTarget(destination.data) ?? realIdOfRow(destination.data))
      : (rootAncestry?.[0] ?? null);
    return wouldNestInItself(destinationRealId, drags.map(realIdOfRow), (id) => realParentOf.get(id));
  };

  // Keyboard shortcuts (scoped to file tree)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // CRITICAL: Don't handle shortcuts if user is typing in an input
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (isTyping) {
        // User is editing - let the input handle the keystroke
        return;
      }

      // Also check if any node in the tree is being edited
      const tree = treeRef.current;
      const isAnyNodeEditing = tree?.visibleNodes?.some((node: NodeApi<TreeNode>) => node.isEditing);

      if (isAnyNodeEditing) {
        // A node is being renamed - don't intercept keystrokes
        return;
      }

      // Option + letter (owner call, 2026-10-02). These were bare letters and
      // collided with the pane-aiming cluster (lib/features/content/
      // pane-hotkeys.ts): holding "d" to aim at the right pane deleted the
      // selection. The aiming keys stay bare — they are the discoverable
      // gesture — and these three take the modifier instead.
      //
      // Compared on `e.code`, not `e.key`: under Option, macOS turns the key
      // into a glyph (⌥R "®", ⌥D "∂", ⌥A "å") and a `key` comparison would
      // match none of them — the shortcuts would simply stop working on the
      // modifier they moved to.
      const isOptionKey = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey;

      // ⌥R - Rename selected node
      // Safer than F2 which Vivaldi intercepts
      // Special case: For external links, triggers Edit Link dialog instead
      if (e.code === "KeyR" && isOptionKey && onRename) {
        e.preventDefault();
        e.stopPropagation();
        const tree = treeRef.current;
        if (tree?.selectedNodes?.length === 1) {
          const node = tree.selectedNodes[0];

          // A row inside a shortcut (or a window row) is a projection: its
          // name belongs to the original's own row. The menu greys Rename out
          // here; the key does nothing.
          if (node.data.isShortcutMirror) return;

          // Check if this is an external link
          if (node.data.contentType === "external") {
            // Dispatch edit event for external links instead of inline rename
            window.dispatchEvent(new CustomEvent('edit-external-link', {
              detail: { id: node.id }
            }));
          } else {
            // Original behavior: inline rename for all other content types
            node.edit();
          }
        }
        return;
      }

      // ⌥D - Delete selected nodes
      // Safer than Delete key which navigates back in Vivaldi
      if (e.code === "KeyD" && isOptionKey && onDelete) {
        e.preventDefault();
        e.stopPropagation();
        const tree = treeRef.current;
        if (tree?.selectedNodes?.length > 0) {
          // Pass all selected node IDs for batch delete
          const selectedIds = tree.selectedNodes.map((node: NodeApi<TreeNode>) => node.id);
          onDelete(selectedIds);
        }
        return;
      }

      // ⌥A - Open create menu (shows all content types)
      // Opens context menu at selected node position
      if (e.code === "KeyA" && isOptionKey && onCreate) {
        e.preventDefault();
        e.stopPropagation();
        const tree = treeRef.current;
        const selectedNode = tree?.selectedNodes?.[0];

        if (selectedNode) {
          // Trigger right-click on selected node to show create menu.
          // `element` is a runtime-only field on NodeApi (set by the rendered
          // node), not part of the public 3.4 type — narrow rather than `any`.
          const nodeElement = (selectedNode as NodeApi<TreeNode> & { element?: HTMLElement | null }).element;
          if (nodeElement) {
            const rect = nodeElement.getBoundingClientRect();
            // Simulate right-click event at node position
            const syntheticEvent = new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + 20,
              clientY: rect.top + rect.height / 2,
            });
            nodeElement.dispatchEvent(syntheticEvent);
          }
        } else {
          // No node selected, open menu at tree top-left
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const syntheticEvent = new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + 20,
              clientY: rect.top + 20,
            });
            containerRef.current.dispatchEvent(syntheticEvent);
          }
        }
        return;
      }

      // Shift+A - Create folder directly (shortcut bypass)
      if (e.key === "A" && e.shiftKey && !e.metaKey && !e.ctrlKey && onCreate) {
        e.preventDefault();
        e.stopPropagation();
        const tree = treeRef.current;
        const parentId = tree?.selectedNodes?.[0]?.id || null;
        onCreate(parentId, "folder");
        return;
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [onRename, onDelete, onCreate]);

  // Auto-expand node when expandNodeId changes (for creating in collapsed folders)
  useEffect(() => {
    if (!expandNodeId) return;

    const tree = treeRef.current;
    if (!tree) return;

    // Find the node by ID and open it imperatively
    const node = tree.visibleNodes?.find((n: NodeApi<TreeNode>) => n.id === expandNodeId);
    if (!node) return;

    if (!node.isOpen) {
      // Open the node imperatively via react-arborist API
      node.open();

      // Also update Zustand store to persist the state
      setExpanded(expandNodeId, true);
    }

    // Clear the request either way — a node that was already open still
    // satisfies it, and leaving the id set would swallow the next request
    // for the same node.
    onExpandComplete?.();
  }, [expandNodeId, onExpandComplete, setExpanded]);

  // During a drag, a collapsed row held under the pointer opens, and closes
  // again when the pointer leaves it (spring-open.ts).
  useSpringOpen(treeRef, containerRef, setExpanded);

  // Reveal request (toolbar "show in file tree", breadcrumb, or the tree
  // following the active content): mirror a real selection of the node.
  // scrollTo opens every ancestor (firing onToggle per folder, which keeps
  // the persisted expandedIds store in sync — it only ADDS, never collapses
  // what the user had open), waits for the row to appear, and scrolls it
  // per `align` ("auto" leaves a visible row where it is). Selection
  // deliberately happens AFTER the row exists: tree.select on a still-hidden
  // node fires onSelect against a stale visible-row index, reporting an
  // empty selection and wiping the store selection the caller just set. An
  // already-selected row is left alone so a tree click doesn't re-open its
  // own content. A node absent from this tree (workspace-scoped view, stale
  // id) makes scrollTo's internal wait give up after ~1s and the select is
  // skipped — callers avoid that by requesting only nodes present in `data`.
  useEffect(() => {
    if (!revealRequest) return;
    const { id, align, flash } = revealRequest;

    const tree = treeRef.current;
    if (tree) {
      Promise.resolve(tree.scrollTo(id, align)).then(() => {
        const node = treeRef.current?.get(id);
        if (node && !node.isSelected) node.select();
        if (flash) useTreeRevealStore.getState().flashNode(id);
      });
    }

    // Clear the request either way so the next reveal for the same node
    // isn't swallowed.
    onRevealComplete?.();
  }, [revealRequest, onRevealComplete]);

  // Auto-trigger edit mode when editingNodeId changes (for inline creation)
  useEffect(() => {
    if (!editingNodeId) return;

    const tree = treeRef.current;
    if (!tree) return;

    // Small delay to ensure the node is rendered in the DOM
    const timeoutId = setTimeout(() => {
      // Find the node by ID
      const node = tree.visibleNodes?.find((n: NodeApi<TreeNode>) => n.id === editingNodeId);

      if (node && !node.isEditing) {
        // Trigger edit mode
        node.edit();
      }
    }, 50); // 50ms delay to ensure react-arborist has rendered the node

    return () => clearTimeout(timeoutId);
  }, [editingNodeId]);


  return (
    <div
      ref={containerRef}
      className="h-full w-full focus:outline-none"
      data-tree-id="file-tree"
      tabIndex={0}
    >
      <Tree
        key={restoreVersion}
        ref={treeRef}
        data={treeData}
        openByDefault={false}
        initialOpenState={initialOpenState}
        disableMultiSelection={false}
        width="100%"
        height={height}
        indent={15}
        rowHeight={32}
        overscanCount={10}
        paddingTop={8}
        paddingBottom={8}
        idAccessor="id"
        childrenAccessor="children"
        onMove={handleMove}
        onSelect={handleSelect}
        onScroll={handleScroll}
        onToggle={handleToggle}
        onRename={({ id, name }) => {
          // Called when user submits inline edit (Enter or blur)
          if (onRename) {
            onRename(id, name);
          }
        }}
        disableDrag={onMove ? (row: TreeNode) => isUndraggableRow(row) : true}
        disableDrop={onMove ? disableDrop : true}
        {...(dndManager && { dndManager })} // Pass dndManager if provided
      >
        {NodeWithCallbacks}
      </Tree>
    </div>
  );
}
