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
import { Tree, type NodeApi } from "react-arborist";
import { FileNode } from "./FileNode";
import { useTreeStateStore } from "@/state/tree-state-store";
import type { TreeNode } from "@/lib/domain/content/types";

interface FileTreeProps {
  data: TreeNode[];
  onMove?: (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) => Promise<void>;
  onSelect?: (nodes: TreeNode[]) => void;
  onRename?: (id: string, name: string) => Promise<void>;
  onCreate?: (parentId: string | null, type: "folder" | "note" | "file" | "code" | "html") => Promise<void>;
  onDelete?: (ids: string | string[]) => Promise<void>; // Support both single ID and batch delete
  onDuplicate?: (ids: string[]) => Promise<void>; // Duplicate content node(s)
  onDownload?: (ids: string[]) => Promise<void>; // Download file(s)
  height?: number;
  editingNodeId?: string; // If set, automatically triggers edit mode on this node
  expandNodeId?: string | null; // If set, imperatively expands this node
  onExpandComplete?: () => void; // Called after expansion completes
  dndManager?: any; // Optional: DndManager from parent DndProvider
}

export function FileTree({
  data,
  onMove,
  onSelect,
  onRename,
  onCreate,
  onDelete,
  onDuplicate,
  onDownload,
  height = 600,
  editingNodeId,
  expandNodeId,
  onExpandComplete,
  dndManager,
}: FileTreeProps) {
  const treeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { expandedIds, setExpanded, selectedIds, setSelectedIds } = useTreeStateStore();
  const hasRestoredRef = useRef(false);

  // Restore selection ONCE on initial mount from persisted IDs
  useEffect(() => {
    // Only restore once when component first mounts
    if (hasRestoredRef.current || selectedIds.length === 0 || !treeRef.current) return;

    const tree = treeRef.current;
    if (!tree || !tree.visibleNodes) return;

    // Build a set of all valid IDs in current tree data
    const allIds = new Set<string>();
    const collectIds = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.id);
        if (node.children) {
          collectIds(node.children);
        }
      });
    };
    collectIds(data);

    // Filter out stale IDs that no longer exist
    const validIds = selectedIds.filter(id => allIds.has(id));

    // If any IDs were removed, update the store
    if (validIds.length !== selectedIds.length) {
      console.log(`[FileTree] Cleaned stale selection IDs: ${selectedIds.length - validIds.length} removed`);
      setSelectedIds(validIds);
      return; // Will re-run with cleaned IDs
    }

    // Mark as restored before attempting restore to prevent loops
    hasRestoredRef.current = true;

    // Restore selection programmatically using tree API
    const timeoutId = setTimeout(() => {
      const tree = treeRef.current;
      if (!tree || !tree.visibleNodes) return;

      const nodesToSelect = tree.visibleNodes.filter((node: any) =>
        validIds.includes(node.id)
      );

      if (nodesToSelect.length > 0) {
        console.log(`[FileTree] Restoring selection for ${nodesToSelect.length} node(s)`, validIds);

        // Select each node using the node's select method
        nodesToSelect.forEach((node: any, index: number) => {
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
          const selectedNodes = nodesToSelect.map((n: any) => n.data);
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
    const currentlySelected = tree.selectedNodes?.map((n: any) => n.id) || [];

    // Check if selection actually changed (avoid loops)
    const selectedIdsSet = new Set(selectedIds);
    const currentlySelectedSet = new Set(currentlySelected);
    const hasChanged = selectedIds.length !== currentlySelected.length ||
      selectedIds.some(id => !currentlySelectedSet.has(id));

    if (!hasChanged) return;

    console.log('[FileTree] External selection change detected:', selectedIds);

    // Find nodes to select
    const nodesToSelect = tree.visibleNodes.filter((node: any) =>
      selectedIdsSet.has(node.id)
    );

    if (nodesToSelect.length > 0) {
      // Select nodes programmatically
      nodesToSelect.forEach((node: any, index: number) => {
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
        const selectedNodes = nodesToSelect.map((n: any) => n.data);
        onSelect(selectedNodes);
      }
    }
  }, [selectedIds]); // React to selectedIds changes

  // Create a wrapper component that has access to callbacks
  const NodeWithCallbacks = (props: any) => {
    return <FileNode {...props} onRename={onRename} onCreate={onCreate} onDelete={onDelete} onDuplicate={onDuplicate} onDownload={onDownload} />;
  };

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
  }) => {
    if (onMove) {
      try {
        await onMove(args);
      } catch (error) {
        console.error("Failed to move node:", error);
      }
    }
  };

  const handleSelect = (nodes: NodeApi<TreeNode>[]) => {
    const nodeIds = nodes.map(n => n.id);

    // Persist selection state
    setSelectedIds(nodeIds);

    // Notify parent
    if (onSelect) {
      const selectedNodes = nodes.map(n => n.data);
      onSelect(selectedNodes);
    }
  };

  // Persist toggle state
  const handleToggle = (id: string) => {
    // Toggle in the store when a node is toggled
    // Note: We need to check the CURRENT state in expandedIds, not the node state
    const isCurrentlyExpanded = expandedIds.has(id);
    setExpanded(id, !isCurrentlyExpanded);
  };

  // Allow dropping into folders
  const canDrop = (args: { dragNodes: NodeApi<TreeNode>[]; parentNode: NodeApi<TreeNode> | null }) => {
    const { dragNodes, parentNode } = args;

    // Always allow dropping at root level (parentNode is null)
    if (!parentNode) return true;

    // Only allow dropping into folders
    if (parentNode.data.contentType !== "folder") {
      return false;
    }

    // Prevent dropping a folder into itself or its descendants
    for (const dragNode of dragNodes) {
      if (isDescendant(parentNode, dragNode)) {
        return false;
      }
    }

    return true;
  };

  // Check if potentialDescendant is a descendant of node
  const isDescendant = (node: NodeApi<TreeNode>, potentialDescendant: NodeApi<TreeNode>): boolean => {
    if (node.id === potentialDescendant.id) return true;

    let current = potentialDescendant.parent;
    while (current) {
      if (current.id === node.id) return true;
      current = current.parent;
    }

    return false;
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
      const isAnyNodeEditing = tree?.visibleNodes?.some((node: any) => node.isEditing);

      if (isAnyNodeEditing) {
        // A node is being renamed - don't intercept keystrokes
        return;
      }

      // Only handle shortcuts when tree is focused and no modifiers for single-key shortcuts
      const isPlainKey = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;

      // R - Rename selected node (single-key, Vim-style)
      // Safer than F2 which Vivaldi intercepts
      if (e.key === "r" && isPlainKey && onRename) {
        e.preventDefault();
        e.stopPropagation();
        const tree = treeRef.current;
        if (tree?.selectedNodes?.length === 1) {
          const node = tree.selectedNodes[0];
          node.edit();
        }
        return;
      }

      // D - Delete selected nodes (single-key, Vim-style)
      // Safer than Delete key which navigates back in Vivaldi
      if (e.key === "d" && isPlainKey && onDelete) {
        e.preventDefault();
        e.stopPropagation();
        const tree = treeRef.current;
        if (tree?.selectedNodes?.length > 0) {
          // Pass all selected node IDs for batch delete
          const selectedIds = tree.selectedNodes.map((node: any) => node.id);
          onDelete(selectedIds);
        }
        return;
      }

      // A - Open create menu (shows all content types)
      // Opens context menu at selected node position
      if (e.key === "a" && isPlainKey && onCreate) {
        e.preventDefault();
        e.stopPropagation();
        const tree = treeRef.current;
        const selectedNode = tree?.selectedNodes?.[0];

        if (selectedNode) {
          // Trigger right-click on selected node to show create menu
          const nodeElement = selectedNode.element;
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
    const node = tree.visibleNodes?.find((n: any) => n.id === expandNodeId);

    if (node && !node.isOpen) {
      // Open the node imperatively via react-arborist API
      node.open();

      // Also update Zustand store to persist the state
      setExpanded(expandNodeId, true);

      // Notify parent that expansion is complete
      if (onExpandComplete) {
        onExpandComplete();
      }
    }
  }, [expandNodeId, onExpandComplete, setExpanded]);

  // Auto-trigger edit mode when editingNodeId changes (for inline creation)
  useEffect(() => {
    if (!editingNodeId) return;

    const tree = treeRef.current;
    if (!tree) return;

    // Small delay to ensure the node is rendered in the DOM
    const timeoutId = setTimeout(() => {
      // Find the node by ID
      const node = tree.visibleNodes?.find((n: any) => n.id === editingNodeId);

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
        ref={treeRef}
        data={data}
        openByDefault={false}
        initialOpenState={initialOpenState}
        disableMultiSelection={false}
        width="100%"
        height={height}
        indent={20}
        rowHeight={32}
        overscanCount={10}
        paddingTop={8}
        paddingBottom={8}
        idAccessor="id"
        childrenAccessor="children"
        onMove={handleMove}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onRename={({ id, name }) => {
          // Called when user submits inline edit (Enter or blur)
          if (onRename) {
            onRename(id, name);
          }
        }}
        disableDrag={!onMove}
        disableDrop={!onMove}
        {...({ canDrop } as any)} // Type assertion: canDrop exists in runtime but not in v3.4.0 types
        {...(dndManager && { dndManager })} // Pass dndManager if provided
      >
        {NodeWithCallbacks}
      </Tree>
    </div>
  );
}
