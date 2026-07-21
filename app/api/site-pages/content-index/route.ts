/**
 * GET /api/site-pages/content-index — the composer's content picker source.
 *
 * Returns the tenant's published directories with their items nested, so the
 * picker can offer both targets in one pass:
 *   • bind a whole directory  → `publicPath:/<path>` on a section
 *   • add a single item as a row → `publicItem:<slug>`
 *
 * Nested paths are returned with their full slash path so `bind` strings match
 * what resolvePublicPath walks. Empty directories are included (muted in the
 * UI) so you can bind one before publishing into it.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { withRouteTrace } from "@/lib/core/logger";
import { resolveWritableTenantId, TenantAuthError } from "@/lib/domain/tenancy";

const ROUTE_PATH = "/api/site-pages/content-index";

export interface ContentIndexItem {
  ref: string; // "publicItem:<slug>"
  slug: string;
  title: string;
  payloadType: string;
  firstPublishedAt: string | null;
  excerpt: string | null;
}

export interface ContentIndexDirectory {
  ref: string; // "publicPath:/<path>"
  path: string; // "/blog", "/blog/permaculture"
  title: string;
  publishedCount: number;
  items: ContentIndexItem[];
}

export async function GET(req: NextRequest) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    const requestedTenantId = req.nextUrl.searchParams.get("tenantId");
    try {
      const session = await requireAuth();
      const tenantId = await resolveWritableTenantId(session.user.id, requestedTenantId);

      const [paths, items] = await Promise.all([
        prisma.publicPath.findMany({
          where: { tenantId },
          select: { id: true, slug: true, title: true, parentId: true },
          orderBy: { title: "asc" },
        }),
        prisma.publicItem.findMany({
          where: { tenantId, state: "published", deletedAt: null },
          select: {
            slug: true,
            publicTitle: true,
            payloadType: true,
            firstPublishedAt: true,
            pathId: true,
            blogPostPayload: { select: { excerpt: true } },
          },
          orderBy: { lastPublishedAt: "desc" },
        }),
      ]);

      // Build full slash paths so `bind` matches resolvePublicPath's walk.
      const byId = new Map(paths.map((p) => [p.id, p]));
      const fullPath = (id: string): string => {
        const segments: string[] = [];
        let cursor = byId.get(id);
        // Guard against cycles in malformed data.
        for (let depth = 0; cursor && depth < 10; depth++) {
          segments.unshift(cursor.slug);
          cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
        }
        return "/" + segments.join("/");
      };

      const itemsByPath = new Map<string, ContentIndexItem[]>();
      for (const it of items) {
        const list = itemsByPath.get(it.pathId) ?? [];
        list.push({
          ref: `publicItem:${it.slug}`,
          slug: it.slug,
          title: it.publicTitle ?? it.slug,
          payloadType: it.payloadType,
          firstPublishedAt: it.firstPublishedAt?.toISOString() ?? null,
          excerpt: it.blogPostPayload?.excerpt ?? null,
        });
        itemsByPath.set(it.pathId, list);
      }

      const directories: ContentIndexDirectory[] = paths
        .map((p) => {
          const path = fullPath(p.id);
          const dirItems = itemsByPath.get(p.id) ?? [];
          return {
            ref: `publicPath:${path}`,
            path,
            title: p.title,
            publishedCount: dirItems.length,
            items: dirItems,
          };
        })
        .sort((a, b) => a.path.localeCompare(b.path));

      return NextResponse.json({ tenantId, directories });
    } catch (err) {
      if (err instanceof Error && err.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      if (err instanceof TenantAuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  });
}
