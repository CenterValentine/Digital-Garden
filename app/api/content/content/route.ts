/**
 * Content API - List & Create
 *
 * GET  /api/content/content - List content items
 * POST /api/content/content - Create content (note, folder, HTML, code)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  generateUniqueSlug,
  extractSearchTextFromTipTap,
  extractSearchTextFromHtml,
  extractSearchTextFromCode,
  markdownToTiptap,
  CONTENT_WITH_PAYLOADS,
} from "@/lib/domain/content";
import { normalizeUrl } from "@/lib/domain/content/external-validation";
import type { JSONContent } from "@tiptap/core";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import { instantiateTemplateContent } from "@/lib/domain/editor/template-instantiation";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import type { ContentType } from "@/lib/database/generated/prisma";
import { ensureWebResourceForExternalContent } from "@/lib/domain/browser-extension";
import type {
  ContentWhereInput,
  ContentListItem,
  CreatePayloadData,
  CreateContentRequest,
  ContentDetailResponse,
} from "@/lib/domain/content/api-types";

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
// GET /api/content/content - List Content
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const parentId = searchParams.get("parentId");
    const personId = searchParams.get("personId");
    const peopleGroupId = searchParams.get("peopleGroupId");
    const search = searchParams.get("search");
    const tags = searchParams.get("tags"); // M6: Tag filter
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

    if (personId) {
      whereClause.personId = personId;
    }

    if (peopleGroupId) {
      whereClause.peopleGroupId = peopleGroupId;
    }

    // Type filtering (by contentType field)
    if (type !== "all") {
      whereClause.contentType = type as ContentType;
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

    // M6: Tag filtering
    if (tags) {
      const tagSlugs = tags.split(",").map((t) => t.trim().toLowerCase());
      if (tagSlugs.length > 0) {
        whereClause.contentTags = {
          some: {
            tag: {
              slug: {
                in: tagSlugs,
              },
            },
          },
        };
      }
    }

    // Query content
    const [items, total] = await Promise.all([
      prisma.contentNode.findMany({
        where: whereClause,
        include: {
          folderPayload: {
            select: {
              viewMode: true,
              sortMode: true,
              includeReferencedContent: true,
            },
          },
          notePayload: {
            select: {
              metadata: true,
              searchText: true, // Include for search excerpts
            },
          },
          filePayload: {
            select: {
              fileName: true,
              mimeType: true,
              fileSize: true,
              uploadStatus: true,
              storageUrl: true,
              thumbnailUrl: true,
              width: true,
              height: true,
            },
          },
          htmlPayload: {
            select: {
              isTemplate: true,
              searchText: true, // Include for search excerpts
            },
          },
          codePayload: {
            select: {
              language: true,
              searchText: true, // Include for search excerpts
            },
          },
          chatPayload: {
            select: {
              messages: true,
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
        contentType: item.contentType,
      };

      // Add payload summaries
      if (item.folderPayload) {
        formatted.folder = {
          viewMode: item.folderPayload.viewMode,
          sortMode: item.folderPayload.sortMode,
          includeReferencedContent: item.folderPayload.includeReferencedContent,
        };
      }
      if (item.notePayload) {
        formatted.note = {
          ...(item.notePayload.metadata as any),
          searchText: item.notePayload.searchText,
        };
      }
      if (item.filePayload) {
        formatted.file = {
          fileName: item.filePayload.fileName,
          mimeType: item.filePayload.mimeType,
          fileSize: item.filePayload.fileSize.toString(),
          uploadStatus: item.filePayload.uploadStatus,
          url: item.filePayload.storageUrl,
          thumbnailUrl: item.filePayload.thumbnailUrl,
          width: item.filePayload.width,
          height: item.filePayload.height,
        };
      }
      if (item.htmlPayload) {
        formatted.html = {
          isTemplate: item.htmlPayload.isTemplate,
          searchText: item.htmlPayload.searchText,
        } as any;
      }
      if (item.codePayload) {
        formatted.code = {
          language: item.codePayload.language,
          searchText: item.codePayload.searchText,
        } as any;
      }
      if (item.chatPayload) {
        const msgs = Array.isArray(item.chatPayload.messages)
          ? (item.chatPayload.messages as any[])
          : [];
        formatted.chat = {
          messageCount: msgs.length,
          lastMessage: msgs.length > 0 ? String(msgs[msgs.length - 1]?.content ?? "") : undefined,
        };
      }

      if (item.contentType === "folder") {
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
    console.error("GET /api/content/content error:", error);
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
// POST /api/content/content - Create Content
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as CreateContentRequest;

    const {
      title: rawTitle,
      parentId,
      categoryId,
      peopleGroupId,
      personId,
      tiptapJson: rawTiptapJson,
      markdown,
      html,
      isTemplate,
      templateSchema,
      templateMetadata,
      code,
      language,
      url,
      subtype,
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
      engine,
      chartConfig,
      chartData,
      isFolder,
      customIcon,
      iconColor,
      viewMode,
      sortMode,
      includeReferencedContent,
      contentType: requestedContentType,
      chatMessages,
      chatMetadata,
      fromTemplateId,
    } = body;

    let title = rawTitle;
    let tiptapJson = rawTiptapJson;

    if (fromTemplateId) {
      const pageTemplate = await prisma.pageTemplate.findFirst({
        where: {
          id: fromTemplateId,
          OR: [{ userId: session.user.id }, { userId: null }],
        },
        select: {
          id: true,
          title: true,
          defaultTitle: true,
          tiptapJson: true,
        },
      });

      if (!pageTemplate) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Page template not found",
            },
          },
          { status: 404 }
        );
      }

      tiptapJson = instantiateTemplateContent(
        JSON.parse(JSON.stringify(pageTemplate.tiptapJson)) as JSONContent
      );

      if (!title || !title.trim()) {
        title = pageTemplate.defaultTitle || pageTemplate.title;
      }

      prisma.pageTemplate
        .update({
          where: { id: pageTemplate.id },
          data: {
            usageCount: { increment: 1 },
          },
        })
        .catch(() => {});
    }

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

    let resolvedPeopleGroupId = peopleGroupId ?? null;
    let resolvedPersonId = personId ?? null;

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

    // Generate unique slug
    const slug = await generateUniqueSlug(title, session.user.id);

    // Determine content type and prepare payload data
    let contentType: ContentType;
    let payloadData: CreatePayloadData;

    if (isFolder) {
      // Folder: create FolderPayload with view configuration
      contentType = "folder";
      payloadData = {
        folderPayload: {
          create: {
            viewMode: viewMode || "list",
            sortMode: sortMode !== undefined ? sortMode : null,
            viewPrefs: {},
            includeReferencedContent: includeReferencedContent ?? false,
          },
        },
      };
    } else if (tiptapJson || markdown) {
      contentType = "note";
      // Note payload
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
      contentType = isTemplate ? "template" : "html";
      const searchText = extractSearchTextFromHtml(html);

      payloadData = {
        htmlPayload: {
          create: {
            html,
            searchText,
            isTemplate: isTemplate || false,
            templateSchema: (templateSchema || null) as any,
            templateMetadata: (templateMetadata || {}) as any,
            renderMode: isTemplate ? "template" : "static",
            templateEngine: isTemplate ? "nunjucks" : null,
          },
        },
      };
    } else if (code !== undefined) {
      // Code payload
      contentType = "code";
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
    } else if (url !== undefined) {
      // External payload (Phase 2)
      contentType = "external";
      const normalizedUrl = normalizeUrl(url);
      const resolvedCanonicalUrl = canonicalUrl
        ? normalizeUrl(canonicalUrl)
        : normalizedUrl;
      const domainParts = getExternalDomainParts(resolvedCanonicalUrl);

      payloadData = {
        externalPayload: {
          create: {
            url,
            normalizedUrl,
            canonicalUrl: resolvedCanonicalUrl,
            subtype: preserveHtml ? "preserved-html" : subtype || "website",
            readingStatus: readingStatus || "inbox",
            description: description?.trim() || null,
            resourceType: resourceType?.trim() || null,
            resourceRelationship: resourceRelationship?.trim() || null,
            userIntent: userIntent?.trim() || null,
            sourceDomain: domainParts.domain,
            sourceHostname: domainParts.hostname,
            faviconUrl: faviconUrl || null,
            preview: {}, // Will be populated by preview fetch
            captureMetadata: (captureMetadata || {}) as any,
            matchMetadata: (matchMetadata || {}) as any,
            preserveHtml: preserveHtml || false,
            preservedHtmlSnapshot: (preservedHtmlSnapshot || null) as any,
            preservedHtmlCapturedAt:
              preserveHtml && preservedHtmlSnapshot ? new Date() : null,
          },
        },
      };
    } else if (engine !== undefined) {
      // Visualization payload
      contentType = "visualization";

      payloadData = {
        visualizationPayload: {
          create: {
            engine,
            config: chartConfig || {},
            data: chartData || {},
          },
        },
      } as CreatePayloadData;

      // Path A: drawings created from inside a note's block claim ownership
      // at creation. We validate the parent note actually exists + belongs to
      // the same user — otherwise we silently drop the claim (safer than
      // accepting a forged ownership link).
      const embedBody = body as unknown as {
        ownedByNoteId?: string | null;
        role?: string | null;
      };
      if (embedBody.ownedByNoteId) {
        const host = await prisma.contentNode.findFirst({
          where: {
            id: embedBody.ownedByNoteId,
            ownerId: session.user.id,
            deletedAt: null,
            contentType: "note",
          },
          select: { id: true },
        });
        if (host) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payloadData as any).ownedByNoteId = host.id;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payloadData as any).role = "referenced";
        }
      }
    } else if (requestedContentType === "chat") {
      // Chat payload
      contentType = "chat";
      payloadData = {
        chatPayload: {
          create: {
            messages: (chatMessages ?? []) as any,
            metadata: (chatMetadata ?? {}) as any,
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
              "Must specify one of: isFolder, tiptapJson, markdown, html, code, url, engine, or contentType: 'chat'",
          },
        },
        { status: 400 }
      );
    }

    // Create content node — retry on slug uniqueness collisions.
    // generateUniqueSlug's check-then-insert isn't atomic, so two concurrent
    // creates with the same title can both resolve to the same slug and then
    // race on INSERT. Rapid NodeView re-mounts of embedded drawings tripped
    // this. We retry with a short random suffix on P2002 against (ownerId, slug).
    const createWithSlug = (attemptSlug: string) =>
      prisma.contentNode.create({
        data: {
          ownerId: session.user.id,
          title,
          slug: attemptSlug,
          contentType,
          parentId: parentId || null,
          categoryId: categoryId || null,
          peopleGroupId: resolvedPeopleGroupId,
          personId: resolvedPersonId,
          customIcon: customIcon || null,
          iconColor: iconColor || null,
          ...payloadData,
        },
        include: CONTENT_WITH_PAYLOADS,
      });

    let content: Awaited<ReturnType<typeof createWithSlug>> | null = null;
    let attemptSlug = slug;
    for (let attempt = 0; attempt < 3 && !content; attempt++) {
      try {
        content = await createWithSlug(attemptSlug);
      } catch (e) {
        const err = e as { code?: string; meta?: { target?: string[] } };
        const isSlugConflict =
          err.code === "P2002" &&
          (err.meta?.target?.includes("slug") ?? true);
        if (!isSlugConflict) throw e;
        const suffix = Math.random().toString(36).slice(2, 8);
        attemptSlug = `${slug}-${suffix}`;
      }
    }
    if (!content) {
      throw new Error("Could not resolve unique slug after retries");
    }

    if (content.externalPayload) {
      await ensureWebResourceForExternalContent(session.user.id, {
        contentId: content.id,
        url: content.externalPayload.url,
        canonicalUrl: content.externalPayload.canonicalUrl,
        title: content.title,
        faviconUrl: content.externalPayload.faviconUrl,
      });
      content = await prisma.contentNode.findUnique({
        where: { id: content.id },
        include: CONTENT_WITH_PAYLOADS,
      });
      if (!content) {
        throw new Error("Created external content could not be reloaded");
      }
    }

    // Format response
    const response: ContentDetailResponse = {
      id: content.id,
      ownerId: content.ownerId,
      title: content.title,
      slug: content.slug,
      parentId: content.parentId,
      categoryId: content.categoryId,
      peopleGroupId: content.peopleGroupId,
      personId: content.personId,
      displayOrder: content.displayOrder,
      isPublished: content.isPublished,
      customIcon: content.customIcon,
      iconColor: content.iconColor,
      contentType: content.contentType,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      deletedAt: content.deletedAt,
    };

    // Add full payload data in response
    if (content.folderPayload) {
      response.folder = {
        viewMode: content.folderPayload.viewMode,
        sortMode: content.folderPayload.sortMode,
        viewPrefs: content.folderPayload.viewPrefs as any,
        includeReferencedContent: content.folderPayload.includeReferencedContent,
      };
    }
    if (content.notePayload) {
      response.note = {
        tiptapJson: content.notePayload.tiptapJson as any,
        searchText: content.notePayload.searchText,
        metadata: content.notePayload.metadata as any,
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
    if (content.externalPayload) {
      response.external = formatExternalResponse(content.externalPayload);
    }
    if (content.chatPayload) {
      response.chat = {
        messages: (content.chatPayload.messages ?? []) as any,
        metadata: (content.chatPayload.metadata ?? {}) as any,
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
    console.error("POST /api/content/content error:", error);
    // In development, surface the real error to the client so toasts become
    // actionable. In production, keep the generic message to avoid leaking
    // internal details. Prisma errors have a `.code` (e.g. "P2002") which
    // is safe to pass through either way.
    const isDev = process.env.NODE_ENV !== "production";
    const err = error as { code?: string; message?: string };
    return NextResponse.json(
      {
        success: false,
        error: {
          code: err.code || "SERVER_ERROR",
          message: isDev
            ? `Failed to create content: ${err.message || String(error)}`
            : "Failed to create content",
        },
      },
      { status: 500 }
    );
  }
}
