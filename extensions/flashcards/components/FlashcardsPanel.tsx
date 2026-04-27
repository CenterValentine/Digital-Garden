"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Check,
  Eye,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  FlashcardDeckDto,
  FlashcardDto,
  FlashcardReviewMode,
  FlashcardReviewStatus,
} from "@/lib/domain/flashcards";
import { useContentStore } from "@/state/content-store";
import {
  Dialog,
  DialogContent,
} from "@/components/client/ui/dialog";
import { FlashcardInlineEditor } from "./FlashcardInlineEditor";
import { FlashcardReviewOverlay } from "./FlashcardReviewOverlay";
import FlashcardsSettingsDialog from "../settings/FlashcardsSettingsDialog";
import {
  FLASHCARD_CHANGED_EVENT,
  FLASHCARD_QUICK_ADD_EVENT,
  FLASHCARD_VIEW_SOURCE_EVENT,
  type FlashcardViewSourceEventDetail,
} from "../events";

type DeckSelection = {
  category: string;
  subcategory: string;
} | null;
type DeckReviewSettings = {
  reviewMode: FlashcardReviewMode;
  reviewStatus: FlashcardReviewStatus | "all";
};

const REVIEW_MODES: Array<{ value: FlashcardReviewMode; label: string }> = [
  { value: "front_to_back", label: "Front to Back" },
  { value: "back_to_front", label: "Back to Front" },
  { value: "random", label: "Random" },
];
const STATUS_LABELS: Record<FlashcardReviewStatus | "all", string> = {
  all: "Active",
  new: "New",
  review: "Review",
  mastered: "Mastered",
  archived: "Archived",
};
const MENU_SELECT_CLASS =
  "w-full rounded-md border border-white/20 bg-gray-900/95 px-3 py-2 text-base text-gray-100 shadow-sm outline-none transition-colors hover:bg-white/10 focus:border-gold-primary focus:bg-gray-900 md:text-sm";
const DECK_SETTINGS_STORAGE_KEY = "flashcards:deck-review-settings";

function getUsableSourceContentId(id: string | null): string | null {
  if (!id || id.startsWith("temp-") || id.startsWith("person:")) return null;
  return id;
}

function deckKey(deck: Pick<FlashcardDeckDto, "category" | "subcategory">) {
  return `${deck.category}\u0000${deck.subcategory}`;
}

function cardPreview(card: FlashcardDto) {
  return card.frontPreview || card.backPreview || "Untitled flashcard";
}

function formatDeckLabel(
  deck: Pick<FlashcardDeckDto, "category" | "subcategory">
) {
  return deck.subcategory
    ? `${deck.subcategory} / ${deck.category}`
    : deck.category;
}

function loadDeckSettings(): Record<string, DeckReviewSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DECK_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DeckReviewSettings>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function FlashcardsPanel() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const sourceContentId = getUsableSourceContentId(selectedContentId);
  const [cards, setCards] = useState<FlashcardDto[]>([]);
  const [decks, setDecks] = useState<FlashcardDeckDto[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckSelection>(null);
  const [status, setStatus] = useState<FlashcardReviewStatus | "all">("all");
  const [reviewMode, setReviewMode] =
    useState<FlashcardReviewMode>("front_to_back");
  const [deckSearch, setDeckSearch] = useState("");
  const [cardSearch, setCardSearch] = useState("");
  const [skillFilterOpen, setSkillFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [deckSettings, setDeckSettings] =
    useState<Record<string, DeckReviewSettings>>(loadDeckSettings);
  const [settingsDeckKey, setSettingsDeckKey] = useState<string | null>(null);
  const [renamingDeckKey, setRenamingDeckKey] = useState<string | null>(null);
  const [renameSkillCategory, setRenameSkillCategory] = useState("");
  const [reviewSessionCards, setReviewSessionCards] = useState<FlashcardDto[]>([]);
  const [sourceFilter, setSourceFilter] = useState<{
    id: string;
    title: string | null;
  } | null>(null);

  const fetchDecks = useCallback(async () => {
    const response = await fetch("/api/flashcards/decks", {
      credentials: "include",
    });
    const result = await response.json();
    if (result?.success) {
      setDecks(result.data as FlashcardDeckDto[]);
    }
  }, []);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDeck) {
        params.set("category", selectedDeck.category);
        params.set("subcategory", selectedDeck.subcategory);
      }
      if (sourceFilter) params.set("sourceContentId", sourceFilter.id);
      if (status !== "all") params.set("reviewStatus", status);
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
      setLoading(false);
    }
  }, [selectedDeck, sourceFilter, status]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchDecks(), fetchCards()]);
  }, [fetchCards, fetchDecks]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    window.localStorage.setItem(
      DECK_SETTINGS_STORAGE_KEY,
      JSON.stringify(deckSettings)
    );
  }, [deckSettings]);

  useEffect(() => {
    const handleViewSource = (event: Event) => {
      const detail = (event as CustomEvent<FlashcardViewSourceEventDetail>).detail;
      if (!detail?.sourceContentId) return;
      setSelectedDeck(null);
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
    const query = deckSearch.trim().toLowerCase();
    if (!query) return decks;
    return decks.filter((deck) =>
      `${deck.category} ${deck.subcategory}`.toLowerCase().includes(query)
    );
  }, [deckSearch, decks]);
  const filteredCards = useMemo(() => {
    const query = cardSearch.trim().toLowerCase();
    if (!query) return cards;
    return cards.filter((card) =>
      [
        card.frontPreview,
        card.backPreview,
        card.frontLabel,
        card.backLabel,
        card.category,
        card.subcategory,
        card.sourceTitle ?? "",
        card.reviewStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [cardSearch, cards]);

  const openQuickAdd = () => {
    window.dispatchEvent(
      new CustomEvent(FLASHCARD_QUICK_ADD_EVENT, {
        detail: { sourceContentId },
      })
    );
  };

  const getDeckSettings = (deck: FlashcardDeckDto): DeckReviewSettings => {
    return (
      deckSettings[deckKey(deck)] ?? {
        reviewMode,
        reviewStatus: "all",
      }
    );
  };

  const updateDeckSettings = (
    deck: FlashcardDeckDto,
    updates: Partial<DeckReviewSettings>
  ) => {
    setDeckSettings((current) => {
      const key = deckKey(deck);
      return {
        ...current,
        [key]: {
          ...getDeckSettings(deck),
          ...updates,
        },
      };
    });
  };

  const moveDeckSettings = (
    deck: FlashcardDeckDto,
    nextSubcategory: string
  ) => {
    setDeckSettings((current) => {
      const currentKey = deckKey(deck);
      const nextKey = deckKey({ ...deck, subcategory: nextSubcategory });
      if (currentKey === nextKey || !current[currentKey]) return current;
      const { [currentKey]: settings, ...rest } = current;
      return {
        ...rest,
        [nextKey]: settings,
      };
    });
  };

  const startDeckReview = async (deck: FlashcardDeckDto) => {
    const settings = getDeckSettings(deck);
    setReviewMode(settings.reviewMode);
    setStatus(settings.reviewStatus);
    setSelectedDeck({
      category: deck.category,
      subcategory: deck.subcategory,
    });
    setSourceFilter(null);

    const params = new URLSearchParams({
      category: deck.category,
      subcategory: deck.subcategory,
    });
    if (settings.reviewStatus !== "all") {
      params.set("reviewStatus", settings.reviewStatus);
    }

    try {
      const response = await fetch(`/api/flashcards?${params.toString()}`, {
        credentials: "include",
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message || "Failed to load deck");
      }
      const loadedCards = (result.data as FlashcardDto[]).filter(
        (card) => card.reviewStatus !== "archived"
      );
      setReviewSessionCards(loadedCards);
      if (loadedCards.length === 0) {
        toast.error("No active cards in this deck.");
        return;
      }
      setReviewOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load deck");
    }
  };

  const updateCardStatus = async (
    card: FlashcardDto,
    nextStatus: FlashcardReviewStatus
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
        nextStatus === "archived" && status !== "archived"
          ? current.filter((candidate) => candidate.id !== card.id)
          : current.map((candidate) =>
              candidate.id === card.id ? updated : candidate
            )
      );
      void fetchDecks();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update flashcard"
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
        current.filter((candidate) => candidate.id !== card.id)
      );
      void fetchDecks();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete flashcard"
      );
    } finally {
      setMutatingId(null);
    }
  };

  const replaceCard = useCallback((card: FlashcardDto) => {
    setCards((current) =>
      current.map((candidate) => (candidate.id === card.id ? card : candidate))
    );
    setReviewSessionCards((current) =>
      current.map((candidate) => (candidate.id === card.id ? card : candidate))
    );
  }, []);

  const launchCardReview = (card: FlashcardDto) => {
    const rest = cards.filter(
      (candidate) =>
        candidate.id !== card.id && candidate.reviewStatus !== "archived"
    );
    setReviewSessionCards([card, ...rest]);
    setReviewOpen(true);
  };

  const renameDeckSkillCategory = async (deck: FlashcardDeckDto) => {
    const currentKey = deckKey(deck);
    const nextSubcategory = renameSkillCategory.trim();
    if (nextSubcategory === deck.subcategory) {
      setRenamingDeckKey(null);
      return;
    }

    setRenamingDeckKey(currentKey);
    try {
      const response = await fetch("/api/flashcards/decks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category: deck.category,
          subcategory: deck.subcategory,
          nextSubcategory,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message || "Failed to update deck");
      }

      const data = result.data as {
        matchedCount: number;
        updatedCount: number;
        subcategory: string;
      };
      setCards((current) =>
        current.map((card) =>
          card.category === deck.category && card.subcategory === deck.subcategory
            ? { ...card, subcategory: data.subcategory }
            : card
        )
      );
      setReviewSessionCards((current) =>
        current.map((card) =>
          card.category === deck.category && card.subcategory === deck.subcategory
            ? { ...card, subcategory: data.subcategory }
            : card
        )
      );
      setSelectedDeck((current) =>
        current &&
        current.category === deck.category &&
        current.subcategory === deck.subcategory
          ? { ...current, subcategory: data.subcategory }
          : current
      );
      moveDeckSettings(deck, data.subcategory);
      setSettingsDeckKey(deckKey({ ...deck, subcategory: data.subcategory }));
      setRenameSkillCategory(data.subcategory);
      if (data.updatedCount === data.matchedCount) {
        toast.success(`Updated ${data.updatedCount} flashcards.`);
      } else if (data.updatedCount > 0) {
        toast.warning(
          `Updated ${data.updatedCount} of ${data.matchedCount} flashcards.`
        );
      } else {
        toast.error("No flashcards were updated.");
      }
      void fetchDecks();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update deck"
      );
    } finally {
      setRenamingDeckKey(null);
    }
  };

  const emptyMessage = loading
    ? "Loading flashcards..."
    : cards.length > 0 && cardSearch.trim()
      ? "No cards match your search."
    : sourceFilter
      ? "No flashcards attached to this file."
      : selectedDeck
        ? "No cards for this skill yet."
        : "No flashcards yet.";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111318] text-white">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
              Flashcards
            </p>
            <h3 className="text-lg font-semibold text-white">
              {selectedDeck
                ? formatDeckLabel(selectedDeck)
                : sourceFilter
                  ? sourceFilter.title ?? "This File"
                : "All Skills"}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 text-gray-300 transition-colors hover:bg-white/10 hover:text-gold-primary"
              title="Flashcard settings"
              aria-label="Flashcard settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={openQuickAdd}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-gold-primary/40 text-gold-primary transition-colors hover:bg-gold-primary/10"
              title="Add flashcard"
              aria-label="Add flashcard"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <Layers className="h-4 w-4" />
            Skills
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSkillFilterOpen((current) => !current)}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                skillFilterOpen || deckSearch
                  ? "bg-gold-primary/10 text-gold-primary"
                  : "text-gray-400 hover:bg-white/10 hover:text-gold-primary"
              }`}
              title="Filter skills"
              aria-label="Filter skills"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {selectedDeck || sourceFilter ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedDeck(null);
                  setSourceFilter(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-gold-primary hover:bg-gold-primary/10"
                title="Clear skill selection"
                aria-label="Clear skill selection"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
        {skillFilterOpen || deckSearch ? (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-gray-400">
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={deckSearch}
                onChange={(event) => setDeckSearch(event.target.value)}
                placeholder="Search skills"
                className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-gray-500 md:text-sm"
              />
            </label>
            {deckSearch ? (
              <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">
                <span className="text-xs text-gray-500">
                  {filteredDecks.length}
                </span>
                <button
                  type="button"
                  onClick={() => setDeckSearch("")}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-gold-primary"
                  title="Clear skill filter"
                  aria-label="Clear skill filter"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
          {filteredDecks.length === 0 ? (
            <p className="rounded-md border border-white/10 px-3 py-2 text-sm text-gray-500">
              No skills yet.
            </p>
          ) : (
            filteredDecks.map((deck) => {
              const active =
                selectedDeck &&
                deck.category === selectedDeck.category &&
                deck.subcategory === selectedDeck.subcategory;
              const key = deckKey(deck);
              const settings = getDeckSettings(deck);
              const settingsOpen = settingsDeckKey === key;
              return (
                <div
                  key={key}
                  className={`group rounded-md border transition-colors ${
                    active
                      ? "border-gold-primary/40 bg-gold-primary/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDeck({
                          category: deck.category,
                          subcategory: deck.subcategory,
                        });
                        setSourceFilter(null);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-100">
                          {deck.subcategory || "No skill category"}
                        </span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-gray-300">
                          {deck.count}
                        </span>
                        {deck.viewedCount > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded border border-gold-primary/20 bg-gold-primary/10 px-1.5 py-0.5 text-[11px] text-gold-primary"
                            title="Card views in this skill"
                          >
                            <Eye className="h-3 w-3" />
                            {deck.viewedCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {deck.category}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => void startDeckReview(deck)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-300 hover:bg-gold-primary/10 hover:text-gold-primary"
                        title="Review this deck"
                        aria-label="Review this deck"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameSkillCategory(deck.subcategory);
                          setSettingsDeckKey((current) =>
                            current === key ? null : key
                          );
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-300 hover:bg-white/10 hover:text-gold-primary"
                        title="Deck review settings"
                        aria-label="Deck review settings"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {settingsOpen ? (
                    <div className="grid gap-2 border-t border-white/10 px-3 py-3">
                      <label className="space-y-1 text-xs text-gray-400">
                        Skill Category
                        <div className="flex items-center gap-1">
                          <input
                            value={renameSkillCategory}
                            onChange={(event) =>
                              setRenameSkillCategory(event.target.value)
                            }
                            className="min-w-0 flex-1 rounded-md border border-white/20 bg-gray-900/95 px-3 py-2 text-base text-gray-100 shadow-sm outline-none transition-colors hover:bg-white/10 focus:border-gold-primary focus:bg-gray-900 md:text-sm"
                            placeholder="No skill category"
                          />
                          <button
                            type="button"
                            onClick={() => void renameDeckSkillCategory(deck)}
                            disabled={
                              renamingDeckKey === key ||
                              renameSkillCategory.trim() === deck.subcategory
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-md border border-white/20 text-gray-300 hover:bg-gold-primary/10 hover:text-gold-primary disabled:cursor-not-allowed disabled:opacity-40"
                            title="Save skill category"
                            aria-label="Save skill category"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRenameSkillCategory(deck.subcategory)
                            }
                            disabled={renameSkillCategory === deck.subcategory}
                            className="flex h-10 w-10 items-center justify-center rounded-md border border-white/20 text-gray-300 hover:bg-white/10 hover:text-gold-primary disabled:cursor-not-allowed disabled:opacity-40"
                            title="Reset skill category"
                            aria-label="Reset skill category"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </label>
                      <label className="space-y-1 text-xs text-gray-400">
                        Review Mode
                        <select
                          value={settings.reviewMode}
                          onChange={(event) =>
                            updateDeckSettings(deck, {
                              reviewMode: event.target.value as FlashcardReviewMode,
                            })
                          }
                          className={MENU_SELECT_CLASS}
                        >
                          {REVIEW_MODES.map((mode) => (
                            <option key={mode.value} value={mode.value}>
                              {mode.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs text-gray-400">
                        Status
                        <select
                          value={settings.reviewStatus}
                          onChange={(event) =>
                            updateDeckSettings(deck, {
                              reviewStatus: event.target.value as
                                | FlashcardReviewStatus
                                | "all",
                            })
                          }
                          className={MENU_SELECT_CLASS}
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Cards
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md p-1.5 text-gray-400 hover:bg-white/10 hover:text-gold-primary"
              aria-label="Refresh flashcards"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-gray-400">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={cardSearch}
              onChange={(event) => setCardSearch(event.target.value)}
              placeholder="Search cards"
              className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-gray-500 md:text-sm"
            />
          </label>
        </div>

        {filteredCards.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-gray-500">
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredCards.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-gold-primary/30 hover:bg-white/[0.06]"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => launchCardReview(card)}
                    className="group min-w-0 flex-1 rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-primary/60"
                    aria-label="Review this flashcard"
                  >
                    <p className="line-clamp-2 text-sm font-semibold text-white transition-colors group-hover:text-gold-primary">
                      {cardPreview(card)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500 transition-colors group-hover:text-gray-300">
                      {card.backPreview || "No back preview"}
                    </p>
                  </button>
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] capitalize text-gray-300">
                    {card.reviewStatus}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="min-w-0 truncate">
                    {card.subcategory
                      ? `${card.subcategory} / ${card.category}`
                      : card.category}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCardId((current) =>
                          current === card.id ? null : card.id
                        )
                      }
                      disabled={mutatingId === card.id}
                      className={`rounded-md p-2 hover:bg-white/10 disabled:opacity-50 ${
                        editingCardId === card.id
                          ? "text-gold-primary"
                          : "text-gray-400 hover:text-gold-primary"
                      }`}
                      aria-label={
                        editingCardId === card.id
                          ? "Stop editing flashcard"
                          : "Edit flashcard"
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {card.reviewStatus === "archived" ? (
                      <button
                        type="button"
                        onClick={() => void updateCardStatus(card, "review")}
                        disabled={mutatingId === card.id}
                        className="rounded-md p-2 text-gray-400 hover:bg-white/10 hover:text-gold-primary disabled:opacity-50"
                        aria-label="Restore flashcard"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void updateCardStatus(card, "archived")}
                        disabled={mutatingId === card.id}
                        className="rounded-md p-2 text-gray-400 hover:bg-white/10 hover:text-gold-primary disabled:opacity-50"
                        aria-label="Archive flashcard"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteCard(card)}
                      disabled={mutatingId === card.id}
                      className="rounded-md p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                      aria-label="Delete flashcard"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {editingCardId === card.id ? (
                  <div className="mt-3 border-t border-white/10 pt-3">
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
          void fetchDecks();
        }}
      />
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[calc(100vh-4rem)] w-[min(760px,92vw)] overflow-y-auto border-white/10 bg-[#0f1115] p-6 text-white">
          <FlashcardsSettingsDialog />
        </DialogContent>
      </Dialog>
    </div>
  );
}
