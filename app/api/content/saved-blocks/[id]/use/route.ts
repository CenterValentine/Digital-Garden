/**
 * Saved Block Usage Tracking
 *
 * POST /api/content/saved-blocks/[id]/use
 * Increments usageCount and updates lastUsedAt
 *
 * Epoch 11 Sprint 43: Block Infrastructure
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Verify the block exists and user has access
    const block = await prisma.savedBlock.findFirst({
      where: {
        id,
        OR: [{ userId: session.user.id }, { userId: null }],
      },
    });

    if (!block) {
      return NextResponse.json(
        { error: "Saved block not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.savedBlock.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    return NextResponse.json({
      id: updated.id,
      usageCount: updated.usageCount,
      lastUsedAt: updated.lastUsedAt?.toISOString(),
    });
  } catch (error) {
    console.error("Track saved block usage error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to track usage",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
