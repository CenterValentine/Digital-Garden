/**
 * Per-Connection usage report — the normalized shape every meter
 * adapter (telemetry / OpenRouter / Vercel Gateway / future) produces.
 *
 * The `source` field is a *honesty signal* the UI surfaces so users
 * know whether a number came from the provider's own billing API or
 * was estimated from our local telemetry. Mixed-mode (some fields
 * official, others estimated) returns `"hybrid"`.
 */

export type UsageSource = "provider-api" | "telemetry" | "hybrid";

export interface UsagePeriod {
  /** ISO date strings for the start and end of the reporting window. */
  from: string;
  to: string;
}

export interface UsageMoney {
  amount: number;
  currency: "USD";
}

export interface UsageTokens {
  input?: number;
  output?: number;
  total?: number;
}

export interface ModelUsageRow {
  modelId: string;
  /** Display name when known; falls back to modelId. */
  modelName?: string;
  requests: number;
  tokens?: UsageTokens;
  /** Estimated unless `source === "provider-api"`. */
  cost?: UsageMoney;
}

/**
 * Gateway-only sub-breakdown by *underlying* provider. A turn routed
 * through `vercel-gateway → anthropic/claude-sonnet-4` consumes an
 * Anthropic account, so users want to know "how much of my gateway
 * spend was Anthropic vs OpenAI" without diving into per-model rows.
 */
export interface ProviderUsageRow {
  providerId: string;
  requests: number;
  tokens?: UsageTokens;
  cost?: UsageMoney;
}

export interface UsageBudget {
  limit: UsageMoney;
  used: UsageMoney;
  remaining: UsageMoney;
}

export interface UsageReport {
  source: UsageSource;
  period: UsagePeriod;
  totals: {
    requests: number;
    tokens?: UsageTokens;
    cost?: UsageMoney;
  };
  byModel: ModelUsageRow[];
  byUnderlyingProvider?: ProviderUsageRow[];
  budget?: UsageBudget;
  /** When the report was generated; UI uses for "refreshed Xm ago." */
  refreshedAt: string;
  /**
   * Free-form note from the adapter when something is incomplete
   * (e.g., "tokens estimated from message length; install upstream
   * usage capture for accuracy"). Surface in the meter UI as a small
   * help-text line.
   */
  note?: string;
}
