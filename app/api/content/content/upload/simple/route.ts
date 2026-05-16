/**
 * Simple Server-Side File Upload (CORS-Free)
 *
 * POST /api/content/content/upload/simple
 *
 * Uploads file through server (no CORS issues)
 * Use this for testing until CORS is configured on R2 bucket
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { generateUniqueSlug } from "@/lib/domain/content";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import crypto from "crypto";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/content/upload/simple";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const formData = await request.formData();

      const file = formData.get("file") as File;
      const parentId = formData.get("parentId") as string | null;
      const peopleGroupId = formData.get("peopleGroupId") as string | null;
      const personId = formData.get("personId") as string | null;
      const provider = formData.get("provider") as "r2" | "s3" | "vercel" | null;
      const enableOCR = formData.get("enableOCR") === "true";
      const role = formData.get("role") as "primary" | "referenced" | null;

      if (!file) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "VALIDATION_ERROR", message: "File is required" },
          },
          { status: 400 }
        );
      }

      if (peopleGroupId && personId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Content can only be assigned to one People target.",
            },
          },
          { status: 400 }
        );
      }

      let resolvedPeopleGroupId = peopleGroupId || null;
      let resolvedPersonId = personId || null;

      if (resolvedPeopleGroupId) {
        const group = await prisma.peopleGroup.findFirst({
          where: {
            id: resolvedPeopleGroupId,
            ownerId: session.user.id,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!group) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "NOT_FOUND", message: "People group not found" },
            },
            { status: 404 }
          );
        }
      }

      if (resolvedPersonId) {
        const person = await prisma.person.findFirst({
          where: {
            id: resolvedPersonId,
            ownerId: session.user.id,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!person) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "NOT_FOUND", message: "Person not found" },
            },
            { status: 404 }
          );
        }
      }

      if (parentId) {
        const parent = await prisma.contentNode.findUnique({
          where: { id: parentId },
          select: {
            id: true,
            ownerId: true,
            contentType: true,
            deletedAt: true,
            peopleGroupId: true,
            personId: true,
          },
        });

        if (!parent || parent.ownerId !== session.user.id) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "NOT_FOUND", message: "Parent not found" },
            },
            { status: 404 }
          );
        }

        if (parent.deletedAt) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Cannot add content to deleted parent",
              },
            },
            { status: 400 }
          );
        }

        if (parent.contentType !== "folder") {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Parent must be a folder",
              },
            },
            { status: 400 }
          );
        }

        if (parent.peopleGroupId || parent.personId) {
          if (
            (resolvedPeopleGroupId && resolvedPeopleGroupId !== parent.peopleGroupId) ||
            (resolvedPersonId && resolvedPersonId !== parent.personId)
          ) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message: "People assignment must match the parent folder.",
                },
              },
              { status: 400 }
            );
          }

          resolvedPeopleGroupId = parent.peopleGroupId;
          resolvedPersonId = parent.personId;
        }
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

      const fileExtension = file.name.split(".").pop() || "";
      const timestamp = Date.now();
      const storageKey = `uploads/${session.user.id}/${timestamp}-${crypto.randomBytes(8).toString("hex")}.${fileExtension}`;

      const usedProvider = provider || "r2";

      const storageProvider = await getUserStorageProvider(
        session.user.id,
        provider || undefined
      );

      await withSpan(
        { layer: "storage", name: "upload" },
        {
          attrs: { provider: usedProvider, bytes: buffer.length, mime: file.type || "octet-stream" },
          summary: `${buffer.length} bytes`,
        },
        async () => storageProvider.uploadFile(storageKey, buffer, file.type),
      );

      // Extract text for search (if document)
      const searchText = await withSpan(
        { layer: "content", name: "extract_text" },
        { attrs: { mime: file.type || "octet-stream", ocr: enableOCR } },
        async (span) => {
          const { DocumentExtractor } = await import("@/lib/infrastructure/media/document-extractor");
          const documentExtractor = new DocumentExtractor(storageProvider, enableOCR);
          const text = await documentExtractor.extractText(storageKey, file.type);
          span.attr("text_chars", text.length).summary(`${text.length} chars extracted`);
          return text;
        },
      );

      // Check for duplicate file (by checksum)
      const existingFile = await prisma.filePayload.findFirst({
        where: {
          checksum,
          fileSize: BigInt(file.size),
          content: { ownerId: session.user.id },
          uploadStatus: { in: ["uploading", "ready"] },
        },
        include: { content: true },
      });

      let finalFileName = file.name;
      let isDuplicateFile = false;

      if (existingFile) {
        isDuplicateFile = true;

        const extensionMatch = file.name.match(/^(.+)(\.[^.]+)$/);
        const baseName = extensionMatch ? extensionMatch[1] : file.name;
        const extension = extensionMatch ? extensionMatch[2] : "";

        let counter = 1;
        let candidateName = `${baseName} (${counter})${extension}`;

        while (true) {
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

          if (counter > 100) {
            throw new Error("Too many duplicate files with the same content");
          }
        }

        logger.info({
          layer: "content",
          event: "upload:duplicate_renamed",
          summary: `renamed copy (#${counter})`,
          attrs: { counter },
        });
      }

      const { content, attempts } = await withSpan(
        { layer: "content", name: "create" },
        { attrs: { kind: "file", ext: fileExtension } },
        async (span) => {
          let slug = await generateUniqueSlug(finalFileName, session.user.id);
          let created;
          let attempt = 0;
          const maxAttempts = 3;

          while (attempt < maxAttempts) {
            attempt++;

            try {
              created = await prisma.contentNode.create({
                data: {
                  ownerId: session.user.id,
                  title: finalFileName,
                  slug,
                  contentType: "file",
                  parentId: parentId || null,
                  peopleGroupId: resolvedPeopleGroupId,
                  personId: resolvedPersonId,
                  role: role || "primary",
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
              span.attr("attempts", attempt).attr("content_id", created.id);
              await spanPayload(span, "uploaded_content", created);
              return { content: created, attempts: attempt };
            } catch (error: unknown) {
              const prismaError = error as { code?: string; meta?: { target?: string[] } };
              if (prismaError.code === "P2002" && prismaError.meta?.target?.includes("slug")) {
                if (attempt < maxAttempts) {
                  const ts = Date.now();
                  const randomSuffix = crypto.randomBytes(4).toString("hex");
                  slug = `${await generateUniqueSlug(finalFileName, session.user.id)}-${ts}-${randomSuffix}`;
                  logger.warn({
                    layer: "content",
                    event: "create:slug_retry",
                    summary: `attempt ${attempt}/${maxAttempts}`,
                    attrs: { attempt, max: maxAttempts },
                  });
                  continue;
                } else {
                  throw new Error(
                    "Unable to create unique file name. Please rename the file and try again."
                  );
                }
              }
              throw error;
            }
          }
          throw new Error("Failed to create content after retries");
        },
      );

      return NextResponse.json(
        {
          success: true,
          data: {
            contentId: content.id,
            fileName: finalFileName,
            fileSize: file.size,
            searchTextLength: searchText.length,
            storageProvider: usedProvider,
            slug: content.slug,
            isDuplicate: isDuplicateFile,
            retriedSlug: attempts > 1,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      // Note: previous logs included error.stack — audit sev-3. Logger's
      // error field omits stack in production by design.
      logger.error({
        layer: "storage",
        event: "upload_simple:caught",
        summary: "upload failed — 500",
        error,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to upload file",
            details: error instanceof Error ? error.message : String(error),
          },
        },
        { status: 500 }
      );
    }
  });
}
