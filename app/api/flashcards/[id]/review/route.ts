import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { FLASHCARD_SELECT, toFlashcardDto } from "@/lib/domain/flashcards";
import type {
  FlashcardReviewMode,
  FlashcardReviewOutcome,
  FlashcardShownSide,
} from "@/lib/domain/flashcards";

// Legacy review endpoint (Sprint 0 — superseded by POST /api/flashcards/review).
//
// Kept for back-compat with the FlashcardsPanel UI, which still calls
// this endpoint with the binary outcome. After Sprint 6's Migration C,
// the legacy reviewStatus / reviewCount / masteredAt columns are gone,
// so this endpoint no longer writes them — it only records the
// FlashcardReviewAttempt audit row + touches lastReviewedAt. The
// scheduler state (FSRS) is NOT advanced by this endpoint; the new
// /api/flashcards/review handles that with proper rating semantics.
//
// New UI code should call /api/flashcards/review. Legacy callers
// (FlashcardsPanel) get a no-op-on-schedule semantics here.

type Params = Promise<{ id: string }>;

function parseOutcome(value: unknown): FlashcardReviewOutcome {
  return value === "mastered" ? "mastered" : "review";
}

function parseReviewMode(value: unknown): FlashcardReviewMode {
  if (
    value === "front_to_back" ||
    value === "back_to_front" ||
    value === "random" ||
    value === "reference"
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
      where: { id, ownerId: session.user.id, deletedAt: null },
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
          // Sprint 6: no `rating` populated here — legacy endpoint
          // doesn't carry 4-button rating info. The FSRS optimizer
          // filters null-rating rows automatically.
        },
      });

      return tx.flashcard.update({
        where: { id },
        data: {
          // Sprint 6: legacy columns (reviewStatus, reviewCount,
          // masteredAt) are dropped by Migration C. Just touch
          // lastReviewedAt so the Panel can still surface "when did
          // we last see this card?" — note that scored reviews via
          // the new POST /review endpoint also touch lastReviewedAt.
          lastReviewedAt: now,
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
