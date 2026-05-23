"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import { ChevronLeft, ChevronRight, Layers, Lock, Play, Plus } from "lucide-react";
import { extractPlainTextFromTiptap } from "@/lib/domain/flashcards";
import type {
  FlashcardDeckRecordDto,
  FlashcardDto,
} from "@/lib/domain/flashcards";
import { FlashcardDeckPickerDialog } from "./FlashcardDeckPickerDialog";
import { FlashcardReviewOverlay } from "./FlashcardReviewOverlay";
import { FLASHCARD_QUICK_ADD_EVENT } from "../events";
import type { FlashcardEmbedAttrs } from "@/lib/domain/editor/extensions/blocks/flashcard-embed";

interface NodeViewProps {
  attrs: FlashcardEmbedAttrs;
  editor: Editor;
  getPos: () => number | undefined;
}

interface BlockData {
  deck: FlashcardDeckRecordDto | null;
  cards: FlashcardDto[];
  // The card subset the user pinned (when cardIds is set). When the
  // block embeds a whole deck, this is the same as `cards`.
  visibleCards: FlashcardDto[];
}

// Tiny fetch helper that tolerates the shape variance between the two
// flashcards routes (deck record vs queue). Both wrap in
// { success, data, error } — we just need a generic narrowing.
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { credentials: "include" });
    const raw = (await response.json()) as Record<string, unknown>;
    if (raw?.success === true) return raw.data as T;
    return null;
  } catch {
    return null;
  }
}

export function FlashcardEmbedNodeView({ attrs, editor, getPos }: NodeViewProps) {
  const { deckId, cardIds } = attrs;

  // Reactive block data + view state. Removed the Study/Reference
  // mode toggle (Sprint 8 follow-up): inline preview never scores,
  // only the Play overlay's 4-button rating advances FSRS state.
  const [data, setData] = useState<BlockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Collab-mode gate (Sprint 8 follow-up): if the editor was instantiated
  // with the Collaboration extension, the block goes inert for EVERYONE
  // — including the document owner. Reasoning: flashcards are private
  // user data with stats that shouldn't be visible to or modifiable by
  // collaborators, and the simplest correct UX is "if any collaboration
  // could be happening here, don't let anyone interact with this." The
  // server-side ownership filter on every flashcards route is the
  // load-bearing guard; this is the matching UI layer.
  const inCollabMode = useMemo(
    () =>
      editor.extensionManager.extensions.some((ext) => ext.name === "collaboration"),
    [editor],
  );

  // Stable JSON serialization of pinned card ids so the load effect
  // doesn't re-fire when the array reference changes but contents don't.
  const cardIdsKey = useMemo(
    () => (cardIds && cardIds.length > 0 ? cardIds.join(",") : ""),
    [cardIds],
  );

  // Load deck + cards when deckId changes. Skipped entirely in collab
  // mode — we don't want to hit private flashcards routes from a
  // session that might be acting on behalf of a non-owner.
  useEffect(() => {
    if (inCollabMode) {
      setData(null);
      setLoading(false);
      return;
    }
    if (!deckId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);

    void (async () => {
      const [deck, queue] = await Promise.all([
        fetchJson<FlashcardDeckRecordDto>(`/api/flashcards/decks/${deckId}`),
        fetchJson<FlashcardDto[]>(
          `/api/flashcards/queue?deckId=${encodeURIComponent(deckId)}&limit=50`,
        ),
      ]);
      if (!deck) {
        setError("Deck not found — it may have been deleted.");
        setData(null);
        setLoading(false);
        return;
      }
      const cards = queue ?? [];
      const pinned = cardIds && cardIds.length > 0 ? new Set(cardIds) : null;
      const visibleCards = pinned ? cards.filter((c) => pinned.has(c.id)) : cards;
      setData({ deck, cards, visibleCards });
      setLoading(false);
    })();
    // cardIdsKey is the content-stable serialization of cardIds; depending
    // on cardIds directly would refetch the deck every parent re-render
    // because the array identity changes even when contents don't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, cardIdsKey, inCollabMode]);

  // Reset preview state when the visible card list changes.
  useEffect(() => {
    setCardIndex(0);
    setFlipped(false);
  }, [data?.visibleCards.length]);

  const currentCard = data?.visibleCards[cardIndex] ?? null;
  const cardCount = data?.visibleCards.length ?? 0;

  // Mutate node attrs — used by the deck picker to write back the
  // chosen deckId. Resolves getPos() fresh per call because TipTap
  // captures position at NodeView mount and an upstream edit could
  // shift it.
  const updateAttrs = useCallback(
    (patch: Partial<FlashcardEmbedAttrs>) => {
      const pos = getPos();
      if (pos === undefined) return;
      editor
        .chain()
        .focus()
        .setNodeSelection(pos)
        .updateAttributes("flashcardEmbed", patch as Record<string, unknown>)
        .run();
    },
    [editor, getPos],
  );

  const goPrev = useCallback(() => {
    if (cardCount === 0) return;
    setCardIndex((i) => (i - 1 + cardCount) % cardCount);
    setFlipped(false);
  }, [cardCount]);

  const goNext = useCallback(() => {
    if (cardCount === 0) return;
    setCardIndex((i) => (i + 1) % cardCount);
    setFlipped(false);
  }, [cardCount]);

  const flipCard = useCallback(() => {
    setFlipped((v) => !v);
  }, []);

  // Compose the overlay filter from this block's attrs.
  const overlayFilter = useMemo(
    () =>
      deckId
        ? {
            deckId,
            ...(cardIds && cardIds.length > 0 ? { cardIds } : {}),
          }
        : undefined,
    [cardIds, deckId],
  );

  // ───────── Render branches ─────────

  // Collab mode: block is intentionally inert. Shows enough of the
  // visual frame to communicate "there's a flashcard block here" but
  // doesn't fetch any data and doesn't expose any controls.
  if (inCollabMode) {
    return (
      <div className="rounded-md border border-dashed border-black/15 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.02] p-4 text-center text-sm">
        <Lock className="mx-auto mb-2 h-5 w-5 text-gray-500 dark:text-gray-400" />
        <p className="font-medium text-gray-700 dark:text-gray-300">
          Flashcards block — locked in collaboration mode
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
          Flashcards are private. Open this note solo (outside a
          collaboration session) to study, add cards, or change the deck.
        </p>
      </div>
    );
  }

  // Unlinked: block was inserted without a deck. Open the picker
  // dialog inline — saves the user a trip to block properties.
  if (!deckId) {
    return (
      <>
        <div className="rounded-md border border-dashed border-gold-primary/40 bg-gold-primary/[0.04] p-4 text-center text-sm">
          <Layers className="mx-auto mb-2 h-5 w-5 text-gold-primary" />
          <p className="font-medium text-gray-900 dark:text-gray-100">
            Flashcards block — no deck selected
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            Pick an existing deck or create one to start studying.
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-gold-primary bg-gold-primary px-3 py-1.5 text-sm font-medium text-black hover:bg-gold-light"
          >
            <Layers className="h-3.5 w-3.5" />
            Pick a deck
          </button>
        </div>
        <FlashcardDeckPickerDialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(pickedDeckId) => updateAttrs({ deckId: pickedDeckId })}
        />
      </>
    );
  }

  if (loading) {
    return (
      <div className="rounded-md border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4 text-center text-sm text-gray-600 dark:text-gray-400">
        Loading deck…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/[0.06] p-4 text-center text-sm">
        <p className="font-medium text-red-700 dark:text-red-300">
          {error ?? "Couldn't load deck"}
        </p>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          The deck may have been renamed or deleted. Open block properties
          to reattach.
        </p>
      </div>
    );
  }

  const { deck } = data;
  const dueCount = deck.dueCount ?? 0;

  return (
    <div className="rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-[#1e2733] p-4">
      {/* Header strip — deck label + due counter. Mode pill removed
          per Sprint 8 follow-up: inline preview is always non-scoring,
          only Play opens the FSRS-graded overlay. */}
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-gold-primary" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {deck.name}
            </div>
            <div className="truncate text-[11px] text-gray-500 dark:text-gray-500">
              {deck.path}
              {cardIds && cardIds.length > 0
                ? ` · ${cardIds.length} pinned`
                : ` · ${dueCount} due`}
            </div>
          </div>
        </div>
      </div>

      {/* Card preview area — prev/next navigation + click-to-flip.
          Inline flips DO NOT score. Press Play to rate. */}
      {currentCard ? (
        <div className="relative">
          <button
            type="button"
            onClick={flipCard}
            className="group relative block w-full overflow-hidden rounded-md border border-gold-primary/20 bg-gray-50 p-4 text-left transition-shadow hover:shadow-md dark:bg-[#252f3a]"
            aria-label={flipped ? "Show front" : "Show back"}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gold-primary">
              {flipped ? currentCard.backLabel : currentCard.frontLabel}
            </div>
            <div className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
              {extractPlainTextFromTiptap(
                flipped ? currentCard.backContent : currentCard.frontContent,
              ) || "Empty"}
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-500">
              <span>
                Card {cardIndex + 1} of {cardCount} · tap to {flipped ? "show front" : "flip"}
              </span>
              <span className="opacity-70">Press Play to rate</span>
            </div>
          </button>
          {/* Prev/next buttons — Sprint 8 follow-up. Click-through
              navigation without leaving the block. Disabled when only
              one card so the chrome doesn't visually misrepresent
              navigability. */}
          {cardCount > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous card"
                title="Previous card"
                className="absolute left-1.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#1e2733]/95 text-gray-700 dark:text-gray-300 shadow-sm hover:bg-black/[0.05] dark:hover:bg-white/10"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next card"
                title="Next card"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#1e2733]/95 text-gray-700 dark:text-gray-300 shadow-sm hover:bg-black/[0.05] dark:hover:bg-white/10"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4 text-center text-sm text-gray-600 dark:text-gray-400">
          {cardIds && cardIds.length > 0
            ? "Pinned cards are no longer available in this deck."
            : "No cards in this deck yet."}
        </div>
      )}

      {/* Footer action row — Play overlay + Add card */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOverlayOpen(true)}
          disabled={cardCount === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-gold-primary bg-gold-primary px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play className="h-3.5 w-3.5" />
          Play
        </button>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent(FLASHCARD_QUICK_ADD_EVENT, {
                detail: { deckId },
              }),
            );
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          title="Add a new card to this deck"
        >
          <Plus className="h-3.5 w-3.5" />
          Add card
        </button>
      </div>

      {overlayFilter && (
        <FlashcardReviewOverlay
          filter={overlayFilter}
          mode="front_to_back"
          open={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          onCardUpdated={(card) => {
            setData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                cards: prev.cards.map((c) => (c.id === card.id ? card : c)),
                visibleCards: prev.visibleCards.map((c) =>
                  c.id === card.id ? card : c,
                ),
              };
            });
          }}
        />
      )}
    </div>
  );
}
