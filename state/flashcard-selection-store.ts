/**
 * Flashcard Selection Store (Epoch 19, Sprint 8)
 *
 * Ephemeral state machine for the "highlight to flashcard" workflow.
 *
 * Lifecycle:
 *   idle
 *     → start(deckId)
 *   awaiting-front   (cursor crosshair, hint: "Highlight the FRONT")
 *     → commitFrontRange({ from, to })
 *   awaiting-back    (cursor crosshair, hint: "Highlight the BACK")
 *     → commitBackRange({ from, to })
 *   submitting       (POST /api/flashcards in flight)
 *     → resolveSuccess(flashcardId) | resolveError()
 *   idle
 *
 * Esc at any non-idle phase calls `cancel()` which resets to idle and
 * returns the cardSetId — the caller is responsible for removing any
 * front-side mark that was already applied (the editor extension knows
 * how to do that; the store doesn't touch ProseMirror directly).
 *
 * Nothing here persists — last-used deck and quickFireEnabled live in
 * user settings (server-persisted via /api/flashcards/selection-defaults).
 */

import { create } from "zustand";
import { paletteIndexFromCardSetId } from "@/lib/domain/editor/extensions/flashcard-select";

export type FlashcardSelectionPhase =
  | "idle"
  | "awaiting-front"
  | "awaiting-back"
  | "submitting";

export interface FlashcardRange {
  from: number;
  to: number;
}

interface FlashcardSelectionStateShape {
  phase: FlashcardSelectionPhase;
  /** Deck the card will be created in. Non-null while phase !== "idle". */
  deckId: string | null;
  /** UUID linking front + back marks of the same card. */
  cardSetId: string | null;
  /** Palette slot (0..11) for both marks of this card set. */
  paletteIndex: number;
  /** Saved on commitFrontRange so abandon path can clean it up. */
  frontRange: FlashcardRange | null;
}

interface FlashcardSelectionActions {
  /**
   * Enter awaiting-front. Generates a fresh cardSetId + palette slot.
   * Returns the generated cardSetId so the caller can pass it to the
   * mark setter when the user drags a selection.
   */
  start: (deckId: string) => {
    cardSetId: string;
    paletteIndex: number;
  };

  /**
   * Mark the front range as committed. Transitions to awaiting-back.
   * The mark has already been applied to ProseMirror at this point.
   */
  commitFrontRange: (range: FlashcardRange) => void;

  /**
   * Mark the back range as committed. Transitions to submitting.
   * Returns the snapshot the caller needs to make the API call.
   */
  commitBackRange: (
    range: FlashcardRange,
  ) =>
    | {
        cardSetId: string;
        deckId: string;
        paletteIndex: number;
        frontRange: FlashcardRange;
        backRange: FlashcardRange;
      }
    | null;

  /**
   * Cancel the in-flight selection. Returns whatever bookkeeping the
   * caller needs to clean up any partial mark in the document
   * (specifically: the cardSetId of marks to remove). Returns null if
   * already idle (no-op).
   */
  cancel: () => { cardSetId: string } | null;

  /** Successful API response — go back to idle. */
  resolveSuccess: () => void;

  /**
   * Failed API response — return to idle and surface the cardSetId so
   * the caller can roll back both marks.
   */
  resolveError: () => { cardSetId: string } | null;
}

type FlashcardSelectionStore = FlashcardSelectionStateShape & FlashcardSelectionActions;

function freshCardSetId(): string {
  // crypto.randomUUID is available in modern browsers + Node 19+. Both
  // SSR and CSR call sites are post-bootstrap so we can rely on it.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback shouldn't fire in practice but keeps types honest. Uses
  // a randomized timestamp string — sufficient for in-memory pairing
  // since the value is fed into a UUID column server-side anyway.
  return `fc-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const IDLE_STATE: FlashcardSelectionStateShape = {
  phase: "idle",
  deckId: null,
  cardSetId: null,
  paletteIndex: 0,
  frontRange: null,
};

export const useFlashcardSelectionStore = create<FlashcardSelectionStore>(
  (set, get) => ({
    ...IDLE_STATE,

    start: (deckId) => {
      const cardSetId = freshCardSetId();
      const paletteIndex = paletteIndexFromCardSetId(cardSetId);
      set({
        phase: "awaiting-front",
        deckId,
        cardSetId,
        paletteIndex,
        frontRange: null,
      });
      return { cardSetId, paletteIndex };
    },

    commitFrontRange: (range) => {
      const { phase } = get();
      if (phase !== "awaiting-front") return;
      set({ phase: "awaiting-back", frontRange: range });
    },

    commitBackRange: (range) => {
      const { phase, deckId, cardSetId, paletteIndex, frontRange } = get();
      if (
        phase !== "awaiting-back" ||
        !deckId ||
        !cardSetId ||
        !frontRange
      ) {
        return null;
      }
      set({ phase: "submitting" });
      return {
        cardSetId,
        deckId,
        paletteIndex,
        frontRange,
        backRange: range,
      };
    },

    cancel: () => {
      const { phase, cardSetId } = get();
      if (phase === "idle") return null;
      set({ ...IDLE_STATE });
      return cardSetId ? { cardSetId } : null;
    },

    resolveSuccess: () => {
      set({ ...IDLE_STATE });
    },

    resolveError: () => {
      const { cardSetId } = get();
      set({ ...IDLE_STATE });
      return cardSetId ? { cardSetId } : null;
    },
  }),
);

/** Pure selector — true while we're in any non-idle phase. */
export const selectIsSelecting = (s: FlashcardSelectionStore): boolean =>
  s.phase !== "idle";

/** Pure selector — copy for the floating hint bar. */
export function selectionHintFor(phase: FlashcardSelectionPhase): string | null {
  switch (phase) {
    case "awaiting-front":
      return "Highlight the FRONT of the card — Esc to cancel";
    case "awaiting-back":
      return "Highlight the BACK — Esc to discard";
    case "submitting":
      return "Saving flashcard…";
    case "idle":
    default:
      return null;
  }
}
