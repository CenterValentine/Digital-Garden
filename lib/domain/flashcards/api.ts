import { Prisma } from "@/lib/database/generated/prisma";
import {
  normalizeTiptapDoc,
  summarizeFlashcardContent,
} from "./content";
import type { FlashcardDto, FlashcardReviewStatus } from "./types";

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
  };
}
