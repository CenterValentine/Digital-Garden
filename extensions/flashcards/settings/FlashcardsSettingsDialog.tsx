"use client";

import { useState } from "react";
import { Layers, Save } from "lucide-react";
import { toast } from "sonner";
import type { FlashcardSettingsReviewMode } from "@/lib/domain/flashcards";
import { useSettingsStore } from "@/state/settings-store";

const PLAY_ORDER_MODES: Array<{ value: FlashcardSettingsReviewMode; label: string }> = [
  { value: "front_to_back", label: "Front to Back" },
  { value: "back_to_front", label: "Back to Front" },
  { value: "random", label: "Random" },
];

// Same key used by the panel — writes here are picked up when the panel
// re-reads on dialog close.
const PANEL_SETTINGS_KEY = "flashcards:panel-review-settings";

function readPanelPlayOrder(): FlashcardSettingsReviewMode {
  if (typeof window === "undefined") return "front_to_back";
  try {
    const raw = window.localStorage.getItem(PANEL_SETTINGS_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as Partial<{ reviewMode: string }>)
      : null;
    return (parsed?.reviewMode as FlashcardSettingsReviewMode) ?? "front_to_back";
  } catch {
    return "front_to_back";
  }
}

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
  // Single path replaces the legacy two-field representation.
  const [defaultDeckPath, setDefaultDeckPath] = useState(
    flashcards?.lastUsedDeckPath ??
      (flashcards?.lastUsedCategory
        ? [flashcards.lastUsedCategory, flashcards.lastUsedSubcategory]
            .filter(Boolean)
            .join("/")
        : "")
  );
  const [playOrder, setPlayOrder] = useState<FlashcardSettingsReviewMode>(
    readPanelPlayOrder
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      // Write play order into the panel's localStorage key so the panel
      // picks it up when it re-reads after this dialog closes.
      try {
        const existing = JSON.parse(
          window.localStorage.getItem(PANEL_SETTINGS_KEY) ?? "{}",
        ) as Record<string, unknown>;
        window.localStorage.setItem(
          PANEL_SETTINGS_KEY,
          JSON.stringify({ ...existing, reviewMode: playOrder }),
        );
      } catch {
        /* storage unavailable — non-fatal */
      }
      await setFlashcardSettings({
        defaultFrontLabel,
        defaultBackLabel,
        lastUsedDeckPath: defaultDeckPath || undefined,
        defaultReviewMode: playOrder,
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
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900 dark:text-white">
          Flashcards
        </h2>
        <p className="mt-3 max-w-3xl text-base text-gray-600 dark:text-gray-400">
          Set defaults for quick card creation and review flow.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          Default Front Label
          <input
            value={defaultFrontLabel}
            onChange={(event) => setDefaultFrontLabel(event.target.value)}
            className="w-full rounded-md border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-gold-primary"
          />
        </label>
        <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          Default Back Label
          <input
            value={defaultBackLabel}
            onChange={(event) => setDefaultBackLabel(event.target.value)}
            className="w-full rounded-md border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-gold-primary"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-2 text-sm text-gray-700 dark:text-gray-300">
          Play Order
          <select
            value={playOrder}
            onChange={(event) =>
              setPlayOrder(event.target.value as FlashcardSettingsReviewMode)
            }
            className="w-full rounded-md border border-black/15 dark:border-white/20 bg-white dark:bg-gray-900/95 px-3 py-2 text-gray-900 dark:text-gray-100 shadow-sm outline-none transition-colors hover:bg-black/[0.05] dark:hover:bg-white/10 focus:border-gold-primary focus:bg-gray-50 dark:focus:bg-gray-900"
          >
            {PLAY_ORDER_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2 text-sm text-gray-700 dark:text-gray-300">
          Default Skill Path
          <input
            value={defaultDeckPath}
            onChange={(event) => setDefaultDeckPath(event.target.value)}
            placeholder="e.g. latin/grammar"
            className="w-full rounded-md border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/5 px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-gold-primary"
          />
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Pre-fills the skill path when adding a card.{" "}
            <code className="rounded bg-black/[0.05] dark:bg-white/10 px-1">
              skill/subskill
            </code>{" "}
            format.
          </span>
        </label>
      </div>

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
