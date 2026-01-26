/**
 * File Upload - Phase 2: Finalize
 *
 * POST /api/content/content/upload/finalize
 *
 * Transitions FilePayload from uploadStatus="uploading" to "ready" or "failed"
 * Verifies file was uploaded to storage, extracts metadata (thumbnails, dimensions).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import type { FinalizeUploadRequest } from "@/lib/content/api-types";

// ============================================================
// POST /api/content/content/upload/finalize
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
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

    // Fetch content with file payload
    const content = await prisma.contentNode.findUnique({
      where: { id: contentId },
      include: {
        filePayload: true,
      },
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

    // Check ownership
    if (content.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied",
          },
        },
        { status: 403 }
      );
    }

    // Check current upload status
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

    // Verify file exists in storage
    const storageUrl = await verifyFileInStorage(
      content.filePayload.storageProvider,
      content.filePayload.storageKey
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

    // Process media file (images, videos, PDFs)
    const processingResult = await processUploadedMedia(
      content.filePayload.storageKey,
      content.filePayload.mimeType
    );

    // Extract searchable text from documents
    const searchText = await extractDocumentText(
      content.filePayload.storageKey,
      content.filePayload.mimeType
    );

    // Prepare metadata for database update
    const metadata: any = processingResult?.metadata || {};
    const thumbnailUrl = processingResult
      ? (metadata.thumbnails?.small || metadata.thumbnail || null)
      : null;

    // Update file payload to "ready"
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
        storageMetadata: processingResult ? (metadata as any) : {},
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
    console.error("POST /api/content/content/upload/finalize error:", error);
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
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Verify file exists in storage and get download URL
 *
 * Uses real storage SDK integration
 */
async function verifyFileInStorage(
  provider: string,
  storageKey: string
): Promise<string | null> {
  try {
    // Import storage factory
    const { getDefaultStorageProvider } = await import('@/lib/storage');
    const storageProvider = getDefaultStorageProvider();

    // Verify file exists
    const verification = await storageProvider.verifyFileExists(storageKey);

    if (!verification.exists) {
      return null;
    }

    // Generate download URL (presigned, expires in 1 hour)
    const downloadUrl = await storageProvider.generateDownloadUrl(storageKey, 3600);
    return downloadUrl;
  } catch (error) {
    console.error('Failed to verify file in storage:', error);
    return null;
  }
}

/**
 * Process uploaded media file (images, videos, PDFs)
 *
 * Uses Sharp for images, FFmpeg for videos, PDF.js for PDFs
 */
async function processUploadedMedia(
  storageKey: string,
  mimeType: string
): Promise<{
  metadata: any;
  thumbnailKeys: string[];
} | null> {
  try {
    const { createMediaProcessor } = await import('@/lib/media');
    const mediaProcessor = await createMediaProcessor();

    // Process media (returns null for non-media files like documents)
    const result = await mediaProcessor.processMedia(storageKey, mimeType, {
      generateThumbnails: true,
    });

    return result;
  } catch (error) {
    console.error('Media processing failed:', error);
    // Don't fail the upload if processing fails
    // Just log the error and continue without metadata
    return null;
  }
}

/**
 * Extract searchable text from document files
 *
 * Supports: .txt, .md, .json, .pdf
 */
async function extractDocumentText(
  storageKey: string,
  mimeType: string
): Promise<string> {
  try {
    const { createDocumentExtractor } = await import('@/lib/media/document-extractor');
    const documentExtractor = await createDocumentExtractor();

    // Extract text (returns empty string for non-document files)
    const text = await documentExtractor.extractText(storageKey, mimeType);

    return text;
  } catch (error) {
    console.error('Text extraction failed:', error);
    // Don't fail the upload if extraction fails
    // Just log the error and continue without searchable text
    return '';
  }
}
