import type { FlashcardRating, FlashcardState } from "@/lib/database/generated/prisma";
import type { StoredFsrsParameters } from "./parameters";

// Stub for FSRS parameter optimization (Epoch 19, Sprint 2).
//
// Full implementation deferred to v1.1. The optimizer reads a user's
// complete review history (filtered to attempts with non-null rating),
// runs ts-fsrs's Optimizer against it, and returns retuned 19-weight
// parameters that improve schedule accuracy for that user specifically.
//
// Why a stub for v1: shipping optimization needs (a) at least ~100
// reviews of history to be meaningful, (b) an opt-in UI button + UX
// around "your schedule will change," and (c) async job handling — none
// of which exist yet. The endpoint /api/flashcards/parameters/optimize
// surfaces the MIN_REVIEWS_FOR_OPTIMIZATION constant as the gate.

export const MIN_REVIEWS_FOR_OPTIMIZATION = 100;

export interface OptimizerInput {
  // Subset of FlashcardReviewAttempt rows needed for optimization. Pass
  // attempts ordered by createdAt ASC, with NULL ratings filtered out.
  attempts: ReadonlyArray<{
    rating: FlashcardRating;
    stateBefore: FlashcardState | null;
    previousStability: number | null;
    previousDifficulty: number | null;
    createdAt: Date;
  }>;
}

export interface OptimizerResult {
  parameters: StoredFsrsParameters;
}

export class OptimizerNotReadyError extends Error {
  constructor(reviewsAvailable: number) {
    super(
      `Optimization needs at least ${MIN_REVIEWS_FOR_OPTIMIZATION} reviews ` +
        `with a rating — found ${reviewsAvailable}.`,
    );
    this.name = "OptimizerNotReadyError";
  }
}

// v1: rejects with OptimizerNotReadyError when there isn't enough data,
// and a plain Error otherwise (the actual training isn't implemented yet).
// The /parameters/optimize route translates both into structured 4xx
// responses; nothing else should call this directly until v1.1.
export async function optimizeParameters(input: OptimizerInput): Promise<OptimizerResult> {
  if (input.attempts.length < MIN_REVIEWS_FOR_OPTIMIZATION) {
    throw new OptimizerNotReadyError(input.attempts.length);
  }
  throw new Error("FSRS parameter optimization is not yet implemented (v1.1 target).");
}
