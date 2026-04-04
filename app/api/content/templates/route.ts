/**
 * Content Templates API - List & Create
 *
 * GET /api/content/templates?categoryId=&search=&recent=5
 * Returns user's content templates, optionally grouped with "Recent" pseudo-category
 *
 * POST /api/content/templates
 * Creates a new content template for authenticated user
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");
    const recent = searchParams.get("recent");

    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.searchText = {
        contains: search,
        mode: "insensitive",
      };
    }

    const templates = await prisma.contentTemplate.findMany({
      where,
      select: {
        id: true,
        title: true,
        tiptapJson: true,
        categoryId: true,
        usageCount: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    const results = templates.map((t) => ({
      id: t.id,
      title: t.title,
      tiptapJson: t.tiptapJson,
      categoryId: t.categoryId,
      categoryName: t.category.name,
      usageCount: t.usageCount,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    // If "recent" param, prepend recently-used templates as a separate group
    if (recent) {
      const recentCount = parseInt(recent, 10) || 5;
      const recentTemplates = await prisma.contentTemplate.findMany({
        where: {
          userId: session.user.id,
          lastUsedAt: { not: null },
        },
        select: {
          id: true,
          title: true,
          tiptapJson: true,
          categoryId: true,
          usageCount: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { lastUsedAt: "desc" },
        take: recentCount,
      });

      return NextResponse.json({
        recent: recentTemplates.map((t) => ({
          id: t.id,
          title: t.title,
          tiptapJson: t.tiptapJson,
          categoryId: t.categoryId,
          categoryName: t.category.name,
          usageCount: t.usageCount,
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
        templates: results,
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("List content templates error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to list content templates",
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
    const { title, tiptapJson, categoryId, searchText } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Template title is required" },
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
        scope: "content_template",
        OR: [{ userId: session.user.id }, { userId: null }],
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found or not accessible" },
        { status: 404 }
      );
    }

    const template = await prisma.contentTemplate.create({
      data: {
        title: title.trim(),
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
        id: template.id,
        title: template.title,
        tiptapJson: template.tiptapJson,
        categoryId: template.categoryId,
        categoryName: template.category.name,
        usageCount: 0,
        lastUsedAt: null,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create content template error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to create content template",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
