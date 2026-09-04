/**
 * Pricing engine v2 — per-1M-token list pricing (USD) + the turn-cost
 * calculator (COST-METERING-PLAN.md).
 *
 * PURE AND CLIENT-SAFE — no Prisma, no server imports. ChatMessage
 * imports this directly by path; NEVER re-export it through the
 * `ai-connections` barrel (index.ts pulls in service.ts → Prisma).
 *
 * All figures are list-price ESTIMATES. Costs computed here are stamped
 * with `PRICING_VERSION` and persisted with the turn, so later table
 * edits never rewrite history. Known, accepted error sources:
 *   - promotional/intro pricing windows (rows carry a `note`)
 *   - batch-mode / flex-tier discounts (unmodeled)
 *   - Gemini context-cache STORAGE fees ($/1M/hr — time-based, unmodeled)
 *   - Anthropic 1h-TTL cache writes bill 2× (we model the 5m 1.25× rate)
 *   - taxes, free credits, negotiated rates
 *
 * ── Usage-field semantics (AI SDK v6 normalized usage) ────────────────
 * What `inputTokens` means relative to `cachedInputTokens` differs by
 * provider adapter:
 *   - OpenAI, Google, DeepSeek, and every openai-compat route (Kimi,
 *     Groq, Fireworks, Together, OpenRouter): `inputTokens` is the TOTAL
 *     prompt (cached tokens INCLUDED); `cachedInputTokens` is the cached
 *     subset (OpenAI `cached_tokens`, Gemini `cachedContentTokenCount`,
 *     DeepSeek `prompt_cache_hit_tokens`).
 *   - Anthropic: `inputTokens` EXCLUDES cache activity (`input_tokens`
 *     is the uncached remainder); cache reads arrive as
 *     `cachedInputTokens`, cache WRITES only via
 *     `providerMetadata.anthropic.cacheCreationInputTokens` (threaded
 *     through as `cacheWriteTokens` by the chat route).
 * Owner smoke-verification of these mappings (one cached turn per
 * provider vs. the provider's own billing figure) is tracked in
 * COST-METERING-PLAN.md — until then treat per-turn figures as ±provider
 * drift, not invoices.
 */

/** Bump on ANY change to the tables below. Stamped into persisted costs. */
export const PRICING_VERSION = "2026-08-08";

export interface ModelPriceTier {
  /** Applies when a single REQUEST's input tokens exceed this. */
  thresholdTokens: number;
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
  cacheWritePer1M?: number;
}

export interface ModelPrice {
  /**
   * USD per 1M input tokens. For hit/miss-priced providers (DeepSeek,
   * Kimi) this is the cache-MISS rate; `cachedInputPer1M` is the hit rate.
   */
  inputPer1M: number;
  /** USD per 1M output tokens. Reasoning/thinking tokens bill as output. */
  outputPer1M: number;
  /** Cache READ / hit rate; absent → cached tokens bill at inputPer1M. */
  cachedInputPer1M?: number;
  /** Cache WRITE premium (Anthropic, OpenAI gpt-5.6); absent → no charge. */
  cacheWritePer1M?: number;
  /** Long-context tier (OpenAI gpt-5.6 >272K, Gemini Pro >200K). */
  longContext?: ModelPriceTier;
  /** Date this row was verified against the provider's pricing page. */
  asOf: string;
  note?: string;
}

// Anthropic caches: reads ≈0.1× input, writes 1.25× input (5-minute TTL).
const anthropicRow = (
  inputPer1M: number,
  outputPer1M: number,
  note?: string,
): ModelPrice => ({
  inputPer1M,
  outputPer1M,
  cachedInputPer1M: inputPer1M * 0.1,
  cacheWritePer1M: inputPer1M * 1.25,
  asOf: "2026-08-08",
  ...(note ? { note } : {}),
});

export const MODEL_PRICING: Record<string, ModelPrice> = {
  // ── Anthropic (verified 2026-08-08) ───────────────────────────────
  "claude-fable-5": anthropicRow(10, 50),
  "claude-opus-5": anthropicRow(5, 25),
  "claude-opus-4-8": anthropicRow(5, 25),
  "claude-opus-4-7": anthropicRow(5, 25),
  "claude-opus-4-6": anthropicRow(5, 25),
  "claude-opus-4-5": anthropicRow(5, 25),
  // Intro pricing through 2026-08-31 (then $3/$15) — bill-accurate today.
  "claude-sonnet-5": anthropicRow(2, 10, "intro pricing through 2026-08-31, then 3/15"),
  "claude-sonnet-4-6": anthropicRow(3, 15),
  "claude-sonnet-4-5": anthropicRow(3, 15),
  "claude-haiku-4-5": anthropicRow(1, 5),
  // Legacy ids kept for old history rows (2026-Q2 list rates).
  "claude-opus-4": { inputPer1M: 15, outputPer1M: 75, asOf: "2026-Q2", note: "legacy" },
  "claude-sonnet-4": { inputPer1M: 3, outputPer1M: 15, asOf: "2026-Q2", note: "legacy" },
  "claude-sonnet-3-5": { inputPer1M: 3, outputPer1M: 15, asOf: "2026-Q2", note: "legacy" },
  "claude-haiku-3-5": { inputPer1M: 0.8, outputPer1M: 4, asOf: "2026-Q2", note: "legacy" },

  // ── OpenAI (verified 2026-08-08; cache writes bill only on gpt-5.6;
  //    long-context tier >272K input — threshold corroborated-secondary) ─
  "gpt-5.6-sol": {
    inputPer1M: 5, outputPer1M: 30, cachedInputPer1M: 0.5, cacheWritePer1M: 6.25,
    longContext: { thresholdTokens: 272_000, inputPer1M: 10, outputPer1M: 45, cachedInputPer1M: 1, cacheWritePer1M: 12.5 },
    asOf: "2026-08-08",
  },
  "gpt-5.6-terra": {
    inputPer1M: 2, outputPer1M: 12, cachedInputPer1M: 0.2, cacheWritePer1M: 2.5,
    longContext: { thresholdTokens: 272_000, inputPer1M: 4, outputPer1M: 18, cachedInputPer1M: 0.4, cacheWritePer1M: 5 },
    asOf: "2026-08-08",
  },
  "gpt-5.6-luna": {
    inputPer1M: 0.2, outputPer1M: 1.2, cachedInputPer1M: 0.02, cacheWritePer1M: 0.25,
    longContext: { thresholdTokens: 272_000, inputPer1M: 0.4, outputPer1M: 1.8, cachedInputPer1M: 0.04, cacheWritePer1M: 0.5 },
    asOf: "2026-08-08",
  },
  "gpt-5.5": { inputPer1M: 5, outputPer1M: 30, cachedInputPer1M: 0.5, asOf: "2026-08-08" },
  "gpt-5.5-pro": { inputPer1M: 30, outputPer1M: 180, asOf: "2026-08-08" },
  "gpt-5.4": { inputPer1M: 2.5, outputPer1M: 15, cachedInputPer1M: 0.25, asOf: "2026-08-08" },
  "gpt-5.4-mini": { inputPer1M: 0.75, outputPer1M: 4.5, cachedInputPer1M: 0.075, asOf: "2026-08-08" },
  "gpt-5.4-nano": { inputPer1M: 0.2, outputPer1M: 1.25, cachedInputPer1M: 0.02, asOf: "2026-08-08" },
  "gpt-5.1": { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125, asOf: "2026-08-08" },
  "gpt-5": { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125, asOf: "2026-08-08" },
  "gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 2, cachedInputPer1M: 0.025, asOf: "2026-08-08" },
  "gpt-5-nano": { inputPer1M: 0.05, outputPer1M: 0.4, cachedInputPer1M: 0.005, asOf: "2026-08-08" },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10, cachedInputPer1M: 1.25, asOf: "2026-08-08" },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075, asOf: "2026-08-08" },
  // Legacy reasoning line (2026-Q2 list rates).
  o3: { inputPer1M: 2, outputPer1M: 8, asOf: "2026-Q2", note: "legacy" },
  "o3-mini": { inputPer1M: 1.1, outputPer1M: 4.4, asOf: "2026-Q2", note: "legacy" },
  "o1-mini": { inputPer1M: 1.1, outputPer1M: 4.4, asOf: "2026-Q2", note: "legacy" },
  "gpt-4": { inputPer1M: 30, outputPer1M: 60, asOf: "2026-Q2", note: "legacy" },

  // ── Google Gemini (verified 2026-08-08; thinking bills as output;
  //    cache STORAGE $/1M/hr unmodeled; Pro tiers >200K input) ─────────
  "gemini-3.6-flash": { inputPer1M: 1.5, outputPer1M: 7.5, cachedInputPer1M: 0.15, asOf: "2026-08-08" },
  "gemini-3.5-flash": { inputPer1M: 1.5, outputPer1M: 9, cachedInputPer1M: 0.15, asOf: "2026-08-08" },
  "gemini-3.5-flash-lite": { inputPer1M: 0.3, outputPer1M: 2.5, cachedInputPer1M: 0.03, asOf: "2026-08-08" },
  "gemini-3.1-pro-preview": {
    inputPer1M: 2, outputPer1M: 12, cachedInputPer1M: 0.2,
    longContext: { thresholdTokens: 200_000, inputPer1M: 4, outputPer1M: 18, cachedInputPer1M: 0.2 },
    asOf: "2026-08-08",
  },
  "gemini-3.1-flash-lite": { inputPer1M: 0.25, outputPer1M: 1.5, cachedInputPer1M: 0.025, asOf: "2026-08-08" },
  "gemini-3-flash-preview": { inputPer1M: 0.5, outputPer1M: 3, cachedInputPer1M: 0.05, asOf: "2026-08-08" },
  "gemini-2.5-pro": {
    inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125,
    longContext: { thresholdTokens: 200_000, inputPer1M: 2.5, outputPer1M: 15, cachedInputPer1M: 0.125 },
    asOf: "2026-08-08",
  },
  "gemini-2.5-flash": { inputPer1M: 0.3, outputPer1M: 2.5, cachedInputPer1M: 0.03, asOf: "2026-08-08" },
  "gemini-2.5-flash-lite": { inputPer1M: 0.1, outputPer1M: 0.4, cachedInputPer1M: 0.01, asOf: "2026-08-08" },
  "gemini-2.0-flash": { inputPer1M: 0.1, outputPer1M: 0.4, asOf: "2026-Q2", note: "legacy" },

  // ── DeepSeek (verified 2026-08-08; input = cache-MISS, cached = HIT;
  //    official page warns of an upcoming "significant" price increase) ─
  "deepseek-v4-flash": { inputPer1M: 0.14, outputPer1M: 0.28, cachedInputPer1M: 0.0028, asOf: "2026-08-08" },
  "deepseek-v4-pro": { inputPer1M: 0.435, outputPer1M: 0.87, cachedInputPer1M: 0.003625, asOf: "2026-08-08" },

  // ── Moonshot / Kimi (verified 2026-08-08 on platform.kimi.ai; same
  //    hit/miss shape; automatic caching, no write fees). Account model
  //    ids are volatile — matched via PRICING_PREFIX_RULES. ────────────
  "kimi-k3": { inputPer1M: 3, outputPer1M: 15, cachedInputPer1M: 0.3, asOf: "2026-08-08" },
  "kimi-k2.7-code-highspeed": { inputPer1M: 1.9, outputPer1M: 8, cachedInputPer1M: 0.38, asOf: "2026-08-08" },
  "kimi-k2.7-code": { inputPer1M: 0.95, outputPer1M: 4, cachedInputPer1M: 0.19, asOf: "2026-08-08" },
  "kimi-k2.6": { inputPer1M: 0.95, outputPer1M: 4, cachedInputPer1M: 0.16, asOf: "2026-08-08" },

  // ── xAI (2026-Q2 list rates — refresh pass owed) ──────────────────
  "grok-3": { inputPer1M: 3, outputPer1M: 15, asOf: "2026-Q2" },
  "grok-3-mini": { inputPer1M: 0.3, outputPer1M: 0.5, asOf: "2026-Q2" },

  // ── Mistral (2026-Q2) ─────────────────────────────────────────────
  "mistral-large-latest": { inputPer1M: 2, outputPer1M: 6, asOf: "2026-Q2" },
  "codestral-latest": { inputPer1M: 0.3, outputPer1M: 0.9, asOf: "2026-Q2" },

  // ── Groq (2026-Q2) ────────────────────────────────────────────────
  "llama-3.3-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79, asOf: "2026-Q2" },
  "mixtral-8x7b-32768": { inputPer1M: 0.24, outputPer1M: 0.24, asOf: "2026-Q2" },
};

/**
 * Family-prefix fallback rules, ORDERED LONGEST-FIRST (load-bearing:
 * `kimi-k2.7-code-highspeed` must win over `kimi-k2.7-code`). Applied
 * after exact and namespace-stripped lookups miss — catches dated
 * snapshots (`claude-sonnet-4-5-20250929`), account-volatile ids
 * (`kimi-k2.6-1120`), and vendor `-latest` aliases. Rules must map to a
 * MODEL_PRICING key; `ai:pricing:check` asserts both that and ordering.
 */
export const PRICING_PREFIX_RULES: Array<{ prefix: string; use: string }> = [
  { prefix: "kimi-k2.7-code-highspeed", use: "kimi-k2.7-code-highspeed" },
  { prefix: "kimi-k2.7-code", use: "kimi-k2.7-code" },
  { prefix: "gemini-3.5-flash-lite", use: "gemini-3.5-flash-lite" },
  { prefix: "gemini-3.1-flash-lite", use: "gemini-3.1-flash-lite" },
  { prefix: "gemini-2.5-flash-lite", use: "gemini-2.5-flash-lite" },
  { prefix: "gemini-3.1-pro", use: "gemini-3.1-pro-preview" },
  { prefix: "claude-sonnet-4-6", use: "claude-sonnet-4-6" },
  { prefix: "claude-sonnet-4-5", use: "claude-sonnet-4-5" },
  { prefix: "claude-haiku-4-5", use: "claude-haiku-4-5" },
  { prefix: "claude-opus-4-8", use: "claude-opus-4-8" },
  { prefix: "claude-opus-4-7", use: "claude-opus-4-7" },
  { prefix: "claude-opus-4-6", use: "claude-opus-4-6" },
  { prefix: "claude-opus-4-5", use: "claude-opus-4-5" },
  { prefix: "gemini-3.6-flash", use: "gemini-3.6-flash" },
  { prefix: "gemini-3.5-flash", use: "gemini-3.5-flash" },
  { prefix: "gemini-2.5-flash", use: "gemini-2.5-flash" },
  { prefix: "gemini-2.5-pro", use: "gemini-2.5-pro" },
  { prefix: "gpt-5.6-terra", use: "gpt-5.6-terra" },
  { prefix: "gpt-5.6-luna", use: "gpt-5.6-luna" },
  { prefix: "gpt-5.6-sol", use: "gpt-5.6-sol" },
  { prefix: "gpt-5.4-mini", use: "gpt-5.4-mini" },
  { prefix: "gpt-5.4-nano", use: "gpt-5.4-nano" },
  { prefix: "gpt-4o-mini", use: "gpt-4o-mini" },
  { prefix: "gpt-5-mini", use: "gpt-5-mini" },
  { prefix: "gpt-5-nano", use: "gpt-5-nano" },
  { prefix: "kimi-k2.6", use: "kimi-k2.6" },
  { prefix: "kimi-k3", use: "kimi-k3" },
  { prefix: "gpt-5.5", use: "gpt-5.5" },
  { prefix: "gpt-5.4", use: "gpt-5.4" },
  { prefix: "gpt-4o", use: "gpt-4o" },
  // Id-format variants seen on gateways/catalogs for models priced above.
  { prefix: "claude-3.5-sonnet", use: "claude-sonnet-3-5" },
  { prefix: "mistral-large", use: "mistral-large-latest" },
  { prefix: "codestral", use: "codestral-latest" },
  { prefix: "mixtral-8x7b", use: "mixtral-8x7b-32768" },
  // Open-weights family: host rates vary; Groq's list rate is the estimate.
  { prefix: "llama-3.3-70b", use: "llama-3.3-70b-versatile" },
];

/**
 * Model ids (exact) and id prefixes we deliberately do NOT price —
 * `ai:pricing:check` accepts these as covered; surfaces render them as
 * "unpriced" rather than $0.
 */
export const UNPRICED_MODELS: Record<string, string> = {
  "deepseek-chat": "retired alias (2026-07-24) — pointed at v4-flash during transition",
  "deepseek-reasoner": "retired alias (2026-07-24)",
};
export const UNPRICED_PREFIXES: Array<{ prefix: string; reason: string }> = [
  { prefix: "moonshot-v1", reason: "classic series sunsets 2026-08-31; not listed on current pricing pages" },
  { prefix: "kimi-latest", reason: "no pricing on current official pages" },
  { prefix: "kimi-k2.5", reason: "no longer sold on the international platform" },
  { prefix: "accounts/fireworks/", reason: "Fireworks per-model rates vary; gateway metering preferred" },
  { prefix: "meta-llama/Llama-", reason: "Together's Turbo-variant rates differ per host; gateway metering preferred" },
  { prefix: "Qwen/", reason: "host-specific open-model rates; gateway metering preferred" },
];

/** Strip a namespaced prefix ("anthropic/claude-sonnet-5" → bare id). */
function stripNamespace(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash > 0 ? id.slice(slash + 1) : id;
}

/**
 * Resolve a price row: exact id → namespace-stripped exact → family
 * prefix (on both raw and stripped forms). Returns null on miss — the
 * caller must surface "unpriced", never fabricate a figure.
 */
export function priceFor(modelId: string | null | undefined): ModelPrice | null {
  if (!modelId) return null;
  const direct = MODEL_PRICING[modelId];
  if (direct) return direct;
  const bare = stripNamespace(modelId);
  const stripped = MODEL_PRICING[bare];
  if (stripped) return stripped;
  for (const rule of PRICING_PREFIX_RULES) {
    if (modelId.startsWith(rule.prefix) || bare.startsWith(rule.prefix)) {
      return MODEL_PRICING[rule.use] ?? null;
    }
  }
  return null;
}

/** True when the id is on the deliberate no-price list. */
export function isKnownUnpriced(modelId: string | null | undefined): boolean {
  if (!modelId) return false;
  const bare = stripNamespace(modelId);
  if (UNPRICED_MODELS[modelId] || UNPRICED_MODELS[bare]) return true;
  return UNPRICED_PREFIXES.some(
    (r) => modelId.startsWith(r.prefix) || bare.startsWith(r.prefix),
  );
}

/**
 * Does this provider's `inputTokens` INCLUDE `cachedInputTokens`?
 * Anthropic reports the uncached remainder; everyone else reports the
 * total. See the semantics block in the file header.
 */
function inputIncludesCached(providerId: string | null | undefined): boolean {
  return providerId !== "anthropic";
}

export interface UsageLike {
  inputTokens?: number;
  outputTokens?: number;
  /** Cache reads / hits (subset of input for non-Anthropic providers). */
  cachedInputTokens?: number;
  /** Cache writes (Anthropic providerMetadata; OpenAI gpt-5.6 unavailable via SDK usage — undercount accepted). */
  cacheWriteTokens?: number;
}

export interface TurnCostBreakdown {
  /** USD for uncached input tokens. */
  input: number;
  /** USD for cache-read/hit tokens. */
  cachedInput: number;
  /** USD for cache-write tokens. */
  cacheWrite: number;
  /** USD for output tokens (reasoning included). */
  output: number;
}

export interface TurnCost {
  usd: number;
  priceVersion: string;
  breakdown: TurnCostBreakdown;
  /** Literal marker: every telemetry-derived cost is an estimate. */
  estimated: true;
}

const per1M = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;

/**
 * Price ONE REQUEST's usage. Callers accumulate per-request costs into
 * turn totals — never price a turn's summed usage directly, or a
 * multi-request turn's summed input falsely trips long-context tiers
 * (five 60K-input requests ≠ one 300K request).
 *
 * Returns null when the model has no price row (render "unpriced").
 */
export function computeTurnCost(
  usage: UsageLike,
  modelId: string | null | undefined,
  providerId?: string | null,
): TurnCost | null {
  const base = priceFor(modelId);
  if (!base) return null;

  const input = Math.max(0, usage.inputTokens ?? 0);
  const output = Math.max(0, usage.outputTokens ?? 0);
  const cached = Math.max(0, Math.min(usage.cachedInputTokens ?? 0, input * 2));
  const cacheWrite = Math.max(0, usage.cacheWriteTokens ?? 0);

  // Long-context tier keys off the request's total prompt size.
  const totalPrompt = inputIncludesCached(providerId)
    ? input
    : input + cached + cacheWrite;
  const tier =
    base.longContext && totalPrompt > base.longContext.thresholdTokens
      ? base.longContext
      : null;
  const rates = {
    input: tier?.inputPer1M ?? base.inputPer1M,
    output: tier?.outputPer1M ?? base.outputPer1M,
    cachedInput:
      (tier ? tier.cachedInputPer1M : base.cachedInputPer1M) ??
      (tier?.inputPer1M ?? base.inputPer1M),
    cacheWrite: (tier ? tier.cacheWritePer1M : base.cacheWritePer1M) ?? 0,
  };

  const uncachedInput = inputIncludesCached(providerId)
    ? Math.max(0, input - cached)
    : input;

  const breakdown: TurnCostBreakdown = {
    input: per1M(uncachedInput, rates.input),
    cachedInput: per1M(cached, rates.cachedInput),
    cacheWrite: per1M(cacheWrite, rates.cacheWrite),
    output: per1M(output, rates.output),
  };
  const usd =
    breakdown.input + breakdown.cachedInput + breakdown.cacheWrite + breakdown.output;
  return { usd, priceVersion: PRICING_VERSION, breakdown, estimated: true };
}

/** Shape of the `cost` object persisted in ConversationMessage.metadata. */
export type PersistedTurnCost =
  | (Pick<TurnCost, "usd" | "priceVersion" | "estimated"> & {
      breakdown: TurnCostBreakdown;
    })
  | { unpriced: true; modelId?: string };

/** Narrow a metadata `cost` value to the priced shape. */
export function readPersistedCost(
  value: unknown,
): { usd: number; priceVersion?: string } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { usd?: unknown; priceVersion?: unknown; unpriced?: unknown };
  if (v.unpriced === true) return null;
  if (typeof v.usd !== "number" || !Number.isFinite(v.usd)) return null;
  return {
    usd: v.usd,
    ...(typeof v.priceVersion === "string" ? { priceVersion: v.priceVersion } : {}),
  };
}

/** Render a USD estimate compactly: `$1.23`, `$0.042`, `<$0.001`. */
export function formatUsdEstimate(usd: number): string {
  if (usd >= 0.1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.001) return `$${usd.toFixed(3)}`;
  if (usd > 0) return "<$0.001";
  return "$0.00";
}

// ── Session aggregation (EXTRACTION-TO-DATABASE-PLAN P3 owner ask) ────────

export interface SessionUsage {
  /** Assistant turns that reported any usage. */
  turns: number;
  inputTokens: number;
  outputTokens: number;
  /** Sum of persisted per-turn cost estimates (priced turns only). */
  totalUsd: number;
  /** Turns whose model had no price row — totalUsd understates by these. */
  unpricedTurns: number;
}

/**
 * Sum a chat session's persisted per-turn usage for display: the popover
 * shows the session line beside the turn line so a 100k turn total reads
 * as "part of a priced whole", not one alarming number. Pure aggregation
 * over message metadata — the turn accumulator already did the work.
 */
export function aggregateSessionUsage(
  messages: Array<{ role?: string; metadata?: unknown }>,
): SessionUsage | null {
  const out: SessionUsage = {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalUsd: 0,
    unpricedTurns: 0,
  };
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const meta =
      m.metadata && typeof m.metadata === "object"
        ? (m.metadata as { usage?: unknown; cost?: unknown })
        : undefined;
    const usage =
      meta?.usage && typeof meta.usage === "object"
        ? (meta.usage as { inputTokens?: unknown; outputTokens?: unknown })
        : undefined;
    const input =
      typeof usage?.inputTokens === "number" && Number.isFinite(usage.inputTokens)
        ? usage.inputTokens
        : 0;
    const output =
      typeof usage?.outputTokens === "number" && Number.isFinite(usage.outputTokens)
        ? usage.outputTokens
        : 0;
    if (input === 0 && output === 0) continue;
    out.turns += 1;
    out.inputTokens += input;
    out.outputTokens += output;
    const cost = readPersistedCost(meta?.cost);
    if (cost) {
      out.totalUsd += cost.usd;
    } else if (
      meta?.cost &&
      typeof meta.cost === "object" &&
      (meta.cost as { unpriced?: unknown }).unpriced === true
    ) {
      out.unpricedTurns += 1;
    }
  }
  return out.turns > 0 ? out : null;
}
