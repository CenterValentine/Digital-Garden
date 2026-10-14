/**
 * Google Drive Upload API
 *
 * Uploads a file from R2 storage to user's Google Drive for editing.
 *
 * Flow:
 * 1. Fetch file from R2 using downloadUrl
 * 2. Upload to Google Drive using user's OAuth token
 * 3. Return Google Drive file ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getValidGoogleAccessToken, GoogleAuthError } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import { setGoogleDriveMetadata } from "@/lib/domain/content/metadata-types";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/google-drive/upload";

interface UploadRequest {
  contentId: string;
  downloadUrl: string;
  fileName: string;
  mimeType: string;
}

/** Google's reason from an error body: the JSON `error.message` when the
 * body is JSON, else the (short) plain-text body itself. Bounded. */
function googleErrorReason(body: string): string {
  const text = body.trim();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } | string };
    const message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 300);
  } catch {
    // not JSON — fall through to the raw text
  }
  return (text || "no reason given").slice(0, 300);
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

      const body: UploadRequest = await request.json();
      const { contentId, downloadUrl, fileName, mimeType } = body;

      if (!contentId || !downloadUrl || !fileName) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }

      let accessToken: string;
      try {
        accessToken = await getValidGoogleAccessToken(session.user.id);
      } catch (error) {
        // `code` lets clients distinguish "Reconnect Google" from "try
        // again" without string-matching the message (google-reauth-client).
        if (error instanceof GoogleAuthError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: error.code === "transient" ? 503 : 403 }
          );
        }
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

      // 1. Fetch file from storage. The downloadUrl is a presigned URL; not logged.
      const fileBuffer = await withSpan(
        { layer: "storage", name: "fetch_from_url" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const fileResponse = await fetch(downloadUrl);
          if (!fileResponse.ok) {
            throw new Error("Failed to fetch file from storage");
          }
          const buf = await fileResponse.arrayBuffer();
          span.attr("bytes", buf.byteLength).summary(`${buf.byteLength} bytes`);
          return buf;
        },
      );

      // 2. Convert Office formats to Google formats
      const googleMimeType = convertToGoogleMimeType(mimeType);

      // 3. Upload to Google Drive using multipart upload
      const boundary = "-------314159265358979323846";

      const metadata = {
        name: fileName,
        mimeType: googleMimeType,
      };

      const metadataPart = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        "",
      ].join("\r\n");

      const filePart = [
        `--${boundary}`,
        `Content-Type: ${mimeType}`,
        "",
        "",
      ].join("\r\n");

      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartBody = Buffer.concat([
        Buffer.from(metadataPart, "utf8"),
        Buffer.from(filePart, "utf8"),
        Buffer.from(fileBuffer),
        Buffer.from(closeDelimiter, "utf8"),
      ]);

      const uploadResult = await withSpan(
        { layer: "external", name: "google_drive_upload" },
        {
          attrs: {
            content_id: contentId,
            bytes: multipartBody.length,
            mime: mimeType,
            google_mime: googleMimeType,
          },
          summary: `${multipartBody.length} bytes → ${googleMimeType}`,
        },
        async (span) => {
          const uploadResponse = await fetch(
            // `fields` asks for webViewLink — the default response omits it,
            // so the link stored below was always empty. No hand-set
            // Content-Length: the runtime computes it from the body, and a
            // header that disagrees with what is actually sent is exactly
            // the kind of request Google refuses with a terse 400.
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true&fields=id,name,mimeType,webViewLink",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
              },
              body: multipartBody,
            }
          );
          span.attr("status", uploadResponse.status);

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            const reason = googleErrorReason(errorText);
            // Google's own error message (never file content) — logging only
            // its length left a production 400 undiagnosable (2026-10-14).
            logger.warn({
              layer: "external",
              event: "google_drive_upload:failed",
              summary: `status ${uploadResponse.status}: ${reason}`,
              attrs: {
                status: uploadResponse.status,
                body_size: errorText.length,
                google_error: reason,
                file_bytes: fileBuffer.byteLength,
                name_chars: fileName.length,
                mime: mimeType,
              },
            });
            throw new Error(`Google Drive refused the upload (${uploadResponse.status}): ${reason}`);
          }

          const result = await uploadResponse.json();
          span.attr("file_id", result.id).summary(`file_id ${result.id}`);
          await spanPayload(span, "google_drive_upload_result", result);
          return result;
        },
      );

      // Save Google Drive file ID to database metadata
      await withSpan(
        { layer: "content", name: "metadata_update" },
        { attrs: { content_id: contentId, op: "drive_link" } },
        async (span) => {
          const filePayload = await prisma.filePayload.findUnique({
            where: { contentId },
            select: { storageMetadata: true },
          });

          if (!filePayload) {
            span.attr("skipped", true).summary("no FilePayload");
            return;
          }

          const updatedMetadata = setGoogleDriveMetadata(
            filePayload.storageMetadata,
            {
              fileId: uploadResult.id,
              lastSynced: new Date().toISOString(),
              webViewUrl: uploadResult.webViewLink,
              editUrl: uploadResult.webViewLink?.replace("/view", "/edit"),
              googleMimeType: uploadResult.mimeType,
            }
          );

          await prisma.filePayload.update({
            where: { contentId },
            data: { storageMetadata: updatedMetadata as Prisma.InputJsonValue },
          });
          span.summary("metadata linked");
        },
      );

      return NextResponse.json({
        success: true,
        data: {
          fileId: uploadResult.id,
          fileName: uploadResult.name,
          googleMimeType: uploadResult.mimeType,
        },
      });
    } catch (error) {
      logger.error({
        layer: "external",
        event: "google_drive_upload:caught",
        summary: "upload failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Failed to upload to Google Drive",
        },
        { status: 500 }
      );
    }
  });
}

/**
 * Convert Microsoft Office MIME types to Google Docs MIME types
 */
function convertToGoogleMimeType(mimeType: string): string {
  if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("wordprocessingml")
  ) {
    return "application/vnd.google-apps.document";
  }

  if (
    mimeType.includes("sheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheetml")
  ) {
    return "application/vnd.google-apps.spreadsheet";
  }

  if (
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("presentationml")
  ) {
    return "application/vnd.google-apps.presentation";
  }

  return mimeType;
}
