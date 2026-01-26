/**
 * Tag Search API - Autocomplete
 *
 * GET /api/content/tags/search?query=react
 * Returns tags matching search query for autocomplete
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Search tags by name/slug (case-insensitive)
    // Order by usage count (descending), then alphabetically
    const tags = await prisma.tag.findMany({
      where: {
        userId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query.toLowerCase() } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
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
      take: 10, // Limit autocomplete results
    });

    // Transform to autocomplete format
    const results = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      color: tag.color,
      usageCount: tag._count.contentTags,
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Tag search error:", error);
    return NextResponse.json(
      { error: "Failed to search tags", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
