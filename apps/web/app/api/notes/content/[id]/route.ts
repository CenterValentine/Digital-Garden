/**
 * Content API - Individual Item Operations
 *
 * GET    /api/notes/content/[id] - Get content by ID
 * PATCH  /api/notes/content/[id] - Update content
 * DELETE /api/notes/content/[id] - Delete content (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";
import {
  deriveContentType,
  generateUniqueSlug,
  extractSearchTextFromTipTap,
  extractSearchTextFromHtml,
  extractSearchTextFromCode,
  markdownToTiptap,
  CONTENT_WITH_PAYLOADS,
} from "@/lib/content";
import type { JSONContent } from "@tiptap/core";

type Params = Promise<{ id: string }>;

// ============================================================
// GET /api/notes/content/[id] - Get Content
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const content = await prisma.contentNode.findUnique({
      where: { id },
      include: CONTENT_WITH_PAYLOADS,
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

    // Check ownership
    if (content.ownerId !== session.user.id) {
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
    const contentType = deriveContentType(content as any);
    const response: any = {
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
      contentType,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      deletedAt: content.deletedAt,
    };

    // Include full payload data
    if (content.notePayload) {
      response.note = {
        tiptapJson: content.notePayload.tiptapJson,
        searchText: content.notePayload.searchText,
        metadata: content.notePayload.metadata,
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
        templateSchema: content.htmlPayload.templateSchema,
        templateMetadata: content.htmlPayload.templateMetadata,
        renderMode: content.htmlPayload.renderMode,
        templateEngine: content.htmlPayload.templateEngine,
      };
    }
    if (content.codePayload) {
      response.code = {
        code: content.codePayload.code,
        language: content.codePayload.language,
        metadata: content.codePayload.metadata,
      };
    }

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error(`GET /api/notes/content/[id] error:`, error);
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
// PATCH /api/notes/content/[id] - Update Content
// ============================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();

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
    } = body;

    // Prepare update data
    const updateData: any = {};

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
        updateData.slug = await generateUniqueSlug(
          title,
          session.user.id,
          id
        );
      }
    }

    if (parentId !== undefined) {
      updateData.parentId = parentId;
    }
    if (categoryId !== undefined) {
      updateData.categoryId = categoryId;
    }
    if (isPublished !== undefined) {
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

    // Update payload data
    if (existing.notePayload && (tiptapJson || markdown)) {
      const json: JSONContent = markdown
        ? markdownToTiptap(markdown)
        : tiptapJson;

      const searchText = extractSearchTextFromTipTap(json);
      const wordCount = searchText.split(/\s+/).filter(Boolean).length;
      const readingTime = Math.ceil(wordCount / 200);

      await prisma.notePayload.update({
        where: { contentId: id },
        data: {
          tiptapJson: json,
          searchText,
          metadata: {
            wordCount,
            characterCount: searchText.length,
            readingTime,
          },
        },
      });
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

    // Update content node
    const updated = await prisma.contentNode.update({
      where: { id },
      data: updateData,
      include: CONTENT_WITH_PAYLOADS,
    });

    // Format response
    const contentType = deriveContentType(updated as any);
    const response: any = {
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
      contentType,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    // Include payload data
    if (updated.notePayload) {
      response.note = {
        tiptapJson: updated.notePayload.tiptapJson,
        searchText: updated.notePayload.searchText,
        metadata: updated.notePayload.metadata,
      };
    }
    if (updated.htmlPayload) {
      response.html = {
        html: updated.htmlPayload.html,
        isTemplate: updated.htmlPayload.isTemplate,
      };
    }
    if (updated.codePayload) {
      response.code = {
        code: updated.codePayload.code,
        language: updated.codePayload.language,
      };
    }

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error(`PATCH /api/notes/content/[id] error:`, error);
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
// DELETE /api/notes/content/[id] - Delete Content (Soft Delete)
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
        message: "Content moved to trash. Will be permanently deleted in 30 days.",
      },
    });
  } catch (error) {
    console.error(`DELETE /api/notes/content/[id] error:`, error);
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

