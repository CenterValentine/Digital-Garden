/**
 * Create Blank Office Document
 *
 * POST /api/content/content/create-document
 *
 * Creates a blank .docx or .xlsx file, uploads to storage, and creates ContentNode
 * Similar to file upload but generates the file content programmatically
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { generateUniqueSlug } from "@/lib/domain/content";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { createBlankOfficeDocument } from "@/lib/office/blank-document-generator";
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
      fileType: "docx" | "xlsx";
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

    if (!fileType || !["docx", "xlsx"].includes(fileType)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "File type must be 'docx' or 'xlsx'",
          },
        },
        { status: 400 }
      );
    }

    // Ensure fileName has correct extension
    const extension = `.${fileType}`;
    const finalFileName = fileName.endsWith(extension) ? fileName : `${fileName}${extension}`;

    // Generate blank document
    const buffer = await createBlankOfficeDocument(finalFileName);
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
    const mimeType = fileType === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    await storageProvider.uploadFile(storageKey, buffer, mimeType);

    // Determine which provider was actually used
    const usedProvider = provider || "r2";

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
            parentId: parentId || null,
            displayOrder: 0,
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
