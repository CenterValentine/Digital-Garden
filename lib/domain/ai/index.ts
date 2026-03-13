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

// Image generation (client-safe catalog + types)
export {
  IMAGE_PROVIDER_CATALOG,
  getImageProviderMeta,
  getImageModelMeta,
} from "./image/catalog";

export type {
  ImageProviderId,
  ImageModelId,
  ImageSize,
  ImageGenRequest,
  ImageGenResult,
  ImageModelMeta,
  ImageProviderMeta,
} from "./image/types";

// Note: resolveChatModel, middleware, and generateImage are server-only.
// Import directly from their modules in API routes:
//   import { resolveChatModel } from "@/lib/domain/ai/providers/registry";
//   import { applyMiddleware, defaultSettingsMiddleware } from "@/lib/domain/ai/middleware";
//   import { generateImage } from "@/lib/domain/ai/image/generate";
