"use client";

import { useCallback, useEffect, useMemo, useId, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { EMPTY_TIPTAP_DOC } from "@/lib/domain/flashcards";
import type {
  FlashcardDeckRecordDto,
  FlashcardDto,
} from "@/lib/domain/flashcards";
import {
  countClozeCards,
  type TipTapNode,
} from "@/lib/domain/flashcards/cloze/extract";
import { AdaptiveFlashcardEditor } from "./AdaptiveFlashcardEditor";

interface FlashcardClozeQuickAddFormProps {
  sourceContentId: string | null;
  /** Pre-seed the skill path (e.g. from the selected tree node). */
  initialDeckPath?: string | null;
  onCreated?: (cards: FlashcardDto[]) => void;
  onCancel?: () => void;
}

interface PrefillData {
  sourceTitle: string | null;
  category: string;
  subcategory: string;
  deckPath: string;
}

const MENU_INPUT_CLASS =
  "w-full rounded-md border border-black/15 dark:border-white/20 bg-black/[0.05] dark:bg-white/10 px-3 py-2 text-base text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-500 focus:border-gold-primary md:text-sm";

export function FlashcardClozeQuickAddForm({
  sourceContentId,
  initialDeckPath,
  onCreated,
  onCancel,
}: FlashcardClozeQuickAddFormProps) {
  const idPrefix = useId();
  const [deckPath, setDeckPath] = useState("");
  const [deckPaths, setDeckPaths] = useState<string[]>([]);
  const [sourceContent, setSourceContent] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [saving, setSaving] = useState(false);
  const deckPathListId = `${idPrefix}-cloze-deck-paths`;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (sourceContentId) params.set("sourceContentId", sourceContentId);
    fetch(`/api/flashcards/prefill?${params.toString()}`, {
      credentials: "include",
    })
      .then((response) => response.json())
      .then((result) => {
        if (cancelled || !result?.success) return;
        const data = result.data as PrefillData;
        setDeckPath(initialDeckPath?.trim() || data.deckPath || "");
      })
      .catch(() => {
        if (!cancelled && initialDeckPath) setDeckPath(initialDeckPath.trim());
      });
    return () => {
      cancelled = true;
    };
  }, [sourceContentId, initialDeckPath]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/flashcards/decks/tree", { credentials: "include" })
      .then((response) => response.json())
      .then((result) => {
        if (cancelled || !result?.success) return;
        const paths = (result.data as FlashcardDeckRecordDto[])
          .map((deck) => deck.path)
          .sort((a, b) => a.localeCompare(b));
        setDeckPaths(paths);
      })
      .catch(() => {
        if (!cancelled) setDeckPaths([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live count of cards that will be created. Re-derives on every
  // source-content change; the walk is cheap (single tree traversal).
  const cardsToCreate = useMemo(
    () => countClozeCards(sourceContent as TipTapNode),
    [sourceContent],
  );

  const canSave = cardsToCreate > 0 && !saving && Boolean(deckPath.trim());

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const response = await fetch("/api/flashcards/cloze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          deckPath: deckPath.trim(),
          sourceJson: sourceContent,
          sourceContentId,
        }),
      });
      const result = (await response.json()) as {
        success: boolean;
        data?: FlashcardDto[];
        meta?: { noteId: string; cardsCreated: number };
        error?: { code: string; message: string };
      };
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? "Failed to create cloze cards");
      }
      toast.success(
        `Created ${result.meta?.cardsCreated ?? result.data.length} cloze card${
          (result.meta?.cardsCreated ?? result.data.length) === 1 ? "" : "s"
        }`,
      );
      setSourceContent(EMPTY_TIPTAP_DOC);
      setDeckPaths((current) =>
        current.includes(deckPath.trim())
          ? current
          : [...current, deckPath.trim()].sort((a, b) => a.localeCompare(b)),
      );
      onCreated?.(result.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create cloze cards");
    } finally {
      setSaving(false);
    }
  }, [canSave, deckPath, sourceContent, sourceContentId, onCreated]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-1">
        <div className="mb-3 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
          <strong className="text-amber-700 dark:text-amber-400">Cloze mode:</strong>{" "}
          type your sentence, select a word or phrase, and press{" "}
          <kbd className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.7rem] dark:bg-white/10">
            ⌘⇧C
          </kbd>{" "}
          to make it a cloze deletion. Each numbered cloze becomes one sibling card.
        </div>

        <label className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
          Skill path
          <input
            value={deckPath}
            onChange={(event) => setDeckPath(event.target.value)}
            list={deckPathListId}
            placeholder="skill/subskill/subskill"
            spellCheck={false}
            autoCapitalize="none"
            className={MENU_INPUT_CLASS}
          />
          <datalist id={deckPathListId}>
            {deckPaths.map((path) => (
              <option key={path} value={path} />
            ))}
          </datalist>
        </label>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-200">
              Source
            </span>
            <span
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                cardsToCreate > 0
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-black/[0.05] text-gray-500 dark:bg-white/5 dark:text-gray-500"
              }`}
              aria-live="polite"
            >
              <Sparkles className="h-3 w-3" />
              {cardsToCreate === 0
                ? "0 cards"
                : cardsToCreate === 1
                  ? "1 card"
                  : `${cardsToCreate} cards`}
            </span>
          </div>
          <AdaptiveFlashcardEditor
            value={sourceContent}
            onChange={setSourceContent}
            mode="rich"
            placeholder="Type your sentence, then select text and press ⌘⇧C to make it a cloze..."
            ariaLabel="Cloze source"
          />
        </div>
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-end gap-2 border-t border-black/10 dark:border-white/10 pt-3">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-black/15 dark:border-white/15 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-500"
        >
          {saving
            ? "Saving…"
            : cardsToCreate === 0
              ? "Mark some text first"
              : `Save ${cardsToCreate} card${cardsToCreate === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
