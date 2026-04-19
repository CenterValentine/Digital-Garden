export const FLASHCARD_QUICK_ADD_EVENT = "dg:flashcards-quick-add";
export const FLASHCARD_VIEW_SOURCE_EVENT = "dg:flashcards-view-source";
export const FLASHCARD_CHANGED_EVENT = "dg:flashcards-changed";

export interface FlashcardViewSourceEventDetail {
  sourceContentId: string;
  sourceTitle?: string | null;
}
