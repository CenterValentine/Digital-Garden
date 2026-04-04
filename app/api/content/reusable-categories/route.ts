/**
 * Reusable Categories API - List & Create
 *
 * GET /api/content/reusable-categories?scope=saved_block
 * Returns user + system categories for a given scope
 *
 * POST /api/content/reusable-categories
 * Creates a new category for authenticated user
 *
 * Epoch 11 Sprint 43: Block Infrastructure
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type { ReusableCategoryScope } from "@/lib/database/generated/prisma";

const VALID_SCOPES: ReusableCategoryScope[] = [
  "content_template",
  "snippet",
  "page_template",
  "saved_block",
];

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") as ReusableCategoryScope | null;

    if (!scope || !VALID_SCOPES.includes(scope)) {
      return NextResponse.json(
        { error: "Valid scope parameter required", validScopes: VALID_SCOPES },
        { status: 400 }
      );
    }

    // Fetch user-owned + system-wide (userId: null) categories
    const categories = await prisma.reusableCategory.findMany({
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

    const results = categories.map((cat) => {
      // Return the count for the relevant scope
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
    console.error("List reusable categories error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to list categories",
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
    const { name, scope, parentId } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
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
      .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens

    // Fallback for names that produce empty slugs (e.g., non-Latin characters)
    if (!slug) {
      slug = `cat-${Date.now()}`;
    }

    // Check for duplicate slug within user + scope
    const existing = await prisma.reusableCategory.findUnique({
      where: {
        userId_scope_slug: {
          userId: session.user.id,
          scope,
          slug,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A category with this name already exists" },
        { status: 409 }
      );
    }

    // Get max displayOrder for this user+scope
    const maxOrder = await prisma.reusableCategory.aggregate({
      where: { userId: session.user.id, scope },
      _max: { displayOrder: true },
    });

    const category = await prisma.reusableCategory.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        slug,
        scope,
        parentId: parentId || null,
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
      },
    });

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
    console.error("Create reusable category error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to create category",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
