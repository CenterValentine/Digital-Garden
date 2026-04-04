/**
 * Block Schema Utilities
 *
 * Base Zod schema shared by all blocks, plus utilities for
 * converting block attrs to/from JSON.
 *
 * Every block extends `baseBlockAttrsSchema` with its own attrs.
 *
 * Epoch 11 Sprint 43
 */

import { z } from "zod";
import { v4 as uuid } from "uuid";

/**
 * Base attributes present on every block node.
 * Individual blocks extend this with z.object({...}).merge(baseBlockAttrsSchema).
 */
export const baseBlockAttrsSchema = z.object({
  /** Unique ID for this block instance — regenerated on copy/template insert */
  blockId: z
    .string()
    .uuid()
    .default(() => uuid())
    .describe("Unique block instance ID"),
  /** The block type key — must match a registered BlockDefinition.type */
  blockType: z
    .string()
    .min(1)
    .describe("Block type identifier matching the registry"),
});

export type BaseBlockAttrs = z.infer<typeof baseBlockAttrsSchema>;

/**
 * Create a typed block attrs schema by merging custom attrs with the base.
 * Returns both the schema and a type-safe default generator.
 *
 * @example
 * const { schema, defaults } = createBlockSchema("sectionHeader", {
 *   level: z.number().int().min(1).max(3).default(1),
 *   label: z.string().default(""),
 *   showDivider: z.boolean().default(true),
 * });
 */
export function createBlockSchema<T extends z.ZodRawShape>(
  blockType: string,
  customAttrs: T
) {
  const schema = baseBlockAttrsSchema.merge(z.object(customAttrs));

  const defaults = (): z.infer<typeof schema> => {
    return schema.parse({ blockType }) as z.infer<typeof schema>;
  };

  return { schema, defaults };
}

/**
 * Convert a block's attrs to a clean JSON object, stripping undefined values.
 * Used when saving to database or serializing for TipTap JSON.
 */
export function blockAttrsToJSON(
  attrs: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Regenerate blockId for a block attrs object (used when inserting from templates/library).
 * Returns a new attrs object with a fresh UUID.
 */
export function regenerateBlockId(
  attrs: Record<string, unknown>
): Record<string, unknown> {
  return { ...attrs, blockId: uuid() };
}
