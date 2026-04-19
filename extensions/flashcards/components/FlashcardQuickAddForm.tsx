"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { Type } from "lucide-react";
import { toast } from "sonner";
import {
  EMPTY_TIPTAP_DOC,
  createTextTiptapDoc,
  extractPlainTextFromTiptap,
} from "@/lib/domain/flashcards";
import type { FlashcardDto, FlashcardOptionsDto } from "@/lib/domain/flashcards";
import { AdaptiveFlashcardEditor } from "./AdaptiveFlashcardEditor";

interface FlashcardQuickAddFormProps {
  sourceContentId: string | null;
  onCreated?: (card: FlashcardDto) => void;
  onCancel?: () => void;
  mobileSheet?: boolean;
}

interface PrefillData {
  sourceTitle: string | null;
  category: string;
  subcategory: string;
  frontLabel: string;
  backLabel: string;
}

const EMPTY_OPTIONS: FlashcardOptionsDto = {
  categories: ["General"],
  subcategoriesByCategory: {},
  frontLabels: ["Question"],
  backLabels: ["Answer"],
};

const NEW_SKILL_VALUE = "__new_flashcard_skill__";
const NEW_SKILL_CATEGORY_VALUE = "__new_flashcard_skill_category__";
const MENU_SELECT_CLASS =
  "w-full rounded-md border border-white/20 bg-gray-900/95 px-3 py-2 text-base text-gray-100 shadow-sm outline-none transition-colors hover:bg-white/10 focus:border-gold-primary focus:bg-gray-900 md:text-sm";
const MENU_INPUT_CLASS =
  "w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-base text-gray-100 outline-none placeholder:text-gray-500 focus:border-white/40 md:text-sm";

function addUniqueSorted(values: string[], value: string) {
  const normalized = value.trim();
  if (!normalized) return values;
  return Array.from(new Set([...values, normalized])).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function FlashcardQuickAddForm({
  sourceContentId,
  onCreated,
  onCancel,
  mobileSheet = false,
}: FlashcardQuickAddFormProps) {
  const idPrefix = useId();
  const [prefill, setPrefill] = useState<PrefillData | null>(null);
  const [options, setOptions] = useState<FlashcardOptionsDto>(EMPTY_OPTIONS);
  const [frontLabel, setFrontLabel] = useState("Question");
  const [backLabel, setBackLabel] = useState("Answer");
  const [category, setCategory] = useState("General");
  const [subcategory, setSubcategory] = useState("");
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [isCreatingSkillCategory, setIsCreatingSkillCategory] = useState(false);
  const [isFrontRichText, setIsFrontRichText] = useState(false);
  const [frontContent, setFrontContent] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [backContent, setBackContent] = useState<JSONContent>(EMPTY_TIPTAP_DOC);
  const [saving, setSaving] = useState(false);
  const frontLabelRef = useRef<HTMLInputElement>(null);
  const frontLabelListId = `${idPrefix}-flashcard-front-labels`;
  const backLabelListId = `${idPrefix}-flashcard-back-labels`;

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
        setPrefill(data);
        setFrontLabel(data.frontLabel || "Question");
        setBackLabel(data.backLabel || "Answer");
        setCategory(data.category || "General");
        setSubcategory(data.subcategory || "");
        setIsCreatingSkill(false);
        setIsCreatingSkillCategory(false);
      })
      .catch(() => {
        if (!cancelled) setPrefill(null);
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

  const frontText = useMemo(
    () => extractPlainTextFromTiptap(frontContent),
    [frontContent]
  );

  const skillOptions = useMemo(
    () => addUniqueSorted(options.categories, "General"),
    [options.categories]
  );

  const subcategoryOptions = useMemo(
    () => options.subcategoriesByCategory[category] ?? [],
    [category, options.subcategoriesByCategory]
  );

  const skillSelection = useMemo(
    () =>
      !isCreatingSkill && category && skillOptions.includes(category)
        ? category
        : NEW_SKILL_VALUE,
    [category, isCreatingSkill, skillOptions]
  );

  const skillCategorySelection = useMemo(
    () =>
      isCreatingSkillCategory
        ? NEW_SKILL_CATEGORY_VALUE
        : !subcategory
          ? ""
          : subcategoryOptions.includes(subcategory)
            ? subcategory
            : NEW_SKILL_CATEGORY_VALUE,
    [isCreatingSkillCategory, subcategory, subcategoryOptions]
  );

  const showSkillInput =
    isCreatingSkill || Boolean(category && !skillOptions.includes(category));
  const showSkillCategoryInput =
    isCreatingSkillCategory ||
    Boolean(subcategory && !subcategoryOptions.includes(subcategory));

  const resetContent = useCallback(() => {
    setFrontContent(EMPTY_TIPTAP_DOC);
    setBackContent(EMPTY_TIPTAP_DOC);
    if (!mobileSheet) {
      window.setTimeout(() => frontLabelRef.current?.focus(), 40);
    }
  }, [mobileSheet]);

  const save = useCallback(
    async (createAnother: boolean) => {
      if (saving) return;
      if (!frontText && !isFrontRichText) {
        toast.error("Add a front side first.");
        return;
      }
      if (!category.trim()) {
        toast.error("Choose or create a skill.");
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
            category,
            subcategory,
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
          categories: addUniqueSorted(current.categories, created.category),
          subcategoriesByCategory: {
            ...current.subcategoriesByCategory,
            [created.category]: addUniqueSorted(
              current.subcategoriesByCategory[created.category] ?? [],
              created.subcategory
            ),
          },
          frontLabels: addUniqueSorted(current.frontLabels, created.frontLabel),
          backLabels: addUniqueSorted(current.backLabels, created.backLabel),
        }));
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
      category,
      frontContent,
      frontLabel,
      frontText,
      isFrontRichText,
      onCancel,
      onCreated,
      resetContent,
      saving,
      sourceContentId,
      subcategory,
    ]
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
        {prefill?.sourceTitle ? (
          <div className="mb-3 rounded-md border border-gold-primary/25 bg-gold-primary/10 px-3 py-2 text-xs text-gold-primary">
            Snapped to {prefill.sourceTitle}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="space-y-1 text-xs text-gray-400">
            Skill
            <select
              value={skillSelection}
              onChange={(event) => {
                if (event.target.value === NEW_SKILL_VALUE) {
                  setIsCreatingSkill(true);
                  setIsCreatingSkillCategory(false);
                  setCategory("");
                  setSubcategory("");
                  return;
                }
                setIsCreatingSkill(false);
                setIsCreatingSkillCategory(false);
                setCategory(event.target.value);
                setSubcategory("");
              }}
              className={MENU_SELECT_CLASS}
            >
              {skillOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={NEW_SKILL_VALUE}>Create new skill...</option>
            </select>
            {showSkillInput ? (
              <input
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setSubcategory("");
                }}
                placeholder="New skill"
                className={MENU_INPUT_CLASS}
              />
            ) : null}
          </label>
          <label className="space-y-1 text-xs text-gray-400">
            Skill Category
            <select
              value={skillCategorySelection}
              onChange={(event) => {
                if (event.target.value === NEW_SKILL_CATEGORY_VALUE) {
                  setIsCreatingSkillCategory(true);
                  setSubcategory("");
                  return;
                }
                setIsCreatingSkillCategory(false);
                setSubcategory(event.target.value);
              }}
              className={MENU_SELECT_CLASS}
            >
              <option value="">No skill category</option>
              {subcategoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={NEW_SKILL_CATEGORY_VALUE}>
                Create new skill category...
              </option>
            </select>
            {showSkillCategoryInput ? (
              <input
                value={subcategory}
                onChange={(event) => setSubcategory(event.target.value)}
                placeholder="New skill category"
                className={MENU_INPUT_CLASS}
              />
            ) : null}
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="space-y-1 text-xs text-gray-400">
            Front Label
            <input
              ref={frontLabelRef}
              value={frontLabel}
              onChange={(event) => setFrontLabel(event.target.value)}
              list={frontLabelListId}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-base text-white outline-none focus:border-gold-primary md:text-sm"
            />
            <datalist id={frontLabelListId}>
              {options.frontLabels.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1 text-xs text-gray-400">
            Back Label
            <input
              value={backLabel}
              onChange={(event) => setBackLabel(event.target.value)}
              list={backLabelListId}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-base text-white outline-none focus:border-gold-primary md:text-sm"
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
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {frontLabel || "Question"}
            </span>
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
                  : "border-white/20 text-gray-300 hover:bg-white/10 hover:text-gold-primary"
              }`}
              title={isFrontRichText ? "Use simple text" : "Enable rich text"}
              aria-label={
                isFrontRichText ? "Use simple text" : "Enable rich text"
              }
            >
              <Type className="h-4 w-4" />
            </button>
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
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
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
        className={`flex shrink-0 gap-2 border-t border-white/10 bg-[#111318]/95 p-3 ${
          mobileSheet ? "pb-[calc(0.75rem+env(safe-area-inset-bottom))]" : ""
        }`}
      >
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-md border border-white/10 px-3 text-sm text-gray-300 hover:bg-white/10"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void save(false)}
          disabled={saving}
          className="min-h-11 flex-1 rounded-md border border-white/10 px-3 text-sm font-semibold text-gray-100 hover:bg-white/10 disabled:opacity-50"
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
