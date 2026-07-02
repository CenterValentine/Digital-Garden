"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { ArrowUpDown, Type } from "lucide-react";
import { toast } from "sonner";
import {
  EMPTY_TIPTAP_DOC,
  createTextTiptapDoc,
  extractPlainTextFromTiptap,
} from "@/lib/domain/flashcards";
import type {
  FlashcardDeckRecordDto,
  FlashcardDto,
  FlashcardOptionsDto,
} from "@/lib/domain/flashcards";
import { AdaptiveFlashcardEditor } from "./AdaptiveFlashcardEditor";

interface FlashcardQuickAddFormProps {
  sourceContentId: string | null;
  /** Pre-seed the skill path (e.g. from the selected tree node). */
  initialDeckPath?: string | null;
  onCreated?: (card: FlashcardDto) => void;
  onCancel?: () => void;
  mobileSheet?: boolean;
}

interface PrefillData {
  sourceTitle: string | null;
  category: string;
  subcategory: string;
  deckPath: string;
  frontLabel: string;
  backLabel: string;
}

const EMPTY_OPTIONS: FlashcardOptionsDto = {
  categories: ["General"],
  subcategoriesByCategory: {},
  frontLabels: ["Question"],
  backLabels: ["Answer"],
};

const MENU_INPUT_CLASS =
  "w-full rounded-md border border-black/15 dark:border-white/20 bg-black/[0.05] dark:bg-white/10 px-3 py-2 text-base text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-500 focus:border-gold-primary md:text-sm";

function addUniqueSorted(values: string[], value: string) {
  const normalized = value.trim();
  if (!normalized) return values;
  return Array.from(new Set([...values, normalized])).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function FlashcardQuickAddForm({
  sourceContentId,
  initialDeckPath,
  onCreated,
  onCancel,
  mobileSheet = false,
}: FlashcardQuickAddFormProps) {
  const idPrefix = useId();
  const [options, setOptions] = useState<FlashcardOptionsDto>(EMPTY_OPTIONS);
  const [deckPaths, setDeckPaths] = useState<string[]>([]);
  const [frontLabel, setFrontLabel] = useState("Question");
  const [backLabel, setBackLabel] = useState("Answer");
  // Single skill/subskill/subskill path — replaces the old two-select
  // Skill / Skill Category affordance. Resolved-or-created server-side.
  const [deckPath, setDeckPath] = useState("");
  const [sourceTitle, setSourceTitle] = useState<string | null>(null);
  const [isFrontRichText, setIsFrontRichText] = useState(false);
  const [frontContent, setFrontContent] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [backContent, setBackContent] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [saving, setSaving] = useState(false);
  const frontLabelRef = useRef<HTMLInputElement>(null);
  const frontLabelListId = `${idPrefix}-flashcard-front-labels`;
  const backLabelListId = `${idPrefix}-flashcard-back-labels`;
  const deckPathListId = `${idPrefix}-flashcard-deck-paths`;

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
        setSourceTitle(data.sourceTitle);
        setFrontLabel(data.frontLabel || "Question");
        setBackLabel(data.backLabel || "Answer");
        // An explicit pre-seed (selected tree node) wins over the
        // server's "last used" default.
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

  // Existing deck paths drive the path-input autocomplete.
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

  const frontText = useMemo(
    () => extractPlainTextFromTiptap(frontContent),
    [frontContent],
  );

  const resetContent = useCallback(() => {
    setFrontContent(EMPTY_TIPTAP_DOC);
    setBackContent(EMPTY_TIPTAP_DOC);
    if (!mobileSheet) {
      window.setTimeout(() => frontLabelRef.current?.focus(), 40);
    }
  }, [mobileSheet]);

  // Swap front ↔ back. The back editor is always rich, so the new front
  // inherits rich mode; labels swap alongside the content. Lets the user
  // flip recall direction without retyping (#67).
  const swapSides = useCallback(() => {
    setFrontContent(backContent);
    setBackContent(frontContent);
    setFrontLabel(backLabel);
    setBackLabel(frontLabel);
    setIsFrontRichText(true);
  }, [backContent, frontContent, backLabel, frontLabel]);

  const save = useCallback(
    async (createAnother: boolean) => {
      if (saving) return;
      if (!frontText && !isFrontRichText) {
        toast.error("Add a front side first.");
        return;
      }
      if (!deckPath.trim()) {
        toast.error("Enter a skill path, e.g. spanish/verbs.");
        return;
      }

      setSaving(true);
      try {
        const response = await fetch("/api/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sourceContentId,
            frontLabel,
            backLabel,
            deckPath: deckPath.trim(),
            isFrontRichText,
            frontText,
            frontContent,
            backContent,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result?.success) {
          throw new Error(result?.error?.message || "Failed to create flashcard");
        }

        toast.success("Flashcard saved");
        const created = result.data as FlashcardDto;
        setOptions((current) => ({
          ...current,
          frontLabels: addUniqueSorted(current.frontLabels, created.frontLabel),
          backLabels: addUniqueSorted(current.backLabels, created.backLabel),
        }));
        setDeckPaths((current) => addUniqueSorted(current, deckPath.trim()));
        onCreated?.(created);
        if (createAnother) {
          resetContent();
        } else {
          onCancel?.();
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save flashcard");
      } finally {
        setSaving(false);
      }
    },
    [
      backContent,
      backLabel,
      deckPath,
      frontContent,
      frontLabel,
      frontText,
      isFrontRichText,
      onCancel,
      onCreated,
      resetContent,
      saving,
      sourceContentId,
    ],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void save(true);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" onKeyDown={handleKeyDown}>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        {sourceTitle ? (
          <div className="mb-3 rounded-md border border-gold-primary/25 bg-gold-primary/10 px-3 py-2 text-xs text-gold-primary">
            Snapped to {sourceTitle}
          </div>
        ) : null}

        <label className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
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
          <span className="block text-[11px] text-gray-500 dark:text-gray-400">
            First segment is the skill; deeper segments are sub-skills.
            Missing levels are created for you.
          </span>
        </label>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
            Front Label
            <input
              ref={frontLabelRef}
              value={frontLabel}
              onChange={(event) => setFrontLabel(event.target.value)}
              list={frontLabelListId}
              className="w-full rounded-md border border-black/10 dark:border-white/20 bg-black/[0.03] dark:bg-white/[0.08] px-3 py-2 text-base text-gray-900 dark:text-white outline-none focus:border-gold-primary md:text-sm"
            />
            <datalist id={frontLabelListId}>
              {options.frontLabels.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
            Back Label
            <input
              value={backLabel}
              onChange={(event) => setBackLabel(event.target.value)}
              list={backLabelListId}
              className="w-full rounded-md border border-black/10 dark:border-white/20 bg-black/[0.03] dark:bg-white/[0.08] px-3 py-2 text-base text-gray-900 dark:text-white outline-none focus:border-gold-primary md:text-sm"
            />
            <datalist id={backLabelListId}>
              {options.backLabels.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-200">
              {frontLabel || "Question"}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={swapSides}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-black/15 dark:border-white/20 text-gray-700 dark:text-gray-300 transition-colors hover:bg-gold-primary/10 hover:text-gold-primary"
                title="Swap front and back"
                aria-label="Swap front and back"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFrontRichText((current) => !current);
                  if (isFrontRichText) {
                    setFrontContent(createTextTiptapDoc(frontText));
                  }
                }}
                className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                  isFrontRichText
                    ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
                    : "border-black/15 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-black/[0.05] dark:bg-white/10 hover:text-gold-primary"
                }`}
                title={isFrontRichText ? "Use simple text" : "Enable rich text"}
                aria-label={
                  isFrontRichText ? "Use simple text" : "Enable rich text"
                }
              >
                <Type className="h-4 w-4" />
              </button>
            </div>
          </div>
          <AdaptiveFlashcardEditor
            value={frontContent}
            onChange={setFrontContent}
            mode={isFrontRichText ? "rich" : "plain"}
            placeholder="Front of card..."
            ariaLabel="Flashcard front"
            compact
          />
        </div>

        <div className="mt-4 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-200">
            {backLabel || "Answer"}
          </span>
          <AdaptiveFlashcardEditor
            value={backContent}
            onChange={setBackContent}
            mode="rich"
            placeholder="Back of card..."
            ariaLabel="Flashcard back"
          />
        </div>
      </div>

      <div
        className={`flex shrink-0 gap-2 border-t border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#1a2530]/95 p-3 ${
          mobileSheet ? "pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : ""
        }`}
      >
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-md border border-black/10 dark:border-white/10 px-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-black/[0.05] dark:bg-white/10"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void save(false)}
          disabled={saving}
          className="min-h-11 flex-1 rounded-md border border-black/10 dark:border-white/10 px-3 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:bg-black/[0.05] dark:hover:bg-black/[0.05] dark:bg-white/10 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => void save(true)}
          disabled={saving}
          className="min-h-11 flex-1 rounded-md bg-gold-primary px-3 text-sm font-semibold text-black hover:bg-gold-light disabled:opacity-50"
        >
          Save + Next
        </button>
      </div>
    </div>
  );
}
