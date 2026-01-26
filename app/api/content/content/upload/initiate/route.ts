/**
 * File Upload - Phase 1: Initiate
 *
 * POST /api/content/content/upload/initiate
 *
 * Creates ContentNode + FilePayload with uploadStatus="uploading"
 * Returns presigned URL for direct client → storage upload.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import { generateUniqueSlug } from "@/lib/content";
import type { InitiateUploadRequest } from "@/lib/content/api-types";
import crypto from "crypto";

// ============================================================
// POST /api/content/content/upload/initiate
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as InitiateUploadRequest;

    const {
      fileName,
      fileSize,
      mimeType,
      checksum,
      parentId,
      title,
      customIcon,
      iconColor,
    } = body;

    // Validation
    if (!fileName || !fileSize || !mimeType) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "fileName, fileSize, and mimeType are required",
          },
        },
        { status: 400 }
      );
    }

    if (fileSize > 100 * 1024 * 1024) {
      // 100 MB limit
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "File size exceeds 100 MB limit",
          },
        },
        { status: 400 }
      );
    }

    // Validate parent
    if (parentId) {
      const parent = await prisma.contentNode.findUnique({
        where: { id: parentId },
      });

      if (!parent || parent.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Parent not found",
            },
          },
          { status: 404 }
        );
      }
    }

    // Check for duplicate file (by checksum + size)
    if (checksum) {
      const duplicate = await prisma.filePayload.findFirst({
        where: {
          checksum,
          fileSize: BigInt(fileSize),
          content: {
            ownerId: session.user.id,
          },
          uploadStatus: "ready",
        },
        include: {
          content: true,
        },
      });

      if (duplicate) {
        return NextResponse.json({
          success: true,
          data: {
            isDuplicate: true,
            existingContentId: duplicate.contentId,
            message: "File already exists. Reference the existing file.",
          },
        });
      }
    }

    // Get user's default storage provider
    const storageConfig = await prisma.storageProviderConfig.findFirst({
      where: {
        userId: session.user.id,
        isDefault: true,
        isActive: true,
      },
    });

    if (!storageConfig) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "STORAGE_ERROR",
            message: "No storage provider configured",
          },
        },
        { status: 500 }
      );
    }

    // Generate storage key
    const fileExtension = fileName.split(".").pop() || "";
    const uniqueId = crypto.randomUUID();
    const storageKey = `uploads/${session.user.id}/${uniqueId}.${fileExtension}`;

    // Generate slug and title
    const contentTitle = title || fileName;
    const slug = await generateUniqueSlug(contentTitle, session.user.id);

    // Create ContentNode + FilePayload (uploadStatus="uploading")
    const content = await prisma.contentNode.create({
      data: {
        ownerId: session.user.id,
        title: contentTitle,
        slug,
        parentId: parentId || null,
        customIcon: customIcon || null,
        iconColor: iconColor || null,
        filePayload: {
          create: {
            fileName,
            fileExtension,
            mimeType,
            fileSize: BigInt(fileSize),
            checksum: checksum || "",
            storageProvider: storageConfig.provider,
            storageKey,
            uploadStatus: "uploading",
          },
        },
      },
      include: {
        filePayload: true,
      },
    });

    // Generate presigned URL for direct upload
    const presignedUrl = await generatePresignedUploadUrl(
      storageConfig.provider,
      storageConfig.config,
      storageKey,
      mimeType
    );

    return NextResponse.json({
      success: true,
      data: {
        contentId: content.id,
        uploadUrl: presignedUrl,
        storageKey,
        expiresIn: 3600, // 1 hour
        message:
          "Upload initiated. Upload file to the provided URL, then call /finalize.",
      },
    });
  } catch (error) {
    console.error("POST /api/content/content/upload/initiate error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to initiate upload",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================
// PRESIGNED URL GENERATION
// ============================================================

/**
 * Generate presigned upload URL for storage provider
 *
 * Uses real storage SDK integration (R2, S3, Vercel Blob)
 */
async function generatePresignedUploadUrl(
  provider: string,
  config: any,
  storageKey: string,
  mimeType: string
): Promise<string> {
  // Import storage factory
  const { getDefaultStorageProvider } = await import('@/lib/storage');

  // For now, use environment-based provider
  // Later: use config parameter for user-specific providers
  const storageProvider = getDefaultStorageProvider();

  // Generate presigned URL
  const presignedUrl = await storageProvider.generateUploadUrl(
    storageKey,
    mimeType,
    3600 // 1 hour expiration
  );

  return presignedUrl.url;
}
