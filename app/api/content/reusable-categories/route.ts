/**
 * Reusable Categories API - List & Create
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type { ReusableCategoryScope } from "@/lib/database/generated/prisma";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/reusable-categories";

const VALID_SCOPES: ReusableCategoryScope[] = [
  "content_template",
  "snippet",
  "page_template",
  "saved_block",
];

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { searchParams } = new URL(request.url);
      const scope = searchParams.get("scope") as ReusableCategoryScope | null;

      if (!scope || !VALID_SCOPES.includes(scope)) {
        return NextResponse.json(
          { error: "Valid scope parameter required", validScopes: VALID_SCOPES },
          { status: 400 }
        );
      }

      const categories = await withSpan(
        { layer: "content", name: "reusable_categories_list" },
        { attrs: { scope } },
        async (span) => {
          const result = await prisma.reusableCategory.findMany({
            where: {
              scope,
              OR: [{ userId: session.user.id }, { userId: null }],
            },
            select: {
              id: true,
              name: true,
              slug: true,
              scope: true,
              userId: true,
              parentId: true,
              displayOrder: true,
              createdAt: true,
              _count: {
                select: {
                  savedBlocks: true,
                  contentTemplates: true,
                  snippets: true,
                  pageTemplates: true,
                },
              },
            },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
          });
          span.attr("count", result.length);
          await spanPayload(span, "reusable_categories", result);
          return result;
        },
      );

      const results = categories.map((cat) => {
        let itemCount = 0;
        if (cat.scope === "saved_block") itemCount = cat._count.savedBlocks;
        else if (cat.scope === "content_template") itemCount = cat._count.contentTemplates;
        else if (cat.scope === "snippet") itemCount = cat._count.snippets;
        else if (cat.scope === "page_template") itemCount = cat._count.pageTemplates;

        return {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          scope: cat.scope,
          parentId: cat.parentId,
          displayOrder: cat.displayOrder,
          isSystem: cat.userId === null,
          itemCount,
          createdAt: cat.createdAt.toISOString(),
        };
      });

      return NextResponse.json(results);
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "reusable_categories_list:caught",
        summary: "list failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to list categories",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = await request.json();
      const { name, scope, parentId } = body;

      if (!name || typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Category name is required" }, { status: 400 });
      }

      if (!scope || !VALID_SCOPES.includes(scope)) {
        return NextResponse.json(
          { error: "Valid scope is required", validScopes: VALID_SCOPES },
          { status: 400 }
        );
      }

      let slug = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/^-+|-+$/g, "");

      if (!slug) {
        slug = `cat-${Date.now()}`;
      }

      const existing = await prisma.reusableCategory.findUnique({
        where: {
          userId_scope_slug: { userId: session.user.id, scope, slug },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "A category with this name already exists" },
          { status: 409 }
        );
      }

      const maxOrder = await prisma.reusableCategory.aggregate({
        where: { userId: session.user.id, scope },
        _max: { displayOrder: true },
      });

      const category = await withSpan(
        { layer: "content", name: "reusable_category_create" },
        { attrs: { scope } },
        async (span) => {
          const created = await prisma.reusableCategory.create({
            data: {
              userId: session.user.id,
              name: name.trim(),
              slug,
              scope,
              parentId: parentId || null,
              displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
            },
          });
          span.attr("category_id", created.id);
          return created;
        },
      );

      return NextResponse.json(
        {
          id: category.id,
          name: category.name,
          slug: category.slug,
          scope: category.scope,
          parentId: category.parentId,
          displayOrder: category.displayOrder,
          isSystem: false,
          itemCount: 0,
          createdAt: category.createdAt.toISOString(),
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "reusable_category_create:caught",
        summary: "create failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to create category",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
