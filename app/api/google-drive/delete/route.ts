/**
 * Google Drive Delete API
 *
 * Deletes a file from user's Google Drive when local file is deleted.
 *
 * Flow:
 * 1. Validate user has Google OAuth tokens
 * 2. Call Google Drive API to delete file
 * 3. Return success or error
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getValidGoogleAccessToken } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/google-drive/delete";

interface DeleteRequest {
  fileId: string;
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

      const body: DeleteRequest = await request.json();
      const { fileId } = body;

      if (!fileId) {
        return NextResponse.json(
          { error: "Missing required field: fileId" },
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

      return await withSpan(
        { layer: "external", name: "google_drive_delete" },
        { attrs: { file_id: fileId } },
        async (span) => {
          const deleteResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );
          span.attr("status", deleteResponse.status);

          if (!deleteResponse.ok) {
            // 404: already deleted is not an error
            if (deleteResponse.status === 404) {
              span.attr("ok", true).summary("404 (already deleted)");
              return NextResponse.json({
                success: true,
                message: "File not found in Google Drive (may have been already deleted)",
              });
            }

            if (deleteResponse.status === 403) {
              span.attr("ok", false).summary("403 forbidden");
              return NextResponse.json(
                { error: "Permission denied. You may not have access to delete this file." },
                { status: 403 }
              );
            }

            // Other non-OK status — read body for logger, not for response
            const errorText = await deleteResponse.text();
            logger.warn({
              layer: "external",
              event: "google_drive_delete:failed",
              summary: `status ${deleteResponse.status}`,
              attrs: { status: deleteResponse.status, body_size: errorText.length },
            });
            throw new Error(`Google Drive delete failed: ${deleteResponse.status}`);
          }

          span.attr("ok", true).summary("deleted");
          return NextResponse.json({
            success: true,
            message: "File deleted from Google Drive",
          });
        },
      );
    } catch (error) {
      logger.error({
        layer: "external",
        event: "google_drive_delete:caught",
        summary: "delete failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Failed to delete file from Google Drive",
        },
        { status: 500 }
      );
    }
  });
}
