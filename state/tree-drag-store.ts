/**
 * Tree drag store — Session 5b-3.
 *
 * Bridges a file-tree drag to drop targets outside the tree (the chat
 * composer, the workspace tab strips). react-arborist owns the tree's
 * internal DnD, so rather than fight its dataTransfer, the dragged node
 * records itself here on drag-start; drop targets read it on drop.
 */

import { create } from "zustand";

export interface DraggingTreeNode {
  id: string;
  title: string;
  contentType: string;
}

interface TreeDragState {
  /** The node under the cursor when the drag started. */
  draggingNode: DraggingTreeNode | null;
  /**
   * Every node in the drag: the grabbed node plus, when it is part of a
   * multi-selection, the rest of the selection in tree order. Mirrors the
   * `dragIds` react-arborist carries in its drag item, but with the
   * title/contentType metadata drop targets need to open tabs named
   * correctly instead of as "Loading...".
   */
  draggingNodes: DraggingTreeNode[];
  setDraggingNode: (
    node: DraggingTreeNode | null,
    nodes?: DraggingTreeNode[]
  ) => void;
  /**
   * Folder the in-flight EXTERNAL file drag would land in (OS files dragged
   * onto the tree). react-arborist's `willReceiveDrop` only covers its own
   * internal DnD, so the drop zone publishes the resolved destination here
   * and the matching row highlights itself.
   */
  externalDropTargetId: string | null;
  setExternalDropTargetId: (id: string | null) => void;
}

export const useTreeDragStore = create<TreeDragState>((set) => ({
  draggingNode: null,
  draggingNodes: [],
  setDraggingNode: (node, nodes) =>
    set({
      draggingNode: node,
      draggingNodes: node ? (nodes && nodes.length > 0 ? nodes : [node]) : [],
    }),
  externalDropTargetId: null,
  setExternalDropTargetId: (id) => set({ externalDropTargetId: id }),
}));
