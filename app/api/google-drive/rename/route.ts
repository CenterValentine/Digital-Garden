/**
 * Google Drive Rename API
 *
 * Renames a file in user's Google Drive to match local file name.
 *
 * Flow:
 * 1. Validate user has Google OAuth tokens
 * 2. Call Google Drive API to rename file
 * 3. Update metadata with new file name
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getValidGoogleAccessToken } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/google-drive/rename";

interface RenameRequest {
  fileId: string;
  newFileName: string;
  contentId?: string;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => getSession(),
      );

      if (!session) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      const body: RenameRequest = await request.json();
      const { fileId, newFileName, contentId } = body;

      if (!fileId || !newFileName) {
        return NextResponse.json(
          { error: "Missing required fields: fileId and newFileName" },
          { status: 400 }
        );
      }

      let accessToken: string;
      try {
        accessToken = await getValidGoogleAccessToken(session.user.id);
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Google authentication required",
          },
          { status: 403 }
        );
      }

      // newFileName may contain user content — not logged in attrs.
      const renameResult = await withSpan(
        { layer: "external", name: "google_drive_rename" },
        { attrs: { file_id: fileId } },
        async (span) => {
          const renameResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: newFileName,
              }),
            }
          );
          span.attr("status", renameResponse.status);

          if (!renameResponse.ok) {
            if (renameResponse.status === 404) {
              span.attr("ok", false).summary("404 not found");
              return { failed: { status: 404, message: "File not found in Google Drive. It may have been deleted or moved." } };
            }
            if (renameResponse.status === 403) {
              span.attr("ok", false).summary("403 forbidden");
              return { failed: { status: 403, message: "Permission denied. You may not have access to this file." } };
            }

            const errorText = await renameResponse.text();
            logger.warn({
              layer: "external",
              event: "google_drive_rename:failed",
              summary: `status ${renameResponse.status}`,
              attrs: { status: renameResponse.status, body_size: errorText.length },
            });
            throw new Error(`Google Drive rename failed: ${renameResponse.status}`);
          }

          const result = await renameResponse.json();
          span.attr("ok", true).summary("renamed");
          return { ok: result };
        },
      );

      if ("failed" in renameResult) {
        return NextResponse.json(
          { error: renameResult.failed.message },
          { status: renameResult.failed.status }
        );
      }

      // Optionally update metadata in database
      if (contentId) {
        await withSpan(
          { layer: "content", name: "metadata_update" },
          { attrs: { content_id: contentId, op: "drive_sync_timestamp" } },
          async (span) => {
            const filePayload = await prisma.filePayload.findUnique({
              where: { contentId },
              select: { storageMetadata: true },
            });

            if (filePayload && filePayload.storageMetadata) {
              const metadata = filePayload.storageMetadata as { googleDrive?: { lastSynced?: string } } | null;
              if (metadata?.googleDrive) {
                metadata.googleDrive.lastSynced = new Date().toISOString();

                await prisma.filePayload.update({
                  where: { contentId },
                  data: { storageMetadata: metadata },
                });
                span.summary("sync timestamp updated");
                return;
              }
            }
            span.attr("skipped", true).summary("no Drive metadata to update");
          },
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          fileId: renameResult.ok.id,
          fileName: renameResult.ok.name,
          mimeType: renameResult.ok.mimeType,
        },
      });
    } catch (error) {
      logger.error({
        layer: "external",
        event: "google_drive_rename:caught",
        summary: "rename failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Failed to rename file in Google Drive",
        },
        { status: 500 }
      );
    }
  });
}
