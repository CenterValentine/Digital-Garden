"use client";

/**
 * FlashcardSelectionLauncher (Epoch 19, Sprint 8)
 *
 * Listens for `dg:flashcard-launch` (emitted by the FlashcardSelect
 * mark on Ctrl/Cmd+Click) and mounts FlashcardReviewOverlay scoped
 * to the requested deck — and to a specific card when the mark
 * carried a `data-flashcard-id`.
 *
 * Why a separate launcher component vs reusing the inline overlay
 * mounted in FlashcardEmbedNodeView: highlights can live in any
 * paragraph of any note. There's no flashcardEmbed block on the
 * page to anchor the overlay to. So we mount the overlay at the
 * extension level (globalDialogs) and let any highlight click open
 * it.
 *
 * When `flashcardId` is present, we pass it as a single-element
 * `cardIds` filter on the FlashcardReviewOverlay's queue filter so
 * the user lands on that exact card. When it's null (POST was still
 * in flight or failed to wire the id back into the marks), we fall
 * back to the deck-wide queue — the highlight is still useful as a
 * "study this deck" gesture.
 */

import { useCallback, useEffect, useState } from "react";
import { FlashcardReviewOverlay } from "./FlashcardReviewOverlay";
import type { FlashcardReviewFilter } from "./FlashcardReviewOverlay";

interface LaunchDetail {
  deckId: string;
  flashcardId: string | null;
}

function isLaunchDetail(value: unknown): value is LaunchDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.deckId === "string" &&
    (v.flashcardId === null || typeof v.flashcardId === "string")
  );
}

export function FlashcardSelectionLauncher() {
  const [filter, setFilter] = useState<FlashcardReviewFilter | null>(null);

  const close = useCallback(() => setFilter(null), []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!isLaunchDetail(detail)) return;
      setFilter({
        deckId: detail.deckId,
        // Scope to a single card when the mark carried an id. The
        // overlay handles both the "single card" and "deck-wide"
        // shapes through the same FlashcardReviewFilter contract.
        cardIds: detail.flashcardId ? [detail.flashcardId] : undefined,
      });
    };
    window.addEventListener("dg:flashcard-launch", handler);
    return () => {
      window.removeEventListener("dg:flashcard-launch", handler);
    };
  }, []);

  // Overlay is controlled via the `open` prop. We render it always
  // (cheap when closed) so the mount-on-open animation lands cleanly.
  return (
    <FlashcardReviewOverlay
      filter={filter ?? undefined}
      mode="front_to_back"
      open={filter !== null}
      onClose={close}
      onCardUpdated={() => {
        // The launcher is presentational — it doesn't track the
        // editor's local card cache. The FSRS write lands server-side
        // via the overlay's own rating handlers; surrounding embed
        // blocks re-fetch on their next mount.
      }}
    />
  );
}
