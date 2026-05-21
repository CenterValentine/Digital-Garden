import type { JSONContent } from "@tiptap/core";

export type FlashcardReviewStatus = "new" | "review" | "mastered" | "archived";
export type FlashcardReviewOutcome = "review" | "mastered";
// Extended in Migration A with `reference` for inline-block skims that
// log an attempt but don't feed the FSRS scheduler.
export type FlashcardReviewMode =
  | "front_to_back"
  | "back_to_front"
  | "random"
  | "reference";

// User-settable default review mode. Excludes `reference` because that's
// a per-block runtime mode, not a "default" anyone'd want as their
// preferred study mode. The settings validator (Zod) only accepts these
// three; the dialog binds to this narrower type.
export type FlashcardSettingsReviewMode = Exclude<FlashcardReviewMode, "reference">;
export type FlashcardShownSide = "front" | "back";

// FSRS scheduling enums (Epoch 19). Mirror the Prisma enums on the
// generated client so the client and server agree on string values.
export type FlashcardState =
  | "new"
  | "learning"
  | "review"
  | "relearning"
  | "suspended"
  | "archived";
export type FlashcardRating = "again" | "hard" | "good" | "easy";
export type FlashcardCardType = "basic";

export interface FlashcardDto {
  id: string;
  sourceContentId: string | null;
  sourceTitle: string | null;
  frontLabel: string;
  backLabel: string;
  frontContent: JSONContent;
  backContent: JSONContent;
  frontPreview: string;
  backPreview: string;
  isFrontRichText: boolean;
  category: string;
  subcategory: string;
  reviewStatus: FlashcardReviewStatus;
  reviewCount: number;
  viewCount: number;
  lastReviewedAt: string | null;
  lastViewedAt: string | null;
  masteredAt: string | null;
  createdAt: string;
  updatedAt: string;
  // FSRS fields (Epoch 19). Optional so existing callers that ignore
  // the scheduler data don't have to be updated. Routes always populate
  // them when the new FSRS columns are read.
  deckId?: string | null;
  cardType?: FlashcardCardType;
  state?: FlashcardState;
  due?: string;
  stability?: number;
  difficulty?: number;
  reps?: number;
  lapses?: number;
  learningSteps?: number;
}

// Legacy aggregate shape — string-keyed counts of cards per category +
// subcategory. Used by the original `/api/flashcards/decks` GET route
// and existing UI components (FlashcardsPanel). Stays unchanged during
// the Session 5 UI migration.
export interface FlashcardDeckDto {
  category: string;
  subcategory: string;
  count: number;
  newCount: number;
  reviewCount: number;
  masteredCount: number;
  reviewedCount: number;
  viewedCount: number;
}

// FK-paradigm deck record returned by the new deck CRUD routes. Distinct
// type so old aggregate consumers don't accidentally see id/path/etc.
// fields they aren't prepared for. childCount/dueCount are derived
// server-side via aggregate joins, not stored on the deck row.
export interface FlashcardDeckRecordDto {
  id: string;
  parentDeckId: string | null;
  name: string;
  slug: string;
  path: string;
  description: string | null;
  displayOrder: number;
  iconName: string | null;
  iconColor: string | null;
  createdAt: string;
  updatedAt: string;
  // Aggregate roll-ups computed by the route handlers, not stored
  // columns. Routes that don't need them can omit by leaving undefined.
  childCount?: number;
  cardCount?: number;
  dueCount?: number;
  newCount?: number;
}

export interface FlashcardOptionsDto {
  categories: string[];
  subcategoriesByCategory: Record<string, string[]>;
  frontLabels: string[];
  backLabels: string[];
}

// Per-user FSRS settings DTO. Mirrors the User columns added in
// Migration A. desiredRetention is exposed as a 0–1 float; the UI
// formats it as a percentage.
export interface FlashcardSettingsDto {
  desiredRetention: number;
  fsrsMaxInterval: number;
  defaultFlashcardDeckId: string | null;
  hasOptimizedParameters: boolean;
  parametersOptimizedAt: string | null;
  reviewsUsedForOptimization: number;
}
