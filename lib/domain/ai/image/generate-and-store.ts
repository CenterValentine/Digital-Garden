/**
 * generateAndStoreImage — generate an image with the configured provider, then
 * persist it as a ContentNode + FilePayload in the user's storage and return a
 * download URL. Extracted from the chat `generate_image` tool so other callers
 * (e.g. identification-image flashcards) share the exact generate→store→persist
 * path instead of duplicating it.
 */

import { prisma } from "@/lib/database/client";
import { generateUniqueSlug } from "@/lib/domain/content";
import { generateImage } from "./generate";
import { generateImageViaGateway } from "./generate-via-gateway";
import type { ImageProviderId, ImageModelId, ImageSize } from "./types";
import { getUserSettings } from "@/lib/features/settings";
import {
  listConnections,
  getConnectionWithKey,
} from "@/lib/features/ai-connections";
import {
  resolveGeneratedMediaPlacement,
  findRecentGeneratedMedia,
} from "@/lib/domain/ai/generated-media";

/**
 * Resolve the effective image-gen route for a user: honor a `generate_image`
 * tool route override (a saved Connection) if configured, else fall back to the
 * requested provider/model. Best-effort — never throws on settings read errors.
 */
export async function resolveImageGenRoute(
  userId: string,
  aiArgs: { providerId: ImageProviderId; modelId: ImageModelId },
): Promise<{
  providerId: ImageProviderId;
  modelId: ImageModelId;
  apiKey?: string;
}> {
  try {
    const settings = await getUserSettings(userId);
    const override = (
      settings.ai as
        | {
            toolConfig?: Record<
              string,
              { routeOverride?: { presetId: string; modelId: string } }
            >;
          }
        | undefined
    )?.toolConfig?.generate_image?.routeOverride;
    if (!override) return aiArgs;

    const conns = await listConnections(userId);
    const match = conns.find((c) => c.presetId === override.presetId);
    if (!match) return aiArgs;
    const withKey = await getConnectionWithKey(userId, match.id);

    return {
      providerId: override.presetId as ImageProviderId,
      modelId: override.modelId as ImageModelId,
      apiKey: withKey.apiKey,
    };
  } catch {
    return aiArgs;
  }
}

export interface GenerateAndStoreImageInput {
  prompt: string;
  userId: string;
  providerId?: ImageProviderId;
  modelId?: ImageModelId;
  size?: ImageSize;
  quality?: "standard" | "hd";
  style?: "natural" | "vivid";
  /**
   * Explicit API key for a per-request provider choice. When provided (with
   * providerId/modelId), it is used directly and the saved generate_image route
   * override is BYPASSED — so a user's per-batch provider pick wins over their
   * persisted default. Omit to use resolveImageGenRoute (saved default / env).
   */
  apiKey?: string;
  /**
   * Route through the Vercel AI Gateway image path instead of a direct
   * provider. Set when the chosen connection is a gateway — `modelId` is then
   * the namespaced gateway id (e.g. "openai/gpt-image-1") and any image-capable
   * gateway model works, not just the direct-provider catalog. Requires apiKey.
   */
  gateway?: boolean;
  /**
   * ContentNode the media is generated FROM (e.g. the note a chat is attached
   * to). When set, the stored image co-locates under the source's parent and is
   * marked `ownedByNoteId`, so it's discoverable beside its source and the
   * lifecycle can follow it. Omit (or null) → stored at the root, unowned.
   */
  sourceContentId?: string | null;
}

export interface GeneratedStoredImage {
  /** ContentNode id of the persisted image file. */
  contentId: string;
  /** Download URL for rendering. */
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  revisedPrompt: string | null;
  providerId: string;
  modelId: string;
  fileName: string;
}

export async function generateAndStoreImage(
  input: GenerateAndStoreImageInput,
): Promise<GeneratedStoredImage> {
  const {
    prompt,
    userId,
    providerId = "openai",
    modelId = "dall-e-3",
    size = "1024x1024",
    quality,
    style,
    apiKey,
    gateway,
    sourceContentId,
  } = input;

  // Resolve placement (co-locate under the source) up front so it also keys
  // the idempotency lookup.
  const { parentId, ownedByNoteId } = await resolveGeneratedMediaPlacement(
    userId,
    sourceContentId,
  );
  const searchText = `AI generated image: ${prompt}`;

  // Idempotency: reuse a recent identical generation instead of producing a
  // duplicate (e.g. a client effect that double-fired on a StrictMode remount).
  const existing = await findRecentGeneratedMedia(userId, {
    searchText,
    ownedByNoteId,
  });
  if (existing) {
    const { getUserStorageProvider } = await import(
      "@/lib/infrastructure/storage"
    );
    const sp = await getUserStorageProvider(userId);
    const dupExt = existing.mimeType === "image/jpeg" ? "jpg" : "png";
    const dupFileName = `${
      prompt.slice(0, 60).replace(/[^a-zA-Z0-9\s-]/g, "").trim() || "ai-image"
    }.${dupExt}`;
    return {
      contentId: existing.contentId,
      url: await sp.generateDownloadUrl(existing.storageKey),
      mimeType: existing.mimeType,
      width: existing.width,
      height: existing.height,
      revisedPrompt: null,
      providerId,
      modelId,
      fileName: dupFileName,
    };
  }

  // Explicit key (per-request provider choice) bypasses the saved override;
  // otherwise resolve the user's configured route (override → env fallback).
  const resolved = apiKey
    ? { providerId, modelId, apiKey }
    : await resolveImageGenRoute(userId, { providerId, modelId });

  // Gateway route: any image-capable gateway model (namespaced modelId) goes
  // through the AI Gateway image path. providerId/canonicalModelId are
  // best-effort result metadata derived from the namespace.
  const result =
    gateway && resolved.apiKey
      ? await generateImageViaGateway({
          prompt,
          modelId: resolved.modelId,
          apiKey: resolved.apiKey,
          size: size as ImageSize,
          providerId: (resolved.modelId.split("/")[0] ||
            "openai") as ImageProviderId,
          canonicalModelId: resolved.modelId as ImageModelId,
        })
      : await generateImage(
          {
            prompt,
            providerId: resolved.providerId,
            modelId: resolved.modelId,
            size: size as ImageSize,
            quality,
            style,
            apiKey: resolved.apiKey,
          },
          userId,
        );

  // Decode/download the bytes.
  let imageBuffer: Buffer;
  if (result.base64) {
    imageBuffer = Buffer.from(result.base64, "base64");
  } else if (result.url) {
    const imageRes = await fetch(result.url);
    if (!imageRes.ok) {
      throw new Error(`Failed to download generated image: ${imageRes.statusText}`);
    }
    imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  } else {
    throw new Error("Image generation returned neither URL nor base64 data");
  }

  // Upload to the user's storage.
  const { getUserStorageProvider } = await import("@/lib/infrastructure/storage");
  const storageProvider = await getUserStorageProvider(userId);
  const crypto = await import("crypto");
  const checksum = crypto.createHash("sha256").update(imageBuffer).digest("hex");
  const fileExtension = result.mimeType === "image/jpeg" ? "jpg" : "png";
  const timestamp = Date.now();
  const storageKey = `uploads/${userId}/ai-gen-${timestamp}-${crypto.randomBytes(8).toString("hex")}.${fileExtension}`;

  await storageProvider.uploadFile(storageKey, imageBuffer, result.mimeType);

  // Persist as ContentNode + FilePayload.
  const truncatedPrompt = prompt.slice(0, 60).replace(/[^a-zA-Z0-9\s-]/g, "").trim();
  const fileName = `${truncatedPrompt || "ai-image"}.${fileExtension}`;
  const slug = await generateUniqueSlug(fileName, userId);

  const content = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title: fileName,
      slug,
      contentType: "file",
      parentId,
      role: "referenced",
      ownedByNoteId,
      displayOrder: 0,
      filePayload: {
        create: {
          fileName,
          fileExtension,
          mimeType: result.mimeType,
          fileSize: BigInt(imageBuffer.length),
          checksum,
          storageProvider: "r2",
          storageKey,
          searchText,
          uploadStatus: "ready",
          uploadedAt: new Date(),
          isProcessed: true,
          processingStatus: "complete",
          width: result.width || null,
          height: result.height || null,
        },
      },
    },
  });

  const url = await storageProvider.generateDownloadUrl(storageKey);

  return {
    contentId: content.id,
    url,
    mimeType: result.mimeType,
    width: result.width ?? null,
    height: result.height ?? null,
    revisedPrompt: result.revisedPrompt ?? null,
    providerId: result.providerId,
    modelId: result.modelId,
    fileName,
  };
}
