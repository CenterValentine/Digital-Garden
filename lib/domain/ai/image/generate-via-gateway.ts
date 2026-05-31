/**
 * Vercel AI Gateway image generation.
 *
 * The gateway's image API isn't a 1:1 OpenAI clone — it has its own
 * curated model catalog (gpt-image-1 family, FLUX, Imagen-4, Recraft,
 * Seedream, grok-imagine) and its own request/response shape per
 * model. Raw fetch against /v1/images/generations works for some
 * models but breaks for others.
 *
 * AI SDK's `experimental_generateImage` with `@ai-sdk/gateway` knows
 * the catalog and normalizes the per-model response. Use it for any
 * gateway-routed image request.
 */

import "server-only";
import type {
  ImageGenResult,
  ImageProviderId,
  ImageModelId,
  ImageSize,
} from "./types";

interface GatewayImageGenInput {
  prompt: string;
  /** Namespaced gateway model id, e.g. "openai/gpt-image-1" */
  modelId: string;
  apiKey: string;
  size?: ImageSize;
  /** Canonical request providerId, used in the result for symmetry */
  providerId: ImageProviderId;
  /** Canonical request modelId, used in the result for symmetry */
  canonicalModelId: ImageModelId;
}

export async function generateImageViaGateway(
  input: GatewayImageGenInput,
): Promise<ImageGenResult> {
  // Dynamic imports keep the gateway SDK out of the bundle for any
  // caller that doesn't actually hit this path.
  const [{ createGatewayProvider }, { experimental_generateImage }] =
    await Promise.all([
      import("@ai-sdk/gateway"),
      import("ai"),
    ]);

  const provider = createGatewayProvider({ apiKey: input.apiKey });
  // imageModel accepts the gateway's GatewayImageModelId union — we
  // cast because we validate the id existence by storing it via the
  // catalog-augmented fetcher (`catalogImageModelsFor("vercel-gateway")`).
  // The cast keeps the call site honest about the boundary.
  const model = provider.imageModel(
    input.modelId as Parameters<typeof provider.imageModel>[0],
  );

  const sized = input.size ?? "1024x1024";
  const result = await experimental_generateImage({
    model,
    prompt: input.prompt,
    n: 1,
    size: sized,
  });

  // experimental_generateImage returns a GeneratedFile (or array). We
  // pick the first image and surface its base64. Width/height parsed
  // from the size string when the file doesn't carry them.
  const file = result.image ?? result.images?.[0];
  if (!file) {
    throw new Error("Vercel AI Gateway returned no image data.");
  }
  const [w, h] = sized.split("x").map(Number);

  return {
    base64: file.base64,
    url: "",
    width: w,
    height: h,
    mimeType: file.mediaType ?? "image/png",
    providerId: input.providerId,
    modelId: input.canonicalModelId,
  };
}
