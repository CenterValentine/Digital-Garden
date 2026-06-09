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

  // Image generation models. Patterns cover canonical id stems across
  // providers and gateways:
  //   - DALL·E + GPT Image families (OpenAI direct + via gateway)
  //   - Imagen series (Google direct)
  //   - Google's image-output Gemini variants — Nano Banana
  //     (`gemini-2.5-flash-image`), Nano Banana Pro
  //     (`gemini-3-pro-image`), and preview channels — all end in
  //     `-image` or `-image-preview`. Caught by the suffix rule.
  //   - FLUX (BFL direct + via gateway, fal.ai, Together, Fireworks)
  //   - Recraft + Seedream (gateway only as of writing)
  //   - xAI's grok-imagine
  //   - Stable Diffusion / SDXL variants
  if (
    /^dall-e/i.test(bare) ||
    /^gpt-image/i.test(bare) ||
    /^imagen/i.test(bare) ||
    /-image(-preview)?$/i.test(bare) ||
    /\bflux\b/i.test(bare) ||
    /^recraft/i.test(bare) ||
    /^seedream/i.test(bare) ||
    /\bgrok-imagine\b/i.test(bare) ||
    /^stable-diffusion/i.test(bare) ||
    /^sdxl/i.test(bare)
  ) {
    out.push("image-generation");
  }

  return out;
}

/**
 * Capability aliases. The model catalog/fetcher and the feature
 * registry speak the `CapabilityFlag` token `"image"` ("image
 * output"); id inference (above) emits the more descriptive
 * `"image-generation"`. They name the SAME capability — collapse the
 * alias to the registry's canonical token so a feature requiring
 * `"image"` matches an id-inferred image model, and the AIConnections
 * badge filter, the feature-routing compatible-pairs filter, and the
 * server route resolver all agree. Add future synonym pairs here, not
 * at each call site.
 */
const CAPABILITY_ALIASES: Record<string, string> = {
  "image-generation": "image",
};

/** Canonical form of a capability token (collapses known aliases). */
export function normalizeCapability(cap: string): string {
  return CAPABILITY_ALIASES[cap] ?? cap;
}

/**
 * Effective capability set for a saved model: union of the explicit
 * `capabilities` array (catalog/fetcher-derived) and any flags
 * inferred from the model id, each normalized to its canonical token.
 * Use this anywhere a feature-routing filter wants to know what a
 * model can do. Because tokens are normalized, an id-inferred image
 * model (`"image-generation"`) satisfies a feature requiring `"image"`.
 */
export function effectiveCapabilities(
  model: { id: string; capabilities?: string[] },
): Set<string> {
  const have = new Set<string>();
  for (const c of model.capabilities ?? []) have.add(normalizeCapability(c));
  for (const inferred of inferCapabilities(model.id)) {
    have.add(normalizeCapability(inferred));
  }
  return have;
}
