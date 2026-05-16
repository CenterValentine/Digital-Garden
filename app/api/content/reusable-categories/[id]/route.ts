/**
 * Reusable Category by ID - Update & Delete
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/reusable-categories/[id]";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
      const { name, displayOrder } = body;

      const category = await prisma.reusableCategory.findUnique({ where: { id } });

      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }

      if (category.userId === null) {
        return NextResponse.json({ error: "System categories are read-only" }, { status: 403 });
      }

      if (category.userId !== session.user.id) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }

      const updateData: Record<string, unknown> = {};

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return NextResponse.json({ error: "Category name cannot be empty" }, { status: 400 });
        }
        updateData.name = name.trim();
        updateData.slug = name
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
      }

      if (displayOrder !== undefined) {
        if (typeof displayOrder !== "number" || displayOrder < 0) {
          return NextResponse.json(
            { error: "displayOrder must be a non-negative number" },
            { status: 400 }
          );
        }
        updateData.displayOrder = displayOrder;
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
      }

      const updated = await withSpan(
        { layer: "content", name: "reusable_category_update" },
        { attrs: { category_id: id } },
        async () => prisma.reusableCategory.update({ where: { id }, data: updateData }),
      );

      return NextResponse.json({
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        scope: updated.scope,
        parentId: updated.parentId,
        displayOrder: updated.displayOrder,
        isSystem: false,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "reusable_category_update:caught",
        summary: "PATCH caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to update category",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const category = await prisma.reusableCategory.findUnique({ where: { id } });

      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }

      if (category.userId === null) {
        return NextResponse.json({ error: "System categories cannot be deleted" }, { status: 403 });
      }

      if (category.userId !== session.user.id) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }

      const url = new URL(request.url);
      const moveTo = url.searchParams.get("moveTo");

      await withSpan(
        { layer: "content", name: "reusable_category_delete" },
        {
          attrs: { category_id: id, move_to: moveTo ?? "(cascade)" },
        },
        async (span) => {
          if (moveTo) {
            const targetCategory = await prisma.reusableCategory.findFirst({
              where: {
                id: moveTo,
                scope: category.scope,
                OR: [{ userId: session.user.id }, { userId: null }],
              },
            });

            if (!targetCategory) {
              throw new Error("Target category not found");
            }

            if (category.scope === "content_template") {
              await prisma.contentTemplate.updateMany({
                where: { categoryId: id },
                data: { categoryId: moveTo },
              });
            } else if (category.scope === "snippet") {
              await prisma.snippet.updateMany({
                where: { categoryId: id },
                data: { categoryId: moveTo },
              });
            } else if (category.scope === "saved_block") {
              await prisma.savedBlock.updateMany({
                where: { categoryId: id },
                data: { categoryId: moveTo },
              });
            } else if (category.scope === "page_template") {
              await prisma.pageTemplate.updateMany({
                where: { categoryId: id },
                data: { categoryId: moveTo },
              });
            }
            span.attr("moved_items", true);
          }

          await prisma.reusableCategory.delete({ where: { id } });
        },
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      if (error instanceof Error && error.message === "Target category not found") {
        return NextResponse.json({ error: "Target category not found" }, { status: 404 });
      }
      logger.error({
        layer: "content",
        event: "reusable_category_delete:caught",
        summary: "DELETE caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to delete category",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
