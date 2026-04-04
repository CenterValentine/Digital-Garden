/**
 * Content Template by ID - Read, Update & Delete
 *
 * GET /api/content/templates/[id]
 * PATCH /api/content/templates/[id]
 * DELETE /api/content/templates/[id]
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
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

    const template = await prisma.contentTemplate.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Content template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: template.id,
      title: template.title,
      tiptapJson: template.tiptapJson,
      categoryId: template.categoryId,
      categoryName: template.category.name,
      usageCount: template.usageCount,
      lastUsedAt: template.lastUsedAt?.toISOString() ?? null,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Get content template error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to get content template",
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

    const template = await prisma.contentTemplate.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Content template not found" },
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
          scope: "content_template",
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

    const updated = await prisma.contentTemplate.update({
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
      tiptapJson: updated.tiptapJson,
      categoryId: updated.categoryId,
      categoryName: updated.category.name,
      usageCount: updated.usageCount,
      lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Update content template error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to update content template",
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

    const template = await prisma.contentTemplate.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Content template not found" },
        { status: 404 }
      );
    }

    await prisma.contentTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete content template error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to delete content template",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
