"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Check,
  Loader2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  FlashcardDeckRecordDto,
  FlashcardDto,
  FlashcardReviewMode,
  FlashcardReviewStatus,
} from "@/lib/domain/flashcards";
import { useContentStore } from "@/state/content-store";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/client/ui/dialog";
import { FlashcardInlineEditor } from "./FlashcardInlineEditor";
import { FlashcardReviewOverlay } from "./FlashcardReviewOverlay";
import { FlashcardDeckTree, buildDeckTree } from "./FlashcardDeckTree";
import FlashcardsSettingsDialog from "../settings/FlashcardsSettingsDialog";
import {
  FLASHCARD_CHANGED_EVENT,
  FLASHCARD_QUICK_ADD_EVENT,
  FLASHCARD_VIEW_SOURCE_EVENT,
  type FlashcardViewSourceEventDetail,
} from "../events";

type DeckReviewSettings = {
  reviewMode: FlashcardReviewMode;
  reviewStatus: FlashcardReviewStatus | "all";
};

const MENU_SELECT_CLASS =
  "w-full rounded-md border border-black/15 dark:border-white/20 bg-white dark:bg-gray-900/95 px-3 py-2 text-base text-gray-900 dark:text-gray-100 shadow-sm outline-none transition-colors hover:bg-black/[0.05] dark:hover:bg-black/[0.05] dark:bg-white/10 focus:border-gold-primary focus:bg-gray-50 dark:focus:bg-gray-900 md:text-sm";
const DECK_SETTINGS_STORAGE_KEY = "flashcards:panel-review-settings";
// How many cards a single review session may pull. Generous so a large
// "Play all" / subtree session isn't silently truncated; the server
// clamps to its own ceiling too.
const REVIEW_SESSION_LIMIT = 2000;

function getUsableSourceContentId(id: string | null): string | null {
  if (!id || id.startsWith("temp-") || id.startsWith("person:")) return null;
  return id;
}

function cardPreview(card: FlashcardDto) {
  return card.frontPreview || card.backPreview || "Untitled flashcard";
}

function loadPanelSettings(): DeckReviewSettings {
  if (typeof window === "undefined") {
    return { reviewMode: "front_to_back", reviewStatus: "all" };
  }
  try {
    const raw = window.localStorage.getItem(DECK_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DeckReviewSettings>;
      return {
        reviewMode: parsed.reviewMode ?? "front_to_back",
        reviewStatus: parsed.reviewStatus ?? "all",
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return { reviewMode: "front_to_back", reviewStatus: "all" };
}

export function FlashcardsPanel() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const sourceContentId = getUsableSourceContentId(selectedContentId);

  const [decks, setDecks] = useState<FlashcardDeckRecordDto[]>([]);
  const [cards, setCards] = useState<FlashcardDto[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] =
    useState<FlashcardReviewMode>(() => loadPanelSettings().reviewMode);
  const status = "all" as const satisfies FlashcardReviewStatus | "all";
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [treeLoading, setTreeLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [reviewSessionCards, setReviewSessionCards] = useState<FlashcardDto[]>([]);
  const [playingDeckId, setPlayingDeckId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<{
    id: string;
    title: string | null;
  } | null>(null);
  // Rename dialog state.
  const [renamingDeck, setRenamingDeck] =
    useState<FlashcardDeckRecordDto | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameInFlight, setRenameInFlight] = useState(false);

  // Delete dialog state.
  const [deletingDeck, setDeletingDeck] =
    useState<FlashcardDeckRecordDto | null>(null);
  const [deleteCardsAction, setDeleteCardsAction] = useState<"delete" | "move">(
    "delete",
  );
  const [moveToDeckIdChoice, setMoveToDeckIdChoice] = useState<string>("");
  const [deletingInFlight, setDeletingInFlight] = useState(false);

  // Subtree card totals per deck, so the delete dialog can say "Has N
  // cards" for a whole skill, matching what the tree shows.
  const subtreeCountByDeck = useMemo(() => {
    const map = new Map<string, number>();
    const walk = (nodes: ReturnType<typeof buildDeckTree>) => {
      for (const node of nodes) {
        map.set(node.deck.id, node.subtreeCardCount);
        walk(node.children);
      }
    };
    walk(buildDeckTree(decks));
    return map;
  }, [decks]);

  const selectedDeck = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) ?? null,
    [decks, selectedDeckId],
  );

  const fetchTree = useCallback(async () => {
    try {
      const response = await fetch("/api/flashcards/decks/tree", {
        credentials: "include",
      });
      const result = await response.json();
      if (result?.success) {
        setDecks(result.data as FlashcardDeckRecordDto[]);
      }
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const fetchCards = useCallback(async () => {
    setCardsLoading(true);
    try {
      const params = new URLSearchParams();
      if (sourceFilter) {
        params.set("sourceContentId", sourceFilter.id);
      }
      // Fetch all cards so every expanded deck can show its own cards without
      // an extra round-trip. Client-side filter by card.deckId per row.
      params.set("limit", "500");
      const response = await fetch(`/api/flashcards?${params.toString()}`, {
        credentials: "include",
      });
      const result = await response.json();
      if (result?.success) {
        setCards(result.data as FlashcardDto[]);
      }
    } catch {
      toast.error("Failed to load flashcards");
    } finally {
      setCardsLoading(false);
    }
  }, [sourceFilter]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchTree(), fetchCards()]);
  }, [fetchCards, fetchTree]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Persist the panel-level review mode.
  useEffect(() => {
    window.localStorage.setItem(
      DECK_SETTINGS_STORAGE_KEY,
      JSON.stringify({ reviewMode, reviewStatus: status }),
    );
  }, [reviewMode, status]);

  // Re-read play order from localStorage when the settings dialog closes,
  // picking up any change the user made in the "Play order" setting.
  useEffect(() => {
    if (!settingsOpen) {
      setReviewMode(loadPanelSettings().reviewMode);
    }
  }, [settingsOpen]);

  useEffect(() => {
    const handleViewSource = (event: Event) => {
      const detail = (event as CustomEvent<FlashcardViewSourceEventDetail>).detail;
      if (!detail?.sourceContentId) return;
      setSelectedDeckId(null);
      setSourceFilter({
        id: detail.sourceContentId,
        title: detail.sourceTitle ?? null,
      });
    };
    window.addEventListener(FLASHCARD_VIEW_SOURCE_EVENT, handleViewSource);
    return () =>
      window.removeEventListener(FLASHCARD_VIEW_SOURCE_EVENT, handleViewSource);
  }, []);

  useEffect(() => {
    const handleChanged = () => {
      void refresh();
    };
    window.addEventListener(FLASHCARD_CHANGED_EVENT, handleChanged);
    return () => window.removeEventListener(FLASHCARD_CHANGED_EVENT, handleChanged);
  }, [refresh]);

  const filteredDecks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return decks;
    return decks.filter((deck) =>
      `${deck.name} ${deck.path}`.toLowerCase().includes(query),
    );
  }, [search, decks]);

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return cards;
    return cards.filter((card) =>
      [card.frontPreview, card.backPreview, card.frontLabel, card.backLabel]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [search, cards]);

  const openQuickAdd = () => {
    window.dispatchEvent(
      new CustomEvent(FLASHCARD_QUICK_ADD_EVENT, {
        detail: {
          sourceContentId,
          // Pre-seed the builder's path input with the selected skill.
          deckPath: selectedDeck?.path ?? null,
        },
      }),
    );
  };

  // ─── Review launching ──────────────────────────────────────────

  // Fetch a card set and open the review overlay. `params` already
  // carries the deck/source scope; we add status + a generous limit.
  const launchReview = useCallback(
    async (params: URLSearchParams, deckId: string | null) => {
      if (status !== "all") params.set("reviewStatus", status);
      params.set("limit", String(REVIEW_SESSION_LIMIT));
      setPlayingDeckId(deckId);
      try {
        const response = await fetch(`/api/flashcards?${params.toString()}`, {
          credentials: "include",
        });
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.error?.message || "Failed to load cards");
        }
        const loaded = (result.data as FlashcardDto[]).filter(
          (card) => card.reviewStatus !== "archived",
        );
        if (loaded.length === 0) {
          toast.error("No active cards to review here.");
          return;
        }
        setReviewSessionCards(loaded);
        setReviewOpen(true);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load cards",
        );
      } finally {
        setPlayingDeckId(null);
      }
    },
    [status],
  );

  // Play a deck + everything beneath it. The Latin bug lived here: the
  // old code reconstructed a path from category/subcategory and lost
  // deeper ancestry. Querying by the deck's own id can't drift.
  const playDeck = useCallback(
    (deck: FlashcardDeckRecordDto) => {
      const params = new URLSearchParams({
        deckId: deck.id,
        includeDescendants: "true",
      });
      void launchReview(params, deck.id);
    },
    [launchReview],
  );

  // Play every non-archived card across all decks.
  const playAll = useCallback(() => {
    void launchReview(new URLSearchParams(), null);
  }, [launchReview]);

  // ─── Card mutations ────────────────────────────────────────────

  const updateCardStatus = async (
    card: FlashcardDto,
    nextStatus: FlashcardReviewStatus,
  ) => {
    setMutatingId(card.id);
    try {
      const response = await fetch(`/api/flashcards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reviewStatus: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message || "Failed to update flashcard");
      }
      const updated = result.data as FlashcardDto;
      setCards((current) =>
        nextStatus === "archived"
          ? current.filter((candidate) => candidate.id !== card.id)
          : current.map((candidate) =>
              candidate.id === card.id ? updated : candidate,
            ),
      );
      void fetchTree();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update flashcard",
      );
    } finally {
      setMutatingId(null);
    }
  };

  const deleteCard = async (card: FlashcardDto) => {
    setMutatingId(card.id);
    try {
      const response = await fetch(`/api/flashcards/${card.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message || "Failed to delete flashcard");
      }
      setCards((current) =>
        current.filter((candidate) => candidate.id !== card.id),
      );
      void fetchTree();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete flashcard",
      );
    } finally {
      setMutatingId(null);
    }
  };

  const replaceCard = useCallback((card: FlashcardDto) => {
    setCards((current) =>
      current.map((candidate) => (candidate.id === card.id ? card : candidate)),
    );
    setReviewSessionCards((current) =>
      current.map((candidate) => (candidate.id === card.id ? card : candidate)),
    );
  }, []);

  const launchCardReview = (card: FlashcardDto) => {
    const rest = cards.filter(
      (candidate) =>
        candidate.id !== card.id && candidate.reviewStatus !== "archived",
    );
    setReviewSessionCards([card, ...rest]);
    setReviewOpen(true);
  };

  // ─── Deck rename ───────────────────────────────────────────────

  const openRename = (deck: FlashcardDeckRecordDto) => {
    setRenamingDeck(deck);
    setRenameValue(deck.name);
  };

  const submitRename = async () => {
    if (!renamingDeck) return;
    const next = renameValue.trim();
    if (!next || next === renamingDeck.name) {
      setRenamingDeck(null);
      return;
    }
    setRenameInFlight(true);
    try {
      const response = await fetch(
        `/api/flashcards/decks/${renamingDeck.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: next }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message || "Failed to rename skill");
      }
      toast.success(`Renamed to "${next}"`);
      setRenamingDeck(null);
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to rename skill",
      );
    } finally {
      setRenameInFlight(false);
    }
  };

  // ─── Deck delete ───────────────────────────────────────────────

  const openDelete = (deck: FlashcardDeckRecordDto) => {
    setDeletingDeck(deck);
    setDeleteCardsAction("delete");
    setMoveToDeckIdChoice("");
  };

  const handleDeleteSkill = async () => {
    if (!deletingDeck) return;
    const hasCards = (subtreeCountByDeck.get(deletingDeck.id) ?? 0) > 0;
    const willMove = hasCards && deleteCardsAction === "move";
    if (willMove && !moveToDeckIdChoice) {
      toast.error("Pick a destination skill to move the cards into.");
      return;
    }

    setDeletingInFlight(true);
    try {
      const params = new URLSearchParams();
      if (willMove) {
        params.set("moveToDeckId", moveToDeckIdChoice);
      } else if (hasCards) {
        params.set("cascade", "true");
      }
      const qs = params.toString();
      const response = await fetch(
        `/api/flashcards/decks/${deletingDeck.id}${qs ? `?${qs}` : ""}`,
        { method: "DELETE", credentials: "include" },
      );
      const json = (await response.json().catch(() => null)) as {
        success?: boolean;
        data?: {
          movedCardCount?: number;
          deletedCardCount?: number;
          deletedDeckIds?: string[];
        };
        error?: { message?: string };
      } | null;

      if (!response.ok || !json?.success) {
        toast.error(json?.error?.message ?? `Failed (${response.status})`);
        return;
      }

      const movedCount = json.data?.movedCardCount ?? 0;
      const deletedCardCount = json.data?.deletedCardCount ?? 0;
      const deletedDeckCount = json.data?.deletedDeckIds?.length ?? 1;
      if (movedCount > 0) {
        toast.success(
          `Deleted ${deletingDeck.name} · moved ${movedCount} card${movedCount === 1 ? "" : "s"}`,
        );
      } else if (deletedCardCount > 0) {
        toast.success(
          `Deleted ${deletingDeck.name} · ${deletedCardCount} card${deletedCardCount === 1 ? "" : "s"} deleted`,
        );
      } else {
        toast.success(
          `Deleted ${deletingDeck.name}${deletedDeckCount > 1 ? ` and ${deletedDeckCount - 1} child deck(s)` : ""}`,
        );
      }
      if (
        selectedDeckId === deletingDeck.id ||
        (selectedDeck && selectedDeck.path.startsWith(`${deletingDeck.path}/`))
      ) {
        setSelectedDeckId(null);
      }
      setDeletingDeck(null);
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Network error deleting deck",
      );
    } finally {
      setDeletingInFlight(false);
    }
  };

  const emptyMessage = cardsLoading
    ? "Loading flashcards..."
    : cards.length > 0 && search.trim()
      ? "No cards match your search."
      : sourceFilter
        ? "No flashcards attached to this file."
        : selectedDeckId
          ? "No cards for this skill yet."
          : "Select a skill, or add a card.";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-gray-900 dark:bg-[#1a2530] dark:text-white">
      {/* Header — FLASHCARDS label on its own row so it can never be
          overrun by the action buttons regardless of panel width. */}
      <div className="border-b border-black/10 dark:border-white/10 px-3 pt-3 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
          Flashcards
        </p>
        <div className="mt-1.5 flex items-center gap-1">
          {/* Play all — primary action, leftmost */}
          <button
            type="button"
            onClick={playAll}
            disabled={playingDeckId !== null}
            className="flex h-8 items-center gap-1 rounded-md border border-gold-primary/40 bg-gold-primary/10 px-2.5 text-xs font-semibold text-gold-primary transition-colors hover:bg-gold-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            title="Play every card"
            aria-label="Play all cards"
          >
            {playingDeckId === null ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Play all
          </button>
          {/* Add */}
          <button
            type="button"
            onClick={openQuickAdd}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-gold-primary/40 text-gold-primary transition-colors hover:bg-gold-primary/10"
            title="Add flashcard"
            aria-label="Add flashcard"
          >
            <Plus className="h-4 w-4" />
          </button>
          {/* Search toggle */}
          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => {
                if (v) setSearch("");
                return !v;
              });
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              searchOpen || search
                ? "bg-gold-primary/10 text-gold-primary"
                : "text-gray-500 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] hover:text-gold-primary"
            }`}
            title="Search skills and cards"
            aria-label="Toggle search"
          >
            <Search className="h-4 w-4" />
          </button>
          {/* Settings */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-black/10 dark:border-white/10 text-gray-700 dark:text-gray-300 transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.06] hover:text-gold-primary"
            title="Flashcard settings"
            aria-label="Flashcard settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {/* Expandable search */}
        {searchOpen && (
          <div className="mt-2">
            <label className="flex items-center gap-2 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 px-3 py-2 text-gray-500 dark:text-gray-400">
              <Search className="h-4 w-4 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search skills and cards…"
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 dark:text-white outline-none placeholder:text-gray-500"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-gray-500 hover:text-gold-primary"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
          </div>
        )}
      </div>

      {/* Scrollable content — tree with inline cards nested per node */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <FlashcardDeckTree
          decks={filteredDecks}
          loading={treeLoading}
          selectedDeckId={selectedDeckId}
          playingDeckId={playingDeckId}
          onSelect={(deck) => {
            setSourceFilter(null);
            setSelectedDeckId(deck.id);
          }}
          onPlay={playDeck}
          onRename={openRename}
          onDelete={openDelete}
          onQuickAdd={(deckPath) => {
            window.dispatchEvent(
              new CustomEvent(FLASHCARD_QUICK_ADD_EVENT, {
                detail: { sourceContentId, deckPath },
              }),
            );
          }}
          renderInlineCards={(_deck, depth) => {
            const pl = `${depth * 14 + 4}px`;
            // Own cards for this specific deck node (not descendants).
            const deckCards = filteredCards.filter((c) => c.deckId === _deck.id);
            if (cardsLoading && cards.length === 0) {
              return (
                <div
                  className="flex items-center gap-2 py-2 text-sm text-gray-500"
                  style={{ paddingLeft: pl }}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              );
            }
            if (deckCards.length === 0) {
              // Show empty state only for the actively selected deck.
              if (_deck.id !== selectedDeckId) return null;
              return (
                <p
                  className="py-1.5 text-sm text-gray-500"
                  style={{ paddingLeft: pl }}
                >
                  No cards yet.
                </p>
              );
            }
            return (
              <div className="space-y-0.5 pb-1 pt-0.5">
                {deckCards.map((card) => (
                  <div key={card.id}>
                    <div
                      className={`group flex items-center gap-0.5 rounded pr-0.5 transition-colors ${
                        editingCardId === card.id
                          ? "border border-gold-primary/20 bg-gold-primary/5"
                          : "bg-black/[0.025] dark:bg-white/[0.03] hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
                      }`}
                      style={{ paddingLeft: pl }}
                    >
                      {/* Invisible twisty placeholder so text aligns with deck labels. */}
                      <span className="w-4 shrink-0" aria-hidden />
                      <button
                        type="button"
                        onClick={() => launchCardReview(card)}
                        className="min-w-0 flex-1 py-1 text-left"
                        title="Start review from this card"
                      >
                        <span className="block truncate text-xs text-gray-700 dark:text-gray-300">
                          {cardPreview(card)}
                        </span>
                      </button>
                      <span className="shrink-0 rounded bg-black/[0.05] dark:bg-white/10 px-1 py-0 text-[9px] capitalize text-gray-500 dark:text-gray-400">
                        {card.reviewStatus}
                      </span>
                      <div className="flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingCardId((current) =>
                              current === card.id ? null : card.id,
                            )
                          }
                          disabled={mutatingId === card.id}
                          className={`flex h-6 w-6 items-center justify-center rounded disabled:opacity-50 ${
                            editingCardId === card.id
                              ? "text-gold-primary"
                              : "text-gray-400 dark:text-gray-500 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gold-primary"
                          }`}
                          aria-label={
                            editingCardId === card.id
                              ? "Stop editing"
                              : "Edit flashcard"
                          }
                        >
                          {editingCardId === card.id ? (
                            <X className="h-3 w-3" />
                          ) : (
                            <Pencil className="h-3 w-3" />
                          )}
                        </button>
                        {card.reviewStatus === "archived" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void updateCardStatus(card, "review")
                            }
                            disabled={mutatingId === card.id}
                            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gold-primary disabled:opacity-50"
                            aria-label="Restore flashcard"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void updateCardStatus(card, "archived")
                            }
                            disabled={mutatingId === card.id}
                            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gold-primary disabled:opacity-50"
                            aria-label="Archive flashcard"
                          >
                            <Archive className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void deleteCard(card)}
                          disabled={mutatingId === card.id}
                          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                          aria-label="Delete flashcard"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {editingCardId === card.id ? (
                      <div className="border-t border-black/10 dark:border-white/10 px-2 pb-2 pt-2">
                        <FlashcardInlineEditor
                          card={card}
                          onSaved={replaceCard}
                          compact
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          }}
        />

        {/* Source-filter mode: no deck node to anchor cards, so list below tree. */}
        {sourceFilter ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                setSelectedDeckId(null);
                setSourceFilter(null);
              }}
              className="mb-2 flex items-center gap-1.5 px-2 text-xs text-gray-500 hover:text-gold-primary"
            >
              <X className="h-3.5 w-3.5" />
              Clear filter
            </button>
            {cardsLoading && cards.length === 0 ? (
              <div className="flex items-center gap-2 px-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading cards…
              </div>
            ) : filteredCards.length === 0 ? (
              <p className="rounded-md border border-black/10 dark:border-white/10 px-3 py-2 text-sm text-gray-500">
                {emptyMessage}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filteredCards.map((card) => (
                  <div key={card.id}>
                    <div
                      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                        editingCardId === card.id
                          ? "border border-gold-primary/20 bg-gold-primary/5"
                          : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => launchCardReview(card)}
                        className="min-w-0 flex-1 text-left"
                        title="Start review from this card"
                      >
                        <span className="block truncate text-sm text-gray-800 dark:text-gray-200">
                          {cardPreview(card)}
                        </span>
                      </button>
                      <span className="shrink-0 rounded bg-black/[0.05] dark:bg-white/10 px-1.5 py-0.5 text-[10px] capitalize text-gray-600 dark:text-gray-300">
                        {card.reviewStatus}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingCardId((current) =>
                              current === card.id ? null : card.id,
                            )
                          }
                          disabled={mutatingId === card.id}
                          className={`flex h-7 w-7 items-center justify-center rounded disabled:opacity-50 ${
                            editingCardId === card.id
                              ? "text-gold-primary"
                              : "text-gray-500 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gold-primary"
                          }`}
                          aria-label="Edit flashcard"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {card.reviewStatus === "archived" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void updateCardStatus(card, "review")
                            }
                            disabled={mutatingId === card.id}
                            className="flex h-7 w-7 items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gold-primary disabled:opacity-50"
                            aria-label="Restore flashcard"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void updateCardStatus(card, "archived")
                            }
                            disabled={mutatingId === card.id}
                            className="flex h-7 w-7 items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gold-primary disabled:opacity-50"
                            aria-label="Archive flashcard"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void deleteCard(card)}
                          disabled={mutatingId === card.id}
                          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                          aria-label="Delete flashcard"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {editingCardId === card.id ? (
                      <div className="border-t border-black/10 dark:border-white/10 px-2 pb-2 pt-2">
                        <FlashcardInlineEditor
                          card={card}
                          onSaved={replaceCard}
                          compact
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <FlashcardReviewOverlay
        cards={reviewSessionCards}
        mode={reviewMode}
        open={reviewOpen}
        onClose={() => {
          setReviewOpen(false);
          setReviewSessionCards([]);
        }}
        onCardUpdated={(card) => {
          replaceCard(card);
          void fetchTree();
        }}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[calc(100vh-4rem)] w-[min(760px,92vw)] overflow-y-auto border-black/10 dark:border-white/10 bg-white dark:bg-[#1a2530] p-6 text-gray-900 dark:text-white">
          <DialogTitle className="sr-only">Flashcard settings</DialogTitle>
          <FlashcardsSettingsDialog />
        </DialogContent>
      </Dialog>

      {/* Rename skill dialog */}
      <Dialog
        open={renamingDeck !== null}
        onOpenChange={(open) => {
          if (!open && !renameInFlight) setRenamingDeck(null);
        }}
      >
        <DialogContent className="w-[min(440px,92vw)] border-black/10 dark:border-white/10 bg-white dark:bg-[#1a2530] p-6 text-gray-900 dark:text-gray-100">
          {renamingDeck && (
            <div className="space-y-4">
              <div>
                <DialogTitle className="text-lg font-semibold">Rename skill</DialogTitle>
                <p className="mt-1 truncate text-xs text-gray-500">
                  {renamingDeck.path}
                </p>
              </div>
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitRename();
                }}
                autoFocus
                className={MENU_SELECT_CLASS}
                placeholder="Skill name"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenamingDeck(null)}
                  disabled={renameInFlight}
                  className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitRename()}
                  disabled={renameInFlight || !renameValue.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gold-primary px-3 py-1.5 text-sm font-semibold text-black hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {renameInFlight ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Save
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete skill dialog */}
      <Dialog
        open={deletingDeck !== null}
        onOpenChange={(open) => {
          if (!open && !deletingInFlight) setDeletingDeck(null);
        }}
      >
        <DialogContent className="w-[min(520px,92vw)] border-black/10 dark:border-white/10 bg-white dark:bg-[#1a2530] p-6 text-gray-900 dark:text-gray-100">
          {deletingDeck &&
            (() => {
              const cardCount = subtreeCountByDeck.get(deletingDeck.id) ?? 0;
              const hasCards = cardCount > 0;
              // Exclude the deck being deleted and its descendants from
              // the move-target picker — they'd be cascade-deleted too.
              const moveCandidates = decks.filter(
                (d) =>
                  d.id !== deletingDeck.id &&
                  !d.path.startsWith(`${deletingDeck.path}/`),
              );

              return (
                <div className="space-y-4">
                  <div>
                    <DialogTitle className="text-lg font-semibold">Delete skill?</DialogTitle>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {deletingDeck.name}
                      </span>{" "}
                      will be removed.{" "}
                      {hasCards
                        ? `Has ${cardCount} card${cardCount === 1 ? "" : "s"} (incl. sub-skills).`
                        : "(Empty)"}
                    </p>
                  </div>

                  {hasCards && (
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 p-3">
                        <input
                          type="radio"
                          name="delete-cards-action"
                          value="delete"
                          checked={deleteCardsAction === "delete"}
                          onChange={() => setDeleteCardsAction("delete")}
                          className="mt-0.5 h-4 w-4 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">
                            Delete the cards too
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            All {cardCount} card{cardCount === 1 ? "" : "s"} in
                            this skill and its sub-skills are soft-deleted.
                          </div>
                        </div>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 p-3">
                        <input
                          type="radio"
                          name="delete-cards-action"
                          value="move"
                          checked={deleteCardsAction === "move"}
                          onChange={() => setDeleteCardsAction("move")}
                          className="mt-0.5 h-4 w-4 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div>
                            <div className="text-sm font-medium">
                              Move cards to another skill
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Cards keep their progress; the skill is removed.
                            </div>
                          </div>
                          {deleteCardsAction === "move" && (
                            <select
                              value={moveToDeckIdChoice}
                              onChange={(e) =>
                                setMoveToDeckIdChoice(e.target.value)
                              }
                              className={MENU_SELECT_CLASS}
                              aria-label="Destination skill"
                            >
                              <option value="">Pick a destination…</option>
                              {moveCandidates.length === 0 ? (
                                <option value="" disabled>
                                  No other skills available
                                </option>
                              ) : (
                                moveCandidates.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.path}
                                  </option>
                                ))
                              )}
                            </select>
                          )}
                        </div>
                      </label>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeletingDeck(null)}
                      disabled={deletingInFlight}
                      className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSkill()}
                      disabled={
                        deletingInFlight ||
                        (hasCards &&
                          deleteCardsAction === "move" &&
                          !moveToDeckIdChoice)
                      }
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingInFlight ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Deleting…
                        </>
                      ) : (
                        "Delete skill"
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
