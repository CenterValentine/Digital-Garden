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
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  ALL_SEARCH_FIELDS,
  SEARCH_ORDER,
  buildSearchWhere,
} from "@/lib/domain/content/search-service";
import { resolveTagScope } from "@/lib/domain/content/search-service.server";
import { isCharterMetadata } from "@/lib/domain/ai/charters/registry";

const ROUTE_PATH = "/api/content/search";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { searchParams } = new URL(request.url);

      // Query text and filters. Raw query text is NOT logged in attrs —
      // search terms can carry sensitive context (names, secrets typed by mistake).
      const query = searchParams.get("query") || searchParams.get("search") || "";
      const tagsParam = searchParams.get("tags") || "";
      const typeParam = searchParams.get("type") || "";
      const caseSensitive = searchParams.get("caseSensitive") === "true";

      const tagSlugs = tagsParam
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      // Tag-based filtering first (if specified). AND semantics: a hit must
      // carry every tag. An empty scope short-circuits to no results.
      const contentIds = await withSpan(
        { layer: "content", name: "search_by_tags" },
        { attrs: { tag_count: tagSlugs.length } },
        async (span) => {
          const ids = await resolveTagScope(session.user.id, tagSlugs);
          span.attr("matches", ids?.length ?? -1).summary(
            ids ? `${ids.length} content with all tags` : "no tag filter",
          );
          return ids;
        },
      );
      if (contentIds && contentIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: { items: [], total: 0 },
        });
      }

      // ONE query builder with the chat tool (lib/domain/content/
      // search-service.ts, 2026-10-12). Match semantics — title plus every
      // indexed payload, rows rolled up to their table, shortcuts excluded
      // unless asked for by type — live there, not here.
      const where = buildSearchWhere({
        ownerId: session.user.id,
        query,
        types:
          typeParam && typeParam !== "all" ? [typeParam as ContentType] : undefined,
        tagContentIds: contentIds,
        caseSensitive,
        fields: ALL_SEARCH_FIELDS,
      });

      const items = await withSpan(
        { layer: "content", name: "search" },
        {
          attrs: {
            query_chars: query.length,
            tag_filter: tagSlugs.length,
            type_filter: typeParam || "all",
            case_sensitive: caseSensitive,
          },
          summary: `q=${query.length}ch tags=${tagSlugs.length} type=${typeParam || "all"}`,
        },
        async (span) => {
          const result = await prisma.contentNode.findMany({
            where,
            select: {
              id: true,
              title: true,
              slug: true,
              contentType: true,
              updatedAt: true,
              parent: {
                select: {
                  title: true,
                  parent: {
                    select: {
                      title: true,
                      parent: {
                        select: { title: true },
                      },
                    },
                  },
                },
              },
              notePayload: { select: { searchText: true, metadata: true } },
              htmlPayload: { select: { searchText: true } },
              codePayload: { select: { searchText: true } },
              filePayload: { select: { fileName: true, mimeType: true } },
            },
            orderBy: SEARCH_ORDER,
            take: 100,
          });
          span.attr("hits", result.length).summary(`${result.length} hits`);
          await spanPayload(span, "search_results", result);
          return result;
        },
      );

      const results = items.map((item) => {
        const pathParts: string[] = [];
        let current: { title: string; parent?: { title: string; parent?: { title: string } | null } | null } | null = item.parent;
        while (current) {
          pathParts.unshift(current.title);
          current = (current as { parent?: typeof current }).parent ?? null;
        }
        const path = pathParts.length > 0 ? pathParts.join(" / ") : undefined;

        return {
          id: item.id,
          title: item.title,
          slug: item.slug,
          contentType: item.contentType,
          updatedAt: item.updatedAt.toISOString(),
          path,
          // Charter flag (P0a): lets result rows render the ScrollText icon
          // the tree uses. Storage key is the legacy `metadata.playbook`.
          charter: isCharterMetadata(item.notePayload?.metadata),
          note: item.notePayload
            ? { searchText: item.notePayload.searchText }
            : undefined,
          html: item.htmlPayload
            ? { searchText: item.htmlPayload.searchText }
            : undefined,
          code: item.codePayload
            ? { searchText: item.codePayload.searchText }
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
      logger.error({
        layer: "content",
        event: "search:caught",
        summary: "search failed — 500",
        error,
      });
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
  });
}
