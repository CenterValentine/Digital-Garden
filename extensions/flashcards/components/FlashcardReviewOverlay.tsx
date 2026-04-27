"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
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
  FlashcardReviewMode,
  FlashcardReviewOutcome,
  FlashcardShownSide,
} from "@/lib/domain/flashcards";
import { AdaptiveFlashcardEditor } from "./AdaptiveFlashcardEditor";
import { FlashcardInlineEditor } from "./FlashcardInlineEditor";

interface FlashcardReviewOverlayProps {
  cards: FlashcardDto[];
  mode: FlashcardReviewMode;
  open: boolean;
  onClose: () => void;
  onCardUpdated: (card: FlashcardDto) => void;
}

type SlideIntent = "next" | "previous" | "mastered" | "review";

function getInitialSide(mode: FlashcardReviewMode): FlashcardShownSide {
  if (mode === "back_to_front") return "back";
  if (mode === "random") return Math.random() > 0.5 ? "back" : "front";
  return "front";
}

function getExit(intent: SlideIntent | null, reduced: boolean) {
  if (reduced || !intent) return { opacity: 0 };
  if (intent === "previous") return { x: 900, opacity: 0, rotateZ: 6 };
  if (intent === "mastered") return { y: -700, opacity: 0, rotateX: -10 };
  if (intent === "review") return { y: 700, opacity: 0, rotateX: 10 };
  return { x: -900, opacity: 0, rotateZ: -6 };
}

export function FlashcardReviewOverlay({
  cards,
  mode,
  open,
  onClose,
  onCardUpdated,
}: FlashcardReviewOverlayProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shownSide, setShownSide] = useState<FlashcardShownSide>(() =>
    getInitialSide(mode)
  );
  const [sessionCards, setSessionCards] = useState<FlashcardDto[]>(cards);
  const [intent, setIntent] = useState<SlideIntent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editAffordanceVisible, setEditAffordanceVisible] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const wasOpenRef = useRef(false);
  const editHideTimerRef = useRef<number | null>(null);
  const viewedCardIdsRef = useRef<Set<string>>(new Set());
  const reducedMotion = useReducedMotion();
  const current = sessionCards[index] ?? null;

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    viewedCardIdsRef.current.clear();
    setSessionCards(cards);
    setIndex(0);
    const side = getInitialSide(mode);
    setShownSide(side);
    setFlipped(side === "back");
    setEditing(false);
    setEditAffordanceVisible(false);
    setStartedAt(Date.now());
  }, [cards, mode, open]);

  const resetSide = useCallback(() => {
    const side = getInitialSide(mode);
    setShownSide(side);
    setFlipped(side === "back");
    setStartedAt(Date.now());
  }, [mode]);

  const flipCard = useCallback(() => {
    setFlipped((value) => {
      const next = !value;
      setShownSide(next ? "back" : "front");
      return next;
    });
  }, []);

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
    async (outcome: FlashcardReviewOutcome) => {
      if (!current) return;
      setIntent(outcome);
      try {
        const response = await fetch(`/api/flashcards/${current.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            outcome,
            reviewMode: mode,
            shownSide,
            responseTimeMs: Date.now() - startedAt,
          }),
        });
        const result = await response.json();
        if (result?.success) onCardUpdated(result.data as FlashcardDto);
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
      mode,
      onClose,
      onCardUpdated,
      reducedMotion,
      resetSide,
      sessionCards.length,
      shownSide,
      startedAt,
    ]
  );

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
      if (event.key === "ArrowUp") void submitReview("mastered");
      if (event.key === "ArrowDown") void submitReview("review");
      if (event.key.toLowerCase() === "s") skipCard();
      if (event.key.toLowerCase() === "r") recycleCard();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    flipCard,
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

  const revealEditAffordance = useCallback(() => {
    setEditAffordanceVisible(true);
    if (editHideTimerRef.current) {
      window.clearTimeout(editHideTimerRef.current);
    }
    editHideTimerRef.current = window.setTimeout(() => {
      setEditAffordanceVisible(false);
    }, 1400);
  }, []);

  useEffect(() => {
    return () => {
      if (editHideTimerRef.current) {
        window.clearTimeout(editHideTimerRef.current);
      }
    };
  }, []);

  if (!open || typeof document === "undefined" || !current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm md:p-6">
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#111318] text-white md:h-[min(72vh,760px)] md:w-[min(66vw,960px)] md:rounded-lg md:border md:border-white/10">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Review Flashcards</h2>
            <p className="text-xs text-gray-400">
              {index + 1} of {sessionCards.length} ·{" "}
              {current.subcategory
                ? `${current.subcategory} / ${current.category}`
                : current.category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-md text-gray-300 hover:bg-white/10"
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
                className="absolute h-[min(70dvh,620px)] w-[calc(100vw-128px)] rounded-lg border border-white/10 bg-white/[0.035] md:h-[min(52vh,520px)] md:w-[min(52vw,760px)]"
                style={{
                  transform: `translateY(${layer * 10}px) scale(${1 - layer * 0.035})`,
                  opacity: 1 - layer * 0.2,
                }}
              />
            ))}
          </div>

          <div
            className="relative flex items-stretch gap-2"
            onPointerMove={revealEditAffordance}
          >
            <SideNavButton
              label="Previous card"
              onClick={() => goToIndex(index - 1, "previous")}
              disabled={index === 0}
            >
              <ChevronLeft className="h-5 w-5" />
            </SideNavButton>
            <div className="relative" style={{ perspective: 1400 }}>
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
                className={`absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
                  editing
                    ? "border-gold-primary bg-gold-primary text-black"
                    : "border-white/10 bg-[#111318]/85 text-gray-200 hover:bg-white/10 hover:text-gold-primary"
                } ${
                  editing || editAffordanceVisible
                    ? "opacity-100"
                    : "pointer-events-none opacity-0"
                }`}
                title={editing ? "Stop editing card" : "Edit card"}
                aria-label={editing ? "Stop editing card" : "Edit card"}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <AnimatePresence mode="popLayout" custom={intent}>
                <motion.div
                  key={current.id}
                  role={editing ? undefined : "button"}
                  tabIndex={editing ? undefined : 0}
                  aria-label={editing ? "Editing flashcard" : "Flip flashcard"}
                  className={`relative h-[min(70dvh,620px)] w-[calc(100vw-128px)] rounded-lg border border-gold-primary/30 bg-[#171a20] text-left shadow-2xl outline-none md:h-[min(52vh,520px)] md:w-[min(52vw,760px)] ${
                    editing ? "cursor-default" : "cursor-pointer"
                  }`}
                  style={{
                    transformStyle: "preserve-3d",
                  }}
                  initial={{
                    opacity: 0,
                    scale: 0.96,
                    y: 16,
                    rotateY: editing ? 0 : flipped ? 180 : 0,
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    rotateY: editing ? 0 : flipped ? 180 : 0,
                  }}
                  exit={getExit(intent, Boolean(reducedMotion))}
                  transition={{
                    duration: reducedMotion ? 0.12 : 0.34,
                    ease: "easeInOut",
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

        <div className="grid shrink-0 grid-cols-4 gap-2 border-t border-white/10 bg-[#111318]/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:p-4">
          <ReviewIconButton
            label="Mark for review"
            onClick={() => void submitReview("review")}
          >
            <X className="h-5 w-5" />
          </ReviewIconButton>
          <ReviewIconButton label="Recycle randomly" onClick={recycleCard}>
            <Recycle className="h-5 w-5" />
          </ReviewIconButton>
          <ReviewIconButton label="Skip card" onClick={skipCard}>
            <RotateCcwSquare className="h-5 w-5" />
          </ReviewIconButton>
          <ReviewIconButton
            label="Mark correct"
            onClick={() => void submitReview("mastered")}
            primary
          >
            <Check className="h-5 w-5" />
          </ReviewIconButton>
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
      className="flex h-[min(70dvh,620px)] w-10 shrink-0 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-white/[0.04] hover:text-gold-primary disabled:cursor-not-allowed disabled:opacity-35 md:h-[min(52vh,520px)] md:w-12"
    >
      {children}
    </button>
  );
}

function ReviewIconButton({
  label,
  onClick,
  children,
  disabled = false,
  emphasized = false,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  emphasized?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex min-h-11 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "border-gold-primary bg-gold-primary text-black hover:bg-gold-light"
          : emphasized
            ? "border-gold-primary/40 text-gold-primary hover:bg-gold-primary/10"
            : "border-white/10 text-gray-200 hover:bg-white/10 hover:text-gold-primary"
      }`}
    >
      {children}
    </button>
  );
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
  return (
    <div
      className="absolute inset-0 flex flex-col rounded-lg p-5 md:p-8"
      style={{
        backfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
      }}
    >
      <div className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gold-primary">
        {label}
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto text-gray-100">
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
