/**
 * AI Image Generation API Route — Sprint 42
 *
 * POST /api/ai/image
 *
 * Generates an image via the specified provider, downloads/decodes it,
 * uploads to the user's storage provider, and creates a FilePayload
 * ContentNode. Returns the storage URL and contentId for embedding.
 *
 * Flow: requireAuth → validate → generateImage → download/decode →
 *       upload to storage → create ContentNode → return URL + contentId
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { generateImage } from "@/lib/domain/ai/image/generate";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { generateUniqueSlug } from "@/lib/domain/content";
import {
  getConnectionWithKey,
  listConnections,
} from "@/lib/features/ai-connections";
import { prisma } from "@/lib/database/client";
import crypto from "crypto";
import type { ImageProviderId, ImageModelId, ImageSize } from "@/lib/domain/ai/image/types";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/image";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = await request.json();

      // ─── Validate Request ────────────────────────────────────
      const prompt: string = body.prompt;
      const providerId: ImageProviderId = body.providerId;
      const modelId: ImageModelId = body.modelId;
      const size: ImageSize | undefined = body.size;
      const quality = body.quality as "standard" | "hd" | undefined;
      const style = body.style as "natural" | "vivid" | undefined;
      const parentId: string | undefined = body.parentId;
      // `role` controls visibility in the file tree.
      //   "referenced" (default) — hidden behind the show-referenced
      //     toggle. Right for chat-tool-generated images that are
      //     auxiliary to a conversation.
      //   "primary" — first-class user-created surface. Right for the
      //     standalone "+ AI → Image Generation" flow.
      const role: "primary" | "referenced" =
        body.role === "primary" ? "primary" : "referenced";

      if (!prompt || !providerId || !modelId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "prompt, providerId, and modelId are required",
            },
          },
          { status: 400 }
        );
      }

      // ─── Resolve BYOK key via Connection ─────────────────────
      // Match the requested image-gen provider against the user's
      // Connections by presetId. First direct match wins. If no
      // Connection covers this provider, generateImage falls through to
      // the env-var fallback.
      const apiKey = await resolveImageProviderKey(
        session.user.id,
        providerId,
      );

      // ─── Generate Image ──────────────────────────────────────
      // Prompt is NOT logged in attrs — user-authored, may contain PII or
      // creative content they don't want telemetered. Only metadata about
      // the request appears in spans.
      const result = await withSpan(
        { layer: "ai", name: "generate_image" },
        { attrs: { provider: providerId, model: modelId, byok: apiKey ? "connection" : "env" } },
        async (span) => {
          const generated = await generateImage(
            { prompt, providerId, modelId, size, quality, style, apiKey },
            session.user.id
          );
          span
            .attr("mime", generated.mimeType)
            .attr("width", generated.width ?? 0)
            .attr("height", generated.height ?? 0)
            .summary(`${generated.mimeType} ${generated.width ?? "?"}x${generated.height ?? "?"}`);
          await spanPayload(span, "image_metadata", {
            providerId: generated.providerId,
            modelId: generated.modelId,
            mimeType: generated.mimeType,
            width: generated.width,
            height: generated.height,
            revisedPrompt: generated.revisedPrompt,
            // base64/url omitted — too large for sidecar; the file itself is in storage
          });
          return generated;
        },
      );

      // ─── Get Image Data ──────────────────────────────────────
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

      // ─── Upload to Storage ───────────────────────────────────
      const checksum = crypto.createHash("sha256").update(imageBuffer).digest("hex");
      const fileExtension = result.mimeType === "image/jpeg" ? "jpg" : "png";
      const timestamp = Date.now();
      const storageKey = `uploads/${session.user.id}/ai-gen-${timestamp}-${crypto.randomBytes(8).toString("hex")}.${fileExtension}`;

      await withSpan(
        { layer: "storage", name: "upload" },
        { attrs: { bytes: imageBuffer.length, mime: result.mimeType } },
        async (span) => {
          const storageProvider = await getUserStorageProvider(session.user.id);
          await storageProvider.uploadFile(storageKey, imageBuffer, result.mimeType);
          span.summary(`${imageBuffer.length} bytes uploaded`);
        },
      );

      // ─── Create ContentNode + FilePayload ────────────────────
      // Generate a descriptive filename from the prompt
      const truncatedPrompt = prompt.slice(0, 60).replace(/[^a-zA-Z0-9\s-]/g, "").trim();
      const fileName = `${truncatedPrompt}.${fileExtension}`;
      const slug = await generateUniqueSlug(fileName, session.user.id);

      const content = await withSpan(
        { layer: "content", name: "create" },
        { attrs: { kind: "file" } },
        async (span) => {
          const node = await prisma.contentNode.create({
            data: {
              ownerId: session.user.id,
              title: fileName,
              slug,
              contentType: "file",
              parentId: parentId || null,
              role,
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
                  searchText: `AI generated image: ${prompt}`,
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
          span.attr("content_id", node.id).summary(node.id);
          return node;
        },
      );

      // ─── Generate a public URL for the image ─────────────────
      const storageProvider = await getUserStorageProvider(session.user.id);
      const publicUrl = await storageProvider.generateDownloadUrl(storageKey);

      return NextResponse.json(
        {
          success: true,
          data: {
            contentId: content.id,
            url: publicUrl,
            fileName,
            prompt,
            revisedPrompt: result.revisedPrompt,
            providerId: result.providerId,
            modelId: result.modelId,
            width: result.width,
            height: result.height,
            fileSize: imageBuffer.length,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      // Check for known error types
      if (
        error instanceof Error &&
        error.message === "Authentication required"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Authentication required" },
          },
          { status: 401 }
        );
      }

      logger.error({
        layer: "ai",
        event: "generate_image:caught",
        summary: "image generation failed — 500",
        error,
      });

      const message =
        error instanceof Error ? error.message : "Image generation failed";

      return NextResponse.json(
        {
          success: false,
          error: { code: "IMAGE_GEN_ERROR", message },
        },
        { status: 500 }
      );
    }
  });
}

/**
 * Resolve a BYOK key for an image-gen provider from the user's
 * Connections. We match by `presetId` only (image generation has no
 * gateway routing concept like chat does) and skip Connections without
 * a usable preset. Returns `undefined` so callers fall through to the
 * env-var resolver in `generateImage`.
 */
async function resolveImageProviderKey(
  userId: string,
  providerId: ImageProviderId,
): Promise<string | undefined> {
  try {
    const all = await listConnections(userId);
    const match = all.find((c) => c.presetId === providerId);
    if (!match) return undefined;
    const withKey = await getConnectionWithKey(userId, match.id);
    return withKey.apiKey;
  } catch (err) {
    logger.warn({
      layer: "ai",
      event: "image.byok_lookup_failed",
      summary: "image BYOK lookup failed; falling back to env",
      error: err,
      attrs: { provider: providerId },
    });
    return undefined;
  }
}
