"use client";

/**
 * FlashcardSelectionStarter (Epoch 19, Sprint 8)
 *
 * Bridges the `/flashcard-select` slash command (which dispatches
 * `dg:flashcard-selection-start`) to the deck picker and the
 * selection state machine.
 *
 * Flow:
 *   1. Slash command fires → custom event `dg:flashcard-selection-start`
 *   2. This component fetches /api/user/settings to read the user's
 *      `flashcards.lastUsedSelectionDeckId` + `quickFireEnabled`
 *   3a. If quickFire enabled AND lastUsedSelectionDeckId set → silent
 *       skip: directly call `selectionStore.start(deckId)`. The user
 *       lands in awaiting-front instantly with the cursor cue.
 *   3b. Otherwise → open the FlashcardDeckPickerDialog with the last
 *       deck pre-selected (where supported). On confirm, PATCH user
 *       settings with the new lastUsedSelectionDeckId, then call
 *       `selectionStore.start(deckId)`.
 *
 * Why a discrete component vs handling this inline in the slash
 * command: slash-commands.tsx is a pure data file (no state, no
 * fetch). Keeping UI + fetch + state behind a globalDialogs component
 * keeps that file declarative and lets the same trigger be reused
 * later (toolbar button, context menu, etc.) without duplication.
 */

import { useCallback, useEffect, useState } from "react";
import { FlashcardDeckPickerDialog } from "./FlashcardDeckPickerDialog";
import { useFlashcardSelectionStore } from "@/state/flashcard-selection-store";
// Client-safe logger entry. Importing from "@/lib/core/logger" pulls in
// `next/headers` and `node:async_hooks` transitively — both server-only;
// the bundler rejects them in a "use client" graph.
import { clientLogger } from "@/lib/core/logger/client";

interface SelectionDefaults {
  lastUsedSelectionDeckId: string | null;
  quickFireEnabled: boolean;
}

async function fetchSelectionDefaults(): Promise<SelectionDefaults> {
  try {
    const res = await fetch("/api/user/settings", { credentials: "include" });
    if (!res.ok) {
      return { lastUsedSelectionDeckId: null, quickFireEnabled: false };
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        flashcards?: {
          lastUsedSelectionDeckId?: string;
          quickFireEnabled?: boolean;
        };
      };
    };
    const fc = json?.data?.flashcards;
    return {
      lastUsedSelectionDeckId: fc?.lastUsedSelectionDeckId ?? null,
      quickFireEnabled: Boolean(fc?.quickFireEnabled),
    };
  } catch (err) {
    clientLogger.warn({
      layer: "fetch",
      event: "flashcard_selection_defaults_fetch_failed",
      summary: "Could not read selection defaults — falling back to picker",
      error: err instanceof Error ? err : undefined,
    });
    return { lastUsedSelectionDeckId: null, quickFireEnabled: false };
  }
}

async function persistLastUsedDeck(deckId: string): Promise<void> {
  try {
    await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        flashcards: { lastUsedSelectionDeckId: deckId },
      }),
    });
  } catch (err) {
    // Best-effort — failure here just means next session won't have
    // the deck pre-selected. Not worth surfacing to the user.
    clientLogger.warn({
      layer: "fetch",
      event: "flashcard_selection_persist_deck_failed",
      summary: "Could not persist last-used deck (best-effort)",
      error: err instanceof Error ? err : undefined,
    });
  }
}

export function FlashcardSelectionStarter() {
  const start = useFlashcardSelectionStore((s) => s.start);
  const [pickerOpen, setPickerOpen] = useState(false);

  const beginWithDeck = useCallback(
    (deckId: string) => {
      void persistLastUsedDeck(deckId);
      start(deckId);
    },
    [start],
  );

  useEffect(() => {
    const handler = async () => {
      const defaults = await fetchSelectionDefaults();
      if (defaults.quickFireEnabled && defaults.lastUsedSelectionDeckId) {
        beginWithDeck(defaults.lastUsedSelectionDeckId);
        return;
      }
      setPickerOpen(true);
    };
    window.addEventListener("dg:flashcard-selection-start", handler);
    return () => {
      window.removeEventListener("dg:flashcard-selection-start", handler);
    };
  }, [beginWithDeck]);

  return (
    <FlashcardDeckPickerDialog
      open={pickerOpen}
      onClose={() => setPickerOpen(false)}
      onSelect={(deckId) => {
        setPickerOpen(false);
        beginWithDeck(deckId);
      }}
    />
  );
}
