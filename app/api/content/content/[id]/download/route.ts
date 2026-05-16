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
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/content/[id]/download";

type Params = Promise<{ id: string }>;

// ============================================================
// GET /api/content/content/[id]/download - Download File
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const { searchParams } = new URL(request.url);
      const stream = searchParams.get('stream') === 'true';
      const forceDownload = searchParams.get('download') === 'true';

      const content = await withSpan(
        { layer: "content", name: "payload" },
        { attrs: { content_id: id } },
        async (span) => {
          const result = await prisma.contentNode.findUnique({
            where: { id },
            include: { filePayload: true },
          });
          if (result?.filePayload) {
            span
              .attr("upload_status", result.filePayload.uploadStatus)
              .summary(result.filePayload.uploadStatus);
          } else if (result) {
            span.attr("not_a_file", true).summary("not a file");
          } else {
            span.attr("found", false).summary("not found");
          }
          return result;
        },
      );

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

      const providerType = content.filePayload.storageProvider as 'r2' | 's3' | 'vercel';
      const storageProvider = await getUserStorageProvider(
        session.user.id,
        providerType
      );

      // Stream the file directly back to the client
      if (stream || forceDownload) {
        return await withSpan(
          { layer: "storage", name: "stream" },
          {
            attrs: {
              provider: providerType,
              bytes: Number(content.filePayload.fileSize),
              force_download: forceDownload,
            },
            summary: `${Number(content.filePayload.fileSize)} bytes`,
          },
          async (span) => {
            const downloadUrl = await storageProvider.generateDownloadUrl(
              content.filePayload!.storageKey,
              3600
            );

            const fileResponse = await fetch(downloadUrl);
            if (!fileResponse.ok) {
              throw new Error("Failed to fetch file from storage");
            }

            const fileBlob = await fileResponse.blob();

            const disposition = forceDownload
              ? `attachment; filename="${content.filePayload!.fileName}"`
              : `inline; filename="${content.filePayload!.fileName}"`;

            span.attr("served", true);
            return new NextResponse(fileBlob, {
              headers: {
                'Content-Type': content.filePayload!.mimeType,
                'Content-Disposition': disposition,
                'Content-Length': content.filePayload!.fileSize.toString(),
                'Cache-Control': 'private, max-age=3600',
              },
            });
          },
        );
      }

      // Default: Return presigned download URL
      const downloadUrl = await withSpan(
        { layer: "storage", name: "presign" },
        { attrs: { provider: providerType } },
        async (span) => {
          const url = await storageProvider.generateDownloadUrl(
            content.filePayload!.storageKey,
            3600
          );
          span.summary("1h url");
          return url;
        },
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
      logger.error({
        layer: "storage",
        event: "download:caught",
        summary: "download failed — 500",
        error,
      });
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
  });
}
