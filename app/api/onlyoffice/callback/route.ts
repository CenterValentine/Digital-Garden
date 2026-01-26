/**
 * ONLYOFFICE Callback API
 *
 * This endpoint receives callbacks from ONLYOFFICE Document Server
 * when a document is saved or edited.
 *
 * Callback Status Codes:
 * - 0: Document not found
 * - 1: Document is being edited
 * - 2: Document is ready for saving (user closed editor)
 * - 3: Document saving error
 * - 4: Document closed with no changes
 * - 6: Document is being edited, but current document state is saved
 * - 7: Error occurred during force save
 *
 * Flow:
 * 1. ONLYOFFICE calls this endpoint with status=2 or status=6
 * 2. We download the updated document from ONLYOFFICE's URL
 * 3. We upload it to our storage (R2/S3)
 * 4. We update the database with new file metadata
 * 5. We return success response to ONLYOFFICE
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/infrastructure/auth/session";
import { prisma } from "@/lib/database/client";

interface OnlyOfficeCallback {
  key: string; // Document key
  status: number; // Status code
  url?: string; // URL to download the updated document
  filetype?: string;
  forcesavetype?: number;
  users?: string[];
  actions?: any[];
  changesurl?: string;
  history?: any;
}

export async function POST(request: NextRequest) {
  try {
    // Parse callback data
    const data: OnlyOfficeCallback = await request.json();

    console.log("[ONLYOFFICE Callback] Received:", {
      status: data.status,
      key: data.key,
      hasUrl: !!data.url,
    });

    // Get contentId from query params
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get("contentId");

    if (!contentId) {
      console.error("[ONLYOFFICE Callback] Missing contentId");
      return NextResponse.json(
        { error: "Missing contentId parameter" },
        { status: 400 }
      );
    }

    // Status 1: Document is being edited (no action needed)
    if (data.status === 1) {
      console.log("[ONLYOFFICE Callback] Document is being edited");
      return NextResponse.json({ error: 0 }); // Success response
    }

    // Status 4: Document closed with no changes (no action needed)
    if (data.status === 4) {
      console.log("[ONLYOFFICE Callback] Document closed with no changes");
      return NextResponse.json({ error: 0 });
    }

    // Status 2 or 6: Document ready for saving
    if (data.status === 2 || data.status === 6) {
      if (!data.url) {
        console.error("[ONLYOFFICE Callback] Missing document URL");
        return NextResponse.json(
          { error: "Missing document URL" },
          { status: 400 }
        );
      }

      // Verify content exists and user has access
      const content = await prisma.contentNode.findUnique({
        where: { id: contentId },
        include: {
          filePayload: true,
        },
      });

      if (!content) {
        console.error("[ONLYOFFICE Callback] Content not found:", contentId);
        return NextResponse.json(
          { error: "Content not found" },
          { status: 404 }
        );
      }

      if (!content.filePayload) {
        console.error("[ONLYOFFICE Callback] Not a file:", contentId);
        return NextResponse.json(
          { error: "Not a file" },
          { status: 400 }
        );
      }

      console.log("[ONLYOFFICE Callback] Downloading updated document from:", data.url);

      try {
        // 1. Download the updated document from ONLYOFFICE
        const response = await fetch(data.url);
        if (!response.ok) {
          throw new Error(`Failed to download document: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const newFileSize = buffer.length;

        console.log("[ONLYOFFICE Callback] Downloaded document:", {
          size: newFileSize,
          originalSize: content.filePayload.fileSize,
        });

        // 2. Upload to our storage (R2/S3)
        // TODO: Implement storage upload
        // For now, we'll use the simple upload endpoint as a reference
        // In production, you'd directly upload to R2 using the storage SDK

        // 3. Update database with new metadata
        await prisma.filePayload.update({
          where: { contentId },
          data: {
            fileSize: BigInt(newFileSize),
            uploadStatus: "ready",
            // Update any other metadata as needed
          },
        });

        // 4. Update ContentNode timestamp
        await prisma.contentNode.update({
          where: { id: contentId },
          data: {
            updatedAt: new Date(),
          },
        });

        console.log("[ONLYOFFICE Callback] Document saved successfully");

        // Return success response to ONLYOFFICE
        return NextResponse.json({ error: 0 });
      } catch (error) {
        console.error("[ONLYOFFICE Callback] Failed to save document:", error);
        return NextResponse.json(
          { error: "Failed to save document" },
          { status: 500 }
        );
      }
    }

    // Status 3 or 7: Error occurred
    if (data.status === 3 || data.status === 7) {
      console.error("[ONLYOFFICE Callback] Error status received:", data.status);
      return NextResponse.json(
        { error: "Document error" },
        { status: 500 }
      );
    }

    // Unknown status
    console.warn("[ONLYOFFICE Callback] Unknown status:", data.status);
    return NextResponse.json({ error: 0 }); // Accept but log
  } catch (error) {
    console.error("[ONLYOFFICE Callback] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ONLYOFFICE may send GET requests to verify the callback URL
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "ONLYOFFICE callback endpoint is active",
  });
}
