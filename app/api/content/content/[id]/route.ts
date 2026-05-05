/**
 * Content API - Individual Item Operations
 *
 * GET    /api/content/content/[id] - Get content by ID
 * PATCH  /api/content/content/[id] - Update content
 * DELETE /api/content/content/[id] - Delete content (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
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
import type {
  ContentDetailResponse,
  UpdateContentRequest,
} from "@/lib/domain/content/api-types";

type Params = Promise<{ id: string }>;

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
    preservedHtmlSnapshot: payload.preservedHtmlSnapshot as any,
    preservedHtmlCapturedAt: payload.preservedHtmlCapturedAt,
    captureMetadata: payload.captureMetadata as any,
    matchMetadata: payload.matchMetadata as any,
    preview: payload.preview as any,
  };
}

// ============================================================
// GET /api/content/content/[id] - Get Content
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const userId = await getRequestUserId(request);
    const { id } = await params;

    const content = await prisma.contentNode.findUnique({
      where: { id },
      include: {
        ...CONTENT_WITH_PAYLOADS,
        // Path A: include the owning note (if any) so the standalone viewer
        // can render read-only and link back. Kept inline to avoid widening
        // CONTENT_WITH_PAYLOADS for every caller.
        ownedByNote: { select: { id: true, title: true } },
      },
    });

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

    try {
      await resolveContentAccess(prisma, {
        contentId: id,
        userId,
        require: "view",
      });
    } catch {
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
        tiptapJson: content.notePayload.tiptapJson as any,
        searchText: content.notePayload.searchText,
        metadata: content.notePayload.metadata as any,
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
        storageMetadata: content.filePayload.storageMetadata as any,
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
        templateSchema: content.htmlPayload.templateSchema as any,
        templateMetadata: content.htmlPayload.templateMetadata as any,
        renderMode: content.htmlPayload.renderMode,
        templateEngine: content.htmlPayload.templateEngine,
      };
    }
    if (content.codePayload) {
      response.code = {
        code: content.codePayload.code,
        language: content.codePayload.language,
        metadata: content.codePayload.metadata as any,
      };
    }
    // Phase 2: Folder payload
    if (content.folderPayload) {
      response.folder = {
        viewMode: content.folderPayload.viewMode,
        sortMode: content.folderPayload.sortMode,
        viewPrefs: content.folderPayload.viewPrefs as any,
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
        config: content.visualizationPayload.config as any,
        data: content.visualizationPayload.data as any,
      };
    }
    // Chat payload
    if (content.chatPayload) {
      response.chat = {
        messages: (content.chatPayload.messages ?? []) as any,
        metadata: (content.chatPayload.metadata ?? {}) as any,
      };
    }

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error(`GET /api/content/content/[id] error:`, error);
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
}

// ============================================================
// PATCH /api/content/content/[id] - Update Content
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const userId = await getRequestUserId(request);
    const { id } = await params;
    const body = (await request.json()) as UpdateContentRequest;

    // Fetch existing content
    const existing = await prisma.contentNode.findUnique({
      where: { id },
      include: CONTENT_WITH_PAYLOADS,
    });

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

    try {
      await resolveContentAccess(prisma, {
        contentId: id,
        userId,
        require: "edit",
      });
    } catch {
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
              ? (preservedHtmlSnapshot as any)
              : existing.externalPayload.preservedHtmlSnapshot,
          preservedHtmlCapturedAt:
            preserveHtml && preservedHtmlSnapshot ? new Date() : undefined,
          captureMetadata:
            captureMetadata !== undefined
              ? (captureMetadata as any)
              : existing.externalPayload.captureMetadata,
          matchMetadata:
            matchMetadata !== undefined
              ? (matchMetadata as any)
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
      }
    }

    // Update visualization payload
    if (existing.visualizationPayload && visualizationData !== undefined) {
      await prisma.visualizationPayload.update({
        where: { contentId: id },
        data: {
          data: visualizationData as any, // Cast to any for JSON type compatibility
          updatedAt: new Date(),
        },
      });
    }

    // Update chat payload (upsert: create if it doesn't exist)
    if (chatMessages !== undefined || chatMetadata !== undefined) {
      await prisma.chatPayload.upsert({
        where: { contentId: id },
        update: {
          ...(chatMessages !== undefined && { messages: chatMessages as any }),
          ...(chatMetadata !== undefined && { metadata: chatMetadata as any }),
        },
        create: {
          contentId: id,
          messages: (chatMessages ?? []) as any,
          metadata: (chatMetadata ?? {}) as any,
        },
      });
    }

    // Update content node only when top-level metadata actually changed.
    // Pure payload saves should not bump ContentNode.updatedAt, because that
    // timestamp is too coarse for worklog-style activity summaries.
    const updated =
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
      const metadata = existing.filePayload.storageMetadata as any;
      const googleDriveFileId = metadata?.externalProviders?.googleDrive?.fileId;

      if (googleDriveFileId) {
        console.log(`[PATCH Content] File renamed, syncing to Google Drive...`);
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

          if (!renameResponse.ok) {
            const errorData = await renameResponse.json();
            console.error("[PATCH Content] Google Drive rename failed:", errorData.error);
            // Don't fail the entire request if Google Drive rename fails
            // The local file is already renamed successfully
          } else {
            console.log("[PATCH Content] Google Drive file renamed successfully");
          }
        } catch (error) {
          console.error("[PATCH Content] Google Drive rename error:", error);
          // Don't fail the entire request
        }
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
        viewPrefs: updated.folderPayload.viewPrefs as any,
        includeReferencedContent: updated.folderPayload.includeReferencedContent,
      };
    }
    if (updated.notePayload) {
      response.note = {
        tiptapJson: updated.notePayload.tiptapJson as any,
        searchText: updated.notePayload.searchText,
        metadata: updated.notePayload.metadata as any,
      };
    }
    if (updated.htmlPayload) {
      response.html = {
        html: updated.htmlPayload.html,
        isTemplate: updated.htmlPayload.isTemplate,
        templateSchema: updated.htmlPayload.templateSchema as any,
        templateMetadata: updated.htmlPayload.templateMetadata as any,
        renderMode: updated.htmlPayload.renderMode,
        templateEngine: updated.htmlPayload.templateEngine,
      };
    }
    if (updated.codePayload) {
      response.code = {
        code: updated.codePayload.code,
        language: updated.codePayload.language,
        metadata: updated.codePayload.metadata as any,
      };
    }
    if (updated.externalPayload) {
      response.external = formatExternalResponse(updated.externalPayload);
    }
    if (updated.chatPayload) {
      response.chat = {
        messages: (updated.chatPayload.messages ?? []) as any,
        metadata: (updated.chatPayload.metadata ?? {}) as any,
      };
    }

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error(`PATCH /api/content/content/[id] error:`, error);
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
}

// ============================================================
// DELETE /api/content/content/[id] - Delete Content (Soft Delete)
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Fetch existing content
    const existing = await prisma.contentNode.findUnique({
      where: { id },
      include: {
        children: {
          select: { id: true },
        },
      },
    });

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
    console.error(`DELETE /api/content/content/[id] error:`, error);
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
}

// syncContentTags extracted to lib/domain/content/tag-sync.ts for reuse by import service
