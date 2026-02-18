/**
 * Create Blank Office Document or JSON File
 *
 * POST /api/content/content/create-document
 *
 * Creates a blank .docx, .xlsx, or .json file, uploads to storage, and creates ContentNode
 * Similar to file upload but generates the file content programmatically
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { generateUniqueSlug } from "@/lib/domain/content";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { createBlankOfficeDocument } from "@/lib/features/office/blank-document-generator";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();

    const {
      fileName,
      fileType,
      parentId = null,
      provider = null,
    }: {
      fileName: string;
      fileType: "docx" | "xlsx" | "json";
      parentId?: string | null;
      provider?: "r2" | "s3" | "vercel" | null;
    } = body;

    if (!fileName) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "File name is required",
          },
        },
        { status: 400 }
      );
    }

    if (!fileType || !["docx", "xlsx", "json"].includes(fileType)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "File type must be 'docx', 'xlsx', or 'json'",
          },
        },
        { status: 400 }
      );
    }

    // Use fileName exactly as provided (no modification)
    const finalFileName = fileName;
    const extension = `.${fileType}`;

    // Generate blank document or JSON file
    let buffer: Buffer;
    if (fileType === "json") {
      // Create blank JSON object
      buffer = Buffer.from("{}", "utf-8");
    } else {
      // Generate blank Office document (docx or xlsx)
      buffer = await createBlankOfficeDocument(fileType as "docx" | "xlsx", finalFileName);
    }
    const fileSize = buffer.length;

    // Calculate checksum
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    // Generate storage key
    const timestamp = Date.now();
    const storageKey = `uploads/${session.user.id}/${timestamp}-${crypto.randomBytes(8).toString("hex")}${extension}`;

    // Get storage provider
    const storageProvider = await getUserStorageProvider(
      session.user.id,
      provider || undefined
    );

    // Upload to storage
    const mimeType =
      fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : fileType === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/json";

    await storageProvider.uploadFile(storageKey, buffer, mimeType);

    // Determine which provider was actually used
    const usedProvider = provider || "r2";

    // Calculate displayOrder to place new file at the top
    // Find the minimum displayOrder among siblings to place this one above all others
    const siblings = await prisma.contentNode.findMany({
      where: {
        ownerId: session.user.id,
        parentId: parentId || null,
        deletedAt: null,
      },
      select: { displayOrder: true },
      orderBy: { displayOrder: "asc" },
      take: 1,
    });

    const minDisplayOrder = siblings.length > 0 ? siblings[0].displayOrder : 0;
    const newDisplayOrder = minDisplayOrder - 1;

    // Generate slug and create ContentNode with retry logic
    let slug = await generateUniqueSlug(finalFileName, session.user.id);
    let content;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        // Try to create ContentNode + FilePayload
        content = await prisma.contentNode.create({
          data: {
            ownerId: session.user.id,
            title: finalFileName,
            slug,
            contentType: "file",
            parentId: parentId || null,
            displayOrder: newDisplayOrder,
            filePayload: {
              create: {
                fileName: finalFileName,
                fileExtension: fileType,
                mimeType,
                fileSize: BigInt(fileSize),
                checksum,
                storageProvider: usedProvider,
                storageKey,
                searchText: "", // Empty for blank documents
                uploadStatus: "ready",
                uploadedAt: new Date(),
                isProcessed: false,
                processingStatus: "none",
              },
            },
          },
        });

        // Success! Break out of retry loop
        break;
      } catch (error: any) {
        // Check if it's a unique constraint error on slug
        if (error.code === "P2002" && error.meta?.target?.includes("slug")) {
          if (attempts < maxAttempts) {
            // Regenerate slug with timestamp + random suffix to ensure uniqueness
            const timestamp = Date.now();
            const randomSuffix = crypto.randomBytes(4).toString("hex");
            slug = `${await generateUniqueSlug(finalFileName, session.user.id)}-${timestamp}-${randomSuffix}`;
            console.log(`[CreateDocument Retry ${attempts}/${maxAttempts}] Slug collision, retrying with: ${slug}`);
            continue;
          } else {
            // Max attempts reached
            throw new Error(
              "Unable to create unique file name. Please rename the file and try again."
            );
          }
        }

        // Not a slug collision error, rethrow
        throw error;
      }
    }

    if (!content) {
      throw new Error("Failed to create content after retries");
    }

    console.log(`[CreateDocument] Created ${fileType.toUpperCase()}: ${finalFileName} (${fileSize} bytes)`);

    return NextResponse.json(
      {
        success: true,
        data: {
          id: content.id,
          fileName: finalFileName,
          fileType,
          fileSize,
          slug,
          storageProvider: usedProvider,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[CreateDocument] ERROR:", error);
    console.error("[CreateDocument] Stack:", error instanceof Error ? error.stack : "No stack");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create document",
          details: error instanceof Error ? error.stack : String(error),
        },
      },
      { status: 500 }
    );
  }
}
