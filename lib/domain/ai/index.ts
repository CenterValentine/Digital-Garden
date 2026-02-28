/**
 * AI Domain — Barrel Export
 *
 * Central export point for AI integration types and utilities.
 * Import from "@/lib/domain/ai" throughout the application.
 */

// Core types
export type {
  AIProviderId,
  AIModelId,
  ProviderConfig,
  AIToolChoice,
  StoredChatMessage,
  ChatMetadata,
} from "./types";

// Provider catalog (client-safe — no server-only imports)
export {
  PROVIDER_CATALOG,
  getProviderMeta,
  getModelMeta,
} from "./providers/catalog";

export type {
  ProviderMeta,
  ModelMeta,
  ModelCapability,
  CostTier,
} from "./providers/types";

// Note: resolveChatModel and middleware are server-only.
// Import directly from their modules in API routes:
//   import { resolveChatModel } from "@/lib/domain/ai/providers/registry";
//   import { applyMiddleware, defaultSettingsMiddleware } from "@/lib/domain/ai/middleware";
