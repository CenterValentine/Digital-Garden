"use client";

import { useEffect } from "react";
import { Zap } from "lucide-react";
import {
  SPEED_READER_WPM_RANGE,
  useSpeedReaderStore,
  type SpeedReaderFont,
  type SpeedReaderPolishToggles,
  type SpeedReaderTheme,
  type SpeedReaderOrpColor,
} from "../state/speed-reader-store";
import { FONT_LABELS, FONT_STACKS, ensureReaderFontsLoaded } from "../lib/theme";
import {
  formatDurationShort,
  getTimeSavedMs,
  useSpeedReaderMetricsStore,
} from "../state/metrics-store";

const POLISH_OPTIONS: Array<{
  key: keyof SpeedReaderPolishToggles;
  label: string;
  description: string;
}> = [
  {
    key: "orpHighlight",
    label: "ORP Highlight",
    description:
      "Color one letter at each word's optical center. Eyes stop refocusing — the core RSVP technique.",
  },
  {
    key: "punctuationPauses",
    label: "Punctuation Pauses",
    description:
      "Hold longer on sentence endings (1.5×), commas (1.2×), and paragraph breaks (2×). Mimics natural reading rhythm.",
  },
  {
    key: "lengthBasedTiming",
    label: "Length-based Timing",
    description:
      "Words over 8 characters get up to +60% time. Reduces miss rate at high WPM.",
  },
  {
    key: "bionicReading",
    label: "Fixation Cue (bold first half)",
    description:
      "Bolds the first ~45% of each word as a brain-anchor. Disables ORP highlight when active.",
  },
  {
    key: "crescendoResume",
    label: "Crescendo on play / resume",
    description:
      "Starts at 50% of your target WPM and smoothly ramps up to full speed over 3 seconds. Helps you ease in without jumping straight to top speed.",
  },
  {
    key: "pauseAtSentenceEnd",
    label: "Sentence-end pause",
    description:
      "Adds a ~0.9 s hard stop after each sentence-ending word before the next sentence begins. Gives your brain a beat to absorb what it just read.",
  },
  {
    key: "autoStart",
    label: "Auto-start (1 s delay)",
    description:
      "Begins playback automatically 1 second after content finishes loading, so you can keep your hands off the keyboard from the start.",
  },
];

const FONT_OPTIONS: Array<{
  value: SpeedReaderFont;
  description: string;
}> = [
  {
    value: "atkinson",
    description:
      "Designed by the Braille Institute. Wider letterforms and distinctive character shapes minimize confusion between similar glyphs — ideal for sustained reading sessions.",
  },
  {
    value: "lexend",
    description:
      "Developed to reduce visual stress. Optimized letterforms improve word-shape recognition and fluency, particularly helpful for reading at speed.",
  },
  {
    value: "open-dyslexic",
    description:
      "Weighted bottoms anchor letter orientation and reduce the letter-swapping effect. Widely chosen by readers with dyslexia.",
  },
  {
    value: "system",
    description:
      "Your device's default UI font. Familiar, fast to render, and consistent with the rest of the app.",
  },
];

const THEME_OPTIONS: Array<{ value: SpeedReaderTheme; label: string }> = [
  { value: "system", label: "Auto (match system)" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sepia", label: "Sepia" },
  { value: "oled", label: "True Black (OLED)" },
];

export default function SpeedReaderSettingsDialog() {
  const wpm = useSpeedReaderStore((s) => s.wpm);
  const setWpm = useSpeedReaderStore((s) => s.setWpm);
  const font = useSpeedReaderStore((s) => s.font);
  const setFont = useSpeedReaderStore((s) => s.setFont);
  const fontSizeRem = useSpeedReaderStore((s) => s.fontSizeRem);
  const setFontSizeRem = useSpeedReaderStore((s) => s.setFontSizeRem);
  const themePref = useSpeedReaderStore((s) => s.theme);
  const setTheme = useSpeedReaderStore((s) => s.setTheme);
  const polish = useSpeedReaderStore((s) => s.polish);
  const togglePolish = useSpeedReaderStore((s) => s.togglePolish);
  const orpColor = useSpeedReaderStore((s) => s.orpColor);
  const setOrpColor = useSpeedReaderStore((s) => s.setOrpColor);
  const pdfCompatMode = useSpeedReaderStore((s) => s.pdfCompatMode);
  const setPdfCompatMode = useSpeedReaderStore((s) => s.setPdfCompatMode);

  // Fonts are lazy-loaded on first reader open; load them eagerly here so the
  // card previews actually render in the correct typeface.
  useEffect(() => {
    ensureReaderFontsLoaded();
  }, []);

  const totalWordsRead = useSpeedReaderMetricsStore((s) => s.totalWordsRead);
  const totalSessions = useSpeedReaderMetricsStore((s) => s.totalSessions);
  const totalReadingMs = useSpeedReaderMetricsStore((s) => s.totalReadingMs);
  const bestWpm = useSpeedReaderMetricsStore((s) => s.bestWpm);
  const resetMetrics = useSpeedReaderMetricsStore((s) => s.reset);
  const timeSaved = getTimeSavedMs(totalWordsRead, totalReadingMs);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 text-gold-primary">
          <Zap className="h-6 w-6" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]">
            Built-in extension
          </span>
        </div>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900 dark:text-white">
          Speed Reader
        </h2>
        <p className="mt-3 max-w-3xl text-base text-gray-600 dark:text-gray-400">
          RSVP-style one-word-at-a-time reader. Configure default speed, font,
          theme, and which research-backed polish features to apply.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Reading polish
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Toggle each enhancement to calibrate the reader to your preference.
          You can override these per-session from the reader dialog too.
        </p>
        <div className="space-y-2">
          {POLISH_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className="flex items-start gap-3 rounded-md border border-black/10 bg-black/[0.02] p-3 transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <input
                type="checkbox"
                checked={polish[opt.key]}
                onChange={() => togglePolish(opt.key)}
                className="mt-1 h-4 w-4 accent-current"
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {opt.label}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {opt.description}
                </div>
              </div>
            </label>
          ))}
          {/* PDF compat lives at top-level store state, not in polish, but groups here visually */}
          <label className="flex items-start gap-3 rounded-md border border-black/10 bg-black/[0.02] p-3 transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
            <input
              type="checkbox"
              checked={pdfCompatMode}
              onChange={() => setPdfCompatMode(!pdfCompatMode)}
              className="mt-1 h-4 w-4 accent-current"
            />
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                PDF compat mode
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Post-process PDF-extracted text to collapse space-fragmented characters
                {' ("w o r d" → "word")'}, remove soft hyphens at line breaks, and normalize
                whitespace runs. Enabling this mid-session will re-parse the text and reset
                your reading position.
              </div>
            </div>
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Default WPM
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={SPEED_READER_WPM_RANGE.min}
            max={SPEED_READER_WPM_RANGE.max}
            step={25}
            value={wpm}
            onChange={(e) => setWpm(Number(e.target.value))}
            className="flex-1"
          />
          <div className="min-w-[5rem] text-right text-sm tabular-nums text-gray-900 dark:text-white">
            {wpm} WPM
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Normal adult prose averages ~250 WPM. Start near 300 and adjust up by
          25–50 each session as comprehension stays high.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Font
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FONT_OPTIONS.map((opt) => {
              const selected = font === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFont(opt.value)}
                  className={[
                    "flex flex-col gap-1 rounded-md border p-3 text-left transition-colors",
                    selected
                      ? "border-gold-primary bg-gold-primary/10 dark:bg-gold-primary/15"
                      : "border-black/10 bg-black/[0.02] hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
                  ].join(" ")}
                >
                  <span
                    className="text-base leading-snug text-gray-900 dark:text-white"
                    style={{ fontFamily: FONT_STACKS[opt.value] }}
                  >
                    {FONT_LABELS[opt.value]}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          Theme override
          <select
            value={themePref}
            onChange={(e) => setTheme(e.target.value as SpeedReaderTheme)}
            className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-gray-900 outline-none focus:border-gold-primary dark:border-white/20 dark:bg-gray-900/95 dark:text-gray-100"
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
          Font size ({fontSizeRem.toFixed(1)} rem)
          <input
            type="range"
            min={2}
            max={7}
            step={0.5}
            value={fontSizeRem}
            onChange={(e) => setFontSizeRem(Number(e.target.value))}
            className="w-full"
          />
        </label>

        {/* Anchor (ORP) highlight color */}
        <div className="space-y-2 md:col-span-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Anchor highlight color
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            The letter highlighted at the optical recognition point (ORP) of each word.
          </p>
          <div className="flex gap-2">
            {(["red", "blue"] as SpeedReaderOrpColor[]).map((color) => {
              const hex = color === "red" ? "#dc2626" : "#2563EB";
              const label = color === "red" ? "Red" : "Blue";
              const selected = orpColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setOrpColor(color)}
                  className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
                  style={
                    selected
                      ? { background: hex, color: "#fff", borderColor: hex }
                      : { borderColor: "rgba(0,0,0,0.12)", color: "#374151" }
                  }
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: hex }}
                  />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Reading metrics
          </h3>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Reset all speed reader metrics? This cannot be undone."
                )
              ) {
                resetMetrics();
              }
            }}
            className="text-xs text-red-500 underline-offset-2 hover:underline"
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Sessions" value={totalSessions.toLocaleString()} />
          <Metric
            label="Words read"
            value={totalWordsRead.toLocaleString()}
          />
          <Metric label="Best WPM" value={bestWpm > 0 ? bestWpm.toString() : "—"} />
          <Metric
            label="Time saved"
            value={formatDurationShort(timeSaved)}
            hint="vs. 250 WPM"
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Metrics are stored locally in your browser only — no server records.
        </p>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-white">
        {value}
      </div>
      {hint && (
        <div className="text-[10px] uppercase tracking-wider text-gray-500/60 dark:text-gray-400/60">
          {hint}
        </div>
      )}
    </div>
  );
}
