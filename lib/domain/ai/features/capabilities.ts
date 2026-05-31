/**
 * Client-safe capability helpers.
 *
 * Lives separately from `router.ts` because router.ts imports
 * `server-only` (for the feature-route resolution path that hits
 * Prisma). The helpers here are pure functions over a model object
 * and can be imported by client components — specifically the
 * AIFeatureRoutingPage compatibility filter.
 */

/**
 * Infer capability flags from a model's id when the saved
 * `capabilities` array is missing or incomplete.
 *
 * Safety net for Connection entries saved before the fetcher's
 * catalog augmentation existed (or for entries the user added
 * manually via the "Model ID" input, which has no capability
 * field). Lets feature routing find them as compatible pairs without
 * forcing the user to re-add their models.
 *
 * Only adds capabilities — never removes — so explicit `capabilities`
 * on the model still win. Patterns are deliberately conservative; we
 * recognize widely-documented model id stems rather than every
 * variant.
 */
export function inferCapabilities(modelId: string): string[] {
  // Strip a namespace prefix so `openai/dall-e-3` matches the same
  // patterns as `dall-e-3`.
  const slash = modelId.indexOf("/");
  const bare = slash >= 0 ? modelId.slice(slash + 1) : modelId;
  const out: string[] = [];

  // Image generation models. These ids are stable across providers and
  // gateways — DALL·E + GPT Image (OpenAI), Imagen (Google), FLUX
  // (fal.ai / Together / Fireworks), Stable Diffusion variants.
  if (
    /^dall-e/i.test(bare) ||
    /^gpt-image/i.test(bare) ||
    /^imagen/i.test(bare) ||
    /\bflux\b/i.test(bare) ||
    /^stable-diffusion/i.test(bare) ||
    /^sdxl/i.test(bare)
  ) {
    out.push("image-generation");
  }

  return out;
}

/**
 * Effective capability set for a saved model: union of the explicit
 * `capabilities` array (catalog/fetcher-derived) and any flags
 * inferred from the model id. Use this anywhere a feature-routing
 * filter wants to know what a model can do.
 */
export function effectiveCapabilities(
  model: { id: string; capabilities?: string[] },
): Set<string> {
  const have = new Set<string>(model.capabilities ?? []);
  for (const inferred of inferCapabilities(model.id)) have.add(inferred);
  return have;
}
