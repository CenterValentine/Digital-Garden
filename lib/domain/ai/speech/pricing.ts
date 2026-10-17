/**
 * Speech (TTS) list pricing — per-1M-CHARACTERS, USD.
 *
 * PURE AND CLIENT-SAFE — no Prisma, no server imports. The read-aloud
 * mini-player imports this directly to show a cost estimate on hover.
 *
 * Sibling of `lib/features/ai-connections/usage/pricing.ts`, which meters chat
 * turns per-TOKEN. Speech bills per CHARACTER of input instead, which makes the
 * estimate exact rather than probabilistic: we know the character count before
 * the request is sent, so the number shown to the user is the number billed —
 * no output-length guessing.
 *
 * All figures are list-price ESTIMATES. Known, accepted error sources:
 *   - volume/committed-use discounts (unmodeled)
 *   - free tiers (Google grants 1M WaveNet chars/month free — unmodeled, so
 *     estimates are an UPPER bound for light Google users)
 *   - ElevenLabs sells subscription credits, not per-character list pricing;
 *     its models are deliberately unpriced (see UNPRICED_SPEECH_MODELS)
 *   - taxes, promotional windows, negotiated rates
 */

/** Bump on ANY change to the table below. */
export const SPEECH_PRICING_VERSION = "2026-09-26";

export interface SpeechPrice {
  /** USD per 1,000,000 characters of input text. */
  per1MChars: number;
  /** Optional caveat surfaced in the cost tooltip. */
  note?: string;
}

/**
 * Per-model character pricing, keyed by the catalog's model id
 * (`lib/domain/ai/speech/catalog.ts`).
 */
export const SPEECH_PRICES: Record<string, SpeechPrice> = {
  // OpenAI — https://openai.com/api/pricing
  "tts-1": { per1MChars: 15 },
  "tts-1-hd": { per1MChars: 30 },

  // Google Cloud Text-to-Speech — https://cloud.google.com/text-to-speech/pricing
  // Both tiers list at $16/1M chars. The first 1M chars/month are free, which
  // this table does NOT model — estimates are an upper bound.
  "google-tts-neural2": {
    per1MChars: 16,
    note: "Google grants 1M characters/month free — actual cost may be $0.",
  },
  "google-tts-wavenet": {
    per1MChars: 16,
    note: "Google grants 1M characters/month free — actual cost may be $0.",
  },
};

/**
 * Models deliberately left unpriced, with the reason. Keeps "we forgot to add a
 * price" distinguishable from "this genuinely has no per-character list price".
 */
export const UNPRICED_SPEECH_MODELS: Record<string, string> = {
  eleven_multilingual_v2: "ElevenLabs bills subscription credits, not characters.",
  eleven_turbo_v2_5: "ElevenLabs bills subscription credits, not characters.",
};

export interface SpeechCostEstimate {
  /** USD, or null when the model has no per-character list price. */
  usd: number | null;
  /** Characters actually sent to the provider (cache hits excluded). */
  billedChars: number;
  /** Why `usd` is null, or a caveat on a priced estimate. */
  note?: string;
  /** Pricing table version this estimate was computed against. */
  pricingVersion: string;
}

/**
 * Estimate the cost of synthesizing `billedChars` characters with `modelId`.
 *
 * Pass only the characters that will actually hit the provider — the controller
 * excludes chunks already in the session cache, so a replay correctly estimates
 * $0 rather than re-charging the user in the UI for audio they already have.
 */
export function estimateSpeechCost(
  modelId: string | null | undefined,
  billedChars: number,
): SpeechCostEstimate {
  const base = {
    billedChars,
    pricingVersion: SPEECH_PRICING_VERSION,
  };

  if (!modelId) {
    return { ...base, usd: null, note: "Model not yet resolved." };
  }

  const unpriced = UNPRICED_SPEECH_MODELS[modelId];
  if (unpriced) return { ...base, usd: null, note: unpriced };

  const price = SPEECH_PRICES[modelId];
  if (!price) {
    return { ...base, usd: null, note: `No price on file for "${modelId}".` };
  }

  return {
    ...base,
    usd: (billedChars / 1_000_000) * price.per1MChars,
    note: price.note,
  };
}

/**
 * Format a USD amount for the cost tooltip.
 *
 * Read-aloud costs are small — a 4,000-character note on tts-1 is $0.06 — so a
 * plain 2-decimal format would render most reads as "$0.00" and read as "free".
 * Sub-cent amounts therefore get a "<$0.01" treatment instead of a misleading
 * zero, and tenth-of-a-cent precision below a dime.
 */
export function formatSpeechCost(usd: number | null): string {
  if (usd === null) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  if (usd < 0.1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
