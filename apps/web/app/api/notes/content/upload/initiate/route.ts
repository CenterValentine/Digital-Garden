/**
 * File Upload - Phase 1: Initiate
 *
 * POST /api/notes/content/upload/initiate
 *
 * Creates ContentNode + FilePayload with uploadStatus="uploading"
 * Returns presigned URL for direct client → storage upload.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import { generateUniqueSlug, calculateChecksumFromBuffer } from "@/lib/content";
import crypto from "crypto";

// ============================================================
// POST /api/notes/content/upload/initiate
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();

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
    console.error("POST /api/notes/content/upload/initiate error:", error);
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
 * Note: This is a placeholder implementation.
 * Production requires actual SDK integration.
 */
async function generatePresignedUploadUrl(
  provider: string,
  config: any,
  storageKey: string,
  mimeType: string
): Promise<string> {
  // Placeholder: In production, use actual storage SDK
  if (provider === "r2") {
    // Cloudflare R2 (S3-compatible)
    // Example: Use @aws-sdk/client-s3 with R2 endpoint
    return `https://upload.example.com/${storageKey}?presigned=true`;
  } else if (provider === "s3") {
    // AWS S3
    // Example: Use @aws-sdk/s3-request-presigner
    return `https://s3.amazonaws.com/${storageKey}?presigned=true`;
  } else if (provider === "vercel") {
    // Vercel Blob
    // Example: Use @vercel/blob
    return `https://blob.vercel.com/upload/${storageKey}`;
  }

  throw new Error(`Unsupported storage provider: ${provider}`);
}
