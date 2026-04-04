/**
 * Builder Tree Operations
 *
 * Pure functions for manipulating the BuilderNode tree.
 * All functions return new trees (immutable) for Zustand state updates.
 *
 * Epoch 11 Sprint 44b
 */

import { v4 as uuid } from "uuid";
import type { BuilderNode, BuilderNodeLookup } from "./builder-types";
import { getBlockDefinition } from "./registry";

/**
 * Find a node by ID anywhere in the tree.
 * Returns the node, its parent, and its index within the parent's children.
 */
export function findNode(
  nodes: BuilderNode[],
  id: string,
  parent: BuilderNode | null = null
): BuilderNodeLookup | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      return { node: nodes[i], parent, index: i };
    }
    const found = findNode(nodes[i].children, id, nodes[i]);
    if (found) return found;
  }
  return null;
}

/**
 * Create a new BuilderNode from a block type with default attrs.
 * For layout blocks (columns, tabs), pre-populates required child nodes.
 */
export function createBuilderNode(blockType: string): BuilderNode | null {
  const def = getBlockDefinition(blockType);
  if (!def) return null;

  const node: BuilderNode = {
    id: uuid(),
    blockType,
    attrs: { ...def.defaultAttrs, blockType },
    children: [],
  };

  // Pre-populate required children for layout blocks
  if (blockType === "columns") {
    const count = (node.attrs.columnCount as number) ?? 2;
    for (let i = 0; i < count; i++) {
      node.children.push({
        id: uuid(),
        blockType: "column",
        attrs: { blockType: "column" },
        children: [],
      });
    }
  } else if (blockType === "tabs") {
    // Default 2 tabs
    node.children.push(
      {
        id: uuid(),
        blockType: "tabPanel",
        attrs: { blockType: "tabPanel", label: "Tab 1" },
        children: [],
      },
      {
        id: uuid(),
        blockType: "tabPanel",
        attrs: { blockType: "tabPanel", label: "Tab 2" },
        children: [],
      }
    );
  }

  return node;
}

/**
 * Add a node to the tree at a specific position.
 * If parentId is null, adds to the root level.
 */
export function addNode(
  nodes: BuilderNode[],
  newNode: BuilderNode,
  parentId: string | null,
  index?: number
): BuilderNode[] {
  if (parentId === null) {
    const result = [...nodes];
    const insertIndex = index ?? result.length;
    result.splice(insertIndex, 0, newNode);
    return result;
  }

  return nodes.map((node) => {
    if (node.id === parentId) {
      const newChildren = [...node.children];
      const insertIndex = index ?? newChildren.length;
      newChildren.splice(insertIndex, 0, newNode);
      return { ...node, children: newChildren };
    }
    const updatedChildren = addNode(node.children, newNode, parentId, index);
    if (updatedChildren !== node.children) {
      return { ...node, children: updatedChildren };
    }
    return node;
  });
}

/**
 * Remove a node by ID from the tree.
 * Returns the updated tree and the removed node (for move operations).
 */
export function removeNode(
  nodes: BuilderNode[],
  id: string
): { tree: BuilderNode[]; removed: BuilderNode | null } {
  let removed: BuilderNode | null = null;

  const result = nodes.filter((node) => {
    if (node.id === id) {
      removed = node;
      return false;
    }
    return true;
  });

  if (removed) return { tree: result, removed };

  const mapped = result.map((node) => {
    const childResult = removeNode(node.children, id);
    if (childResult.removed) {
      removed = childResult.removed;
      return { ...node, children: childResult.tree };
    }
    return node;
  });

  return { tree: mapped, removed };
}

/**
 * Move a node from its current position to a new position.
 * Handles both reordering within the same parent and cross-parent moves.
 */
export function moveNode(
  nodes: BuilderNode[],
  nodeId: string,
  newParentId: string | null,
  newIndex: number
): BuilderNode[] {
  const { tree, removed } = removeNode(nodes, nodeId);
  if (!removed) return nodes;
  return addNode(tree, removed, newParentId, newIndex);
}

/**
 * Update a node's attributes by ID.
 */
export function updateNodeAttrs(
  nodes: BuilderNode[],
  id: string,
  attrs: Partial<Record<string, unknown>>
): BuilderNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, attrs: { ...node.attrs, ...attrs } };
    }
    const updatedChildren = updateNodeAttrs(node.children, id, attrs);
    if (updatedChildren !== node.children) {
      return { ...node, children: updatedChildren };
    }
    return node;
  });
}

/**
 * Check if a block type can accept children based on its content model.
 */
export function canAcceptChildren(blockType: string): boolean {
  const def = getBlockDefinition(blockType);
  if (!def) return false;
  return (
    def.contentModel !== null &&
    def.contentModel !== "inline*" &&
    !def.atom
  );
}

/**
 * Check if a specific child block type is valid for a parent.
 * Columns only accept "column", tabs only accept "tabPanel",
 * other containers accept any block.
 */
export function isValidChild(
  parentType: string,
  childType: string
): boolean {
  const parentDef = getBlockDefinition(parentType);
  if (!parentDef) return false;

  // Atoms and inline-only blocks don't accept children
  if (parentDef.atom || parentDef.contentModel === null || parentDef.contentModel === "inline*") {
    return false;
  }

  // Specific child constraints
  if (parentDef.contentModel === "column+") return childType === "column";
  if (parentDef.contentModel === "tabPanel+") return childType === "tabPanel";

  // "block+" accepts any non-child-only block type
  return childType !== "column" && childType !== "tabPanel";
}

/**
 * Check if moving a node would create a circular reference.
 */
export function wouldCreateCycle(
  nodes: BuilderNode[],
  nodeId: string,
  targetParentId: string
): boolean {
  // Check if targetParentId is a descendant of nodeId
  const lookup = findNode(nodes, nodeId);
  if (!lookup) return false;

  function isDescendant(node: BuilderNode, searchId: string): boolean {
    if (node.id === searchId) return true;
    return node.children.some((child) => isDescendant(child, searchId));
  }

  return isDescendant(lookup.node, targetParentId);
}

/**
 * Deep clone a builder node tree with fresh IDs.
 * Used when inserting saved blocks (each instance gets unique IDs).
 */
export function cloneWithFreshIds(node: BuilderNode): BuilderNode {
  return {
    ...node,
    id: uuid(),
    attrs: { ...node.attrs, blockId: uuid() },
    children: node.children.map(cloneWithFreshIds),
  };
}

/**
 * Count total nodes in a tree (including nested children).
 */
export function countNodes(nodes: BuilderNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + 1 + countNodes(node.children),
    0
  );
}
