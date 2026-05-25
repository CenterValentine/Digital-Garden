/**
 * Tree drag store — Session 5b-3.
 *
 * Bridges a file-tree drag to drop targets outside the tree (the chat
 * composer). react-arborist owns the tree's internal DnD, so rather than
 * fight its dataTransfer, the dragged node records itself here on
 * drag-start; the composer reads it on drop to attach the node as context.
 */

import { create } from "zustand";

export interface DraggingTreeNode {
  id: string;
  title: string;
  contentType: string;
}

interface TreeDragState {
  draggingNode: DraggingTreeNode | null;
  setDraggingNode: (node: DraggingTreeNode | null) => void;
}

export const useTreeDragStore = create<TreeDragState>((set) => ({
  draggingNode: null,
  setDraggingNode: (node) => set({ draggingNode: node }),
}));
