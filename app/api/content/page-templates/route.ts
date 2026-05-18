/**
 * Page Templates - List & Create
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/page-templates";

export async function GET(_request: NextRequest) {
  return withRouteTrace(_request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const templates = await withSpan(
        { layer: "content", name: "page_templates_list" },
        undefined,
        async (span) => {
          const result = await prisma.pageTemplate.findMany({
            where: {
              OR: [{ userId: session.user.id }, { userId: null }],
            },
            include: {
              category: { select: { id: true, name: true, slug: true } },
            },
            orderBy: [{ category: { displayOrder: "asc" } }, { title: "asc" }],
          });
          span.attr("count", result.length);
          await spanPayload(span, "page_templates", result);
          return result;
        },
      );

      return NextResponse.json(
        templates.map((t) => ({
          id: t.id,
          title: t.title,
          tiptapJson: t.tiptapJson,
          categoryId: t.categoryId,
          categoryName: t.category.name,
          userId: t.userId,
          isSystem: t.userId === null,
          defaultTitle: t.defaultTitle,
          customIcon: t.customIcon,
          iconColor: t.iconColor,
          usageCount: t.usageCount,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "page_templates_list:caught",
        summary: "list failed — 500",
        error,
      });
      return NextResponse.json({ error: "Failed to list page templates" }, { status: 500 });
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
      const { title, tiptapJson, categoryId, defaultTitle, searchText, customIcon, iconColor } = body;

      if (!title?.trim()) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
      }

      if (!tiptapJson || typeof tiptapJson !== "object") {
        return NextResponse.json({ error: "tiptapJson is required" }, { status: 400 });
      }

      const category = await prisma.reusableCategory.findFirst({
        where: {
          id: categoryId,
          scope: "page_template",
          OR: [{ userId: session.user.id }, { userId: null }],
        },
      });

      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }

      const template = await withSpan(
        { layer: "content", name: "page_template_create" },
        undefined,
        async (span) => {
          const created = await prisma.pageTemplate.create({
            data: {
              title: title.trim(),
              tiptapJson,
              categoryId,
              userId: session.user.id,
              defaultTitle: defaultTitle?.trim() || null,
              searchText: searchText || title.trim().toLowerCase(),
              customIcon: customIcon || null,
              iconColor: iconColor || null,
            },
            include: { category: { select: { id: true, name: true, slug: true } } },
          });
          span.attr("template_id", created.id);
          return created;
        },
      );

      return NextResponse.json(
        {
          id: template.id,
          title: template.title,
          tiptapJson: template.tiptapJson,
          categoryId: template.categoryId,
          categoryName: template.category.name,
          userId: template.userId,
          isSystem: false,
          defaultTitle: template.defaultTitle,
          customIcon: template.customIcon,
          iconColor: template.iconColor,
          usageCount: template.usageCount,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
        },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "page_template_create:caught",
        summary: "create failed — 500",
        error,
      });
      return NextResponse.json({ error: "Failed to create page template" }, { status: 500 });
    }
  });
}
