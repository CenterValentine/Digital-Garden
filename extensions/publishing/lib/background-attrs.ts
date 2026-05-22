/**
 * Shared bgColor + bgGradient attribute cluster used by 8 publishing blocks.
 *
 * Pre-R4a, each of bookmark-card, cta-banner, feature-list,
 * newsletter-signup, person-card, pricing-card, stat-block, and
 * testimonial-card declared the same Zod schema lines AND the same
 * TipTap addAttributes parseHTML/renderHTML pair for these two attrs.
 *
 * Both halves now live here. Each block spreads `BACKGROUND_SCHEMA_SHAPE`
 * into createBlockSchema(...) and spreads `backgroundAttrs()` into the
 * addAttributes() return value.
 */

import { z } from "zod";
import { dataAttr } from "@/lib/domain/blocks/data-attr";

/**
 * Zod shape — spread into the second arg of `createBlockSchema(name, shape)`.
 */
export const BACKGROUND_SCHEMA_SHAPE = {
  bgColor: z
    .string()
    .default("")
    .describe("Custom background color (any CSS color value)"),
  bgGradient: z
    .string()
    .default("")
    .describe(
      "CSS gradient — e.g. linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    ),
} as const;

/**
 * TipTap addAttributes spread — produces { bgColor: {...}, bgGradient: {...} }.
 * Uses the shared `dataAttr()` helper so both attrs round-trip through
 * `data-bg-color` and `data-bg-gradient` with the correct camel/kebab
 * handling.
 */
export function backgroundAttrs() {
  return {
    bgColor: dataAttr("bgColor"),
    bgGradient: dataAttr("bgGradient"),
  };
}
