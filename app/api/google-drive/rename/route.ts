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
import { getSession } from "@/lib/infrastructure/auth/session";
import { prisma } from "@/lib/database/client";

interface RenameRequest {
  fileId: string;
  newFileName: string;
  contentId?: string; // Optional: to update metadata after rename
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

    const body: RenameRequest = await request.json();
    const { fileId, newFileName, contentId } = body;

    if (!fileId || !newFileName) {
      return NextResponse.json(
        { error: "Missing required fields: fileId and newFileName" },
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

    // Check if token is expired
    let accessToken = account.accessToken;
    if (account.expiresAt && new Date() > account.expiresAt) {
      // TODO: Implement token refresh
      return NextResponse.json(
        { error: "Google access token expired. Please re-authenticate." },
        { status: 403 }
      );
    }

    // Rename file in Google Drive using PATCH request
    console.log(`[Google Drive Rename] Renaming file ${fileId} to "${newFileName}"`);
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

    if (!renameResponse.ok) {
      const errorText = await renameResponse.text();
      console.error("[Google Drive Rename] Failed:", errorText);

      // Handle specific error cases
      if (renameResponse.status === 404) {
        return NextResponse.json(
          { error: "File not found in Google Drive. It may have been deleted or moved." },
          { status: 404 }
        );
      }

      if (renameResponse.status === 403) {
        return NextResponse.json(
          { error: "Permission denied. You may not have access to this file." },
          { status: 403 }
        );
      }

      throw new Error(`Google Drive rename failed: ${renameResponse.status}`);
    }

    const renameResult = await renameResponse.json();
    console.log("[Google Drive Rename] Success! New name:", renameResult.name);

    // Optionally update metadata in database
    if (contentId) {
      const filePayload = await prisma.filePayload.findUnique({
        where: { contentId },
        select: { storageMetadata: true },
      });

      if (filePayload && filePayload.storageMetadata) {
        const metadata = filePayload.storageMetadata as any;
        if (metadata.googleDrive) {
          metadata.googleDrive.lastSynced = new Date().toISOString();

          await prisma.filePayload.update({
            where: { contentId },
            data: { storageMetadata: metadata },
          });

          console.log("[Google Drive Rename] Updated metadata sync timestamp");
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        fileId: renameResult.id,
        fileName: renameResult.name,
        mimeType: renameResult.mimeType,
      },
    });
  } catch (error) {
    console.error("[Google Drive Rename] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to rename file in Google Drive",
      },
      { status: 500 }
    );
  }
}
