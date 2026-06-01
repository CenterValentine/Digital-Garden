/**
 * Per-1M-token pricing for chat models (USD).
 *
 * Maintained by hand — public list pricing as of the dates noted
 * inline. Drifts over time; treat figures as estimates with up to
 * ±30% error vs. real invoices, *especially* for:
 *   - cached input pricing (we don't track cache hits)
 *   - tiered/prompt-caching discounts
 *   - batch-mode discounts
 *   - free credits / promotional pricing
 *
 * For exact figures users should consult the provider's billing
 * dashboard. Meters render telemetry-source costs with an "estimated"
 * note so the source-of-truth distinction stays explicit.
 */

export interface ModelPrice {
  /** USD per 1M *input* tokens. */
  inputPer1M: number;
  /** USD per 1M *output* tokens. */
  outputPer1M: number;
}

/**
 * Lookup key is a normalized id:
 *   - canonical DG ids (e.g. "claude-sonnet-4", "gpt-4o")
 *   - upstream-format ids (e.g. "claude-sonnet-4-20250514")
 *   - namespaced gateway ids (e.g. "anthropic/claude-sonnet-4")
 *
 * The aggregator tries each shape in turn (canonical, then upstream,
 * then namespaced) so a single message provider+model lookup hits
 * regardless of which Connection routed it.
 */
export const MODEL_PRICING: Record<string, ModelPrice> = {
  // ── Anthropic (as of 2026-Q2 list pricing) ────────────────────────
  "claude-opus-4": { inputPer1M: 15, outputPer1M: 75 },
  "claude-sonnet-4": { inputPer1M: 3, outputPer1M: 15 },
  "claude-sonnet-3-5": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku-3-5": { inputPer1M: 0.8, outputPer1M: 4 },
  // Dated/upstream variants
  "claude-opus-4-5-20250414": { inputPer1M: 15, outputPer1M: 75 },
  "claude-sonnet-4-20250514": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3-5-sonnet-20241022": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4 },

  // ── OpenAI ────────────────────────────────────────────────────────
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4": { inputPer1M: 30, outputPer1M: 60 },
  "o3-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  "o1-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  o3: { inputPer1M: 2, outputPer1M: 8 },

  // ── Google (Gemini) ──────────────────────────────────────────────
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10 },
  "gemini-2.5-flash": { inputPer1M: 0.3, outputPer1M: 2.5 },
  "gemini-2.0-flash": { inputPer1M: 0.1, outputPer1M: 0.4 },

  // ── xAI ──────────────────────────────────────────────────────────
  "grok-3": { inputPer1M: 3, outputPer1M: 15 },
  "grok-3-mini": { inputPer1M: 0.3, outputPer1M: 0.5 },

  // ── Mistral ──────────────────────────────────────────────────────
  "mistral-large-latest": { inputPer1M: 2, outputPer1M: 6 },
  "codestral-latest": { inputPer1M: 0.3, outputPer1M: 0.9 },

  // ── Groq (free tier exists; list rates approx.) ──────────────────
  "llama-3.3-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79 },
  "mixtral-8x7b-32768": { inputPer1M: 0.24, outputPer1M: 0.24 },
};

/** Strip a namespaced prefix and try the bare id; useful for gateway routes. */
function stripNamespace(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(slash + 1) : id;
}

/**
 * Look up a price entry. Returns null when the model isn't in the
 * table — caller renders cost as undefined (UI hides the $ figure).
 */
export function priceFor(modelId: string | null | undefined): ModelPrice | null {
  if (!modelId) return null;
  const direct = MODEL_PRICING[modelId];
  if (direct) return direct;
  const stripped = MODEL_PRICING[stripNamespace(modelId)];
  return stripped ?? null;
}

/**
 * Estimate the cost of a turn given a token usage record + model id.
 * Returns 0 when pricing is unknown (the UI then hides the $ column
 * for that row rather than fabricate a number).
 */
export function estimateCost(
  modelId: string | null | undefined,
  input: number | undefined,
  output: number | undefined,
): number {
  const price = priceFor(modelId);
  if (!price) return 0;
  const i = input ?? 0;
  const o = output ?? 0;
  return (i / 1_000_000) * price.inputPer1M + (o / 1_000_000) * price.outputPer1M;
}
