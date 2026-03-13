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
import { prisma } from "@/lib/database/client";
import crypto from "crypto";
import type { ImageProviderId, ImageModelId, ImageSize } from "@/lib/domain/ai/image/types";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();

    // ─── Validate Request ────────────────────────────────────
    const prompt: string = body.prompt;
    const providerId: ImageProviderId = body.providerId;
    const modelId: ImageModelId = body.modelId;
    const size: ImageSize | undefined = body.size;
    const quality = body.quality as "standard" | "hd" | undefined;
    const style = body.style as "natural" | "vivid" | undefined;
    const parentId: string | undefined = body.parentId;

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

    // ─── Generate Image ──────────────────────────────────────
    const result = await generateImage(
      { prompt, providerId, modelId, size, quality, style },
      session.user.id
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

    const storageProvider = await getUserStorageProvider(session.user.id);
    await storageProvider.uploadFile(storageKey, imageBuffer, result.mimeType);

    // ─── Create ContentNode + FilePayload ────────────────────
    // Generate a descriptive filename from the prompt
    const truncatedPrompt = prompt.slice(0, 60).replace(/[^a-zA-Z0-9\s-]/g, "").trim();
    const fileName = `${truncatedPrompt}.${fileExtension}`;
    const slug = await generateUniqueSlug(fileName, session.user.id);

    const content = await prisma.contentNode.create({
      data: {
        ownerId: session.user.id,
        title: fileName,
        slug,
        contentType: "file",
        parentId: parentId || null,
        role: "referenced",
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

    // ─── Generate a public URL for the image ─────────────────
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
    console.error("[AI Image] ERROR:", error);

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
}
