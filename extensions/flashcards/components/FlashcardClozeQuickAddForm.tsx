"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { EMPTY_TIPTAP_DOC } from "@/lib/domain/flashcards";
import type { FlashcardDto, FlashcardOptionsDto } from "@/lib/domain/flashcards";
import {
  countClozeCards,
  type TipTapNode,
} from "@/lib/domain/flashcards/cloze/extract";
import { AdaptiveFlashcardEditor } from "./AdaptiveFlashcardEditor";

interface FlashcardClozeQuickAddFormProps {
  sourceContentId: string | null;
  onCreated?: (cards: FlashcardDto[]) => void;
  onCancel?: () => void;
}

interface PrefillData {
  sourceTitle: string | null;
  category: string;
  subcategory: string;
}

const EMPTY_OPTIONS: FlashcardOptionsDto = {
  categories: ["General"],
  subcategoriesByCategory: {},
  frontLabels: ["Question"],
  backLabels: ["Answer"],
};

const MENU_SELECT_CLASS =
  "w-full rounded-md border border-black/15 dark:border-white/20 bg-white dark:bg-gray-900/95 px-3 py-2 text-base text-gray-900 dark:text-gray-100 shadow-sm outline-none transition-colors hover:bg-black/[0.05] dark:hover:bg-black/[0.05] dark:bg-white/10 focus:border-gold-primary md:text-sm";

export function FlashcardClozeQuickAddForm({
  sourceContentId,
  onCreated,
  onCancel,
}: FlashcardClozeQuickAddFormProps) {
  const [options, setOptions] = useState<FlashcardOptionsDto>(EMPTY_OPTIONS);
  const [category, setCategory] = useState("General");
  const [subcategory, setSubcategory] = useState("");
  const [sourceContent, setSourceContent] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [saving, setSaving] = useState(false);

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
        setCategory(data.category || "General");
        setSubcategory(data.subcategory || "");
      })
      .catch(() => {
        // Silent — fall back to defaults
      });
    return () => {
      cancelled = true;
    };
  }, [sourceContentId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/flashcards/options", { credentials: "include" })
      .then((response) => response.json())
      .then((result) => {
        if (!cancelled && result?.success) {
          setOptions(result.data as FlashcardOptionsDto);
        }
      })
      .catch(() => {
        if (!cancelled) setOptions(EMPTY_OPTIONS);
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

  const subcategoryOptions = useMemo(
    () => options.subcategoriesByCategory[category] ?? [],
    [options.subcategoriesByCategory, category],
  );

  const canSave = cardsToCreate > 0 && !saving;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const response = await fetch("/api/flashcards/cloze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category,
          subcategory,
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
      onCreated?.(result.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create cloze cards");
    } finally {
      setSaving(false);
    }
  }, [canSave, category, subcategory, sourceContent, sourceContentId, onCreated]);

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

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
            Skill
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setSubcategory("");
              }}
              className={MENU_SELECT_CLASS}
            >
              {options.categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
            Skill Category
            <select
              value={subcategory}
              onChange={(event) => setSubcategory(event.target.value)}
              className={MENU_SELECT_CLASS}
            >
              <option value="">No skill category</option>
              {subcategoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
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

      <div className="mt-3 flex shrink-0 items-center justify-end gap-2 border-t border-white/10 pt-3">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/15 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
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
