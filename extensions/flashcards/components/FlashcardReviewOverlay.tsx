"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Recycle,
  RotateCcw,
  RotateCcwSquare,
  X,
} from "lucide-react";
import { extractPlainTextFromTiptap } from "@/lib/domain/flashcards";
import type {
  FlashcardDto,
  FlashcardRating,
  FlashcardReviewMode,
  FlashcardShownSide,
} from "@/lib/domain/flashcards";
// Deep imports into the fsrs subpath keep the client bundle from
// pulling in lib/domain/flashcards/api.ts (which value-imports Prisma).
import { previewIntervals } from "@/lib/domain/flashcards/fsrs/scheduler";
import { getDefaultParameters } from "@/lib/domain/flashcards/fsrs/parameters";
import { AdaptiveFlashcardEditor } from "./AdaptiveFlashcardEditor";
import { FlashcardInlineEditor } from "./FlashcardInlineEditor";

// FSRS queue filter. When `deckId` is set, the queue fetches cards in
// that deck and its descendants (per /api/flashcards/queue). When
// `cardIds` is set, only those specific cards are returned. Used by
// the editor block's Play overlay so a block embedding a card subset
// can "play just these" without disturbing the user's main queue.
export interface FlashcardReviewFilter {
  deckId?: string;
  cardIds?: string[];
  // When true, omit new-state cards from the queue (review-only session).
  includeNew?: boolean;
  // Max cards to pull. Defaults to 20.
  limit?: number;
}

// Format a day-count as a compact human label for the rating button
// captions. <1m / 12m / 4h / 2d / 3mo / 1y — matches Anki's hints.
function formatInterval(days: number): string {
  if (!Number.isFinite(days) || days < 0) return "—";
  if (days < 1 / 1440) return "<1m";
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))}m`;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 30) return `${Math.max(1, Math.round(days))}d`;
  if (days < 365) return `${Math.max(1, Math.round(days / 30))}mo`;
  return `${Math.max(1, Math.round(days / 365))}y`;
}

interface FlashcardReviewOverlayProps {
  // Pre-loaded card list. Used by legacy callers (FlashcardsPanel) that
  // already have a string-deck queue in hand. Ignored when `filter` is
  // provided — the overlay then refetches from /api/flashcards/queue.
  cards?: FlashcardDto[];
  // FSRS queue filter (Session 3). When set, the overlay loads its own
  // queue on open. Editor blocks pass this; legacy callers omit it.
  filter?: FlashcardReviewFilter;
  mode: FlashcardReviewMode;
  open: boolean;
  onClose: () => void;
  onCardUpdated: (card: FlashcardDto) => void;
}

// Rating-driven slide intents. The four FSRS ratings + nav directions.
type SlideIntent = "next" | "previous" | "again" | "hard" | "good" | "easy";

// Visual config for each rating button. Color intensity escalates from
// Again (red) → Easy (green) so the user's eye lands on the destructive
// vs growth-positive choices immediately.
const RATING_BUTTONS: ReadonlyArray<{
  rating: FlashcardRating;
  label: string;
  shortcut: string;
  className: string;
}> = [
  {
    rating: "again",
    label: "Again",
    shortcut: "1",
    className:
      "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200 hover:bg-red-500/20",
  },
  {
    rating: "hard",
    label: "Hard",
    shortcut: "2",
    className:
      "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-200 hover:bg-orange-500/20",
  },
  {
    rating: "good",
    label: "Good",
    shortcut: "3",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-500/20",
  },
  {
    rating: "easy",
    label: "Easy",
    shortcut: "4",
    className:
      "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-200 hover:bg-blue-500/20",
  },
];

function getInitialSide(mode: FlashcardReviewMode): FlashcardShownSide {
  if (mode === "back_to_front") return "back";
  if (mode === "random") return Math.random() > 0.5 ? "back" : "front";
  return "front";
}

function getExit(intent: SlideIntent | null, reduced: boolean) {
  if (reduced || !intent) return { opacity: 0 };
  if (intent === "previous") return { x: 900, opacity: 0, rotateZ: 6 };
  // Rating exits map roughly to "moving down the priority list" (again/
  // hard slide down — "back to the queue") vs. "moving forward / out"
  // (good/easy slide left/up — "graduated this round").
  if (intent === "again") return { y: 700, opacity: 0, rotateX: 12 };
  if (intent === "hard") return { y: 500, opacity: 0, rotateX: 8 };
  if (intent === "good") return { x: -900, opacity: 0, rotateZ: -6 };
  if (intent === "easy") return { y: -700, opacity: 0, rotateX: -10 };
  // "next" intent — the default forward slide.
  return { x: -900, opacity: 0, rotateZ: -6 };
}

export function FlashcardReviewOverlay({
  cards,
  filter,
  mode,
  open,
  onClose,
  onCardUpdated,
}: FlashcardReviewOverlayProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // Direction is seeded from the `mode` prop but can be flipped per
  // session via the in-overlay toggle (#67) without disturbing the
  // caller's default. Drives which face shows first + the FSRS audit.
  const [effectiveMode, setEffectiveMode] = useState<FlashcardReviewMode>(mode);
  const [shownSide, setShownSide] = useState<FlashcardShownSide>(() =>
    getInitialSide(mode)
  );
  const [sessionCards, setSessionCards] = useState<FlashcardDto[]>(cards ?? []);
  const [intent, setIntent] = useState<SlideIntent | null>(null);
  const [editing, setEditing] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  // Loading state for the filter-driven queue fetch. UI shows a small
  // "Loading…" affordance instead of empty card area.
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const wasOpenRef = useRef(false);
  const viewedCardIdsRef = useRef<Set<string>>(new Set());
  const reducedMotion = useReducedMotion();
  const current = sessionCards[index] ?? null;

  // Stable JSON serialization of the filter so React can compare it as
  // a dep without spurious re-fetches when callers pass a freshly-built
  // object on each render.
  const filterKey = useMemo(
    () => (filter ? JSON.stringify(filter) : null),
    [filter],
  );

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    viewedCardIdsRef.current.clear();
    setIndex(0);
    setEffectiveMode(mode);
    const side = getInitialSide(mode);
    setShownSide(side);
    setFlipped(side === "back");
    setEditing(false);
    setStartedAt(Date.now());
    setQueueError(null);

    if (filter) {
      // Fetch from /api/flashcards/queue with the filter. The route
      // returns due cards in FSRS priority order (overdue review →
      // learning → new, capped).
      setQueueLoading(true);
      const params = new URLSearchParams();
      if (filter.deckId) params.set("deckId", filter.deckId);
      if (filter.cardIds && filter.cardIds.length > 0) {
        params.set("cardIds", filter.cardIds.join(","));
      }
      if (filter.includeNew === false) params.set("includeNew", "false");
      if (typeof filter.limit === "number") {
        params.set("limit", String(filter.limit));
      }
      const url = `/api/flashcards/queue${params.toString() ? `?${params.toString()}` : ""}`;
      void (async () => {
        try {
          const response = await fetch(url, { credentials: "include" });
          // Raw json + manual shape check. The discriminated-union `as`
          // cast looks tidier but TS's narrowing through it has been
          // flaky here — being explicit is more robust.
          const raw = (await response.json()) as Record<string, unknown>;
          const success = raw?.success === true;
          if (success && Array.isArray(raw.data)) {
            setSessionCards(raw.data as FlashcardDto[]);
          } else {
            const err = raw?.error as { message?: string } | undefined;
            setQueueError(err?.message ?? "Failed to load queue.");
            setSessionCards([]);
          }
        } catch (err) {
          setQueueError(err instanceof Error ? err.message : "Failed to load queue.");
          setSessionCards([]);
        } finally {
          setQueueLoading(false);
        }
      })();
    } else {
      // Legacy caller — use the pre-loaded cards prop verbatim.
      setSessionCards(cards ?? []);
    }
    // We intentionally key on filterKey (not the raw `filter` ref) so a
    // caller re-rendering with an equivalent filter object doesn't
    // refetch. The exhaustive-deps lint would suggest `filter` itself,
    // but that triggers the spurious refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, mode, open, filterKey]);

  const resetSide = useCallback(() => {
    const side = getInitialSide(effectiveMode);
    setShownSide(side);
    setFlipped(side === "back");
    setStartedAt(Date.now());
  }, [effectiveMode]);

  // Flip the session's recall direction (front↔back) and re-orient the
  // current card immediately. Random collapses to front-first so the
  // toggle stays predictable.
  const toggleDirection = useCallback(() => {
    setEffectiveMode((prev) => {
      const next: FlashcardReviewMode =
        prev === "back_to_front" ? "front_to_back" : "back_to_front";
      const side: FlashcardShownSide =
        next === "back_to_front" ? "back" : "front";
      setShownSide(side);
      setFlipped(side === "back");
      setStartedAt(Date.now());
      return next;
    });
  }, []);

  const flipCard = useCallback(() => {
    setFlipped((value) => {
      const next = !value;
      setShownSide(next ? "back" : "front");
      return next;
    });
  }, []);

  // Auto-play any audio block on the now-visible side that's marked
  // `autoplayOnFlip: true`. Both faces are in the DOM concurrently
  // (only one visible via backface-visibility) — scope the query to
  // the side matching `shownSide` so the hidden face's audio doesn't
  // fire too. Delay matches the 3D rotateY transition so the audio
  // lands with the visual reveal, not the click.
  useEffect(() => {
    if (!current) return;
    const delay = reducedMotion ? 100 : 600;
    const timer = window.setTimeout(() => {
      const audio = document.querySelector<HTMLAudioElement>(
        `[data-card-side="${shownSide}"] audio[data-autoplay-on-flip="true"]`,
      );
      if (!audio) return;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Browser may block autoplay (no recent user gesture, muted tab,
        // background tab). Silent — manual play button still works.
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [shownSide, current, reducedMotion]);

  const goToIndex = useCallback(
    (nextIndex: number, nextIntent: SlideIntent) => {
      setIntent(nextIntent);
      window.setTimeout(() => {
        const bounded = Math.max(0, Math.min(sessionCards.length - 1, nextIndex));
        setIndex(bounded);
        resetSide();
        setIntent(null);
      }, reducedMotion ? 80 : 180);
    },
    [reducedMotion, resetSide, sessionCards.length]
  );
  const goNext = useCallback(() => {
    if (index + 1 >= sessionCards.length) {
      goToIndex(0, "previous");
      return;
    }
    goToIndex(index + 1, "next");
  }, [goToIndex, index, sessionCards.length]);

  const skipCard = useCallback(() => {
    if (index + 1 >= sessionCards.length) {
      onClose();
      return;
    }
    goToIndex(index + 1, "next");
  }, [goToIndex, index, onClose, sessionCards.length]);

  const recycleCard = useCallback(() => {
    if (!current) return;
    setIntent("next");
    window.setTimeout(() => {
      setSessionCards((existing) => {
        if (existing.length <= 1) return existing;
        const remaining = existing.filter((card) => card.id !== current.id);
        const minInsert = Math.min(index + 1, remaining.length);
        const randomInsert =
          minInsert +
          Math.floor(Math.random() * (remaining.length - minInsert + 1));
        const nextCards = [...remaining];
        nextCards.splice(randomInsert, 0, current);
        return nextCards;
      });
      setIndex((value) => Math.min(value, sessionCards.length - 1));
      resetSide();
      setIntent(null);
    }, reducedMotion ? 80 : 180);
  }, [current, index, reducedMotion, resetSide, sessionCards.length]);

  const submitReview = useCallback(
    async (rating: FlashcardRating) => {
      if (!current) return;
      setIntent(rating);
      try {
        // Session 3 endpoint: POST /api/flashcards/review with cardId in
        // body + 4-button rating. Server runs FSRS scheduler, writes
        // audit row, returns updated card + (optional) next card id.
        const response = await fetch(`/api/flashcards/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            cardId: current.id,
            rating,
            reviewMode: effectiveMode,
            shownSide,
            responseTimeMs: Date.now() - startedAt,
          }),
        });
        // Same defensive shape check as the queue fetch above — manual
        // narrowing because TS's discriminated-union `as` cast has been
        // flaky here.
        const raw = (await response.json()) as Record<string, unknown>;
        if (raw?.success === true) {
          const data = raw.data as { card: FlashcardDto; nextCardId: string | null };
          onCardUpdated(data.card);
          // Patch the card in-place so any subsequent display in this
          // session reflects the new FSRS state (due/state/etc.).
          setSessionCards((existing) =>
            existing.map((c) => (c.id === data.card.id ? data.card : c)),
          );
        }
      } finally {
        window.setTimeout(() => {
          const nextIndex = index + 1;
          if (nextIndex >= sessionCards.length) {
            onClose();
            return;
          }
          setIndex(nextIndex);
          resetSide();
          setIntent(null);
        }, reducedMotion ? 80 : 180);
      }
    },
    [
      current,
      index,
      effectiveMode,
      onClose,
      onCardUpdated,
      reducedMotion,
      resetSide,
      sessionCards.length,
      shownSide,
      startedAt,
    ]
  );

  // Compute the predicted next interval for each of the 4 rating
  // buttons. v1 uses default FSRS parameters — until the optimizer
  // ships in v1.1, this is exactly what the server uses too, so the
  // preview matches the actual scheduled outcome.
  const defaultParams = useMemo(() => getDefaultParameters(), []);
  const previews = useMemo(() => {
    if (!current) return null;
    return previewIntervals(
      {
        state: current.state ?? "new",
        due: current.due ? new Date(current.due) : new Date(),
        stability: current.stability ?? 0,
        difficulty: current.difficulty ?? 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: current.reps ?? 0,
        lapses: current.lapses ?? 0,
        learningSteps: current.learningSteps ?? 0,
        lastReviewedAt: null,
      },
      defaultParams,
      new Date(),
    );
  }, [current, defaultParams]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (editing) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        flipCard();
      }
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goToIndex(index - 1, "previous");
      // FSRS 4-button rating shortcuts (Anki-compatible). Only fire
      // when the card is showing its answer side — rating before
      // flipping is a usability hazard (you'd be guessing on the
      // question alone).
      if (flipped) {
        if (event.key === "1") void submitReview("again");
        if (event.key === "2") void submitReview("hard");
        if (event.key === "3") void submitReview("good");
        if (event.key === "4") void submitReview("easy");
      }
      if (event.key.toLowerCase() === "s") skipCard();
      if (event.key.toLowerCase() === "r") recycleCard();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    flipCard,
    flipped,
    goNext,
    goToIndex,
    index,
    editing,
    onClose,
    open,
    recycleCard,
    skipCard,
    submitReview,
  ]);

  const passiveLayers = useMemo(
    () => (sessionCards.length > 3 ? [1, 2, 3] : [1, 2]),
    [sessionCards.length]
  );
  const updateCurrentCard = useCallback(
    (card: FlashcardDto) => {
      setSessionCards((currentCards) =>
        currentCards.map((candidate) =>
          candidate.id === card.id ? card : candidate
        )
      );
      onCardUpdated(card);
    },
    [onCardUpdated]
  );

  useEffect(() => {
    if (!open || !current || viewedCardIdsRef.current.has(current.id)) return;
    viewedCardIdsRef.current.add(current.id);

    const recordView = async () => {
      try {
        const response = await fetch(`/api/flashcards/${current.id}/view`, {
          method: "POST",
          credentials: "include",
        });
        const result = await response.json();
        if (result?.success) updateCurrentCard(result.data as FlashcardDto);
      } catch {
        // View counts are non-critical telemetry for the review UI.
      }
    };

    void recordView();
  }, [current, open, updateCurrentCard]);

  if (!open || typeof document === "undefined") return null;

  // Three states where we render the shell but not the card stack:
  //   queueLoading — filter fetch in flight
  //   queueError   — fetch failed (network, 4xx)
  //   sessionCards.length === 0 — nothing due / nothing matched
  // Each gets a distinct copy so the user knows what to do next.
  const emptyState: { title: string; body: string } | null = queueLoading
    ? { title: "Loading…", body: "Pulling your due queue." }
    : queueError
      ? { title: "Couldn't load cards", body: queueError }
      : sessionCards.length === 0
        ? {
            title: "All caught up",
            body: filter
              ? "No cards in this deck are due right now."
              : "No cards to review.",
          }
        : null;

  if (emptyState) {
    return createPortal(
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm md:p-6">
        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-gray-900 dark:bg-[#1a2530] dark:text-white md:h-[min(72vh,760px)] md:w-[min(66vw,960px)] md:rounded-lg md:border md:border-black/10 dark:md:border-black/10 dark:border-white/10">
          <div className="flex shrink-0 items-center justify-between border-b border-black/10 dark:border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Review Flashcards</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-md text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10"
              aria-label="Close review"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <p className="text-xl font-semibold">{emptyState.title}</p>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {emptyState.body}
              </p>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  if (!current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm md:p-6">
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-gray-900 dark:bg-[#1a2530] dark:text-white md:h-[min(72vh,760px)] md:w-[min(66vw,960px)] md:rounded-lg md:border md:border-black/10 dark:md:border-black/10 dark:border-white/10">
        <div className="flex shrink-0 items-center justify-between border-b border-black/10 dark:border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Review Flashcards</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {index + 1} of {sessionCards.length} ·{" "}
              {current.subcategory
                ? `${current.subcategory} / ${current.category}`
                : current.category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-md text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10"
            aria-label="Close review"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 md:p-8">
          <div className="absolute inset-0 flex items-center justify-center">
            {passiveLayers.map((layer) => (
              <div
                key={layer}
                className="absolute h-[min(60dvh,540px)] w-[calc(100vw-128px)] rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.025] dark:bg-white/[0.035] md:h-[min(40vh,440px)] md:w-[min(52vw,760px)]"
                style={{
                  transform: `translateY(${layer * 10}px) scale(${1 - layer * 0.035})`,
                  opacity: 1 - layer * 0.2,
                }}
              />
            ))}
          </div>

          <div className="relative flex items-stretch gap-2">
            <SideNavButton
              label="Previous card"
              onClick={() => goToIndex(index - 1, "previous")}
              disabled={index === 0}
            >
              <ChevronLeft className="h-5 w-5" />
            </SideNavButton>
            <div className="group relative" style={{ perspective: 1400 }}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditing((value) => {
                    const next = !value;
                    if (next) setFlipped(false);
                    return next;
                  });
                }}
                className={`absolute right-2.5 top-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200 ${
                  editing
                    ? "bg-gold-primary text-black opacity-100 shadow-sm"
                    : "bg-transparent text-gray-500 dark:text-gray-500 opacity-0 group-hover:opacity-100 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gold-primary focus-visible:opacity-100"
                }`}
                title={editing ? "Stop editing card" : "Edit card"}
                aria-label={editing ? "Stop editing card" : "Edit card"}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <AnimatePresence mode="popLayout" custom={intent}>
                <motion.div
                  key={current.id}
                  role={editing ? undefined : "button"}
                  tabIndex={editing ? undefined : 0}
                  aria-label={editing ? "Editing flashcard" : "Flip flashcard"}
                  className={`relative h-[min(60dvh,540px)] w-[calc(100vw-128px)] rounded-lg border border-gold-primary/30 bg-gray-50 dark:bg-[#202935] text-left shadow-2xl outline-none md:h-[min(40vh,440px)] md:w-[min(52vw,760px)] ${
                    editing ? "cursor-default" : "cursor-pointer"
                  }`}
                  style={{
                    transformStyle: "preserve-3d",
                    boxShadow: flipped
                      ? "0 25px 50px -12px rgba(201, 168, 108, 0.18), 0 0 0 1px rgba(201, 168, 108, 0.12)"
                      : "0 25px 50px -12px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(201, 168, 108, 0.08)",
                    transition: "box-shadow 0.5s ease",
                  }}
                  initial={{
                    opacity: 0,
                    scale: 0.96,
                    y: 16,
                    rotateY: editing ? 0 : flipped ? 180 : 0,
                  }}
                  animate={{
                    opacity: 1,
                    scale: editing ? 1 : reducedMotion ? 1 : [1, 0.92, 1],
                    y: 0,
                    rotateY: editing ? 0 : flipped ? 180 : 0,
                  }}
                  exit={getExit(intent, Boolean(reducedMotion))}
                  transition={{
                    duration: reducedMotion ? 0.12 : 0.55,
                    rotateY: {
                      duration: reducedMotion ? 0.12 : 0.55,
                      ease: [0.34, 1.2, 0.6, 1],
                    },
                    scale: {
                      duration: reducedMotion ? 0.12 : 0.55,
                      times: [0, 0.5, 1],
                      ease: "easeInOut",
                    },
                    default: { ease: "easeInOut" },
                  }}
                  drag={reducedMotion || editing ? false : true}
                  dragElastic={0.12}
                  whileDrag={reducedMotion || editing ? undefined : { rotateX: 3 }}
                  onClick={editing ? undefined : flipCard}
                  onKeyDown={(event) => {
                    if (editing) return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    flipCard();
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {editing ? (
                      <div className="absolute inset-0 overflow-y-auto rounded-lg p-5 md:p-8">
                        <FlashcardInlineEditor
                          card={current}
                          onSaved={updateCurrentCard}
                          compact
                          reserveStatusSpace
                        />
                      </div>
                    ) : (
                      <>
                        <CardFace
                          label={current.frontLabel}
                          content={current.frontContent}
                          plain={!current.isFrontRichText}
                        />
                        <CardFace
                          label={current.backLabel}
                          content={current.backContent}
                          back
                        />
                      </>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            <SideNavButton
              label={
                index + 1 >= sessionCards.length
                  ? "Restart deck"
                  : "Next card"
              }
              onClick={goNext}
            >
              {index + 1 >= sessionCards.length ? (
                <RotateCcw className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </SideNavButton>
          </div>
        </div>

        {/* FSRS 4-button rating row. Predicted next-interval label
            sits under each button (Anki convention) so the user has
            calibration on how aggressive each rating is. Buttons are
            disabled until the user flips to the answer side — rating
            blind before seeing the back is a usability hazard. */}
        <div className="shrink-0 border-t border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#1a2530]/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:px-4 md:pt-4">
          {/* Secondary action strip: skip + recycle. These don't update
              the FSRS schedule — they're session-flow helpers. Kept
              small to give visual primacy to the rating row below. */}
          <div className="mb-2 flex items-center justify-end gap-2 text-xs text-gray-600 dark:text-gray-400">
            <button
              type="button"
              onClick={toggleDirection}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              title="Flip recall direction (front ↔ back)"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {effectiveMode === "back_to_front" ? "Back→Front" : "Front→Back"}
            </button>
            <button
              type="button"
              onClick={skipCard}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              title="Skip without rating (S)"
            >
              <RotateCcwSquare className="h-3.5 w-3.5" />
              Skip
            </button>
            <button
              type="button"
              onClick={recycleCard}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              title="Shuffle this card back into the session (R)"
            >
              <Recycle className="h-3.5 w-3.5" />
              Recycle
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {RATING_BUTTONS.map((btn) => {
              const intervalDays = previews ? previews[btn.rating].intervalDays : 0;
              const intervalLabel = previews ? formatInterval(intervalDays) : "—";
              return (
                <RatingButton
                  key={btn.rating}
                  label={btn.label}
                  shortcut={btn.shortcut}
                  intervalLabel={intervalLabel}
                  disabled={!flipped}
                  className={btn.className}
                  onClick={() => void submitReview(btn.rating)}
                />
              );
            })}
          </div>
          {!flipped && (
            <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-500">
              Flip the card (space) to see the answer before rating.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function SideNavButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-[min(60dvh,540px)] w-10 shrink-0 items-center justify-center rounded-md text-gray-700 dark:text-gray-300 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] hover:text-gold-primary disabled:cursor-not-allowed disabled:opacity-35 md:h-[min(40vh,440px)] md:w-12"
    >
      {children}
    </button>
  );
}

// FSRS 4-button rating button. Renders the rating label + keyboard
// shortcut hint + predicted next interval underneath. Color comes from
// the parent's per-rating className (red/orange/green/blue gradient).
function RatingButton({
  label,
  shortcut,
  intervalLabel,
  onClick,
  className,
  disabled = false,
}: {
  label: string;
  shortcut: string;
  intervalLabel: string;
  onClick: () => void;
  className: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} — predicted next interval ${intervalLabel}`}
      className={`flex min-h-14 flex-col items-center justify-center rounded-md border px-2 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[10px] opacity-60">{shortcut}</span>
      </span>
      <span className="text-[11px] font-mono opacity-75">{intervalLabel}</span>
    </button>
  );
}

// Sprint 7 — detect a card-face whose body is a single image node
// (no caption, no headings, no anything else). Image-only faces get a
// centered fill-the-frame layout instead of inheriting the typography
// padding meant for text-heavy cards.
function isImageOnlyContent(content: FlashcardDto["frontContent"]): {
  src: string;
  alt: string;
} | null {
  // TipTap docs are { type: "doc", content: [...] }. An image-only doc
  // has exactly one top-level block that's an image, OR exactly one
  // paragraph containing exactly one image child. Both shapes can
  // surface depending on how the editor inserted it (block-level
  // image vs inline image in an otherwise-empty paragraph).
  const blocks = content?.content;
  if (!Array.isArray(blocks) || blocks.length !== 1) return null;
  const first = blocks[0];
  if (!first) return null;
  if (first.type === "image") {
    const src = typeof first.attrs?.src === "string" ? first.attrs.src : null;
    if (!src) return null;
    const alt = typeof first.attrs?.alt === "string" ? first.attrs.alt : "";
    return { src, alt };
  }
  if (first.type === "paragraph" && Array.isArray(first.content)) {
    // Strip any zero-width text nodes that some editors insert; if the
    // only meaningful child is an image, treat the paragraph as image-only.
    const nonEmpty = first.content.filter(
      (c) => c.type !== "text" || (typeof c.text === "string" && c.text.trim() !== ""),
    );
    if (nonEmpty.length === 1 && nonEmpty[0].type === "image") {
      const node = nonEmpty[0];
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : null;
      if (!src) return null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return { src, alt };
    }
  }
  return null;
}

function CardFace({
  label,
  content,
  plain = false,
  back = false,
}: {
  label: string;
  content: FlashcardDto["frontContent"];
  plain?: boolean;
  back?: boolean;
}) {
  // Image-only faces bypass the typography layout — fills the frame
  // edge-to-edge with the image centered. Caption-style cards (image
  // + text) keep the standard layout via the regular branch below.
  const imageOnly = !plain ? isImageOnlyContent(content) : null;

  if (imageOnly) {
    return (
      <div
        className="absolute inset-0 flex flex-col rounded-lg"
        data-card-side={back ? "back" : "front"}
        style={{
          backfaceVisibility: "hidden",
          transform: back ? "rotateY(180deg)" : undefined,
        }}
      >
        <div className="shrink-0 px-5 pt-5 text-xs font-semibold uppercase tracking-wide text-gold-primary md:px-8 md:pt-8">
          {label}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-2 md:p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- TipTap image
              node renders raw URLs (including proxied download URLs); the Next
              <Image> component would need a known-host allowlist and width/
              height attrs, which we don't have at this layer. */}
          <img
            src={imageOnly.src}
            alt={imageOnly.alt}
            className="max-h-full max-w-full rounded-md object-contain"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 flex flex-col rounded-lg p-5 md:p-8"
      data-card-side={back ? "back" : "front"}
      style={{
        backfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
      }}
    >
      <div className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gold-primary">
        {label}
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto text-gray-900 dark:text-gray-100">
        {plain ? (
          <p className="whitespace-pre-wrap text-xl leading-relaxed md:text-2xl">
            {extractPlainTextFromTiptap(content) || "Empty front"}
          </p>
        ) : (
          <AdaptiveFlashcardEditor
            value={content}
            mode="rich"
            editable={false}
            placeholder=""
            ariaLabel={label}
          />
        )}
      </div>
    </div>
  );
}
