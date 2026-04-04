/**
 * Saved Blocks API - List & Create
 *
 * GET /api/content/saved-blocks?categoryId=&blockType=&search=
 * Returns saved blocks for authenticated user + system blocks
 *
 * POST /api/content/saved-blocks
 * Creates a new saved block for authenticated user
 *
 * Epoch 11 Sprint 43: Block Infrastructure
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const blockType = searchParams.get("blockType");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {
      OR: [{ userId: session.user.id }, { userId: null }],
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (blockType) {
      where.blockType = blockType;
    }

    if (search) {
      where.searchText = {
        contains: search,
        mode: "insensitive",
      };
    }

    const blocks = await prisma.savedBlock.findMany({
      where,
      select: {
        id: true,
        title: true,
        blockType: true,
        tiptapJson: true,
        categoryId: true,
        userId: true,
        usageCount: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
    });

    const results = blocks.map((block) => ({
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
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("List saved blocks error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to list saved blocks",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { title, blockType, tiptapJson, categoryId, searchText } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Block title is required" },
        { status: 400 }
      );
    }

    if (!blockType || typeof blockType !== "string") {
      return NextResponse.json(
        { error: "Block type is required" },
        { status: 400 }
      );
    }

    if (!tiptapJson || typeof tiptapJson !== "object") {
      return NextResponse.json(
        { error: "TipTap JSON content is required" },
        { status: 400 }
      );
    }

    if (!categoryId) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    // Verify category exists and user has access
    const category = await prisma.reusableCategory.findFirst({
      where: {
        id: categoryId,
        scope: "saved_block",
        OR: [{ userId: session.user.id }, { userId: null }],
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found or not accessible" },
        { status: 404 }
      );
    }

    const block = await prisma.savedBlock.create({
      data: {
        title: title.trim(),
        blockType,
        tiptapJson,
        searchText: searchText || title.trim().toLowerCase(),
        categoryId,
        userId: session.user.id,
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return NextResponse.json(
      {
        id: block.id,
        title: block.title,
        blockType: block.blockType,
        tiptapJson: block.tiptapJson,
        categoryId: block.categoryId,
        categoryName: block.category.name,
        isSystem: false,
        usageCount: 0,
        lastUsedAt: null,
        createdAt: block.createdAt.toISOString(),
        updatedAt: block.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create saved block error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to create saved block",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
