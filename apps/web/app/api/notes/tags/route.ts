/**
 * Tags API - List & Create Tags
 *
 * GET /api/notes/tags?search=query
 * Returns all tags for authenticated user with optional search filter
 *
 * POST /api/notes/tags
 * Creates a new tag for authenticated user
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/middleware";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    // Build where clause with optional search
    const where: any = {
      userId: session.user.id,
    };

    if (search) {
      where.name = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Get all tags for user with usage counts
    const tags = await prisma.tag.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        createdAt: true,
        _count: {
          select: {
            contentTags: true, // Usage count
          },
        },
      },
      orderBy: [
        { contentTags: { _count: "desc" } }, // Most used first
        { name: "asc" }, // Then alphabetically
      ],
    });

    // Transform to response format
    const results = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      color: tag.color,
      usageCount: tag._count.contentTags,
      createdAt: tag.createdAt.toISOString(),
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("List tags error:", error);

    // Handle authentication errors
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to list tags", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }

    // Generate slug from name (lowercase, replace spaces with hyphens)
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    // Check if tag with this slug already exists for this user
    const existing = await prisma.tag.findUnique({
      where: {
        userId_slug: {
          userId: session.user.id,
          slug,
        },
      },
    });

    if (existing) {
      // Return existing tag instead of error
      return NextResponse.json({
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        color: existing.color,
        createdAt: existing.createdAt.toISOString(),
      });
    }

    // Create new tag
    const tag = await prisma.tag.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        slug,
        color: color || null,
      },
    });

    return NextResponse.json({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      color: tag.color,
      createdAt: tag.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Create tag error:", error);

    // Handle authentication errors
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create tag", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
