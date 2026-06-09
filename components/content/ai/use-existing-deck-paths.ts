"use client";

/**
 * Tiny module-level cache + React hook for the user's existing
 * flashcard deck paths. Used by the AI proposal cards
 * (FlashcardDeckProposalCard + FlashcardCardProposalList) to power
 * an inline autocomplete (<datalist>) so the user can edit the
 * proposed deck path and pick from existing decks instead of
 * creating a new one.
 *
 * The cache is shared across all proposal cards in a session so
 * mounting 5 cards in chat only triggers 1 fetch. A
 * "flashcard-deck-created" event listener invalidates the cache
 * when any card commits a new deck, so subsequent autocompletes
 * surface the freshly-created deck without a manual refresh.
 */

import { useEffect, useState } from "react";

interface DeckPath {
  id: string;
  path: string;
  name: string;
}

let cached: DeckPath[] | null = null;
let cachedPromise: Promise<DeckPath[]> | null = null;
const subscribers = new Set<(decks: DeckPath[]) => void>();

async function fetchDeckPaths(): Promise<DeckPath[]> {
  // Use the existing GET /api/flashcards/decks endpoint. It returns
  // legacy DTO shape with `deckId` + `path` + `category` + `subcategory`.
  // We only need id, path, and a display name.
  try {
    const res = await fetch("/api/flashcards/decks", {
      credentials: "include",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      success?: boolean;
      data?: Array<{
        deckId?: string;
        path?: string;
        category?: string;
        subcategory?: string;
      }>;
    };
    if (!json?.success || !Array.isArray(json.data)) return [];
    return json.data
      .filter((d): d is { deckId: string; path: string; category: string; subcategory: string } => (
        typeof d.deckId === "string" &&
        typeof d.path === "string" &&
        typeof d.category === "string"
      ))
      .map((d) => ({
        id: d.deckId,
        path: d.path,
        name: d.subcategory || d.category,
      }));
  } catch {
    return [];
  }
}

function notify(): void {
  if (!cached) return;
  for (const s of subscribers) s(cached);
}

// Listen for newly-created decks (fired by the proposal cards on
// commit) so the cache stays in step without manual refresh.
if (typeof window !== "undefined") {
  window.addEventListener("flashcard-deck-created", (e) => {
    const detail = (e as CustomEvent).detail as
      | { deckPath?: string; deckId?: string | null }
      | undefined;
    if (!detail?.deckPath || !detail.deckId || !cached) return;
    if (cached.some((d) => d.id === detail.deckId)) return;
    cached = [
      ...cached,
      {
        id: detail.deckId,
        path: detail.deckPath,
        name: detail.deckPath.split("/").pop() ?? detail.deckPath,
      },
    ].sort((a, b) => a.path.localeCompare(b.path));
    notify();
  });
}

export function useExistingDeckPaths(): DeckPath[] {
  // Initial state from the module cache so the first render is hot
  // when a sibling card has already triggered the fetch. The useEffect
  // below registers a subscriber and (lazily) kicks off the fetch if
  // nothing's pending — but doesn't synchronously call setDecks.
  const [decks, setDecks] = useState<DeckPath[]>(() => cached ?? []);

  useEffect(() => {
    let mounted = true;
    const subscribe = (next: DeckPath[]) => {
      if (mounted) setDecks(next);
    };
    subscribers.add(subscribe);

    if (!cached && !cachedPromise) {
      cachedPromise = fetchDeckPaths().then((result) => {
        cached = result;
        notify();
        return result;
      });
    }

    return () => {
      mounted = false;
      subscribers.delete(subscribe);
    };
  }, []);

  return decks;
}

/**
 * Resolve a path string against the cached deck list. Used by
 * proposal cards to recompute deckExists / deckId as the user edits.
 */
export function resolveDeckByPath(
  decks: DeckPath[],
  path: string,
): DeckPath | undefined {
  return decks.find((d) => d.path === path);
}
