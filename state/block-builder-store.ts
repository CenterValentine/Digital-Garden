/**
 * Block Builder Store
 *
 * Zustand store managing the block builder canvas state.
 * Tracks the BuilderNode tree, selection, and builder mode.
 *
 * Not persisted — builder state is ephemeral (modal session only).
 *
 * Epoch 11 Sprint 44b
 */

import { create } from "zustand";
import type { BuilderNode, BuilderState } from "@/lib/domain/blocks/builder-types";
import {
  addNode,
  removeNode,
  moveNode,
  updateNodeAttrs,
  createBuilderNode,
} from "@/lib/domain/blocks/builder-tree";

interface BlockBuilderStore extends BuilderState {
  /** Add a new block part to the canvas */
  addBlockPart: (
    blockType: string,
    parentId: string | null,
    index?: number
  ) => void;

  /** Remove a node from the canvas */
  removeNode: (nodeId: string) => void;

  /** Move a node to a new position */
  moveNode: (
    nodeId: string,
    newParentId: string | null,
    newIndex: number
  ) => void;

  /** Update a node's attributes */
  updateAttrs: (
    nodeId: string,
    attrs: Partial<Record<string, unknown>>
  ) => void;

  /** Select a node for properties editing */
  selectNode: (nodeId: string | null) => void;

  /** Reset the builder to initial state */
  reset: () => void;

  /** Initialize builder with existing nodes (for editing saved blocks) */
  loadNodes: (
    nodes: BuilderNode[],
    mode: "create" | "edit",
    editingBlockId?: string
  ) => void;
}

const initialState: BuilderState = {
  nodes: [],
  selectedNodeId: null,
  mode: "create",
  editingBlockId: null,
};

export const useBlockBuilderStore = create<BlockBuilderStore>()((set) => ({
  ...initialState,

  addBlockPart: (blockType, parentId, index) => {
    const newNode = createBuilderNode(blockType);
    if (!newNode) return;
    set((state) => ({
      nodes: addNode(state.nodes, newNode, parentId, index),
      selectedNodeId: newNode.id,
    }));
  },

  removeNode: (nodeId) =>
    set((state) => {
      const { tree } = removeNode(state.nodes, nodeId);
      return {
        nodes: tree,
        selectedNodeId:
          state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      };
    }),

  moveNode: (nodeId, newParentId, newIndex) =>
    set((state) => ({
      nodes: moveNode(state.nodes, nodeId, newParentId, newIndex),
    })),

  updateAttrs: (nodeId, attrs) =>
    set((state) => ({
      nodes: updateNodeAttrs(state.nodes, nodeId, attrs),
    })),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  reset: () => set(initialState),

  loadNodes: (nodes, mode, editingBlockId) =>
    set({
      nodes,
      selectedNodeId: null,
      mode,
      editingBlockId: editingBlockId ?? null,
    }),
}));
