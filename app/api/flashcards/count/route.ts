import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const sourceContentId = searchParams.get("sourceContentId");

    if (!sourceContentId) {
      return NextResponse.json({
        success: true,
        data: { count: 0 },
      });
    }

    await resolveContentAccess(prisma, {
      contentId: sourceContentId,
      userId: session.user.id,
      require: "view",
    });

    const count = await prisma.flashcard.count({
      where: {
        ownerId: session.user.id,
        sourceContentId,
        reviewStatus: { not: "archived" },
      },
    });

    return NextResponse.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to count flashcards";
    const status = message.includes("Authentication") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status }
    );
  }
}
