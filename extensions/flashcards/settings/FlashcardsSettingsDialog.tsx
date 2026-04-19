"use client";

import { useState } from "react";
import { Layers, Save } from "lucide-react";
import { toast } from "sonner";
import type { FlashcardReviewMode } from "@/lib/domain/flashcards";
import { useSettingsStore } from "@/state/settings-store";

const REVIEW_MODES: Array<{ value: FlashcardReviewMode; label: string }> = [
  { value: "front_to_back", label: "Front to Back" },
  { value: "back_to_front", label: "Back to Front" },
  { value: "random", label: "Random" },
];
const MENU_SELECT_CLASS =
  "w-full rounded-md border border-white/20 bg-gray-900/95 px-3 py-2 text-gray-100 shadow-sm outline-none transition-colors hover:bg-white/10 focus:border-gold-primary focus:bg-gray-900";

export default function FlashcardsSettingsDialog() {
  const flashcards = useSettingsStore((state) => state.flashcards);
  const setFlashcardSettings = useSettingsStore(
    (state) => state.setFlashcardSettings
  );
  const [defaultFrontLabel, setDefaultFrontLabel] = useState(
    flashcards?.defaultFrontLabel ?? "Question"
  );
  const [defaultBackLabel, setDefaultBackLabel] = useState(
    flashcards?.defaultBackLabel ?? "Answer"
  );
  const [defaultReviewMode, setDefaultReviewMode] =
    useState<FlashcardReviewMode>(
      flashcards?.defaultReviewMode ?? "front_to_back"
    );
  const [lastUsedCategory, setLastUsedCategory] = useState(
    flashcards?.lastUsedCategory ?? "General"
  );
  const [lastUsedSubcategory, setLastUsedSubcategory] = useState(
    flashcards?.lastUsedSubcategory ?? ""
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setFlashcardSettings({
        defaultFrontLabel,
        defaultBackLabel,
        defaultReviewMode,
        lastUsedCategory,
        lastUsedSubcategory,
      });
      toast.success("Flashcard settings saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 text-gold-primary">
          <Layers className="h-6 w-6" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]">
            Built-in extension
          </span>
        </div>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">
          Flashcards
        </h2>
        <p className="mt-3 max-w-3xl text-base text-gray-400">
          Set defaults for quick card creation and review flow.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-gray-300">
          Default Front Label
          <input
            value={defaultFrontLabel}
            onChange={(event) => setDefaultFrontLabel(event.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-gold-primary"
          />
        </label>
        <label className="space-y-2 text-sm text-gray-300">
          Default Back Label
          <input
            value={defaultBackLabel}
            onChange={(event) => setDefaultBackLabel(event.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-gold-primary"
          />
        </label>
        <label className="space-y-2 text-sm text-gray-300">
          Last Used Skill
          <input
            value={lastUsedCategory}
            onChange={(event) => setLastUsedCategory(event.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-gold-primary"
          />
        </label>
        <label className="space-y-2 text-sm text-gray-300">
          Last Used Skill Category
          <input
            value={lastUsedSubcategory}
            onChange={(event) => setLastUsedSubcategory(event.target.value)}
            placeholder="Optional"
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-gold-primary"
          />
        </label>
      </div>

      <label className="block max-w-sm space-y-2 text-sm text-gray-300">
        Default Review Mode
        <select
          value={defaultReviewMode}
          onChange={(event) =>
            setDefaultReviewMode(event.target.value as FlashcardReviewMode)
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

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-gold-primary px-4 text-sm font-semibold text-black hover:bg-gold-light disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        Save Settings
      </button>
    </div>
  );
}
