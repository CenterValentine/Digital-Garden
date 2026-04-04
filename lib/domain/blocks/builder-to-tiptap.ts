/**
 * Builder → TipTap JSON Converter
 *
 * Converts BuilderNode[] tree into TipTap-compatible JSON nodes.
 * Each BuilderNode maps to a TipTap node with:
 * - type: the block's TipTap node name
 * - attrs: block attributes with fresh blockId UUIDs
 * - content: child nodes (containers get empty paragraphs if no children)
 *
 * Epoch 11 Sprint 44b
 */

import { v4 as uuid } from "uuid";
import type { BuilderNode } from "./builder-types";
import { getBlockDefinition } from "./registry";

/** Minimal TipTap JSON node shape */
export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

/** Empty paragraph — default content for empty containers */
function emptyParagraph(): TipTapNode {
  return { type: "paragraph" };
}

/**
 * Convert a single BuilderNode to a TipTap JSON node.
 * Recursively converts children, generating fresh blockId UUIDs.
 */
function builderNodeToTipTap(node: BuilderNode): TipTapNode {
  const def = getBlockDefinition(node.blockType);

  // Fresh blockId for each inserted instance
  const attrs = {
    ...node.attrs,
    blockId: uuid(),
  };

  const tipTapNode: TipTapNode = {
    type: node.blockType,
    attrs,
  };

  // Handle content based on block type
  if (def?.atom || def?.contentModel === null) {
    // Atom blocks (dividers, form inputs): no content
    return tipTapNode;
  }

  if (def?.contentModel === "inline*") {
    // Inline content blocks (sectionHeader): empty paragraph-like content
    // TipTap will allow inline editing
    return tipTapNode;
  }

  // Container blocks: convert children or add default content
  if (node.blockType === "columns") {
    // Columns must have column children
    const columnCount = (node.attrs.columnCount as number) ?? 2;
    const columnChildren =
      node.children.length > 0
        ? node.children.map(builderNodeToTipTap)
        : Array.from({ length: columnCount }, () => ({
            type: "column",
            content: [emptyParagraph()],
          }));
    tipTapNode.content = columnChildren;
  } else if (node.blockType === "column") {
    // Column contains block children or empty paragraph
    tipTapNode.content =
      node.children.length > 0
        ? node.children.map(builderNodeToTipTap)
        : [emptyParagraph()];
  } else if (node.blockType === "tabs") {
    // Tabs must have tabPanel children
    const tabChildren =
      node.children.length > 0
        ? node.children.map(builderNodeToTipTap)
        : [
            {
              type: "tabPanel",
              attrs: { label: "Tab 1" },
              content: [emptyParagraph()],
            },
            {
              type: "tabPanel",
              attrs: { label: "Tab 2" },
              content: [emptyParagraph()],
            },
          ];
    tipTapNode.content = tabChildren;
  } else if (node.blockType === "tabPanel") {
    // Tab panel contains block children or empty paragraph
    tipTapNode.content =
      node.children.length > 0
        ? node.children.map(builderNodeToTipTap)
        : [emptyParagraph()];
  } else if (def?.contentModel?.includes("block")) {
    // Generic block containers (cardPanel, accordion): convert children or empty paragraph
    tipTapNode.content =
      node.children.length > 0
        ? node.children.map(builderNodeToTipTap)
        : [emptyParagraph()];
  }

  return tipTapNode;
}

/**
 * Convert a BuilderNode[] tree to TipTap JSON nodes.
 * This is the main entry point for insertion into the editor.
 *
 * @param nodes - Root-level builder nodes
 * @returns TipTap JSON nodes ready for editor.commands.insertContent()
 */
export function builderNodesToTipTap(nodes: BuilderNode[]): TipTapNode[] {
  return nodes.map(builderNodeToTipTap);
}
