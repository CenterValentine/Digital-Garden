/**
 * File Upload - Phase 1: Initiate
 *
 * POST /api/content/content/upload/initiate
 *
 * Creates ContentNode + FilePayload with uploadStatus="uploading"
 * Returns presigned URL for direct client → storage upload.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { generateUniqueSlug } from "@/lib/domain/content";
import type { InitiateUploadRequest } from "@/lib/domain/content/api-types";
import crypto from "crypto";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/content/upload/initiate";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
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
        role,
      } = body;

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

      if (parentId) {
        const parent = await prisma.contentNode.findUnique({
          where: { id: parentId },
        });

        if (!parent || parent.ownerId !== session.user.id) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "NOT_FOUND", message: "Parent not found" },
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
            content: { ownerId: session.user.id },
            uploadStatus: "ready",
          },
          include: { content: true },
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

      const fileExtension = fileName.split(".").pop() || "";
      const uniqueId = crypto.randomUUID();
      const storageKey = `uploads/${session.user.id}/${uniqueId}.${fileExtension}`;

      const contentTitle = title || fileName;
      const slug = await generateUniqueSlug(contentTitle, session.user.id);

      const content = await withSpan(
        { layer: "content", name: "create" },
        { attrs: { kind: "file", ext: fileExtension, bytes: fileSize } },
        async (span) => {
          const created = await prisma.contentNode.create({
            data: {
              ownerId: session.user.id,
              title: contentTitle,
              slug,
              contentType: "file",
              parentId: parentId || null,
              role: role || "primary",
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
            include: { filePayload: true },
          });
          span.attr("content_id", created.id);
          return created;
        },
      );

      const presignedUrl = await withSpan(
        { layer: "storage", name: "presign_upload" },
        { attrs: { provider: storageConfig.provider, mime: mimeType } },
        async () =>
          generatePresignedUploadUrl(
            storageConfig.provider,
            storageConfig.config as Record<string, unknown>,
            storageKey,
            mimeType
          ),
      );

      return NextResponse.json({
        success: true,
        data: {
          contentId: content.id,
          uploadUrl: presignedUrl,
          storageKey,
          expiresIn: 3600,
          message:
            "Upload initiated. Upload file to the provided URL, then call /finalize.",
        },
      });
    } catch (error) {
      logger.error({
        layer: "storage",
        event: "upload_initiate:caught",
        summary: "initiate failed — 500",
        error,
      });
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
  });
}

// ============================================================
// PRESIGNED URL GENERATION
// ============================================================

async function generatePresignedUploadUrl(
  provider: string,
  config: Record<string, unknown>,
  storageKey: string,
  mimeType: string
): Promise<string> {
  const { getDefaultStorageProvider } = await import('@/lib/infrastructure/storage');

  const storageProvider = getDefaultStorageProvider();

  const presignedUrl = await storageProvider.generateUploadUrl(
    storageKey,
    mimeType,
    3600
  );

  return presignedUrl.url;
}
