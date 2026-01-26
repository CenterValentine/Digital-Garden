/**
 * Simple Server-Side File Upload (CORS-Free)
 *
 * POST /api/notes/content/upload/simple
 *
 * Uploads file through server (no CORS issues)
 * Use this for testing until CORS is configured on R2 bucket
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import { generateUniqueSlug } from "@/lib/content";
import { getUserStorageProvider } from "@/lib/storage";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const formData = await request.formData();

    const file = formData.get("file") as File;
    const parentId = formData.get("parentId") as string | null;
    const provider = formData.get("provider") as "r2" | "s3" | "vercel" | null;
    const enableOCR = formData.get("enableOCR") === "true";

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "File is required",
          },
        },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Calculate checksum
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    // Generate storage key
    const fileExtension = file.name.split(".").pop() || "";
    const timestamp = Date.now();
    const storageKey = `uploads/${session.user.id}/${timestamp}-${crypto.randomBytes(8).toString("hex")}.${fileExtension}`;

    // Get storage provider (use specified provider or user's default)
    const storageProvider = await getUserStorageProvider(
      session.user.id,
      provider || undefined
    );

    // Upload to storage
    await storageProvider.uploadFile(storageKey, buffer, file.type);

    // Determine which provider was actually used
    const usedProvider = provider || "r2"; // Default to r2 if not specified

    // Extract text for search (if document)
    // Use the same storage provider we just uploaded to
    const { DocumentExtractor } = await import("@/lib/media/document-extractor");
    const documentExtractor = new DocumentExtractor(storageProvider, enableOCR);
    const searchText = await documentExtractor.extractText(storageKey, file.type);

    console.log(`[Upload] File: ${file.name}, OCR: ${enableOCR}, searchTextLength: ${searchText.length}`);

    // Check for duplicate file (by checksum)
    const existingFile = await prisma.filePayload.findFirst({
      where: {
        checksum,
        fileSize: BigInt(file.size),
        content: {
          ownerId: session.user.id,
        },
        uploadStatus: { in: ["uploading", "ready"] },  // Check both statuses
      },
      include: {
        content: true,
      },
    });

    // If duplicate exists, auto-rename with (1), (2), etc. like macOS
    let finalFileName = file.name;
    let isDuplicateFile = false;

    if (existingFile) {
      isDuplicateFile = true;

      // Extract filename and extension
      const extensionMatch = file.name.match(/^(.+)(\.[^.]+)$/);
      const baseName = extensionMatch ? extensionMatch[1] : file.name;
      const extension = extensionMatch ? extensionMatch[2] : "";

      // Find next available number (1, 2, 3, etc.)
      let counter = 1;
      let candidateName = `${baseName} (${counter})${extension}`;

      while (true) {
        // Check if this name is already taken (by checksum)
        const nameExists = await prisma.filePayload.findFirst({
          where: {
            checksum,
            fileSize: BigInt(file.size),
            content: {
              ownerId: session.user.id,
              title: candidateName,
            },
            uploadStatus: { in: ["uploading", "ready"] },
          },
        });

        if (!nameExists) {
          finalFileName = candidateName;
          break;
        }

        counter++;
        candidateName = `${baseName} (${counter})${extension}`;

        // Safety limit
        if (counter > 100) {
          throw new Error("Too many duplicate files with the same content");
        }
      }

      console.log(`[Upload] Duplicate detected. Renamed "${file.name}" → "${finalFileName}"`);
    }

    // Generate slug and create ContentNode with retry logic for race conditions
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
                fileExtension,
                mimeType: file.type || "application/octet-stream",
                fileSize: BigInt(file.size),
                checksum,
                storageProvider: usedProvider,
                storageKey,
                searchText,
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
            console.log(`[Upload Retry ${attempts}/${maxAttempts}] Slug collision, retrying with: ${slug}`);
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

    // Return a simple response with only primitive types (no Prisma objects)
    return NextResponse.json(
      {
        success: true,
        data: {
          fileName: finalFileName,
          fileSize: file.size,
          searchTextLength: searchText.length,
          storageProvider: usedProvider,
          slug,
          isDuplicate: isDuplicateFile,  // True if we renamed due to duplicate content
          retriedSlug: attempts > 1,  // Indicate if we had to retry slug collision
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[SimpleUpload] ERROR:", error);
    console.error("[SimpleUpload] Stack:", error instanceof Error ? error.stack : "No stack");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to upload file",
          details: error instanceof Error ? error.stack : String(error),
        },
      },
      { status: 500 }
    );
  }
}
