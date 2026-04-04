/**
 * Block Registry
 *
 * Static registry of all available block definitions.
 * Blocks are registered here and consumed by:
 * - Slash command menu (getAllSlashBlocks)
 * - Properties Panel (getBlockDefinition)
 * - Block Picker (getBlocksByFamily)
 * - AI JSON Schema generation
 *
 * Pattern follows lib/domain/tools/registry.ts.
 *
 * Epoch 11 Sprint 43
 */

import type { BlockDefinition, BlockFamily } from "./types";
import { useSettingsStore } from "@/state/settings-store";

/**
 * Static block registry — populated by registerBlock() calls.
 * Sprint 44 will register content + layout blocks here.
 * Sprint 46 will add form blocks.
 */
const BLOCK_REGISTRY: Map<string, BlockDefinition> = new Map();

/** Register a block definition. Called once per block extension at import time. */
export function registerBlock(definition: BlockDefinition): void {
  if (BLOCK_REGISTRY.has(definition.type)) {
    console.warn(
      `Block type "${definition.type}" is already registered. Overwriting.`
    );
  }
  BLOCK_REGISTRY.set(definition.type, definition);
}

/** Get a block definition by type key. */
export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return BLOCK_REGISTRY.get(type);
}

/** Get all blocks belonging to a specific family. */
export function getBlocksByFamily(family: BlockFamily): BlockDefinition[] {
  return Array.from(BLOCK_REGISTRY.values()).filter(
    (def) => def.family === family
  );
}

/** Get all registered block definitions. */
export function getAllBlocks(): BlockDefinition[] {
  return Array.from(BLOCK_REGISTRY.values());
}

/**
 * Get all blocks that should appear in the slash command menu.
 * Returns definitions sorted by family → group → label.
 *
 * All blocks are currently beta-gated behind the editor.betaBlocks setting.
 * When betaBlocks is false, no blocks appear in slash commands.
 * Blocks are still registered as TipTap nodes so existing documents parse correctly.
 */
export function getAllSlashBlocks(): BlockDefinition[] {
  // Beta gate: blocks hidden only when betaBlocks is explicitly false.
  // undefined (no cached setting yet) falls through to the default (true).
  const editorSettings = useSettingsStore.getState().editor;
  if (editorSettings?.betaBlocks === false) return [];

  return Array.from(BLOCK_REGISTRY.values())
    .filter((def) => def.slashCommand)
    .sort((a, b) => {
      // Sort by family order: content → layout → form
      const familyOrder: Record<BlockFamily, number> = {
        content: 0,
        layout: 1,
        form: 2,
      };
      const familyDiff = familyOrder[a.family] - familyOrder[b.family];
      if (familyDiff !== 0) return familyDiff;

      // Then by group
      if (a.group !== b.group) return a.group.localeCompare(b.group);

      // Then by label
      return a.label.localeCompare(b.label);
    });
}

/**
 * Get block type keys for validation.
 * Used by API routes to validate blockType on SavedBlock creation.
 */
export function getRegisteredBlockTypes(): string[] {
  return Array.from(BLOCK_REGISTRY.keys());
}
