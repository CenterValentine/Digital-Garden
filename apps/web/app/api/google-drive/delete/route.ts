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
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

interface DeleteRequest {
  fileId: string;
  contentId?: string; // Optional: for logging purposes
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

    const body: DeleteRequest = await request.json();
    const { fileId, contentId } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: "Missing required field: fileId" },
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

    // Delete file in Google Drive
    console.log(`[Google Drive Delete] Deleting file ${fileId}`);
    const deleteResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error("[Google Drive Delete] Failed:", errorText);

      // Handle specific error cases
      if (deleteResponse.status === 404) {
        // File already deleted or doesn't exist - not an error
        console.log("[Google Drive Delete] File not found (already deleted)");
        return NextResponse.json({
          success: true,
          message: "File not found in Google Drive (may have been already deleted)",
        });
      }

      if (deleteResponse.status === 403) {
        return NextResponse.json(
          { error: "Permission denied. You may not have access to delete this file." },
          { status: 403 }
        );
      }

      throw new Error(`Google Drive delete failed: ${deleteResponse.status}`);
    }

    console.log("[Google Drive Delete] Success! File deleted from Google Drive");

    return NextResponse.json({
      success: true,
      message: "File deleted from Google Drive",
    });
  } catch (error) {
    console.error("[Google Drive Delete] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete file from Google Drive",
      },
      { status: 500 }
    );
  }
}
