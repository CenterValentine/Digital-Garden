"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Eye, Layers, Play, Plus, Target } from "lucide-react";
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
  const { deckId, cardIds, defaultMode } = attrs;

  // Reactive block data + view state.
  const [data, setData] = useState<BlockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"study" | "reference">(defaultMode);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Keep local mode in sync if the editor mutates the attribute.
  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  // Load deck + cards when deckId changes. cardIds changes are a subset
  // of the full deck card list, so we re-derive `visibleCards` locally
  // rather than re-fetching.
  useEffect(() => {
    if (!deckId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);

    void (async () => {
      // Two parallel fetches: the deck record (for name + counts) and a
      // small slice of cards for the inline preview. We use the queue
      // endpoint so we get FSRS-ordered "what's most due first" rather
      // than just the deck's card list raw.
      const [deck, queue] = await Promise.all([
        fetchJson<FlashcardDeckRecordDto>(`/api/flashcards/decks/${deckId}`),
        fetchJson<FlashcardDto[]>(
          `/api/flashcards/queue?deckId=${encodeURIComponent(deckId)}&limit=20`,
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
  }, [deckId, cardIds]);

  // Reset preview state when the visible card list changes (deck swap,
  // pinned-set change, etc.).
  useEffect(() => {
    setCardIndex(0);
    setFlipped(false);
  }, [data?.visibleCards.length]);

  const currentCard = data?.visibleCards[cardIndex] ?? null;

  // Mutate node attrs — used by the deck picker (Session 5) to write
  // back the chosen deckId. Resolves getPos() fresh per call because
  // TipTap captures position at NodeView mount and an upstream edit
  // could shift it.
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

  // Local-only mode flip — UX nicety. Doesn't persist to attrs unless
  // the user uses the "Set as default" submenu (out of v1 scope).
  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "study" ? "reference" : "study"));
  }, []);

  const advanceCard = useCallback(() => {
    if (!data) return;
    const next = cardIndex + 1;
    if (next >= data.visibleCards.length) {
      setCardIndex(0);
    } else {
      setCardIndex(next);
    }
    setFlipped(false);
  }, [cardIndex, data]);

  const flipOrAdvance = useCallback(() => {
    if (!flipped) {
      setFlipped(true);
    } else {
      advanceCard();
    }
  }, [advanceCard, flipped]);

  // Compose the overlay filter from this block's attrs. When the user
  // clicks Play, the overlay opens with the same filter the block uses.
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

  const { deck, visibleCards } = data;
  const cardCount = visibleCards.length;
  const dueCount = deck.dueCount ?? 0;

  return (
    <div className="rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-[#1e2733] p-4">
      {/* Header strip — deck label + mode pill + due counter */}
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
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleMode}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors ${
              mode === "study"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                : "border-gray-500/40 bg-gray-500/10 text-gray-700 dark:text-gray-200"
            }`}
            title={
              mode === "study"
                ? "Study mode — flips count as reviews"
                : "Reference mode — flips don't update the schedule"
            }
          >
            {mode === "study" ? (
              <Target className="h-3 w-3" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
            {mode === "study" ? "Study" : "Reference"}
          </button>
        </div>
      </div>

      {/* Card preview area — single card with click-to-flip */}
      {currentCard ? (
        <button
          type="button"
          onClick={flipOrAdvance}
          className="group relative block w-full overflow-hidden rounded-md border border-gold-primary/20 bg-gray-50 p-4 text-left transition-shadow hover:shadow-md dark:bg-[#252f3a]"
          aria-label={flipped ? "Next card" : "Flip card"}
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
              {cardIndex + 1} of {cardCount} · tap to {flipped ? "advance" : "flip"}
            </span>
            {/* In study mode, hint that the Play overlay is where the
                real review happens. Inline taps just flip + advance —
                they don't (yet) submit ratings without explicit user
                action via the Play overlay. */}
            <span className="opacity-70">
              Press Play to rate
            </span>
          </div>
        </button>
      ) : (
        <div className="rounded-md border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4 text-center text-sm text-gray-600 dark:text-gray-400">
          {cardIds && cardIds.length > 0
            ? "Pinned cards are no longer available in this deck."
            : "No cards in this deck yet."}
        </div>
      )}

      {/* Footer action row — Play overlay + Add card affordance */}
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
            // Open the existing FlashcardQuickAddDialog (mounted at the
            // extension root) via its event contract. Constant lives in
            // ../events — using the string literal directly here would
            // silently fail since the listener subscribes to the
            // canonical name. (Earlier version had a typo; tracked
            // down as bug-2 of the Sprint 6 follow-up.)
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
        <div className="flex-1" />
        {/* No custom properties button — the block chrome from
            createBlockNodeView already exposes the "..." menu that
            routes to PropertiesPanel via the block-store. Adding our
            own would be a redundant, second-source-of-truth surface
            for attr editing (and it never wired up correctly — the
            previous version dispatched a "block-open-properties"
            event that has no listener in the codebase). */}
      </div>

      {overlayFilter && (
        <FlashcardReviewOverlay
          filter={overlayFilter}
          mode="front_to_back"
          open={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          onCardUpdated={(card) => {
            // When the overlay rates a card, patch our local cache so
            // the dueCount / preview reflect the new state without
            // refetching the whole deck.
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
