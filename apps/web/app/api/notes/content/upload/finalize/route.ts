/**
 * File Upload - Phase 2: Finalize
 *
 * POST /api/notes/content/upload/finalize
 *
 * Transitions FilePayload from uploadStatus="uploading" to "ready" or "failed"
 * Verifies file was uploaded to storage, extracts metadata (thumbnails, dimensions).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";

// ============================================================
// POST /api/notes/content/upload/finalize
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();

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

    // Extract metadata (dimensions, duration, thumbnail)
    const metadata = await extractFileMetadata(
      content.filePayload.mimeType,
      content.filePayload.storageKey,
      storageUrl
    );

    // Update file payload to "ready"
    const updated = await prisma.filePayload.update({
      where: { contentId },
      data: {
        uploadStatus: "ready",
        uploadedAt: new Date(),
        storageUrl,
        thumbnailUrl: metadata.thumbnailUrl || null,
        width: metadata.width || null,
        height: metadata.height || null,
        duration: metadata.duration || null,
        isProcessed: true,
        processingStatus: "complete",
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
    console.error("POST /api/notes/content/upload/finalize error:", error);
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
 * Verify file exists in storage and get public URL
 *
 * Note: Placeholder implementation. Production requires actual SDK.
 */
async function verifyFileInStorage(
  provider: string,
  storageKey: string
): Promise<string | null> {
  // Placeholder: In production, use actual storage SDK to check file exists
  if (provider === "r2") {
    // Check Cloudflare R2
    // Example: Use @aws-sdk/client-s3 HeadObject
    return `https://cdn.example.com/${storageKey}`;
  } else if (provider === "s3") {
    // Check AWS S3
    return `https://s3.amazonaws.com/${storageKey}`;
  } else if (provider === "vercel") {
    // Check Vercel Blob
    return `https://blob.vercel.com/${storageKey}`;
  }

  return null;
}

/**
 * Extract file metadata (dimensions, duration, thumbnail)
 *
 * Note: Placeholder implementation. Production requires image/video processing.
 */
async function extractFileMetadata(
  mimeType: string,
  storageKey: string,
  storageUrl: string
): Promise<{
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}> {
  const metadata: any = {};

  // Image metadata extraction
  if (mimeType.startsWith("image/")) {
    // Placeholder: Use sharp or similar to extract dimensions
    // Example:
    // const buffer = await fetchFileFromStorage(storageUrl);
    // const image = sharp(buffer);
    // const { width, height } = await image.metadata();
    // metadata.width = width;
    // metadata.height = height;
    // metadata.thumbnailUrl = await generateThumbnail(buffer, storageKey);
  }

  // Video metadata extraction
  if (mimeType.startsWith("video/")) {
    // Placeholder: Use ffmpeg or similar to extract duration, dimensions
    // Example:
    // const videoInfo = await extractVideoMetadata(storageUrl);
    // metadata.width = videoInfo.width;
    // metadata.height = videoInfo.height;
    // metadata.duration = videoInfo.duration;
    // metadata.thumbnailUrl = await generateVideoThumbnail(storageUrl, storageKey);
  }

  // Audio metadata extraction
  if (mimeType.startsWith("audio/")) {
    // Placeholder: Extract audio duration
    // metadata.duration = await extractAudioDuration(storageUrl);
  }

  return metadata;
}

