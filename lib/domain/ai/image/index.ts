/**
 * AI Image Generation — Barrel Export (Sprint 42)
 */

// Client-safe types and catalog
export type {
  ImageProviderId,
  ImageModelId,
  ImageSize,
  ImageGenRequest,
  ImageGenResult,
  ImageModelMeta,
  ImageProviderMeta,
} from "./types";

export {
  IMAGE_PROVIDER_CATALOG,
  getImageProviderMeta,
  getImageModelMeta,
} from "./catalog";

// Server-only: import directly from "./generate" in API routes
//   import { generateImage } from "@/lib/domain/ai/image/generate";
