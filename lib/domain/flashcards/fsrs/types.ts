import type { FlashcardRating, FlashcardState } from "@/lib/database/generated/prisma";

// camelCase subset of the FSRS column group on the Flashcard model.
// Kept as a plain interface so callers can pass a Prisma row directly
// (Prisma generates the same field names).
export interface FsrsCardState {
  state: FlashcardState;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  // Position in the (re)learning-step ladder. Resets when the card
  // graduates to Review or lapses to Relearning. Persisted on the
  // Flashcard row so a card mid-learning resumes correctly between
  // sessions.
  learningSteps: number;
  lastReviewedAt: Date | null;
}

// Audit row written to FlashcardReviewAttempt for every scored review.
// The "previous" fields preserve the pre-rating state so we can replay
// or rollback if the optimizer ever recomputes parameters.
export interface FsrsAuditLog {
  previousState: FlashcardState;
  nextState: FlashcardState;
  previousDue: Date;
  scheduledDue: Date;
  previousStability: number;
  newStability: number;
  previousDifficulty: number;
  newDifficulty: number;
}

export interface FsrsScheduleResult {
  next: FsrsCardState;
  log: FsrsAuditLog;
}

export interface FsrsIntervalPreview {
  dueAt: Date;
  intervalDays: number;
}

export type FsrsPreviewIntervals = Record<FlashcardRating, FsrsIntervalPreview>;
