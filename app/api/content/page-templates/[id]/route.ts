/**
 * Page Template by ID - Read, Update & Delete
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/page-templates/[id]";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(_request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const template = await prisma.pageTemplate.findFirst({
        where: {
          id,
          OR: [{ userId: session.user.id }, { userId: null }],
        },
        include: { category: { select: { id: true, name: true, slug: true } } },
      });

      if (!template) {
        return NextResponse.json({ error: "Page template not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: template.id,
        title: template.title,
        tiptapJson: template.tiptapJson,
        categoryId: template.categoryId,
        categoryName: template.category.name,
        userId: template.userId,
        isSystem: template.userId === null,
        defaultTitle: template.defaultTitle,
        customIcon: template.customIcon,
        iconColor: template.iconColor,
        usageCount: template.usageCount,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "page_template_read:caught",
        summary: "GET caught — translated to 500",
        error,
      });
      return NextResponse.json({ error: "Failed to get page template" }, { status: 500 });
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;
      const body = await request.json();
      const { title, tiptapJson, categoryId, defaultTitle, searchText } = body;

      const template = await prisma.pageTemplate.findFirst({
        where: { id, userId: session.user.id },
      });

      if (!template) {
        return NextResponse.json(
          { error: "Page template not found or is read-only" },
          { status: 404 },
        );
      }

      const updateData: Record<string, unknown> = {};

      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
        }
        updateData.title = title.trim();
      }

      if (tiptapJson !== undefined) {
        if (typeof tiptapJson !== "object") {
          return NextResponse.json({ error: "tiptapJson must be a JSON object" }, { status: 400 });
        }
        updateData.tiptapJson = tiptapJson;
      }

      if (categoryId !== undefined) {
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
        updateData.categoryId = categoryId;
      }

      if (defaultTitle !== undefined) updateData.defaultTitle = defaultTitle?.trim() || null;
      if (searchText !== undefined) updateData.searchText = searchText;

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
      }

      const updated = await withSpan(
        { layer: "content", name: "page_template_update" },
        { attrs: { template_id: id } },
        async () =>
          prisma.pageTemplate.update({
            where: { id },
            data: updateData,
            include: { category: { select: { id: true, name: true, slug: true } } },
          }),
      );

      return NextResponse.json({
        id: updated.id,
        title: updated.title,
        tiptapJson: updated.tiptapJson,
        categoryId: updated.categoryId,
        categoryName: updated.category.name,
        userId: updated.userId,
        isSystem: false,
        defaultTitle: updated.defaultTitle,
        customIcon: updated.customIcon,
        iconColor: updated.iconColor,
        usageCount: updated.usageCount,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "page_template_update:caught",
        summary: "PATCH caught — translated to 500",
        error,
      });
      return NextResponse.json({ error: "Failed to update page template" }, { status: 500 });
    }
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(_request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const template = await prisma.pageTemplate.findFirst({
        where: { id, userId: session.user.id },
      });

      if (!template) {
        return NextResponse.json(
          { error: "Page template not found or is read-only" },
          { status: 404 },
        );
      }

      await withSpan(
        { layer: "content", name: "page_template_delete" },
        { attrs: { template_id: id } },
        async () => prisma.pageTemplate.delete({ where: { id } }),
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "page_template_delete:caught",
        summary: "DELETE caught — translated to 500",
        error,
      });
      return NextResponse.json({ error: "Failed to delete page template" }, { status: 500 });
    }
  });
}
