/**
 * Reusable Category by ID - Update & Delete
 *
 * PATCH /api/content/reusable-categories/[id]
 * Updates a user-owned category (system categories are read-only)
 *
 * DELETE /api/content/reusable-categories/[id]
 * Deletes a user-owned category (system categories cannot be deleted)
 *
 * Epoch 11 Sprint 43: Block Infrastructure
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { name, displayOrder } = body;

    // Fetch the category
    const category = await prisma.reusableCategory.findUnique({
      where: { id },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // System categories (userId: null) are read-only
    if (category.userId === null) {
      return NextResponse.json(
        { error: "System categories are read-only" },
        { status: 403 }
      );
    }

    // Verify ownership
    if (category.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json(
          { error: "Category name cannot be empty" },
          { status: 400 }
        );
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
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.reusableCategory.update({
      where: { id },
      data: updateData,
    });

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
    console.error("Update reusable category error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to update category",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const category = await prisma.reusableCategory.findUnique({
      where: { id },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // System categories cannot be deleted
    if (category.userId === null) {
      return NextResponse.json(
        { error: "System categories cannot be deleted" },
        { status: 403 }
      );
    }

    // Verify ownership
    if (category.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // If moveTo is provided, move all items to that category before deleting
    const url = new URL(request.url);
    const moveTo = url.searchParams.get("moveTo");

    if (moveTo) {
      const targetCategory = await prisma.reusableCategory.findFirst({
        where: {
          id: moveTo,
          scope: category.scope,
          OR: [{ userId: session.user.id }, { userId: null }],
        },
      });

      if (!targetCategory) {
        return NextResponse.json(
          { error: "Target category not found" },
          { status: 404 }
        );
      }

      // Move all items based on scope
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
    }

    // Delete (cascade will remove any remaining associated items)
    await prisma.reusableCategory.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete reusable category error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to delete category",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
