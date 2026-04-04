/**
 * Block Builder Types
 *
 * Data model for the drag-and-drop block builder canvas.
 * BuilderNode is a simplified tree that maps 1:1 to TipTap JSON —
 * no separate format, no conversion bugs.
 *
 * Epoch 11 Sprint 44b
 */

/**
 * A node in the builder canvas tree.
 * Each node represents a block part that will become a TipTap node on insert.
 */
export interface BuilderNode {
  /** Ephemeral builder ID — regenerated with fresh UUIDs on insert */
  id: string;
  /** Block type key from BlockDefinition.type (e.g., "sectionHeader", "columns") */
  blockType: string;
  /** Block attributes validated against BlockDefinition.attrsSchema */
  attrs: Record<string, unknown>;
  /** Child nodes — only for containers (contentModel: "block+", "column+", etc.) */
  children: BuilderNode[];
}

/**
 * Builder canvas state — managed by block-builder-store.
 */
export interface BuilderState {
  /** Root-level canvas nodes */
  nodes: BuilderNode[];
  /** Currently selected node ID for properties editing */
  selectedNodeId: string | null;
  /** Builder mode */
  mode: "create" | "edit";
  /** SavedBlock ID when editing an existing saved block */
  editingBlockId: string | null;
}

/**
 * Result of a node lookup in the builder tree.
 * Includes parent reference for move/delete operations.
 */
export interface BuilderNodeLookup {
  node: BuilderNode;
  parent: BuilderNode | null;
  index: number;
}

/**
 * Drop target information for drag-and-drop operations.
 */
export interface BuilderDropTarget {
  /** Parent node ID (null = root level) */
  parentId: string | null;
  /** Index within parent's children array */
  index: number;
}
