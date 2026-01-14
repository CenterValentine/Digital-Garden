/**
 * Content API - List & Create
 *
 * GET  /api/notes/content - List content items
 * POST /api/notes/content - Create content (note, folder, HTML, code)
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
import type {
  ContentWhereInput,
  ContentListItem,
  CreatePayloadData,
  CreateContentRequest,
  ContentDetailResponse,
} from "@/lib/content/api-types";

// ============================================================
// GET /api/notes/content - List Content
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const parentId = searchParams.get("parentId");
    const search = searchParams.get("search");
    const includeDeleted = searchParams.get("includeDeleted") === "true";
    const limit = Math.min(
      Number.parseInt(searchParams.get("limit") || "100"),
      500
    );
    const offset = Number.parseInt(searchParams.get("offset") || "0");
    const sortBy = searchParams.get("sortBy") || "title";
    const sortOrder = searchParams.get("sortOrder") || "asc";

    // Build where clause
    const whereClause: ContentWhereInput = {
      ownerId: session.user.id,
    };

    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    if (parentId !== null) {
      whereClause.parentId = parentId === "null" ? null : parentId;
    }

    // Type filtering (by payload presence)
    if (type !== "all") {
      if (type === "note") {
        whereClause.notePayload = { isNot: null };
      } else if (type === "file") {
        whereClause.filePayload = { isNot: null };
      } else if (type === "html") {
        whereClause.htmlPayload = { isNot: null, is: { isTemplate: false } };
      } else if (type === "template") {
        whereClause.htmlPayload = { isNot: null, is: { isTemplate: true } };
      } else if (type === "code") {
        whereClause.codePayload = { isNot: null };
      } else if (type === "folder") {
        // Folder: no payload
        whereClause.notePayload = null;
        whereClause.filePayload = null;
        whereClause.htmlPayload = null;
        whereClause.codePayload = null;
      }
    }

    // Search filtering
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: "insensitive" } },
        {
          notePayload: {
            searchText: { contains: search, mode: "insensitive" },
          },
        },
        {
          htmlPayload: {
            searchText: { contains: search, mode: "insensitive" },
          },
        },
        {
          codePayload: {
            searchText: { contains: search, mode: "insensitive" },
          },
        },
      ];
    }

    // Query content
    const [items, total] = await Promise.all([
      prisma.contentNode.findMany({
        where: whereClause,
        include: {
          notePayload: {
            select: {
              metadata: true,
            },
          },
          filePayload: {
            select: {
              fileName: true,
              mimeType: true,
              fileSize: true,
              uploadStatus: true,
              thumbnailUrl: true,
              width: true,
              height: true,
            },
          },
          htmlPayload: {
            select: {
              isTemplate: true,
            },
          },
          codePayload: {
            select: {
              language: true,
            },
          },
          _count: {
            select: {
              children: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
      }),
      prisma.contentNode.count({ where: whereClause }),
    ]);

    // Format response
    const formattedItems: ContentListItem[] = items.map((item) => {
      const contentType = deriveContentType(item as any);

      const formatted: ContentListItem = {
        id: item.id,
        ownerId: item.ownerId,
        title: item.title,
        slug: item.slug,
        parentId: item.parentId,
        categoryId: item.categoryId,
        displayOrder: item.displayOrder,
        isPublished: item.isPublished,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt,
        customIcon: item.customIcon,
        iconColor: item.iconColor,
        contentType,
      };

      // Add payload summaries
      if (item.notePayload) {
        formatted.note = item.notePayload.metadata;
      }
      if (item.filePayload) {
        formatted.file = {
          fileName: item.filePayload.fileName,
          mimeType: item.filePayload.mimeType,
          fileSize: item.filePayload.fileSize.toString(),
          uploadStatus: item.filePayload.uploadStatus,
          thumbnailUrl: item.filePayload.thumbnailUrl,
          width: item.filePayload.width,
          height: item.filePayload.height,
        };
      }
      if (item.htmlPayload) {
        formatted.html = {
          isTemplate: item.htmlPayload.isTemplate,
        };
      }
      if (item.codePayload) {
        formatted.code = {
          language: item.codePayload.language,
        };
      }

      if (contentType === "folder") {
        formatted.childCount = item._count.children;
      }

      return formatted;
    });

    return NextResponse.json({
      success: true,
      data: {
        items: formattedItems,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("GET /api/notes/content error:", error);
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
// POST /api/notes/content - Create Content
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as CreateContentRequest;

    const {
      title,
      parentId,
      categoryId,
      tiptapJson,
      markdown,
      html,
      isTemplate,
      templateSchema,
      templateMetadata,
      code,
      language,
      isFolder,
      customIcon,
      iconColor,
    } = body;

    // Validation
    if (!title || title.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Title is required",
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

    // Validate parent exists
    if (parentId) {
      const parent = await prisma.contentNode.findUnique({
        where: { id: parentId },
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
    }

    // Generate unique slug
    const slug = await generateUniqueSlug(title, session.user.id);

    // Determine content type and prepare payload data
    let payloadData: CreatePayloadData = {};

    if (isFolder) {
      // Folder: no payload
      payloadData = {};
    } else if (tiptapJson || markdown) {
      // Note payload
      const json: JSONContent = markdown
        ? markdownToTiptap(markdown)
        : tiptapJson;

      const searchText = extractSearchTextFromTipTap(json);
      const wordCount = searchText.split(/\s+/).filter(Boolean).length;
      const readingTime = Math.ceil(wordCount / 200);

      payloadData = {
        notePayload: {
          create: {
            tiptapJson: json,
            searchText,
            metadata: {
              wordCount,
              characterCount: searchText.length,
              readingTime,
            },
          },
        },
      };
    } else if (html !== undefined) {
      // HTML payload
      const searchText = extractSearchTextFromHtml(html);

      payloadData = {
        htmlPayload: {
          create: {
            html,
            searchText,
            isTemplate: isTemplate || false,
            templateSchema: templateSchema || null,
            templateMetadata: templateMetadata || {},
            renderMode: isTemplate ? "template" : "static",
            templateEngine: isTemplate ? "nunjucks" : null,
          },
        },
      };
    } else if (code !== undefined) {
      // Code payload
      const searchText = extractSearchTextFromCode(code, language || "text");

      payloadData = {
        codePayload: {
          create: {
            code,
            language: language || "text",
            searchText,
            metadata: {},
          },
        },
      };
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Must specify one of: isFolder, tiptapJson, markdown, html, or code",
          },
        },
        { status: 400 }
      );
    }

    // Create content node
    const content = await prisma.contentNode.create({
      data: {
        ownerId: session.user.id,
        title,
        slug,
        parentId: parentId || null,
        categoryId: categoryId || null,
        customIcon: customIcon || null,
        iconColor: iconColor || null,
        ...payloadData,
      },
      include: CONTENT_WITH_PAYLOADS,
    });

    // Format response
    const contentType = deriveContentType(content as any);
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
      contentType,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      deletedAt: content.deletedAt,
    };

    // Add full payload data in response
    if (content.notePayload) {
      response.note = {
        tiptapJson: content.notePayload.tiptapJson,
        searchText: content.notePayload.searchText,
        metadata: content.notePayload.metadata,
      };
    }
    if (content.htmlPayload) {
      response.html = {
        html: content.htmlPayload.html,
        isTemplate: content.htmlPayload.isTemplate,
        templateSchema: content.htmlPayload.templateSchema,
        templateMetadata: content.htmlPayload.templateMetadata,
      };
    }
    if (content.codePayload) {
      response.code = {
        code: content.codePayload.code,
        language: content.codePayload.language,
      };
    }

    return NextResponse.json(
      {
        success: true,
        data: response,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/notes/content error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to create content",
        },
      },
      { status: 500 }
    );
  }
}
