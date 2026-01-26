/**
 * Content Tags API - Get Tags for Content
 *
 * GET /api/content/tags/content/[contentId]
 * Returns all tags associated with a specific content node
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/auth/middleware";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  try {
    // Require authentication
    await requireAuth();

    const { contentId } = await params;

    // Get all tags for this content node
    const contentTags = await prisma.contentTag.findMany({
      where: {
        contentId,
      },
      select: {
        id: true,
        positions: true,
        createdAt: true,
        tag: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
          },
        },
      },
      orderBy: {
        tag: {
          name: "asc", // Alphabetical order
        },
      },
    });

    // Transform to response format
    const results = contentTags.map((ct) => ({
      id: ct.tag.id,
      name: ct.tag.name,
      slug: ct.tag.slug,
      color: ct.tag.color,
      positions: ct.positions, // Array of { offset, context }
      linkedAt: ct.createdAt.toISOString(),
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Get content tags error:", error);

    // Handle authentication errors
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to get content tags",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
