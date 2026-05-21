import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  FLASHCARD_SELECT,
  getEffectiveParameters,
  scheduleReview,
  toFlashcardDto,
} from "@/lib/domain/flashcards";
import type {
  FlashcardRating,
  FlashcardReviewMode,
  FlashcardShownSide,
} from "@/lib/domain/flashcards";

// POST /api/flashcards/review
//
// FSRS-scheduled review submission. Replaces the legacy binary
// outcome workflow on /api/flashcards/[id]/review (which stays for
// back-compat during the UI migration).
//
// Body:
//   - cardId (required)
//   - rating: "again" | "hard" | "good" | "easy" (required for scored
//     review; omit for reference-mode skim)
//   - reviewMode: "front_to_back" | "back_to_front" | "random" |
//     "reference" (default "front_to_back")
//   - shownSide: "front" | "back" (default "front")
//   - responseTimeMs: optional integer
//
// Behavior:
//   - When rating is present and reviewMode != "reference": logs a full
//     FSRS audit row to FlashcardReviewAttempt, runs the scheduler, and
//     updates the Flashcard's due/state/stability/etc.
//   - When reviewMode === "reference" (with or without rating): logs an
//     attempt row with rating IS NULL and does NOT touch the card's
//     schedule. This is how inline-block "reference mode" skims are
//     captured without polluting the user's queue.
//
// Returns:
//   {
//     card: <updated FlashcardDto>,
//     log: { previousState, nextState, previousDue, scheduledDue, ... },
//     nextCardId: string | null   // convenience for review sessions
//   }
//
// Refuses to score suspended/archived cards (400) — those are explicit
// user holds. Refuses to score reference-mode with a rating mismatch.
const VALID_RATINGS: ReadonlyArray<FlashcardRating> = ["again", "hard", "good", "easy"];
const VALID_MODES: ReadonlyArray<FlashcardReviewMode> = [
  "front_to_back",
  "back_to_front",
  "random",
  "reference",
];

function parseRating(value: unknown): FlashcardRating | null {
  return typeof value === "string" && (VALID_RATINGS as readonly string[]).includes(value)
    ? (value as FlashcardRating)
    : null;
}

function parseReviewMode(value: unknown): FlashcardReviewMode {
  return typeof value === "string" && (VALID_MODES as readonly string[]).includes(value)
    ? (value as FlashcardReviewMode)
    : "front_to_back";
}

function parseShownSide(value: unknown): FlashcardShownSide {
  return value === "back" ? "back" : "front";
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as Record<string, unknown>;

    const cardId = typeof body.cardId === "string" ? body.cardId : "";
    if (!cardId) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_INPUT", message: "cardId is required." } },
        { status: 400 },
      );
    }

    const rating = parseRating(body.rating);
    const reviewMode = parseReviewMode(body.reviewMode);
    const shownSide = parseShownSide(body.shownSide);
    const responseTimeMs = Number(body.responseTimeMs);
    const isReference = reviewMode === "reference";

    if (!isReference && !rating) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "rating is required for scored review. Use reviewMode='reference' to skim.",
          },
        },
        { status: 400 },
      );
    }

    const card = await prisma.flashcard.findFirst({
      where: { id: cardId, ownerId: session.user.id, deletedAt: null },
      select: FLASHCARD_SELECT,
    });
    if (!card) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Flashcard not found." } },
        { status: 404 },
      );
    }

    if (!isReference && (card.state === "suspended" || card.state === "archived")) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_STATE",
            message: `Cannot score a card in state '${card.state}'. Unsuspend/unarchive first.`,
          },
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: {
        fsrsParameters: true,
        desiredRetention: true,
        fsrsMaxInterval: true,
      },
    });
    const params = getEffectiveParameters(user);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      if (isReference) {
        // Reference-mode skim: log the attempt, never call scheduler.
        // rating is NULL so the optimizer filters this row out.
        await tx.flashcardReviewAttempt.create({
          data: {
            flashcardId: card.id,
            ownerId: session.user.id,
            outcome: "review", // legacy column, populated to keep schema NOT NULL happy
            reviewMode,
            shownSide,
            responseTimeMs: Number.isFinite(responseTimeMs)
              ? Math.max(0, Math.trunc(responseTimeMs))
              : null,
            // rating omitted ⇒ NULL
          },
        });
        // Touch lastViewedAt + viewCount but NOT the schedule.
        const updated = await tx.flashcard.update({
          where: { id: card.id },
          data: {
            viewCount: { increment: 1 },
            lastViewedAt: now,
          },
          select: FLASHCARD_SELECT,
        });
        return { updated, log: null };
      }

      // Scored review.
      const schedule = scheduleReview({
        card: {
          state: card.state,
          due: card.due,
          stability: card.stability,
          difficulty: card.difficulty,
          elapsedDays: card.elapsedDays,
          scheduledDays: card.scheduledDays,
          reps: card.reps,
          lapses: card.lapses,
          learningSteps: card.learningSteps,
          lastReviewedAt: card.lastReviewedAt,
        },
        rating: rating!,
        now,
        parameters: params,
      });

      await tx.flashcardReviewAttempt.create({
        data: {
          flashcardId: card.id,
          ownerId: session.user.id,
          // Legacy outcome column: "mastered" only when card reaches
          // review state via Easy; "review" otherwise. Approximation,
          // not load-bearing — only there for back-compat aggregates.
          outcome: schedule.next.state === "review" && rating === "easy" ? "mastered" : "review",
          reviewMode,
          shownSide,
          responseTimeMs: Number.isFinite(responseTimeMs)
            ? Math.max(0, Math.trunc(responseTimeMs))
            : null,
          rating,
          stateBefore: schedule.log.previousState,
          stateAfter: schedule.log.nextState,
          previousDue: schedule.log.previousDue,
          scheduledDue: schedule.log.scheduledDue,
          previousStability: schedule.log.previousStability,
          newStability: schedule.log.newStability,
          previousDifficulty: schedule.log.previousDifficulty,
          newDifficulty: schedule.log.newDifficulty,
        },
      });

      const updated = await tx.flashcard.update({
        where: { id: card.id },
        data: {
          state: schedule.next.state,
          due: schedule.next.due,
          stability: schedule.next.stability,
          difficulty: schedule.next.difficulty,
          elapsedDays: schedule.next.elapsedDays,
          scheduledDays: schedule.next.scheduledDays,
          reps: schedule.next.reps,
          lapses: schedule.next.lapses,
          learningSteps: schedule.next.learningSteps,
          lastReviewedAt: now,
          // Keep legacy reviewStatus + reviewCount + lastReviewedAt in
          // sync during the transition window. UI components that read
          // these stay functional until Migration C drops them.
          reviewStatus:
            schedule.next.state === "review" && rating === "easy" ? "mastered" : "review",
          reviewCount: { increment: 1 },
        },
        select: FLASHCARD_SELECT,
      });

      return { updated, log: schedule.log };
    });

    // Look up the next due card (excluding the one we just scored, since
    // it's no longer due). Scoped to the same deck so multi-deck review
    // sessions don't accidentally jump contexts. Returns null when the
    // session is done — the UI shows the "caught up" state.
    const nextCard = await prisma.flashcard.findFirst({
      where: {
        ownerId: session.user.id,
        deletedAt: null,
        id: { not: card.id },
        state: { in: ["new", "learning", "review", "relearning"] },
        ...(card.deckId ? { deckId: card.deckId } : {}),
        OR: [{ due: { lte: new Date() } }, { state: "new" }],
      },
      select: { id: true },
      orderBy: [{ due: "asc" }],
    });

    return NextResponse.json({
      success: true,
      data: {
        card: toFlashcardDto(result.updated),
        log: result.log,
        nextCardId: nextCard?.id ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record review";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}
