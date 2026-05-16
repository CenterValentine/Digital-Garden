/**
 * Content API - Individual Item Operations
 *
 * GET    /api/content/content/[id] - Get content by ID
 * PATCH  /api/content/content/[id] - Update content
 * DELETE /api/content/content/[id] - Delete content (soft delete)
 *
 * Phase 2 vertical slice: all three handlers run under withRouteTrace
 * with nested spans for auth / content / access / write paths.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getOptionalBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  generateUniqueSlug,
  extractSearchTextFromTipTap,
  extractSearchTextFromHtml,
  extractSearchTextFromCode,
  markdownToTiptap,
  CONTENT_WITH_PAYLOADS,
} from "@/lib/domain/content";
import { normalizeUrl } from "@/lib/domain/content/external-validation";
import { syncContentTags } from "@/lib/domain/content/tag-sync";
import { syncImageReferences } from "@/lib/domain/content/image-refs";
import { syncPersonMentions } from "@/lib/domain/content/person-mention-sync";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { ensureWebResourceForExternalContent } from "@/lib/domain/browser-extension";
import type { JSONContent } from "@tiptap/core";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";
import type {
  ContentDetailResponse,
  UpdateContentRequest,
} from "@/lib/domain/content/api-types";
import type { StoredChatMessage } from "@/lib/domain/ai/types";

type Params = Promise<{ id: string }>;

const ROUTE_PATH = "/api/content/content/[id]";

async function getRequestUserId(request: NextRequest) {
  const extensionAuth = await getOptionalBrowserExtensionBearerAuth(request);
  if (extensionAuth?.user?.id) {
    return extensionAuth.user.id;
  }

  const session = await requireAuth();
  return session.user.id;
}

function getExternalDomainParts(url: string) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const parts = hostname.split(".").filter(Boolean);
    return {
      hostname,
      domain:
        parts.length >= 2
          ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
          : hostname,
    };
  } catch {
    return { hostname: null, domain: null };
  }
}

function formatExternalResponse(payload: {
  url: string;
  subtype: string | null;
  normalizedUrl: string | null;
  canonicalUrl: string | null;
  readingStatus: "inbox" | "queue" | "reading" | "read" | "archived";
  description: string | null;
  resourceType: string | null;
  resourceRelationship: string | null;
  userIntent: string | null;
  sourceDomain: string | null;
  sourceHostname: string | null;
  faviconUrl: string | null;
  preserveHtml: boolean;
  preservedHtmlSnapshot: unknown;
  preservedHtmlCapturedAt: Date | null;
  captureMetadata: unknown;
  matchMetadata: unknown;
  preview: unknown;
}) {
  return {
    url: payload.url,
    subtype: payload.subtype || "website",
    normalizedUrl: payload.normalizedUrl,
    canonicalUrl: payload.canonicalUrl,
    readingStatus: payload.readingStatus,
    description: payload.description,
    resourceType: payload.resourceType,
    resourceRelationship: payload.resourceRelationship,
    userIntent: payload.userIntent,
    sourceDomain: payload.sourceDomain,
    sourceHostname: payload.sourceHostname,
    faviconUrl: payload.faviconUrl,
    preserveHtml: payload.preserveHtml,
    preservedHtmlSnapshot: payload.preservedHtmlSnapshot as Record<string, unknown> | null,
    preservedHtmlCapturedAt: payload.preservedHtmlCapturedAt,
    captureMetadata: payload.captureMetadata as Record<string, unknown>,
    matchMetadata: payload.matchMetadata as Record<string, unknown>,
    preview: payload.preview as Record<string, unknown>,
  };
}

// ============================================================
// GET /api/content/content/[id] - Get Content
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;

      const userId = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => getRequestUserId(request),
      );

      const content = await withSpan(
        { layer: "content", name: "payload" },
        { attrs: { content_id: id }, summary: id },
        async (span) => {
          const result = await prisma.contentNode.findUnique({
            where: { id },
            include: {
              ...CONTENT_WITH_PAYLOADS,
              // Path A: include the owning note (if any) so the standalone viewer
              // can render read-only and link back. Kept inline to avoid widening
              // CONTENT_WITH_PAYLOADS for every caller.
              ownedByNote: { select: { id: true, title: true } },
            },
          });
          if (result) {
            span
              .attr("kind", result.contentType)
              .summary(`${id} ${result.contentType}`);
            await spanPayload(span, "content_response", result);
          } else {
            span.attr("found", false).summary(`${id} not found`);
          }
          return result;
        },
      );

      if (!content) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Content not found",
            },
          },
          { status: 404 }
        );
      }

      const accessGranted = await withSpan(
        { layer: "content", name: "access" },
        { attrs: { content_id: id, require: "view" } },
        async (span) => {
          try {
            await resolveContentAccess(prisma, {
              contentId: id,
              userId,
              require: "view",
            });
            span.attr("granted", true);
            return true;
          } catch {
            span.attr("granted", false).summary("denied");
            return false;
          }
        },
      );

      if (!accessGranted) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Access denied",
            },
          },
          { status: 403 }
        );
      }

      // Format response
      const response: ContentDetailResponse = {
        id: content.id,
        ownerId: content.ownerId,
        title: content.title,
        slug: content.slug,
        parentId: content.parentId,
        categoryId: content.categoryId,
        displayOrder: content.displayOrder,
        isPublished: content.isPublished,
        customIcon: content.customIcon,
        iconColor: content.iconColor,
        contentType: content.contentType,
        createdAt: content.createdAt,
        updatedAt: content.updatedAt,
        deletedAt: content.deletedAt,
        ownedByNoteId: content.ownedByNoteId,
        ownedByNote: content.ownedByNote
          ? { id: content.ownedByNote.id, title: content.ownedByNote.title }
          : null,
      };

      // Include full payload data
      if (content.notePayload) {
        response.note = {
          tiptapJson: content.notePayload.tiptapJson as Record<string, unknown>,
          searchText: content.notePayload.searchText,
          metadata: content.notePayload.metadata as Record<string, unknown>,
        };
      }
      if (content.filePayload) {
        response.file = {
          fileName: content.filePayload.fileName,
          fileExtension: content.filePayload.fileExtension,
          mimeType: content.filePayload.mimeType,
          fileSize: content.filePayload.fileSize.toString(),
          checksum: content.filePayload.checksum,
          storageProvider: content.filePayload.storageProvider,
          storageKey: content.filePayload.storageKey,
          storageUrl: content.filePayload.storageUrl,
          storageMetadata: content.filePayload.storageMetadata as Record<string, unknown>,
          uploadStatus: content.filePayload.uploadStatus,
          uploadedAt: content.filePayload.uploadedAt,
          uploadError: content.filePayload.uploadError,
          thumbnailUrl: content.filePayload.thumbnailUrl,
          width: content.filePayload.width,
          height: content.filePayload.height,
          duration: content.filePayload.duration,
        };
      }
      if (content.htmlPayload) {
        response.html = {
          html: content.htmlPayload.html,
          isTemplate: content.htmlPayload.isTemplate,
          templateSchema: content.htmlPayload.templateSchema as Record<string, unknown>,
          templateMetadata: content.htmlPayload.templateMetadata as Record<string, unknown>,
          renderMode: content.htmlPayload.renderMode,
          templateEngine: content.htmlPayload.templateEngine,
        };
      }
      if (content.codePayload) {
        response.code = {
          code: content.codePayload.code,
          language: content.codePayload.language,
          metadata: content.codePayload.metadata as Record<string, unknown>,
        };
      }
      // Phase 2: Folder payload
      if (content.folderPayload) {
        response.folder = {
          viewMode: content.folderPayload.viewMode,
          sortMode: content.folderPayload.sortMode,
          viewPrefs: content.folderPayload.viewPrefs as Record<string, unknown>,
          includeReferencedContent: content.folderPayload.includeReferencedContent,
        };
      }
      // Phase 2: External payload
      if (content.externalPayload) {
        response.external = formatExternalResponse(content.externalPayload);
      }
      // Visualization payload
      if (content.visualizationPayload) {
        response.visualization = {
          engine: content.visualizationPayload.engine,
          config: content.visualizationPayload.config as Record<string, unknown>,
          data: content.visualizationPayload.data as Record<string, unknown>,
        };
      }
      // Chat payload
      if (content.chatPayload) {
        response.chat = {
          messages: (content.chatPayload.messages ?? []) as unknown as StoredChatMessage[],
          metadata: (content.chatPayload.metadata ?? {}) as Record<string, unknown>,
        };
      }

      return NextResponse.json({
        success: true,
        data: response,
      });
    } catch (error) {
      logger.error({
        event: "request:caught",
        summary: "GET caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to fetch content",
          },
        },
        { status: 500 }
      );
    }
  });
}

// ============================================================
// PATCH /api/content/content/[id] - Update Content
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const body = (await request.json()) as UpdateContentRequest;

      const userId = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => getRequestUserId(request),
      );

      const existing = await withSpan(
        { layer: "content", name: "payload" },
        { attrs: { content_id: id }, summary: id },
        async (span) => {
          await spanPayload(span, "incoming_body", body);
          const result = await prisma.contentNode.findUnique({
            where: { id },
            include: CONTENT_WITH_PAYLOADS,
          });
          if (result) {
            span
              .attr("kind", result.contentType)
              .summary(`${id} ${result.contentType}`);
            await spanPayload(span, "existing_content", result);
          } else {
            span.attr("found", false).summary(`${id} not found`);
          }
          return result;
        },
      );

      if (!existing) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Content not found",
            },
          },
          { status: 404 }
        );
      }

      const accessGranted = await withSpan(
        { layer: "content", name: "access" },
        { attrs: { content_id: id, require: "edit" } },
        async (span) => {
          try {
            await resolveContentAccess(prisma, {
              contentId: id,
              userId,
              require: "edit",
            });
            span.attr("granted", true);
            return true;
          } catch {
            span.attr("granted", false).summary("denied");
            return false;
          }
        },
      );

      if (!accessGranted) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Access denied",
            },
          },
          { status: 403 }
        );
      }

      const {
        title,
        parentId,
        categoryId,
        isPublished,
        tiptapJson,
        markdown,
        html,
        code,
        language,
        customIcon,
        iconColor,
        displayOrder,
        url, // Phase 2: External link URL
        canonicalUrl,
        faviconUrl,
        readingStatus,
        description,
        resourceType,
        resourceRelationship,
        userIntent,
        preserveHtml,
        preservedHtmlSnapshot,
        captureMetadata,
        matchMetadata,
        viewMode, // Phase 2: Folder view mode
        sortMode, // Phase 2: Folder sort mode
        includeReferencedContent, // Phase 2: Folder referenced content
        viewPrefs, // Phase 2: Folder view preferences
        visualizationData, // Visualization payload data (engine-specific)
        chatMessages, // Chat payload messages
        chatMetadata, // Chat payload metadata
      } = body;

      // Prepare update data
      const updateData: Record<string, unknown> = {};

      if (title !== undefined) {
        if (!title || title.trim().length === 0) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Title cannot be empty",
              },
            },
            { status: 400 }
          );
        }
        if (title.length > 255) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Title must be 255 characters or less",
              },
            },
            { status: 400 }
          );
        }
        updateData.title = title;

        // Regenerate slug if title changed
        if (title !== existing.title) {
          updateData.slug = await generateUniqueSlug(title, userId, id);
        }
      }

      if (parentId !== undefined) {
        updateData.parentId = parentId;
      }
      if (categoryId !== undefined) {
        updateData.categoryId = categoryId;
      }
      if (isPublished !== undefined) {
        if (existing.ownerId !== userId) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: "Only the content owner can change public sharing",
              },
            },
            { status: 403 }
          );
        }
        updateData.isPublished = isPublished;
      }
      if (customIcon !== undefined) {
        updateData.customIcon = customIcon;
      }
      if (iconColor !== undefined) {
        updateData.iconColor = iconColor;
      }
      if (displayOrder !== undefined) {
        updateData.displayOrder = displayOrder;
      }

      const updated = await withSpan(
        { layer: "content", name: "write" },
        { attrs: { content_id: id } },
        async (span) => {
          let writeCount = 0;

          // Update payload data (upsert: create NotePayload if it doesn't exist)
          if (tiptapJson || markdown) {
            const parsedJson: JSONContent = markdown
              ? markdownToTiptap(markdown)
              : (tiptapJson as JSONContent);
            const json = sanitizeTipTapJsonWithExtensions(
              parsedJson,
              getServerExtensions()
            ).json;

            const searchText = extractSearchTextFromTipTap(json);
            const wordCount = searchText.split(/\s+/).filter(Boolean).length;
            const readingTime = Math.ceil(wordCount / 200);

            await prisma.notePayload.upsert({
              where: { contentId: id },
              update: {
                tiptapJson: json,
                searchText,
                metadata: {
                  wordCount,
                  characterCount: searchText.length,
                  readingTime,
                },
              },
              create: {
                contentId: id,
                tiptapJson: json,
                searchText,
                metadata: {
                  wordCount,
                  characterCount: searchText.length,
                  readingTime,
                },
              },
            });
            writeCount++;
            span.attr("note_word_count", wordCount);

            // M6: Extract and sync tags from content
            await syncContentTags(id, json, userId);

            // Sprint 37: Sync image references (ContentLink with linkType "image-ref")
            await syncImageReferences(id, json, userId);

            await syncPersonMentions(id, json, userId);
          }

          if (existing.htmlPayload && html !== undefined) {
            const searchText = extractSearchTextFromHtml(html);

            await prisma.htmlPayload.update({
              where: { contentId: id },
              data: {
                html,
                searchText,
              },
            });
            writeCount++;
          }

          if (existing.codePayload && code !== undefined) {
            const lang = language || existing.codePayload.language;
            const searchText = extractSearchTextFromCode(code, lang);

            await prisma.codePayload.update({
              where: { contentId: id },
              data: {
                code,
                language: lang,
                searchText,
              },
            });
            writeCount++;
          }

          // Phase 2: Update external link metadata
          if (
            existing.externalPayload &&
            (
              url !== undefined ||
              canonicalUrl !== undefined ||
              faviconUrl !== undefined ||
              readingStatus !== undefined ||
              description !== undefined ||
              resourceType !== undefined ||
              resourceRelationship !== undefined ||
              userIntent !== undefined ||
              preserveHtml !== undefined ||
              preservedHtmlSnapshot !== undefined ||
              captureMetadata !== undefined ||
              matchMetadata !== undefined
            )
          ) {
            const resolvedUrl = url ?? existing.externalPayload.url;
            const normalizedUrl = normalizeUrl(resolvedUrl);
            const resolvedCanonicalUrl =
              canonicalUrl !== undefined
                ? canonicalUrl
                  ? normalizeUrl(canonicalUrl)
                  : null
                : existing.externalPayload.canonicalUrl ?? normalizedUrl;
            const domainParts = getExternalDomainParts(
              resolvedCanonicalUrl || normalizedUrl
            );
            await prisma.externalPayload.update({
              where: { contentId: id },
              data: {
                url: resolvedUrl,
                normalizedUrl,
                canonicalUrl: resolvedCanonicalUrl,
                readingStatus: readingStatus || existing.externalPayload.readingStatus,
                description:
                  description !== undefined
                    ? description?.trim() || null
                    : existing.externalPayload.description,
                resourceType:
                  resourceType !== undefined
                    ? resourceType?.trim() || null
                    : existing.externalPayload.resourceType,
                resourceRelationship:
                  resourceRelationship !== undefined
                    ? resourceRelationship?.trim() || null
                    : existing.externalPayload.resourceRelationship,
                userIntent:
                  userIntent !== undefined
                    ? userIntent?.trim() || null
                    : existing.externalPayload.userIntent,
                sourceDomain: domainParts.domain,
                sourceHostname: domainParts.hostname,
                faviconUrl:
                  faviconUrl !== undefined ? faviconUrl : existing.externalPayload.faviconUrl,
                preserveHtml:
                  preserveHtml !== undefined
                    ? preserveHtml
                    : existing.externalPayload.preserveHtml,
                preservedHtmlSnapshot:
                  preservedHtmlSnapshot !== undefined
                    ? (preservedHtmlSnapshot as Prisma.InputJsonValue)
                    : existing.externalPayload.preservedHtmlSnapshot,
                preservedHtmlCapturedAt:
                  preserveHtml && preservedHtmlSnapshot ? new Date() : undefined,
                captureMetadata:
                  captureMetadata !== undefined
                    ? (captureMetadata as Prisma.InputJsonValue)
                    : existing.externalPayload.captureMetadata,
                matchMetadata:
                  matchMetadata !== undefined
                    ? (matchMetadata as Prisma.InputJsonValue)
                    : existing.externalPayload.matchMetadata,
                subtype:
                  preserveHtml !== undefined
                    ? preserveHtml
                      ? "preserved-html"
                      : "website"
                    : undefined,
              },
            });

            await ensureWebResourceForExternalContent(userId, {
              contentId: id,
              url: resolvedUrl,
              canonicalUrl: resolvedCanonicalUrl,
              title: (typeof title === "string" ? title.trim() : "") || existing.title,
              faviconUrl:
                faviconUrl !== undefined ? faviconUrl : existing.externalPayload.faviconUrl,
            });
            writeCount++;
          }

          // Phase 2: Update folder payload
          if (existing.folderPayload) {
            const folderUpdateData: Record<string, unknown> = {};

            if (viewMode !== undefined) {
              folderUpdateData.viewMode = viewMode;
            }
            if (sortMode !== undefined) {
              folderUpdateData.sortMode = sortMode;
            }
            if (includeReferencedContent !== undefined) {
              folderUpdateData.includeReferencedContent = includeReferencedContent;
            }
            if (viewPrefs !== undefined) {
              folderUpdateData.viewPrefs = viewPrefs;
            }

            if (Object.keys(folderUpdateData).length > 0) {
              await prisma.folderPayload.update({
                where: { contentId: id },
                data: folderUpdateData,
              });
              writeCount++;
            }
          }

          // Update visualization payload
          if (existing.visualizationPayload && visualizationData !== undefined) {
            await prisma.visualizationPayload.update({
              where: { contentId: id },
              data: {
                data: visualizationData as Prisma.InputJsonValue, // Cast to any for JSON type compatibility
                updatedAt: new Date(),
              },
            });
            writeCount++;
          }

          // Update chat payload (upsert: create if it doesn't exist)
          if (chatMessages !== undefined || chatMetadata !== undefined) {
            await prisma.chatPayload.upsert({
              where: { contentId: id },
              update: {
                ...(chatMessages !== undefined && { messages: chatMessages as unknown as Prisma.InputJsonValue }),
                ...(chatMetadata !== undefined && { metadata: chatMetadata as Prisma.InputJsonValue }),
              },
              create: {
                contentId: id,
                messages: (chatMessages ?? []) as unknown as Prisma.InputJsonValue,
                metadata: (chatMetadata ?? {}) as Prisma.InputJsonValue,
              },
            });
            writeCount++;
          }

          // Update content node only when top-level metadata actually changed.
          // Pure payload saves should not bump ContentNode.updatedAt, because that
          // timestamp is too coarse for worklog-style activity summaries.
          const result =
            Object.keys(updateData).length > 0
              ? await prisma.contentNode.update({
                  where: { id },
                  data: updateData,
                  include: CONTENT_WITH_PAYLOADS,
                })
              : await prisma.contentNode.findUnique({
                  where: { id },
                  include: CONTENT_WITH_PAYLOADS,
                });

          if (Object.keys(updateData).length > 0) writeCount++;
          span.attr("writes", writeCount).summary(`${writeCount} writes`);
          return result;
        },
      );

      if (!updated) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Content not found",
            },
          },
          { status: 404 }
        );
      }

      // If this is a file with Google Drive integration, rename the Google Drive file
      if (title && title !== existing.title && existing.filePayload) {
        // Narrow shape for Google Drive integration metadata stored under
        // storageMetadata.externalProviders.googleDrive.
        const metadata = existing.filePayload.storageMetadata as {
          externalProviders?: { googleDrive?: { fileId?: string } };
        } | null;
        const googleDriveFileId = metadata?.externalProviders?.googleDrive?.fileId;

        if (googleDriveFileId) {
          await withSpan(
            { layer: "external", name: "google_drive_rename" },
            {
              attrs: { content_id: id, file_id: googleDriveFileId },
              summary: "rename via Google Drive",
            },
            async (span) => {
              try {
                // Call Google Drive rename API
                const renameResponse = await fetch(
                  `${request.nextUrl.origin}/api/google-drive/rename`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      // Forward cookies for authentication
                      cookie: request.headers.get("cookie") || "",
                    },
                    body: JSON.stringify({
                      fileId: googleDriveFileId,
                      newFileName: title,
                      contentId: id,
                    }),
                  }
                );

                span.attr("status", renameResponse.status);
                if (!renameResponse.ok) {
                  // External API error envelope can contain path strings — log
                  // the code/status but not the raw error object body.
                  span.attr("ok", false).summary("rename failed (non-fatal)");
                  logger.warn({
                    event: "rename:failed",
                    summary: `status ${renameResponse.status}`,
                    attrs: { status: renameResponse.status },
                  });
                  // Don't fail the entire request if Google Drive rename fails.
                  // The local file is already renamed successfully.
                } else {
                  span.attr("ok", true).summary("renamed");
                }
              } catch (error) {
                // Don't fail the entire request — log the error and continue.
                // The local file is already renamed successfully.
                logger.warn({
                  event: "rename:exception",
                  summary: "Google Drive rename threw (non-fatal)",
                  error,
                });
                span.attr("ok", false).summary("rename threw (non-fatal)");
              }
            },
          );
        }
      }

      // Format response
      const response: ContentDetailResponse = {
        id: updated.id,
        ownerId: updated.ownerId,
        title: updated.title,
        slug: updated.slug,
        parentId: updated.parentId,
        categoryId: updated.categoryId,
        displayOrder: updated.displayOrder,
        isPublished: updated.isPublished,
        customIcon: updated.customIcon,
        iconColor: updated.iconColor,
        contentType: updated.contentType,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        deletedAt: updated.deletedAt,
      };

      // Include payload data
      if (updated.folderPayload) {
        response.folder = {
          viewMode: updated.folderPayload.viewMode,
          sortMode: updated.folderPayload.sortMode,
          viewPrefs: updated.folderPayload.viewPrefs as Record<string, unknown>,
          includeReferencedContent: updated.folderPayload.includeReferencedContent,
        };
      }
      if (updated.notePayload) {
        response.note = {
          tiptapJson: updated.notePayload.tiptapJson as Record<string, unknown>,
          searchText: updated.notePayload.searchText,
          metadata: updated.notePayload.metadata as Record<string, unknown>,
        };
      }
      if (updated.htmlPayload) {
        response.html = {
          html: updated.htmlPayload.html,
          isTemplate: updated.htmlPayload.isTemplate,
          templateSchema: updated.htmlPayload.templateSchema as Record<string, unknown>,
          templateMetadata: updated.htmlPayload.templateMetadata as Record<string, unknown>,
          renderMode: updated.htmlPayload.renderMode,
          templateEngine: updated.htmlPayload.templateEngine,
        };
      }
      if (updated.codePayload) {
        response.code = {
          code: updated.codePayload.code,
          language: updated.codePayload.language,
          metadata: updated.codePayload.metadata as Record<string, unknown>,
        };
      }
      if (updated.externalPayload) {
        response.external = formatExternalResponse(updated.externalPayload);
      }
      if (updated.chatPayload) {
        response.chat = {
          messages: (updated.chatPayload.messages ?? []) as unknown as StoredChatMessage[],
          metadata: (updated.chatPayload.metadata ?? {}) as Record<string, unknown>,
        };
      }

      return NextResponse.json({
        success: true,
        data: response,
      });
    } catch (error) {
      logger.error({
        event: "request:caught",
        summary: "PATCH caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to update content",
          },
        },
        { status: 500 }
      );
    }
  });
}

// ============================================================
// DELETE /api/content/content/[id] - Delete Content (Soft Delete)
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;

      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const existing = await withSpan(
        { layer: "content", name: "payload" },
        { attrs: { content_id: id }, summary: id },
        async (span) => {
          const result = await prisma.contentNode.findUnique({
            where: { id },
            include: {
              children: {
                select: { id: true },
              },
            },
          });
          if (result) {
            span
              .attr("kind", result.contentType)
              .attr("has_children", result.children.length > 0)
              .summary(`${id} ${result.contentType}`);
          } else {
            span.attr("found", false).summary(`${id} not found`);
          }
          return result;
        },
      );

      if (!existing) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Content not found",
            },
          },
          { status: 404 }
        );
      }

      // Check ownership
      if (existing.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Access denied",
            },
          },
          { status: 403 }
        );
      }

      // Soft delete (move to trash)
      const now = new Date();
      const scheduledDeletion = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000
      ); // 30 days

      await withSpan(
        { layer: "content", name: "soft_delete" },
        { attrs: { content_id: id }, summary: "trash + 30d schedule" },
        async () => {
          await prisma.$transaction([
            // Mark as deleted
            prisma.contentNode.update({
              where: { id },
              data: {
                deletedAt: now,
                deletedBy: session.user.id,
              },
            }),

            // Create trash bin entry
            prisma.trashBin.create({
              data: {
                contentId: id,
                deletedBy: session.user.id,
                scheduledDeletion,
                contentSnapshot: {
                  title: existing.title,
                  slug: existing.slug,
                  parentId: existing.parentId,
                  hasChildren: existing.children.length > 0,
                },
              },
            }),
          ]);
        },
      );

      return NextResponse.json({
        success: true,
        data: {
          id,
          deletedAt: now,
          scheduledDeletion,
          message:
            "Content moved to trash. Will be permanently deleted in 30 days.",
        },
      });
    } catch (error) {
      logger.error({
        event: "request:caught",
        summary: "DELETE caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to delete content",
          },
        },
        { status: 500 }
      );
    }
  });
}

// syncContentTags extracted to lib/domain/content/tag-sync.ts for reuse by import service
