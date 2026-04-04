/**
 * Content Template Usage Tracking
 *
 * POST /api/content/templates/[id]/use
 * Increments usageCount and sets lastUsedAt
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
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

    const template = await prisma.contentTemplate.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Content template not found" },
        { status: 404 }
      );
    }

    await prisma.contentTemplate.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Track template usage error:", error);

    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to track template usage",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
