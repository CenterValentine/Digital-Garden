import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { FLASHCARD_SELECT, toFlashcardDto } from "@/lib/domain/flashcards";

type Params = Promise<{ id: string }>;

export async function POST(
  _request: Request,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const existing = await prisma.flashcard.findFirst({
      where: { id, ownerId: session.user.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Flashcard not found" },
        },
        { status: 404 }
      );
    }

    const updated = await prisma.flashcard.update({
      where: { id },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
      select: FLASHCARD_SELECT,
    });

    return NextResponse.json({ success: true, data: toFlashcardDto(updated) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to record flashcard view";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 }
    );
  }
}
