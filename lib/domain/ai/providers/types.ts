/**
 * AI Provider Types
 *
 * Metadata types for the provider catalog and settings UI.
 */

import type { AIProviderId, AIModelId } from "../types";

/** Capabilities a model may support */
export type ModelCapability = "text" | "vision" | "tools" | "streaming" | "image-generation";

/** Cost tier for display in settings */
export type CostTier = "low" | "medium" | "high";

/**
 * Reasoning posture (Session 6):
 *   - `auto`    — provider emits reasoning unprompted (OpenAI o-series).
 *   - `enabled` — provider needs `providerOptions` opt-in per call.
 *                 The chat route looks at this flag and synthesizes the
 *                 right per-provider config (Anthropic thinking, Google
 *                 thinkingConfig.includeThoughts).
 *   - omitted   — model does not emit reasoning.
 */
export type ReasoningMode = "auto" | "enabled";

/** Static metadata about a single model */
export interface ModelMeta {
  id: AIModelId;
  name: string;
  contextWindow: number;
  maxOutput: number;
  capabilities: ModelCapability[];
  costTier: CostTier;
  /** Reasoning emission posture; absent = no reasoning. */
  reasoning?: ReasoningMode;
  /**
   * Token budget for `enabled`-mode providers that gate thinking by an
   * explicit budget (Anthropic extended thinking). Ignored otherwise.
   */
  thinkingBudgetTokens?: number;
}

/** Static metadata about a provider and its models */
export interface ProviderMeta {
  id: AIProviderId;
  name: string;
  requiresApiKey: boolean;
  models: ModelMeta[];
}
