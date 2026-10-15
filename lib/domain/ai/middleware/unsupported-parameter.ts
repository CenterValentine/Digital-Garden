/**
 * Unsupported-parameter retry middleware.
 *
 * Providers reject sampling parameters some models do not take, and they
 * say so in the error: OpenAI's "Unsupported parameter: 'temperature' is
 * not supported with this model." (prod 2026-09-29, `gpt-6-astra` — a model
 * the connection's fetched list offered and the catalog had never seen;
 * the chat died on its first message). `model-constraints.ts` holds the
 * KNOWN families, but a maintained list is always one release behind the
 * provider. This middleware is the net under it: when a call fails with a
 * named unsupported parameter, it retries ONCE without that parameter,
 * remembers the model's refusal for the rest of the process so the next
 * call never sends it, and logs the model id so the list can be updated.
 *
 * Placement: FIRST in the middleware array (innermost, wrapping the raw
 * provider model) so its retry reaches the provider directly — an outer
 * `defaultSettingsMiddleware` would otherwise put the parameter back.
 */

import type { LanguageModelMiddleware } from "ai";
import { logger } from "@/lib/core/logger";

/** Provider parameter name → AI SDK call-option key. */
const PARAMETER_KEYS: Record<string, string> = {
  temperature: "temperature",
  top_p: "topP",
  topp: "topP",
  top_k: "topK",
  frequency_penalty: "frequencyPenalty",
  presence_penalty: "presencePenalty",
  max_tokens: "maxOutputTokens",
  max_output_tokens: "maxOutputTokens",
  max_completion_tokens: "maxOutputTokens",
  seed: "seed",
  stop: "stopSequences",
};

/**
 * The SDK call-option key a provider error names as unsupported, or null.
 * Pure — pinned by `run-harness:check`.
 */
export function parseUnsupportedParameter(error: unknown): string | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return null;
  const patterns = [
    // OpenAI: Unsupported parameter: 'temperature' is not supported with this model.
    /unsupported parameter:?\s*'([a-z_]+)'/i,
    // Variants: "'temperature' is not supported", "temperature is not supported for this model"
    /'([a-z_]+)'\s+is not supported/i,
    /parameter\s+'?([a-z_]+)'?\s+(?:is )?not supported/i,
    // Anthropic-style: "temperature: not supported by this model"
    /\b([a-z_]+): not supported\b/i,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m?.[1]) {
      const key = PARAMETER_KEYS[m[1].toLowerCase()];
      if (key) return key;
    }
  }
  return null;
}

/** A copy of `params` with one call option removed. Pure. */
export function withoutParameter<T extends Record<string, unknown>>(
  params: T,
  key: string,
): T {
  if (!(key in params)) return params;
  const next = { ...params };
  delete (next as Record<string, unknown>)[key];
  return next;
}

/** Per-process memory of parameters a model has refused (modelId → keys). */
const refusedByModel = new Map<string, Set<string>>();

/** Parameters this process has learned a model rejects (for diagnostics). */
export function learnedUnsupportedParameters(modelId: string): string[] {
  return [...(refusedByModel.get(modelId) ?? [])];
}

export function unsupportedParameterMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    // Strip parameters this process already knows the model refuses, so
    // the retry cost is paid once per model per process, not per call.
    transformParams: async ({ params, model }) => {
      const learned = refusedByModel.get(model.modelId);
      if (!learned || learned.size === 0) return params;
      let next = params as Record<string, unknown>;
      for (const key of learned) next = withoutParameter(next, key);
      return next as typeof params;
    },
    wrapGenerate: async ({ doGenerate, params, model }) => {
      try {
        return await doGenerate();
      } catch (error) {
        const key = parseUnsupportedParameter(error);
        if (!key || !(key in (params as Record<string, unknown>))) throw error;
        remember(model.modelId, key, error);
        return model.doGenerate(withoutParameter(params as Record<string, unknown>, key) as typeof params);
      }
    },
    wrapStream: async ({ doStream, params, model }) => {
      try {
        return await doStream();
      } catch (error) {
        const key = parseUnsupportedParameter(error);
        if (!key || !(key in (params as Record<string, unknown>))) throw error;
        remember(model.modelId, key, error);
        return model.doStream(withoutParameter(params as Record<string, unknown>, key) as typeof params);
      }
    },
  };
}

function remember(modelId: string, key: string, error: unknown): void {
  const set = refusedByModel.get(modelId) ?? new Set<string>();
  const first = !set.has(key);
  set.add(key);
  refusedByModel.set(modelId, set);
  if (first) {
    logger.warn({
      layer: "ai",
      event: "ai:unsupported_parameter",
      summary: `${modelId} rejects \`${key}\` — retried without it; add the family to model-constraints.ts`,
      attrs: {
        model: modelId,
        parameter: key,
        message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      },
    });
  }
}
