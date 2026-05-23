import {
  fsrs,
  Rating as TsRating,
  State as TsState,
  type CardInput,
  type FSRSParameters,
  type Grade,
} from "ts-fsrs";
import type { FlashcardRating, FlashcardState } from "@/lib/database/generated/prisma";
import type {
  FsrsCardState,
  FsrsPreviewIntervals,
  FsrsScheduleResult,
} from "./types";

// Domain → library enum mappers. We define these as functions (not
// `Record<...>`) because TS numeric enums coerce keys to string at
// runtime, which complicates the typing. A pair of small switches is
// type-safe, exhaustive (the compiler errors if a new domain value is
// added without handling), and easy to read.
function domainStateToTs(state: FlashcardState): TsState {
  switch (state) {
    case "new":
      return TsState.New;
    case "learning":
      return TsState.Learning;
    case "review":
      return TsState.Review;
    case "relearning":
      return TsState.Relearning;
    case "suspended":
    case "archived":
      // We never feed user-driven holds to ts-fsrs; the route layer is
      // responsible for refusing to score these. This branch only fires
      // if a caller bypasses that guard — fall through to Review so the
      // type system is satisfied; the throw at the call site catches it.
      throw new Error(`Cannot schedule a flashcard in state '${state}'.`);
  }
}

function tsStateToDomain(state: TsState): FlashcardState {
  switch (state) {
    case TsState.New:
      return "new";
    case TsState.Learning:
      return "learning";
    case TsState.Review:
      return "review";
    case TsState.Relearning:
      return "relearning";
  }
}

function domainRatingToTs(rating: FlashcardRating): Grade {
  switch (rating) {
    case "again":
      return TsRating.Again;
    case "hard":
      return TsRating.Hard;
    case "good":
      return TsRating.Good;
    case "easy":
      return TsRating.Easy;
  }
}

// Translate camelCase domain card → snake_case ts-fsrs Card input.
function toTsCard(card: FsrsCardState): CardInput {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: domainStateToTs(card.state),
    last_review: card.lastReviewedAt ?? undefined,
  };
}

export interface ScheduleReviewInput {
  card: FsrsCardState;
  rating: FlashcardRating;
  now: Date;
  parameters: FSRSParameters;
}

// Apply a rating to a card. Returns the updated card state and an audit
// log that the route handler writes to FlashcardReviewAttempt for replay
// / optimizer training.
export function scheduleReview(input: ScheduleReviewInput): FsrsScheduleResult {
  const { card, rating, now, parameters } = input;
  const scheduler = fsrs(parameters);
  const result = scheduler.next(toTsCard(card), now, domainRatingToTs(rating));
  const next: FsrsCardState = {
    state: tsStateToDomain(result.card.state),
    due: result.card.due,
    stability: result.card.stability,
    difficulty: result.card.difficulty,
    elapsedDays: result.card.elapsed_days,
    scheduledDays: result.card.scheduled_days,
    reps: result.card.reps,
    lapses: result.card.lapses,
    learningSteps: result.card.learning_steps,
    lastReviewedAt: result.card.last_review ?? null,
  };
  return {
    next,
    log: {
      previousState: card.state,
      nextState: next.state,
      previousDue: card.due,
      scheduledDue: next.due,
      previousStability: card.stability,
      newStability: next.stability,
      previousDifficulty: card.difficulty,
      newDifficulty: next.difficulty,
    },
  };
}

// Compute the "next interval" preview for each of the 4 rating buttons.
// Powers the labels under each button in the review overlay — Anki shows
// these too, and they make spaced repetition feel less opaque.
//
// We round intervalDays to 2 decimals so the UI can format "10m" vs
// "0.01d" without losing intra-day precision (the smallest sane interval
// is around 1 minute = ~0.0007d).
export function previewIntervals(
  card: FsrsCardState,
  parameters: FSRSParameters,
  now: Date,
): FsrsPreviewIntervals {
  const scheduler = fsrs(parameters);
  const preview = scheduler.repeat(toTsCard(card), now);
  const intervalDays = (due: Date): number => {
    const ms = due.getTime() - now.getTime();
    return Math.max(0, Math.round((ms / 86_400_000) * 100) / 100);
  };
  return {
    again: { dueAt: preview[TsRating.Again].card.due, intervalDays: intervalDays(preview[TsRating.Again].card.due) },
    hard: { dueAt: preview[TsRating.Hard].card.due, intervalDays: intervalDays(preview[TsRating.Hard].card.due) },
    good: { dueAt: preview[TsRating.Good].card.due, intervalDays: intervalDays(preview[TsRating.Good].card.due) },
    easy: { dueAt: preview[TsRating.Easy].card.due, intervalDays: intervalDays(preview[TsRating.Easy].card.due) },
  };
}

// Construct a "fresh card" record for newly-created flashcards. Mirrors
// ts-fsrs's createEmptyCard() but produces our camelCase shape.
export function emptyCardState(now: Date = new Date()): FsrsCardState {
  return {
    state: "new",
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    learningSteps: 0,
    lastReviewedAt: null,
  };
}
