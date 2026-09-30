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
  // Moonshot Kimi thinking line: kimi-k2.6, kimi-k2.7-code, kimi-k3, …
  /(^|\/)kimi-k(2\.[6-9]|[3-9])/i,
];

/**
 * Model families that reject the `temperature` parameter OUTRIGHT — the
 * request must not carry it at all. OpenAI's reasoning models answer
 * "Unsupported parameter: 'temperature' is not supported with this model"
 * (prod 2026-09-29: `gpt-6-astra`, a model the connection's fetched list
 * offered that the catalog had never seen, killed the chat on the first
 * message). The o-series moved here from "fixed at 1": on the Responses
 * API they refuse the parameter too, and omitting it is what "only 1"
 * always meant in practice.
 */
const TEMPERATURE_UNSUPPORTED: ReadonlyArray<RegExp> = [
  // OpenAI o-series reasoning models: o1, o3, o4-mini, …
  /(^|\/)o[1-9][a-z0-9-]*$/i,
  // OpenAI gpt-6 family: gpt-6, gpt-6-astra, gpt-6-mini, …
  /(^|\/)gpt-6(?:$|[.-])/i,
];

/**
 * Resolve the temperature to actually send for a model, honoring known
 * constraints. Returns the requested value for unconstrained models, `1`
 * for models that only accept 1, and `undefined` — SEND NOTHING — for
 * models that reject the parameter.
 *
 * `modelId` may be bare (`kimi-k2.6`) or gateway-namespaced
 * (`moonshotai/kimi-k2.6`) — the patterns anchor on `/` or start.
 *
 * This list is the KNOWN families. An unknown model that rejects a
 * parameter is caught at call time by `unsupportedParameterMiddleware`,
 * which retries without it and logs the model id so it can be added here.
 */
export function resolveModelTemperature(
  modelId: string,
  requested: number,
): number | undefined {
  if (TEMPERATURE_UNSUPPORTED.some((re) => re.test(modelId))) return undefined;
  if (FIXED_TEMPERATURE_ONE.some((re) => re.test(modelId))) return 1;
  return requested;
}

/** True when the model is known to reject `temperature` entirely. */
export function modelRejectsTemperature(modelId: string): boolean {
  return TEMPERATURE_UNSUPPORTED.some((re) => re.test(modelId));
}
