import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  MIN_REVIEWS_FOR_OPTIMIZATION,
  OptimizerNotReadyError,
  optimizeParameters,
} from "@/lib/domain/flashcards";

// POST /api/flashcards/parameters/optimize
//
// Retune the user's FSRS parameter weights against their review history.
//
// v1 status: STUB. The optimizer module is wired up but the actual
// training algorithm isn't shipped yet (ts-fsrs's Optimizer requires
// some careful UX around "your schedule will change" — see plan doc
// for the v1.1 target). We expose the route so the UI can:
//   1. Check eligibility (reviewsUsedForOptimization >= 100)
//   2. Show a "coming soon" affordance once eligible
//
// Returns:
//   - 503 NOT_READY when the user has < MIN_REVIEWS_FOR_OPTIMIZATION
//     reviews with a rating. Body includes the current count so the UI
//     can render progress ("47 / 100 reviews").
//   - 501 NOT_IMPLEMENTED when the user IS eligible (real retuning
//     coming in v1.1).
export async function POST() {
  try {
    const session = await requireAuth();

    const attempts = await prisma.flashcardReviewAttempt.findMany({
      where: { ownerId: session.user.id, rating: { not: null } },
      select: {
        rating: true,
        stateBefore: true,
        previousStability: true,
        previousDifficulty: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    try {
      const _result = await optimizeParameters({
        attempts: attempts.map((a) => ({
          rating: a.rating!,
          stateBefore: a.stateBefore,
          previousStability: a.previousStability,
          previousDifficulty: a.previousDifficulty,
          createdAt: a.createdAt,
        })),
      });
      // Unreachable until v1.1 — optimizeParameters() always throws.
      // The block here documents the eventual write path.
      return NextResponse.json({ success: true, data: { optimized: true } });
    } catch (err) {
      if (err instanceof OptimizerNotReadyError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_READY",
              message: err.message,
              meta: {
                reviewsAvailable: attempts.length,
                reviewsRequired: MIN_REVIEWS_FOR_OPTIMIZATION,
              },
            },
          },
          { status: 503 },
        );
      }
      // Eligible but not implemented yet — v1.1 lands the algorithm.
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_IMPLEMENTED",
            message:
              "FSRS parameter optimization is not yet shipped. You have enough review history; the algorithm lands in v1.1.",
            meta: {
              reviewsAvailable: attempts.length,
              reviewsRequired: MIN_REVIEWS_FOR_OPTIMIZATION,
            },
          },
        },
        { status: 501 },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run optimizer";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}
