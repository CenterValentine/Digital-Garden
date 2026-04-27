import type { JSONContent } from "@tiptap/core";

export type FlashcardReviewStatus = "new" | "review" | "mastered" | "archived";
export type FlashcardReviewOutcome = "review" | "mastered";
export type FlashcardReviewMode = "front_to_back" | "back_to_front" | "random";
export type FlashcardShownSide = "front" | "back";

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
}

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

export interface FlashcardOptionsDto {
  categories: string[];
  subcategoriesByCategory: Record<string, string[]>;
  frontLabels: string[];
  backLabels: string[];
}
