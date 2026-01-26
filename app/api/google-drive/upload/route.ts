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
import { getSession } from "@/lib/infrastructure/auth/session";
import { prisma } from "@/lib/database/client";
import { setGoogleDriveMetadata } from "@/lib/domain/content/metadata-types";

interface UploadRequest {
  contentId: string;
  downloadUrl: string;
  fileName: string;
  mimeType: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

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

    // Get user's Google OAuth tokens
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
      select: {
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
      },
    });

    if (!account || !account.accessToken) {
      return NextResponse.json(
        { error: "Google authentication required" },
        { status: 403 }
      );
    }

    // Check if token is expired and refresh if needed
    let accessToken = account.accessToken;
    if (account.expiresAt && new Date() > account.expiresAt) {
      // TODO: Implement token refresh
      // For now, return error
      return NextResponse.json(
        { error: "Google access token expired. Please re-authenticate." },
        { status: 403 }
      );
    }

    // 1. Fetch file from R2
    console.log("[Google Drive Upload] Fetching file from R2:", downloadUrl);
    const fileResponse = await fetch(downloadUrl);
    if (!fileResponse.ok) {
      throw new Error("Failed to fetch file from storage");
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    console.log("[Google Drive Upload] File size:", fileBuffer.byteLength);

    // 2. Convert Office formats to Google formats
    const googleMimeType = convertToGoogleMimeType(mimeType);

    // 3. Upload to Google Drive using multipart upload
    const boundary = "-------314159265358979323846";

    const metadata = {
      name: fileName,
      mimeType: googleMimeType,
    };

    // Build multipart body as Buffer array for proper binary handling
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

    // Combine parts as buffers
    const multipartBody = Buffer.concat([
      Buffer.from(metadataPart, "utf8"),
      Buffer.from(filePart, "utf8"),
      Buffer.from(fileBuffer),
      Buffer.from(closeDelimiter, "utf8"),
    ]);

    console.log("[Google Drive Upload] Uploading to Google Drive...");
    console.log("[Google Drive Upload] File size:", multipartBody.length, "bytes");
    const uploadResponse = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&convert=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": multipartBody.length.toString(),
        },
        body: multipartBody,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("[Google Drive Upload] Failed:", errorText);
      throw new Error(`Google Drive upload failed: ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log("[Google Drive Upload] Success! File ID:", uploadResult.id);

    // Save Google Drive file ID to database metadata
    const filePayload = await prisma.filePayload.findUnique({
      where: { contentId },
      select: { storageMetadata: true },
    });

    if (filePayload) {
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
        data: { storageMetadata: updatedMetadata as any },
      });

      console.log("[Google Drive Upload] Saved file ID to database metadata");
    }

    return NextResponse.json({
      success: true,
      data: {
        fileId: uploadResult.id,
        fileName: uploadResult.name,
        googleMimeType: uploadResult.mimeType,
      },
    });
  } catch (error) {
    console.error("[Google Drive Upload] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to upload to Google Drive",
      },
      { status: 500 }
    );
  }
}

/**
 * Convert Microsoft Office MIME types to Google Docs MIME types
 */
function convertToGoogleMimeType(mimeType: string): string {
  // Word documents → Google Docs
  if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("wordprocessingml")
  ) {
    return "application/vnd.google-apps.document";
  }

  // Excel spreadsheets → Google Sheets
  if (
    mimeType.includes("sheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheetml")
  ) {
    return "application/vnd.google-apps.spreadsheet";
  }

  // PowerPoint presentations → Google Slides
  if (
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("presentationml")
  ) {
    return "application/vnd.google-apps.presentation";
  }

  // Keep original MIME type for other formats
  return mimeType;
}
