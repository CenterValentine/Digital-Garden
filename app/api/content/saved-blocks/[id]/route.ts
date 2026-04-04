/**
 * Saved Block by ID - Read, Update & Delete
 *
 * GET /api/content/saved-blocks/[id]
 * Returns a single saved block
 *
 * PATCH /api/content/saved-blocks/[id]
 * Updates a user-owned saved block (system blocks are read-only)
 *
 * DELETE /api/content/saved-blocks/[id]
 * Deletes a user-owned saved block
 *
 * Epoch 11 Sprint 43: Block Infrastructure
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const block = await prisma.savedBlock.findFirst({
      where: {
        id,
        OR: [{ userId: session.user.id }, { userId: null }],
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!block) {
      return NextResponse.json(
        { error: "Saved block not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: block.id,
      title: block.title,
      blockType: block.blockType,
      tiptapJson: block.tiptapJson,
      categoryId: block.categoryId,
      categoryName: block.category.name,
      isSystem: block.userId === null,
      usageCount: block.usageCount,
      lastUsedAt: block.lastUsedAt?.toISOString() ?? null,
      createdAt: block.createdAt.toISOString(),
      updatedAt: block.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Get saved block error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to get saved block",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { title, tiptapJson, categoryId, searchText } = body;

    const block = await prisma.savedBlock.findUnique({ where: { id } });

    if (!block) {
      return NextResponse.json(
        { error: "Saved block not found" },
        { status: 404 }
      );
    }

    if (block.userId === null) {
      return NextResponse.json(
        { error: "System blocks are read-only" },
        { status: 403 }
      );
    }

    if (block.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Saved block not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return NextResponse.json(
          { error: "Title cannot be empty" },
          { status: 400 }
        );
      }
      updateData.title = title.trim();
    }

    if (tiptapJson !== undefined) {
      if (typeof tiptapJson !== "object") {
        return NextResponse.json(
          { error: "tiptapJson must be a JSON object" },
          { status: 400 }
        );
      }
      updateData.tiptapJson = tiptapJson;
    }

    if (categoryId !== undefined) {
      const category = await prisma.reusableCategory.findFirst({
        where: {
          id: categoryId,
          scope: "saved_block",
          OR: [{ userId: session.user.id }, { userId: null }],
        },
      });
      if (!category) {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 404 }
        );
      }
      updateData.categoryId = categoryId;
    }

    if (searchText !== undefined) {
      updateData.searchText = searchText;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.savedBlock.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return NextResponse.json({
      id: updated.id,
      title: updated.title,
      blockType: updated.blockType,
      tiptapJson: updated.tiptapJson,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
      isSystem: false,
      usageCount: updated.usageCount,
      lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Update saved block error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to update saved block",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const block = await prisma.savedBlock.findUnique({ where: { id } });

    if (!block) {
      return NextResponse.json(
        { error: "Saved block not found" },
        { status: 404 }
      );
    }

    if (block.userId === null) {
      return NextResponse.json(
        { error: "System blocks cannot be deleted" },
        { status: 403 }
      );
    }

    if (block.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Saved block not found" },
        { status: 404 }
      );
    }

    await prisma.savedBlock.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete saved block error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to delete saved block",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
