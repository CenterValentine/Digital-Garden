/**
 * AI Image Generation — Sprint 42
 *
 * Server-side image generation across 8 providers.
 * Each provider's unique REST API is normalized into ImageGenResult.
 *
 * Provider APIs:
 *   OpenAI      — POST /v1/images/generations (JSON)
 *   Google      — Vertex AI / Generative Language API
 *   DeepAI      — POST /api/text2img (FormData)
 *   fal.ai      — POST /fal-ai/flux/* (JSON)
 *   Together AI — POST /v1/images/generations (OpenAI-compatible)
 *   Fireworks   — POST /inference/v1/workflows/*
 *   RunwayML    — POST /v1/image_to_video (limited image gen)
 *   Artbreeder  — POST /api/compose (limited API)
 */

import "server-only";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageProviderId,
  ImageSize,
} from "./types";
import { getProviderKey } from "@/lib/domain/ai/keys";

// ─── Size Helpers ──────────────────────────────────────────────

function parseDimensions(size: ImageSize): { width: number; height: number } {
  const [w, h] = size.split("x").map(Number);
  return { width: w, height: h };
}

// ─── Main Entry Point ──────────────────────────────────────────

/**
 * Generate an image using the specified provider and model.
 *
 * Resolves API keys in priority order:
 *   1. Explicit apiKey in request
 *   2. Stored BYOK key for the provider
 *   3. Environment variable fallback
 *
 * @throws Error if API key is missing or generation fails
 */
export async function generateImage(
  request: ImageGenRequest,
  userId: string
): Promise<ImageGenResult> {
  // Resolve API key
  const apiKey =
    request.apiKey ??
    (await getProviderKey(userId, request.providerId)) ??
    getEnvKey(request.providerId);

  if (!apiKey) {
    throw new Error(
      `No API key configured for image provider "${request.providerId}". ` +
        `Add one in Settings → AI → API Keys.`
    );
  }

  const size = request.size ?? "1024x1024";
  const { width, height } = parseDimensions(size);

  const result = await dispatchToProvider({
    ...request,
    size,
    apiKey,
  });

  return {
    ...result,
    width: result.width || width,
    height: result.height || height,
    providerId: request.providerId,
    modelId: request.modelId,
  };
}

// ─── Environment Key Fallbacks ─────────────────────────────────

function getEnvKey(providerId: ImageProviderId): string | undefined {
  const envMap: Record<ImageProviderId, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_AI_API_KEY,
    deepai: process.env.DEEPAI_API_KEY,
    fal: process.env.FAL_API_KEY,
    together: process.env.TOGETHER_API_KEY,
    fireworks: process.env.FIREWORKS_API_KEY,
    runway: process.env.RUNWAY_API_KEY,
    artbreeder: process.env.ARTBREEDER_API_KEY,
  };
  return envMap[providerId];
}

// ─── Provider Dispatch ─────────────────────────────────────────

interface ResolvedRequest extends ImageGenRequest {
  apiKey: string;
  size: ImageSize;
}

async function dispatchToProvider(
  req: ResolvedRequest
): Promise<ImageGenResult> {
  switch (req.providerId) {
    case "openai":
      return generateOpenAI(req);
    case "google":
      return generateGoogle(req);
    case "deepai":
      return generateDeepAI(req);
    case "fal":
      return generateFal(req);
    case "together":
      return generateTogether(req);
    case "fireworks":
      return generateFireworks(req);
    case "runway":
      return generateRunway(req);
    case "artbreeder":
      return generateArtbreeder(req);
    default:
      throw new Error(`Unsupported image provider: ${req.providerId}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

// ─── OpenAI (DALL-E 3 / GPT Image 1) ──────────────────────────

async function generateOpenAI(req: ResolvedRequest): Promise<ImageGenResult> {
  const modelMap: Record<string, string> = {
    "dall-e-3": "dall-e-3",
    "gpt-image-1": "gpt-image-1",
  };
  const model = modelMap[req.modelId] ?? "dall-e-3";

  const body: Record<string, unknown> = {
    model,
    prompt: req.prompt,
    n: 1,
    size: req.size,
  };

  if (req.quality && model === "dall-e-3") body.quality = req.quality;
  if (req.style && model === "dall-e-3") body.style = req.style;

  // gpt-image-1 returns base64 by default
  if (model === "gpt-image-1") {
    body.output_format = "png";
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `OpenAI image generation failed: ${(err as Record<string, Record<string, string>>).error?.message ?? res.statusText}`
    );
  }

  const json = await res.json();
  const item = (json as { data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }> }).data[0];

  return {
    url: item.url ?? "",
    base64: item.b64_json,
    revisedPrompt: item.revised_prompt,
    width: 0,
    height: 0,
    mimeType: "image/png",
    providerId: req.providerId,
    modelId: req.modelId,
  };
}

// ─── Google (Imagen 3) ─────────────────────────────────────────

async function generateGoogle(req: ResolvedRequest): Promise<ImageGenResult> {
  // Google AI Studio / Generative Language API for Imagen 3
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${req.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: req.prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: aspectRatioFromSize(req.size),
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Google Imagen failed: ${(err as Record<string, Record<string, string>>).error?.message ?? res.statusText}`
    );
  }

  const json = await res.json();
  const prediction = (json as { predictions: Array<{ bytesBase64Encoded: string; mimeType?: string }> }).predictions[0];

  return {
    url: "",
    base64: prediction.bytesBase64Encoded,
    mimeType: prediction.mimeType ?? "image/png",
    width: 0,
    height: 0,
    providerId: req.providerId,
    modelId: req.modelId,
  };
}

function aspectRatioFromSize(size: ImageSize): string {
  if (size === "1024x1792" || size === "512x512") return "9:16";
  if (size === "1792x1024") return "16:9";
  return "1:1";
}

// ─── DeepAI ────────────────────────────────────────────────────

async function generateDeepAI(req: ResolvedRequest): Promise<ImageGenResult> {
  const formData = new FormData();
  formData.append("text", req.prompt);

  const res = await fetch("https://api.deepai.org/api/text2img", {
    method: "POST",
    headers: { "api-key": req.apiKey },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`DeepAI image generation failed: ${res.statusText}`);
  }

  const json = (await res.json()) as { output_url: string };

  return {
    url: json.output_url,
    mimeType: "image/png",
    width: 0,
    height: 0,
    providerId: req.providerId,
    modelId: req.modelId,
  };
}

// ─── fal.ai (FLUX models) ─────────────────────────────────────

async function generateFal(req: ResolvedRequest): Promise<ImageGenResult> {
  const endpointMap: Record<string, string> = {
    "fal-flux-dev": "fal-ai/flux/dev",
    "fal-flux-schnell": "fal-ai/flux/schnell",
  };
  const endpoint = endpointMap[req.modelId] ?? "fal-ai/flux/dev";
  const { width, height } = parseDimensions(req.size);

  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: req.prompt,
      image_size: { width, height },
      num_images: 1,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `fal.ai image generation failed: ${(err as Record<string, string>).detail ?? res.statusText}`
    );
  }

  const json = (await res.json()) as {
    images: Array<{ url: string; width: number; height: number; content_type?: string }>;
  };
  const image = json.images[0];

  return {
    url: image.url,
    mimeType: image.content_type ?? "image/png",
    width: image.width ?? width,
    height: image.height ?? height,
    providerId: req.providerId,
    modelId: req.modelId,
  };
}

// ─── Together AI ───────────────────────────────────────────────

async function generateTogether(
  req: ResolvedRequest
): Promise<ImageGenResult> {
  const modelMap: Record<string, string> = {
    "together-flux-schnell":
      "black-forest-labs/FLUX.1-schnell-Free",
    "together-sdxl": "stabilityai/stable-diffusion-xl-base-1.0",
  };
  const model = modelMap[req.modelId] ?? "black-forest-labs/FLUX.1-schnell-Free";
  const { width, height } = parseDimensions(req.size);

  const res = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: req.prompt,
      width,
      height,
      n: 1,
      steps: 20,
      response_format: "url",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Together AI image generation failed: ${(err as Record<string, Record<string, string>>).error?.message ?? res.statusText}`
    );
  }

  const json = (await res.json()) as {
    data: Array<{ url: string; revised_prompt?: string }>;
  };
  const item = json.data[0];

  return {
    url: item.url,
    revisedPrompt: item.revised_prompt,
    mimeType: "image/png",
    width,
    height,
    providerId: req.providerId,
    modelId: req.modelId,
  };
}

// ─── Fireworks AI ──────────────────────────────────────────────

async function generateFireworks(
  req: ResolvedRequest
): Promise<ImageGenResult> {
  const { width, height } = parseDimensions(req.size);

  const res = await fetch(
    "https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: req.prompt,
        width,
        height,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(
      `Fireworks AI image generation failed: ${res.statusText}`
    );
  }

  // Fireworks returns raw image bytes
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  return {
    url: "",
    base64,
    mimeType: "image/png",
    width,
    height,
    providerId: req.providerId,
    modelId: req.modelId,
  };
}

// ─── RunwayML (Gen-3 Alpha) ───────────────────────────────────

async function generateRunway(req: ResolvedRequest): Promise<ImageGenResult> {
  // RunwayML Gen-3 is primarily video generation.
  // Image generation uses their /v1/text_to_image endpoint.
  const res = await fetch("https://api.dev.runwayml.com/v1/text_to_image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      prompt: req.prompt,
      model: "gen3a_turbo",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `RunwayML image generation failed: ${(err as Record<string, string>).error ?? res.statusText}`
    );
  }

  const json = (await res.json()) as { id: string; output?: string[] };

  // RunwayML returns a task ID — poll for completion
  const imageUrl = await pollRunwayTask(json.id, req.apiKey);

  return {
    url: imageUrl,
    mimeType: "image/png",
    width: 0,
    height: 0,
    providerId: req.providerId,
    modelId: req.modelId,
  };
}

async function pollRunwayTask(
  taskId: string,
  apiKey: string,
  maxAttempts = 30
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const res = await fetch(
      `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Runway-Version": "2024-11-06",
        },
      }
    );

    if (!res.ok) continue;

    const task = (await res.json()) as {
      status: string;
      output?: string[];
      failure?: string;
    };

    if (task.status === "SUCCEEDED" && task.output?.[0]) {
      return task.output[0];
    }
    if (task.status === "FAILED") {
      throw new Error(`RunwayML task failed: ${task.failure ?? "Unknown error"}`);
    }
  }
  throw new Error("RunwayML task timed out after 60 seconds");
}

// ─── Artbreeder ────────────────────────────────────────────────

async function generateArtbreeder(
  req: ResolvedRequest
): Promise<ImageGenResult> {
  // Artbreeder's public API is limited. This uses their compose endpoint.
  const res = await fetch("https://www.artbreeder.com/api/compose", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: req.prompt,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Artbreeder image generation failed: ${res.statusText}`
    );
  }

  const json = (await res.json()) as { image_url: string };

  return {
    url: json.image_url,
    mimeType: "image/png",
    width: 512,
    height: 512,
    providerId: req.providerId,
    modelId: req.modelId,
  };
}
