/**
 * Model call-parameter constraints (AI v3.1 R4 hardening).
 *
 * Some models reject otherwise-standard sampling parameters. The clearest
 * case: reasoning / "thinking" models that ONLY accept `temperature: 1`
 * and 4xx on anything else — OpenAI's o-series
 * ("invalid temperature: only 1 is allowed"), and Moonshot's Kimi
 * thinking line (kimi-k2.6+, kimi-k3, kimi-k2.7*), which return
 * "invalid temperature: only 1 is allowed for this model".
 *
 * This is the ONE place that knowledge lives. It is unavoidably a
 * maintained list — provider constraints aren't discoverable before the
 * call — but centralizing it (over scattering `if provider === …` at
 * call sites) keeps the quirks auditable and extendable in one spot.
 * Patterns (not exact ids) absorb version drift within a family.
 */

/** Model families that require `temperature: 1` and reject other values. */
const FIXED_TEMPERATURE_ONE: ReadonlyArray<RegExp> = [
  // OpenAI o-series reasoning models: o1, o3, o4-mini, …
  /(^|\/)o[1-9][a-z0-9-]*$/i,
  // Moonshot Kimi thinking line: kimi-k2.6, kimi-k2.7-code, kimi-k3, …
  /(^|\/)kimi-k(2\.[6-9]|[3-9])/i,
];

/**
 * Resolve the temperature to actually send for a model, honoring known
 * fixed-temperature constraints. Returns the requested value for
 * unconstrained models, `1` for models that only accept 1.
 *
 * `modelId` may be bare (`kimi-k2.6`) or gateway-namespaced
 * (`moonshotai/kimi-k2.6`) — the patterns anchor on `/` or start.
 */
export function resolveModelTemperature(
  modelId: string,
  requested: number,
): number {
  if (FIXED_TEMPERATURE_ONE.some((re) => re.test(modelId))) return 1;
  return requested;
}
