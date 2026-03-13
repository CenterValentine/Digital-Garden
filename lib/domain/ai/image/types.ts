/**
 * AI Image Generation Types — Sprint 42
 *
 * Type definitions for the multi-provider image generation system.
 * Client-safe — no server-only imports.
 */

// ─── Provider & Model IDs ─────────────────────────────────────

/** Providers that support image generation */
export type ImageProviderId =
  | "openai"       // DALL-E 3, gpt-image-1
  | "google"       // Imagen 3
  | "deepai"       // DeepAI text2img
  | "fal"          // fal.ai (Flux, SDXL)
  | "together"     // Together AI (Stable Diffusion, FLUX)
  | "fireworks"    // Fireworks AI
  | "runway"       // RunwayML Gen-3
  | "artbreeder";  // Artbreeder

/** Canonical image model IDs */
export type ImageModelId =
  // OpenAI
  | "dall-e-3"
  | "gpt-image-1"
  // Google
  | "imagen-3"
  // DeepAI
  | "deepai-text2img"
  // fal.ai
  | "fal-flux-dev"
  | "fal-flux-schnell"
  // Together AI
  | "together-flux-schnell"
  | "together-sdxl"
  // Fireworks AI
  | "fireworks-flux-dev"
  // RunwayML
  | "runway-gen3"
  // Artbreeder
  | "artbreeder-compose";

// ─── Image Size ────────────────────────────────────────────────

/** Standard image dimensions */
export type ImageSize =
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "1024x1792"   // portrait
  | "1792x1024";  // landscape

// ─── Request / Response ────────────────────────────────────────

/** Input for image generation */
export interface ImageGenRequest {
  /** The text prompt describing the desired image */
  prompt: string;
  /** Provider to use for generation */
  providerId: ImageProviderId;
  /** Specific model to use */
  modelId: ImageModelId;
  /** Desired image dimensions */
  size?: ImageSize;
  /** BYOK API key (optional — falls back to stored key or env var) */
  apiKey?: string;
  /** Quality setting (provider-dependent) */
  quality?: "standard" | "hd";
  /** Style hint (provider-dependent) */
  style?: "natural" | "vivid";
}

/** Successful generation result */
export interface ImageGenResult {
  /** URL of the generated image (may be temporary) */
  url: string;
  /** Base64-encoded image data (some providers return this instead of URL) */
  base64?: string;
  /** Revised prompt (some providers modify the prompt) */
  revisedPrompt?: string;
  /** Image dimensions */
  width: number;
  height: number;
  /** MIME type */
  mimeType: string;
  /** Provider that generated the image */
  providerId: ImageProviderId;
  /** Model that generated the image */
  modelId: ImageModelId;
}

// ─── Provider Catalog (Client-Safe) ────────────────────────────

/** Static metadata about an image model */
export interface ImageModelMeta {
  id: ImageModelId;
  name: string;
  supportedSizes: ImageSize[];
  defaultSize: ImageSize;
  supportsQuality: boolean;
  supportsStyle: boolean;
}

/** Static metadata about an image provider */
export interface ImageProviderMeta {
  id: ImageProviderId;
  name: string;
  requiresApiKey: boolean;
  models: ImageModelMeta[];
}
