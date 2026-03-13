/**
 * Image Provider Catalog — Sprint 42
 *
 * Static metadata for image generation providers and models.
 * Client-safe — used by settings UI and model pickers.
 */

import type { ImageProviderMeta, ImageProviderId } from "./types";

export const IMAGE_PROVIDER_CATALOG: ImageProviderMeta[] = [
  {
    id: "openai",
    name: "OpenAI",
    requiresApiKey: true,
    models: [
      {
        id: "dall-e-3",
        name: "DALL·E 3",
        supportedSizes: ["1024x1024", "1024x1792", "1792x1024"],
        defaultSize: "1024x1024",
        supportsQuality: true,
        supportsStyle: true,
      },
      {
        id: "gpt-image-1",
        name: "GPT Image 1",
        supportedSizes: ["1024x1024", "1024x1792", "1792x1024"],
        defaultSize: "1024x1024",
        supportsQuality: true,
        supportsStyle: false,
      },
    ],
  },
  {
    id: "google",
    name: "Google",
    requiresApiKey: true,
    models: [
      {
        id: "imagen-3",
        name: "Imagen 3",
        supportedSizes: ["1024x1024", "1024x1792", "1792x1024"],
        defaultSize: "1024x1024",
        supportsQuality: false,
        supportsStyle: false,
      },
    ],
  },
  {
    id: "deepai",
    name: "DeepAI",
    requiresApiKey: true,
    models: [
      {
        id: "deepai-text2img",
        name: "Text to Image",
        supportedSizes: ["512x512"],
        defaultSize: "512x512",
        supportsQuality: false,
        supportsStyle: false,
      },
    ],
  },
  {
    id: "fal",
    name: "fal.ai",
    requiresApiKey: true,
    models: [
      {
        id: "fal-flux-dev",
        name: "FLUX.1 Dev",
        supportedSizes: ["512x512", "1024x1024", "1024x1792", "1792x1024"],
        defaultSize: "1024x1024",
        supportsQuality: false,
        supportsStyle: false,
      },
      {
        id: "fal-flux-schnell",
        name: "FLUX.1 Schnell",
        supportedSizes: ["512x512", "1024x1024", "1024x1792", "1792x1024"],
        defaultSize: "1024x1024",
        supportsQuality: false,
        supportsStyle: false,
      },
    ],
  },
  {
    id: "together",
    name: "Together AI",
    requiresApiKey: true,
    models: [
      {
        id: "together-flux-schnell",
        name: "FLUX.1 Schnell",
        supportedSizes: ["512x512", "1024x1024"],
        defaultSize: "1024x1024",
        supportsQuality: false,
        supportsStyle: false,
      },
      {
        id: "together-sdxl",
        name: "Stable Diffusion XL",
        supportedSizes: ["512x512", "1024x1024"],
        defaultSize: "1024x1024",
        supportsQuality: false,
        supportsStyle: false,
      },
    ],
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    requiresApiKey: true,
    models: [
      {
        id: "fireworks-flux-dev",
        name: "FLUX.1 Dev",
        supportedSizes: ["512x512", "1024x1024", "1024x1792", "1792x1024"],
        defaultSize: "1024x1024",
        supportsQuality: false,
        supportsStyle: false,
      },
    ],
  },
  {
    id: "runway",
    name: "RunwayML",
    requiresApiKey: true,
    models: [
      {
        id: "runway-gen3",
        name: "Gen-3 Alpha",
        supportedSizes: ["1024x1024", "1024x1792", "1792x1024"],
        defaultSize: "1024x1024",
        supportsQuality: false,
        supportsStyle: false,
      },
    ],
  },
  {
    id: "artbreeder",
    name: "Artbreeder",
    requiresApiKey: true,
    models: [
      {
        id: "artbreeder-compose",
        name: "Compose",
        supportedSizes: ["512x512"],
        defaultSize: "512x512",
        supportsQuality: false,
        supportsStyle: false,
      },
    ],
  },
];

/** Look up an image provider by ID */
export function getImageProviderMeta(
  providerId: ImageProviderId
): ImageProviderMeta | undefined {
  return IMAGE_PROVIDER_CATALOG.find((p) => p.id === providerId);
}

/** Look up an image model across all providers */
export function getImageModelMeta(modelId: string) {
  for (const provider of IMAGE_PROVIDER_CATALOG) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return { provider, model };
  }
  return undefined;
}
