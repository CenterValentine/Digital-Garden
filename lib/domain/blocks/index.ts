/**
 * Block System — Barrel Export
 *
 * Import from "@/lib/domain/blocks" for block infrastructure.
 */

export type {
  BlockFamily,
  BlockGroup,
  BlockDefinition,
  BlockInstance,
  PropertiesField,
} from "./types";

export {
  baseBlockAttrsSchema,
  createBlockSchema,
  blockAttrsToJSON,
  regenerateBlockId,
} from "./schema";
export type { BaseBlockAttrs } from "./schema";

export {
  registerBlock,
  getBlockDefinition,
  getBlocksByFamily,
  getAllBlocks,
  getAllSlashBlocks,
  getRegisteredBlockTypes,
} from "./registry";

export {
  zodToBlockJsonSchema,
  generateBlockCatalog,
} from "./json-schema";
export type { BlockCatalogEntry } from "./json-schema";

// Builder infrastructure (Sprint 44b)
export type {
  BuilderNode,
  BuilderState,
  BuilderNodeLookup,
  BuilderDropTarget,
} from "./builder-types";

export {
  findNode,
  createBuilderNode,
  addNode,
  removeNode,
  moveNode,
  updateNodeAttrs,
  canAcceptChildren,
  isValidChild,
  wouldCreateCycle,
  cloneWithFreshIds,
  countNodes,
} from "./builder-tree";

export { builderNodesToTipTap } from "./builder-to-tiptap";
export type { TipTapNode } from "./builder-to-tiptap";

export { tiptapToBuilderNodes, registerBuilderBlockType } from "./tiptap-to-builder";
