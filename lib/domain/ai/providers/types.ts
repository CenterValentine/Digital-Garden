/**
 * AI Provider Types
 *
 * Metadata types for the provider catalog and settings UI.
 */

import type { AIProviderId, AIModelId } from "../types";

/** Capabilities a model may support */
export type ModelCapability = "text" | "vision" | "tools" | "streaming";

/** Cost tier for display in settings */
export type CostTier = "low" | "medium" | "high";

/** Static metadata about a single model */
export interface ModelMeta {
  id: AIModelId;
  name: string;
  contextWindow: number;
  maxOutput: number;
  capabilities: ModelCapability[];
  costTier: CostTier;
}

/** Static metadata about a provider and its models */
export interface ProviderMeta {
  id: AIProviderId;
  name: string;
  requiresApiKey: boolean;
  models: ModelMeta[];
}
