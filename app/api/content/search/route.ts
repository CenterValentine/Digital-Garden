/**
 * Advanced Search API
 *
 * GET /api/content/search?query=text&tags=tag1,tag2&type=note
 * Advanced search with multiple filters including tag-based search
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type { ContentType } from "@/lib/domain/content/types";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);

    // Extract search parameters
    const query = searchParams.get("query") || searchParams.get("search") || "";
    const tagsParam = searchParams.get("tags") || "";
    const typeParam = searchParams.get("type") || "";
    const caseSensitive = searchParams.get("caseSensitive") === "true";

    // Parse tags (comma-separated slugs)
    const tagSlugs = tagsParam
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    console.log("[Search API] Query:", query, "Tags:", tagSlugs, "Type:", typeParam, "Case sensitive:", caseSensitive);

    // Start with base where clause
    let contentIds: string[] | undefined;

    // Tag-based filtering first (if specified)
    if (tagSlugs.length > 0) {
      const contentWithTags = await prisma.contentTag.groupBy({
        by: ["contentId"],
        where: {
          tag: {
            userId: session.user.id,
            slug: {
              in: tagSlugs,
            },
          },
        },
        having: {
          contentId: {
            _count: {
              gte: tagSlugs.length, // Must have all tags
            },
          },
        },
      });

      contentIds = contentWithTags.map((ct) => ct.contentId);

      if (contentIds.length === 0) {
        // No content matches all tags
        return NextResponse.json({
          success: true,
          data: {
            items: [],
            total: 0,
          },
        });
      }
    }

    // Build where clause for content search
    const where: any = {
      ownerId: session.user.id,
      deletedAt: null,
    };

    // Add tag filter if we have content IDs
    if (contentIds) {
      where.id = { in: contentIds };
    }

    // Determine Prisma search mode based on caseSensitive flag
    const searchMode = caseSensitive ? "default" : "insensitive";

    // Text search filter (if query provided)
    if (query.trim()) {
      where.OR = [
        {
          title: {
            contains: query,
            mode: searchMode,
          },
        },
        {
          AND: [
            { notePayload: { isNot: null } },
            {
              notePayload: {
                searchText: {
                  contains: query,
                  mode: searchMode,
                },
              },
            },
          ],
        },
        {
          AND: [
            { htmlPayload: { isNot: null } },
            {
              htmlPayload: {
                searchText: {
                  contains: query,
                  mode: searchMode,
                },
              },
            },
          ],
        },
        {
          AND: [
            { codePayload: { isNot: null } },
            {
              codePayload: {
                searchText: {
                  contains: query,
                  mode: searchMode,
                },
              },
            },
          ],
        },
        {
          AND: [
            { filePayload: { isNot: null } },
            {
              filePayload: {
                searchText: {
                  contains: query,
                  mode: searchMode,
                },
              },
            },
          ],
        },
      ];
    }

    // Content type filter (based on which payload exists)
    if (typeParam && typeParam !== "all") {
      switch (typeParam as ContentType) {
        case "note":
          where.notePayload = { isNot: null };
          break;
        case "file":
          where.filePayload = { isNot: null };
          break;
        case "html":
          where.htmlPayload = { isNot: null };
          break;
        case "code":
          where.codePayload = { isNot: null };
          break;
        case "folder":
          // Folders have no payload
          where.AND = [
            { notePayload: null },
            { filePayload: null },
            { htmlPayload: null },
            { codePayload: null },
          ];
          break;
      }
    }

    // Execute search
    const items = await prisma.contentNode.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        updatedAt: true,
        notePayload: {
          select: {
            searchText: true,
          },
        },
        htmlPayload: {
          select: {
            searchText: true,
          },
        },
        codePayload: {
          select: {
            searchText: true,
          },
        },
        filePayload: {
          select: {
            fileName: true,
            mimeType: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 100, // Limit results
    });

    // Transform results - compute contentType based on which payload exists
    const results = items.map((item) => {
      let contentType: ContentType = "folder";
      if (item.notePayload) contentType = "note";
      else if (item.filePayload) contentType = "file";
      else if (item.htmlPayload) contentType = "html";
      else if (item.codePayload) contentType = "code";

      return {
        id: item.id,
        title: item.title,
        slug: item.slug,
        contentType,
        updatedAt: item.updatedAt.toISOString(),
        note: item.notePayload
          ? {
              searchText: item.notePayload.searchText,
            }
          : undefined,
        html: item.htmlPayload
          ? {
              searchText: item.htmlPayload.searchText,
            }
          : undefined,
        code: item.codePayload
          ? {
              searchText: item.codePayload.searchText,
            }
          : undefined,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        items: results,
        total: results.length,
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SEARCH_ERROR",
          message: error instanceof Error ? error.message : "Search failed",
        },
      },
      { status: 500 }
    );
  }
}
