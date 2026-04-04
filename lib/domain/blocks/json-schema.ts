/**
 * Block JSON Schema Generation
 *
 * Converts Zod block schemas to JSON Schema for AI tool consumption.
 * Uses Zod v4's built-in toJSONSchema() for native compatibility.
 *
 * Epoch 11 Sprint 43
 */

import { toJSONSchema } from "zod";
import type { ZodObject, ZodRawShape } from "zod";
import type { BlockDefinition } from "./types";

/**
 * Convert a Zod block attrs schema to JSON Schema.
 * Used for AI tool `inputSchema` so models can create/edit blocks.
 */
export function zodToBlockJsonSchema(
  schema: ZodObject<ZodRawShape>
): Record<string, unknown> {
  return toJSONSchema(schema) as Record<string, unknown>;
}

/**
 * Generate a complete block catalog for AI consumption.
 * Returns a JSON-serializable object describing all registered blocks.
 */
export function generateBlockCatalog(
  blocks: BlockDefinition[]
): BlockCatalogEntry[] {
  return blocks.map((def) => ({
    type: def.type,
    label: def.label,
    description: def.description,
    family: def.family,
    group: def.group,
    atom: def.atom,
    contentModel: def.contentModel,
    attrsSchema: zodToBlockJsonSchema(def.attrsSchema),
  }));
}

export interface BlockCatalogEntry {
  type: string;
  label: string;
  description: string;
  family: string;
  group: string;
  atom: boolean;
  contentModel: string | null;
  attrsSchema: Record<string, unknown>;
}
