/**
 * Page Templates - List & Create
 *
 * GET  /api/content/page-templates - List all (user + system), grouped by category
 * POST /api/content/page-templates - Create a user-owned page template
 *
 * Epoch 11 Sprint 46: Page Templates
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuth();

    const templates = await prisma.pageTemplate.findMany({
      where: {
        OR: [{ userId: session.user.id }, { userId: null }],
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ category: { displayOrder: "asc" } }, { title: "asc" }],
    });

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
    console.error("List page templates error:", error);
    return NextResponse.json({ error: "Failed to list page templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { title, tiptapJson, categoryId, defaultTitle, searchText } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!tiptapJson || typeof tiptapJson !== "object") {
      return NextResponse.json({ error: "tiptapJson is required" }, { status: 400 });
    }

    // Validate category belongs to user (or system) and is page_template scope
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

    const template = await prisma.pageTemplate.create({
      data: {
        title: title.trim(),
        tiptapJson,
        categoryId,
        userId: session.user.id,
        defaultTitle: defaultTitle?.trim() || null,
        searchText: searchText || title.trim().toLowerCase(),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

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
    console.error("Create page template error:", error);
    return NextResponse.json({ error: "Failed to create page template" }, { status: 500 });
  }
}
