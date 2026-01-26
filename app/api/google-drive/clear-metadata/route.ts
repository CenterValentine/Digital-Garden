/**
 * Clear Google Drive Metadata API
 *
 * Clears the Google Drive file ID from storage metadata.
 * Used when the Drive file is deleted or inaccessible.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/infrastructure/auth/session";
import { prisma } from "@/lib/database/client";

interface ClearMetadataRequest {
  contentId: string;
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

    const body: ClearMetadataRequest = await request.json();
    const { contentId } = body;

    if (!contentId) {
      return NextResponse.json(
        { error: "Missing contentId" },
        { status: 400 }
      );
    }

    // Fetch current metadata
    const filePayload = await prisma.filePayload.findUnique({
      where: { contentId },
      select: { storageMetadata: true },
    });

    if (!filePayload) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Remove Google Drive metadata
    const metadata = filePayload.storageMetadata as any;
    if (metadata?.externalProviders?.googleDrive) {
      delete metadata.externalProviders.googleDrive;

      // Update database
      await prisma.filePayload.update({
        where: { contentId },
        data: { storageMetadata: metadata },
      });

      console.log("[Clear Metadata] Removed Google Drive metadata for:", contentId);
    }

    return NextResponse.json({
      success: true,
      message: "Google Drive metadata cleared",
    });
  } catch (error) {
    console.error("[Clear Metadata] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to clear metadata",
      },
      { status: 500 }
    );
  }
}
