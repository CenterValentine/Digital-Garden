/**
 * File Upload - Phase 2: Finalize
 *
 * POST /api/content/content/upload/finalize
 *
 * Transitions FilePayload from uploadStatus="uploading" to "ready" or "failed"
 * Verifies file was uploaded to storage, extracts metadata (thumbnails, dimensions).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type { FinalizeUploadRequest } from "@/lib/domain/content/api-types";
import type { Prisma } from "@/lib/database/generated/prisma";
import type { ProcessingResult } from "@/lib/infrastructure/media/types";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/content/upload/finalize";

// ============================================================
// POST /api/content/content/upload/finalize
// ============================================================

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = (await request.json()) as FinalizeUploadRequest;

      const { contentId, uploadSuccess, uploadError, fileMetadata } = body;

      if (!contentId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "contentId is required",
            },
          },
          { status: 400 }
        );
      }

      const content = await prisma.contentNode.findUnique({
        where: { id: contentId },
        include: { filePayload: true },
      });

      if (!content || !content.filePayload) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Content or file payload not found",
            },
          },
          { status: 404 }
        );
      }

      if (content.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          },
          { status: 403 }
        );
      }

      if (content.filePayload.uploadStatus !== "uploading") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `Upload already finalized (status: ${content.filePayload.uploadStatus})`,
            },
          },
          { status: 400 }
        );
      }

      // Handle upload failure
      if (uploadSuccess === false || uploadError) {
        await prisma.filePayload.update({
          where: { contentId },
          data: {
            uploadStatus: "failed",
            uploadError: uploadError || "Upload failed",
          },
        });

        return NextResponse.json({
          success: true,
          data: {
            contentId,
            uploadStatus: "failed",
            message: "Upload marked as failed",
          },
        });
      }

      const storageUrl = await withSpan(
        { layer: "storage", name: "verify" },
        { attrs: { provider: content.filePayload.storageProvider } },
        async () =>
          verifyFileInStorage(
            content.filePayload!.storageProvider,
            content.filePayload!.storageKey
          ),
      );

      if (!storageUrl) {
        await prisma.filePayload.update({
          where: { contentId },
          data: {
            uploadStatus: "failed",
            uploadError: "File not found in storage",
          },
        });

        return NextResponse.json(
          {
            success: false,
            error: {
              code: "UPLOAD_FAILED",
              message: "File not found in storage",
            },
          },
          { status: 500 }
        );
      }

      const processingResult = await withSpan(
        { layer: "content", name: "media_process" },
        { attrs: { mime: content.filePayload.mimeType } },
        async (span) => {
          const result = await processUploadedMedia(
            content.filePayload!.storageKey,
            content.filePayload!.mimeType
          );
          span.attr("processed", Boolean(result));
          return result;
        },
      );

      const searchText = await withSpan(
        { layer: "content", name: "extract_text" },
        { attrs: { mime: content.filePayload.mimeType } },
        async (span) => {
          const text = await extractDocumentText(
            content.filePayload!.storageKey,
            content.filePayload!.mimeType
          );
          span.attr("text_chars", text.length);
          return text;
        },
      );

      // Prepare metadata for database update
      type MetadataView = {
        width?: number;
        height?: number;
        duration?: number;
        thumbnail?: string;
        thumbnails?: { small?: string };
      };
      const metadata: MetadataView = (processingResult?.metadata as MetadataView | undefined) || {};
      const thumbnailUrl = processingResult
        ? (metadata.thumbnails?.small || metadata.thumbnail || null)
        : null;

      const updated = await prisma.filePayload.update({
        where: { contentId },
        data: {
          uploadStatus: "ready",
          uploadedAt: new Date(),
          storageUrl,
          thumbnailUrl,
          searchText,
          width: metadata.width || null,
          height: metadata.height || null,
          duration: metadata.duration || null,
          isProcessed: processingResult !== null,
          processingStatus: processingResult ? "complete" : "none",
          storageMetadata: processingResult ? (metadata as unknown as Prisma.InputJsonValue) : {},
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          contentId,
          uploadStatus: "ready",
          storageUrl: updated.storageUrl,
          thumbnailUrl: updated.thumbnailUrl,
          width: updated.width,
          height: updated.height,
          duration: updated.duration,
          message: "Upload finalized successfully",
        },
      });
    } catch (error) {
      logger.error({
        layer: "storage",
        event: "upload_finalize:caught",
        summary: "finalize failed — 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to finalize upload",
          },
        },
        { status: 500 }
      );
    }
  });
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Verify file exists in storage and get download URL.
 *
 * Called from within withRouteTrace so trace context flows via ALS.
 */
async function verifyFileInStorage(
  provider: string,
  storageKey: string
): Promise<string | null> {
  try {
    const { getDefaultStorageProvider } = await import('@/lib/infrastructure/storage');
    const storageProvider = getDefaultStorageProvider();

    const verification = await storageProvider.verifyFileExists(storageKey);

    if (!verification.exists) {
      return null;
    }

    const downloadUrl = await storageProvider.generateDownloadUrl(storageKey, 3600);
    return downloadUrl;
  } catch (error) {
    logger.warn({
      layer: "storage",
      event: "verify:caught",
      summary: "verify failed (continuing)",
      error,
    });
    return null;
  }
}

/**
 * Process uploaded media file (images, videos, PDFs)
 */
async function processUploadedMedia(
  storageKey: string,
  mimeType: string
): Promise<ProcessingResult | null> {
  try {
    const { createMediaProcessor } = await import('@/lib/infrastructure/media');
    const mediaProcessor = await createMediaProcessor();

    return await mediaProcessor.processMedia(storageKey, mimeType, {
      generateThumbnails: true,
    });
  } catch (error) {
    logger.warn({
      layer: "content",
      event: "media_process:caught",
      summary: "media processing failed (continuing)",
      error,
    });
    return null;
  }
}

/**
 * Extract searchable text from document files
 */
async function extractDocumentText(
  storageKey: string,
  mimeType: string
): Promise<string> {
  try {
    const { createDocumentExtractor } = await import('@/lib/infrastructure/media/document-extractor');
    const documentExtractor = await createDocumentExtractor();

    return await documentExtractor.extractText(storageKey, mimeType);
  } catch (error) {
    logger.warn({
      layer: "content",
      event: "extract_text:caught",
      summary: "text extraction failed (continuing)",
      error,
    });
    return '';
  }
}
