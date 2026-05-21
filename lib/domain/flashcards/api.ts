import { Prisma } from "@/lib/database/generated/prisma";
import {
  normalizeTiptapDoc,
  summarizeFlashcardContent,
} from "./content";
import type {
  FlashcardCardType,
  FlashcardDeckRecordDto,
  FlashcardDto,
  FlashcardReviewStatus,
  FlashcardState,
} from "./types";

// Card select with the legacy + FSRS column set. Extended in Epoch 19 —
// new columns are at the bottom of the literal so a `git blame` makes
// the addition obvious.
export const FLASHCARD_SELECT = {
  id: true,
  sourceContentId: true,
  sourceContent: {
    select: {
      title: true,
    },
  },
  frontLabel: true,
  backLabel: true,
  frontContent: true,
  backContent: true,
  isFrontRichText: true,
  category: true,
  subcategory: true,
  reviewStatus: true,
  reviewCount: true,
  viewCount: true,
  lastReviewedAt: true,
  lastViewedAt: true,
  masteredAt: true,
  createdAt: true,
  updatedAt: true,
  // FSRS additions (Epoch 19, Sprint 2).
  deckId: true,
  cardType: true,
  state: true,
  due: true,
  stability: true,
  difficulty: true,
  elapsedDays: true,
  scheduledDays: true,
  reps: true,
  lapses: true,
  learningSteps: true,
  suspendedAt: true,
  archivedAt: true,
  deletedAt: true,
} satisfies Prisma.FlashcardSelect;

type SelectedFlashcard = Prisma.FlashcardGetPayload<{
  select: typeof FLASHCARD_SELECT;
}>;

export function toFlashcardDto(card: SelectedFlashcard): FlashcardDto {
  const frontContent = normalizeTiptapDoc(card.frontContent);
  const backContent = normalizeTiptapDoc(card.backContent);

  return {
    id: card.id,
    sourceContentId: card.sourceContentId,
    sourceTitle: card.sourceContent?.title ?? null,
    frontLabel: card.frontLabel,
    backLabel: card.backLabel,
    frontContent,
    backContent,
    frontPreview: summarizeFlashcardContent(frontContent),
    backPreview: summarizeFlashcardContent(backContent),
    isFrontRichText: card.isFrontRichText,
    category: card.category,
    subcategory: card.subcategory,
    reviewStatus: card.reviewStatus as FlashcardReviewStatus,
    reviewCount: card.reviewCount,
    viewCount: card.viewCount,
    lastReviewedAt: card.lastReviewedAt?.toISOString() ?? null,
    lastViewedAt: card.lastViewedAt?.toISOString() ?? null,
    masteredAt: card.masteredAt?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    // FSRS additions.
    deckId: card.deckId,
    cardType: card.cardType as FlashcardCardType,
    state: card.state as FlashcardState,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: card.learningSteps,
  };
}

// Deck record select. Aggregate counts (childCount/cardCount/dueCount/
// newCount) are computed by the route handlers via Prisma `_count`
// joins, not selected directly — keeping this literal narrow.
export const FLASHCARD_DECK_SELECT = {
  id: true,
  parentDeckId: true,
  name: true,
  slug: true,
  path: true,
  description: true,
  displayOrder: true,
  iconName: true,
  iconColor: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FlashcardDeckSelect;

type SelectedFlashcardDeck = Prisma.FlashcardDeckGetPayload<{
  select: typeof FLASHCARD_DECK_SELECT;
}>;

// Optional aggregate roll-ups callers can attach. Route handlers compute
// these separately and pass them in — letting toFlashcardDeckRecordDto
// stay pure (no Prisma access here).
export interface DeckAggregates {
  childCount?: number;
  cardCount?: number;
  dueCount?: number;
  newCount?: number;
}

export function toFlashcardDeckRecordDto(
  deck: SelectedFlashcardDeck,
  aggregates: DeckAggregates = {},
): FlashcardDeckRecordDto {
  return {
    id: deck.id,
    parentDeckId: deck.parentDeckId,
    name: deck.name,
    slug: deck.slug,
    path: deck.path,
    description: deck.description,
    displayOrder: deck.displayOrder,
    iconName: deck.iconName,
    iconColor: deck.iconColor,
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
    ...(aggregates.childCount !== undefined ? { childCount: aggregates.childCount } : {}),
    ...(aggregates.cardCount !== undefined ? { cardCount: aggregates.cardCount } : {}),
    ...(aggregates.dueCount !== undefined ? { dueCount: aggregates.dueCount } : {}),
    ...(aggregates.newCount !== undefined ? { newCount: aggregates.newCount } : {}),
  };
}

// Slug generator shared between the API routes and the backfill script.
// Matches scripts/backfill-flashcard-decks.ts so deck slugs created via
// the API are interchangeable with slugs the backfill produces.
export function slugifyDeckName(input: string, maxLen = 140): string {
  const cleaned = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, maxLen) || "deck";
}
