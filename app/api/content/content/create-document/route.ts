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
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/content/create-document";

/**
 * Permissive UUID regex (v1-v5). Used to short-circuit obviously-bad
 * parentId values before they reach Prisma — specifically the
 * `temp-{ts}-{rand}` placeholder ids the file-tree's optimistic-insert
 * flow uses for not-yet-persisted parents.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = await request.json();

      const {
        fileName,
        fileType,
        parentId = null,
        peopleGroupId = null,
        personId = null,
        provider = null,
      }: {
        fileName: string;
        fileType: "docx" | "xlsx" | "json";
        parentId?: string | null;
        peopleGroupId?: string | null;
        personId?: string | null;
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

      let resolvedPeopleGroupId = peopleGroupId;
      let resolvedPersonId = personId;

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
              error: {
                code: "NOT_FOUND",
                message: "People group not found",
              },
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
              error: {
                code: "NOT_FOUND",
                message: "Person not found",
              },
            },
            { status: 404 }
          );
        }
      }

      if (parentId) {
        // Guard against the optimistic-create race in the file tree: when
        // a child is requested while the parent's row hasn't been created
        // yet, the client still has a "temp-{timestamp}-{rand}" placeholder
        // id for the parent. Without this guard, Prisma would dispatch the
        // string to PostgreSQL and the user sees a raw "invalid input
        // syntax for type uuid" dialog. Return a tractable 400 instead.
        if (!UUID_RE.test(parentId)) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "PARENT_NOT_READY",
                message:
                  "Parent folder is still being created — try again in a moment.",
              },
            },
            { status: 400 },
          );
        }
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
              error: {
                code: "NOT_FOUND",
                message: "Parent not found",
              },
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

      // fileName is user-authored — not logged in attrs.
      const finalFileName = fileName;
      const extension = `.${fileType}`;

      // Generate blank document or JSON file
      const buffer = await withSpan(
        { layer: "content", name: "blank_generate" },
        { attrs: { kind: fileType } },
        async (span) => {
          let buf: Buffer;
          if (fileType === "json") {
            buf = Buffer.from("{}", "utf-8");
          } else {
            buf = await createBlankOfficeDocument(fileType as "docx" | "xlsx", finalFileName);
          }
          span.attr("bytes", buf.length).summary(`${buf.length} bytes`);
          return buf;
        },
      );
      const fileSize = buffer.length;

      const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

      const timestamp = Date.now();
      const storageKey = `uploads/${session.user.id}/${timestamp}-${crypto.randomBytes(8).toString("hex")}${extension}`;

      const usedProvider = provider || "r2";
      const mimeType =
        fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : fileType === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/json";

      await withSpan(
        { layer: "storage", name: "upload" },
        { attrs: { provider: usedProvider, bytes: fileSize, mime: mimeType } },
        async (span) => {
          const storageProvider = await getUserStorageProvider(
            session.user.id,
            provider || undefined,
          );
          await storageProvider.uploadFile(storageKey, buffer, mimeType);
          span.summary(`${fileSize} bytes uploaded`);
        },
      );

      // Place at the top by setting displayOrder one less than the minimum sibling.
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
      const content = await withSpan(
        { layer: "content", name: "create" },
        { attrs: { kind: "file", ext: fileType } },
        async (span) => {
          let slug = await generateUniqueSlug(finalFileName, session.user.id);
          let attempts = 0;
          const maxAttempts = 3;

          while (attempts < maxAttempts) {
            attempts++;

            try {
              const created = await prisma.contentNode.create({
                data: {
                  ownerId: session.user.id,
                  title: finalFileName,
                  slug,
                  contentType: "file",
                  parentId: parentId || null,
                  peopleGroupId: resolvedPeopleGroupId,
                  personId: resolvedPersonId,
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
                      searchText: "",
                      uploadStatus: "ready",
                      uploadedAt: new Date(),
                      isProcessed: false,
                      processingStatus: "none",
                    },
                  },
                },
              });
              span.attr("attempts", attempts).attr("content_id", created.id).summary(`${fileType} created`);
              await spanPayload(span, "created_document", created);
              return created;
            } catch (error: unknown) {
              const prismaError = error as { code?: string; meta?: { target?: string[] } };
              if (prismaError.code === "P2002" && prismaError.meta?.target?.includes("slug")) {
                if (attempts < maxAttempts) {
                  const ts = Date.now();
                  const randomSuffix = crypto.randomBytes(4).toString("hex");
                  slug = `${await generateUniqueSlug(finalFileName, session.user.id)}-${ts}-${randomSuffix}`;
                  logger.warn({
                    layer: "content",
                    event: "create:slug_retry",
                    summary: `attempt ${attempts}/${maxAttempts}`,
                    attrs: { attempt: attempts, max: maxAttempts },
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
            id: content.id,
            fileName: finalFileName,
            fileType,
            fileSize,
            slug: content.slug,
            storageProvider: usedProvider,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      // Note: previous logs included error.stack — audit sev-3. Logger's
      // error field omits stack in production by design; dev pretty printer
      // still shows the error name/message.
      logger.error({
        layer: "content",
        event: "create_document:caught",
        summary: "create-document failed — 500",
        error,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to create document",
            details: error instanceof Error ? error.message : String(error),
          },
        },
        { status: 500 }
      );
    }
  });
}
