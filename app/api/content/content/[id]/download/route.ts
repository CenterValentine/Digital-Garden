/**
 * File Download API
 *
 * GET /api/content/content/[id]/download - Generate download URL for uploaded files
 *
 * Returns a presigned download URL for files stored in cloud storage.
 * For security, validates ownership before generating URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";

type Params = Promise<{ id: string }>;

// ============================================================
// GET /api/content/content/[id]/download - Download File
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check if this is a direct stream request (for Google Docs Viewer)
    const { searchParams } = new URL(request.url);
    const stream = searchParams.get('stream') === 'true';
    const forceDownload = searchParams.get('download') === 'true';

    // Fetch content with file payload
    const content = await prisma.contentNode.findUnique({
      where: { id },
      include: {
        filePayload: true,
      },
    });

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "File not found",
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

    // Verify this is actually a file
    if (!content.filePayload) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_TYPE",
            message: "This content is not a file",
          },
        },
        { status: 400 }
      );
    }

    // Check upload status
    if (content.filePayload.uploadStatus !== "ready") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FILE_NOT_READY",
            message: `File is not ready for download (status: ${content.filePayload.uploadStatus})`,
          },
        },
        { status: 400 }
      );
    }

    // Get storage provider for this file
    // The storageProvider field is 'r2', 's3', or 'vercel'
    const providerType = content.filePayload.storageProvider as 'r2' | 's3' | 'vercel';
    const storageProvider = await getUserStorageProvider(
      session.user.id,
      providerType
    );

    // If stream=true or download=true, fetch and stream the file directly
    if (stream || forceDownload) {
      const downloadUrl = await storageProvider.generateDownloadUrl(
        content.filePayload.storageKey,
        3600 // 1 hour expiry
      );

      // Fetch file from storage
      const fileResponse = await fetch(downloadUrl);
      if (!fileResponse.ok) {
        throw new Error("Failed to fetch file from storage");
      }

      const fileBlob = await fileResponse.blob();

      // Determine Content-Disposition
      const disposition = forceDownload
        ? `attachment; filename="${content.filePayload.fileName}"`
        : `inline; filename="${content.filePayload.fileName}"`;

      // Stream file directly
      return new NextResponse(fileBlob, {
        headers: {
          'Content-Type': content.filePayload.mimeType,
          'Content-Disposition': disposition,
          'Content-Length': content.filePayload.fileSize.toString(),
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    // Default: Generate presigned download URL (expires in 1 hour)
    const downloadUrl = await storageProvider.generateDownloadUrl(
      content.filePayload.storageKey,
      3600 // 1 hour expiry
    );

    return NextResponse.json({
      success: true,
      data: {
        url: downloadUrl,
        fileName: content.filePayload.fileName,
        mimeType: content.filePayload.mimeType,
        fileSize: content.filePayload.fileSize.toString(),
        expiresIn: 3600,
      },
    });
  } catch (error) {
    console.error("GET /api/content/content/[id]/download error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate download URL",
        },
      },
      { status: 500 }
    );
  }
}
