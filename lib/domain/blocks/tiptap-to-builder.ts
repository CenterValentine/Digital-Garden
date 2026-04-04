/**
 * TipTap JSON → Builder Converter
 *
 * Converts TipTap JSON nodes back to BuilderNode[] tree.
 * Used when editing saved blocks — loads existing TipTap JSON
 * into the builder canvas for visual editing.
 *
 * Epoch 11 Sprint 44b
 */

import { v4 as uuid } from "uuid";
import type { BuilderNode } from "./builder-types";
import type { TipTapNode } from "./builder-to-tiptap";
import { getBlockDefinition } from "./registry";

/** Block types that are recognized by the builder */
const BUILDER_BLOCK_TYPES = new Set([
  "sectionHeader",
  "cardPanel",
  "blockDivider",
  "accordion",
  "columns",
  "column",
  "tabs",
  "tabPanel",
]);

/**
 * Convert a single TipTap JSON node to a BuilderNode.
 * Non-block nodes (paragraphs, text, etc.) are skipped —
 * they'll be regenerated on insert via builderNodesToTipTap().
 */
function tipTapNodeToBuilder(tipTapNode: TipTapNode): BuilderNode | null {
  // Only convert recognized block types
  if (!BUILDER_BLOCK_TYPES.has(tipTapNode.type)) {
    return null;
  }

  const attrs = tipTapNode.attrs ? { ...tipTapNode.attrs } : {};
  const children: BuilderNode[] = [];

  // Recursively convert child content nodes
  if (tipTapNode.content) {
    for (const child of tipTapNode.content) {
      const builderChild = tipTapNodeToBuilder(child);
      if (builderChild) {
        children.push(builderChild);
      }
    }
  }

  return {
    id: uuid(),
    blockType: tipTapNode.type,
    attrs,
    children,
  };
}

/**
 * Convert TipTap JSON nodes to BuilderNode[] tree.
 * This is the main entry point for loading saved blocks into the builder.
 *
 * Filters out non-block nodes (paragraphs, text nodes) since those
 * are structural content that gets regenerated on insert.
 *
 * @param tipTapNodes - TipTap JSON node array (from SavedBlock.tiptapJson)
 * @returns BuilderNode tree for the canvas
 */
export function tiptapToBuilderNodes(
  tipTapNodes: TipTapNode[] | TipTapNode
): BuilderNode[] {
  // Handle both single node and array inputs
  const nodes = Array.isArray(tipTapNodes) ? tipTapNodes : [tipTapNodes];

  const result: BuilderNode[] = [];
  for (const node of nodes) {
    const builderNode = tipTapNodeToBuilder(node);
    if (builderNode) {
      result.push(builderNode);
    }
  }
  return result;
}

/**
 * Add form block types to the builder's recognized types.
 * Called when form blocks are registered in Sprint 46.
 */
export function registerBuilderBlockType(type: string): void {
  BUILDER_BLOCK_TYPES.add(type);
}
