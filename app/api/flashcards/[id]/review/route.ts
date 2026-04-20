import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { FLASHCARD_SELECT, toFlashcardDto } from "@/lib/domain/flashcards";
import type {
  FlashcardReviewMode,
  FlashcardReviewOutcome,
  FlashcardShownSide,
} from "@/lib/domain/flashcards";

type Params = Promise<{ id: string }>;

function parseOutcome(value: unknown): FlashcardReviewOutcome {
  return value === "mastered" ? "mastered" : "review";
}

function parseReviewMode(value: unknown): FlashcardReviewMode {
  if (
    value === "front_to_back" ||
    value === "back_to_front" ||
    value === "random"
  ) {
    return value;
  }
  return "front_to_back";
}

function parseShownSide(value: unknown): FlashcardShownSide {
  return value === "back" ? "back" : "front";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const outcome = parseOutcome(body.outcome);
    const reviewMode = parseReviewMode(body.reviewMode);
    const shownSide = parseShownSide(body.shownSide);
    const responseTimeMs = Number(body.responseTimeMs);

    const existing = await prisma.flashcard.findFirst({
      where: { id, ownerId: session.user.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Flashcard not found" } },
        { status: 404 }
      );
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.flashcardReviewAttempt.create({
        data: {
          flashcardId: id,
          ownerId: session.user.id,
          outcome,
          reviewMode,
          shownSide,
          responseTimeMs: Number.isFinite(responseTimeMs)
            ? Math.max(0, Math.trunc(responseTimeMs))
            : null,
        },
      });

      return tx.flashcard.update({
        where: { id },
        data: {
          reviewStatus: outcome,
          reviewCount: { increment: 1 },
          lastReviewedAt: now,
          masteredAt: outcome === "mastered" ? now : null,
        },
        select: FLASHCARD_SELECT,
      });
    });

    return NextResponse.json({ success: true, data: toFlashcardDto(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to review flashcard";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 }
    );
  }
}
