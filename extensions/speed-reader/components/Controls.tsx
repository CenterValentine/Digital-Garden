"use client";

import {
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  RotateCcw,
  Type,
  X,
} from "lucide-react";
import { useRef, type ChangeEvent, type PointerEvent } from "react";
import {
  SPEED_READER_WPM_RANGE,
  useSpeedReaderStore,
  type SpeedReaderFont,
  type SpeedReaderTheme,
} from "../state/speed-reader-store";
import { FONT_LABELS, type ResolvedTheme } from "../lib/theme";

interface ControlsProps {
  playing: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onClose: () => void;
  onSeek: (position: number) => void;
  onPdfCompatToggle: () => void;
  pdfCompatMode: boolean;
  position: number;
  total: number;
  theme: ResolvedTheme;
}

function BehaviorToggle({
  label,
  title,
  active,
  onToggle,
  theme,
}: {
  label: string;
  title: string;
  active: boolean;
  onToggle: () => void;
  theme: ResolvedTheme;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onToggle}
      className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
      style={
        active
          ? {
              background: theme.controlAccent,
              color: "#fff",
              border: `1px solid ${theme.controlAccent}`,
            }
          : {
              background: theme.controlBg,
              color: theme.textMuted,
              border: `1px solid ${theme.controlBorder}`,
            }
      }
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

const FONT_OPTIONS: SpeedReaderFont[] = [
  "atkinson",
  "lexend",
  "open-dyslexic",
  "system",
];

const THEME_OPTIONS: Array<{ value: SpeedReaderTheme; label: string }> = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "sepia", label: "Sepia" },
  { value: "oled", label: "OLED" },
];

export function Controls({
  playing,
  onTogglePlay,
  onRestart,
  onStepBack,
  onStepForward,
  onClose,
  onSeek,
  onPdfCompatToggle,
  pdfCompatMode,
  position,
  total,
  theme,
}: ControlsProps) {
  const wpm = useSpeedReaderStore((s) => s.wpm);
  const setWpm = useSpeedReaderStore((s) => s.setWpm);
  const font = useSpeedReaderStore((s) => s.font);
  const setFont = useSpeedReaderStore((s) => s.setFont);
  const fontSizeRem = useSpeedReaderStore((s) => s.fontSizeRem);
  const setFontSizeRem = useSpeedReaderStore((s) => s.setFontSizeRem);
  const themePref = useSpeedReaderStore((s) => s.theme);
  const setTheme = useSpeedReaderStore((s) => s.setTheme);
  const orpColor = useSpeedReaderStore((s) => s.orpColor);
  const setOrpColor = useSpeedReaderStore((s) => s.setOrpColor);
  const polish = useSpeedReaderStore((s) => s.polish);
  const togglePolish = useSpeedReaderStore((s) => s.togglePolish);

  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressPct = total > 0 ? Math.round((position / total) * 100) : 0;

  // --- Scrubable progress bar ---
  // setPointerCapture keeps pointer events firing on the bar element even
  // when the pointer leaves it, giving drag-anywhere scrub behavior.
  function seekFromPointerEvent(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.round(pct * total));
  }

  function handleProgressPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromPointerEvent(e);
  }

  function handleProgressPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.buttons === 0) return;
    seekFromPointerEvent(e);
  }

  const buttonStyle = {
    background: theme.controlBg,
    border: `1px solid ${theme.controlBorder}`,
    color: theme.textPrimary,
  } as const;

  return (
    <div
      className="flex w-full flex-col gap-3 px-4 py-3"
      style={{
        background: theme.surface,
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderTop: `1px solid ${theme.controlBorder}`,
      }}
    >
      {/* Scrubable progress bar with thumb handle */}
      <div
        ref={progressBarRef}
        role="slider"
        aria-label="Reading progress"
        aria-valuenow={position}
        aria-valuemin={0}
        aria-valuemax={total}
        className="group relative flex h-5 w-full cursor-pointer items-center"
        onPointerDown={handleProgressPointerDown}
        onPointerMove={handleProgressPointerMove}
      >
        {/* Track */}
        <div
          className="relative h-1.5 w-full rounded-full transition-[height] duration-150 group-hover:h-2"
          style={{ background: theme.controlBg }}
        >
          {/* Fill */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progressPct}%`,
              background: theme.controlAccent,
              opacity: 0.85,
            }}
          />
        </div>
        {/* Thumb handle dot */}
        <div
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm transition-transform duration-100 group-hover:scale-125"
          style={{
            left: `${progressPct}%`,
            width: "12px",
            height: "12px",
            background: theme.controlAccent,
            border: `2px solid ${theme.background}`,
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        {/* Position counter */}
        <div
          className="min-w-[5rem] text-xs tabular-nums"
          style={{ color: theme.textMuted }}
        >
          {position} / {total}
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="flex h-10 w-10 items-center justify-center rounded-md"
            style={buttonStyle}
            aria-label="Restart"
            title="Restart (R)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onStepBack}
            className="flex h-10 w-10 items-center justify-center rounded-md"
            style={buttonStyle}
            aria-label="Step back"
            title="Step back (J)"
          >
            <ChevronsLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              background: theme.controlAccent,
              color: "#fff",
              border: `1px solid ${theme.controlBorder}`,
            }}
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause (Space)" : "Play (Space)"}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={onStepForward}
            className="flex h-10 w-10 items-center justify-center rounded-md"
            style={buttonStyle}
            aria-label="Step forward"
            title="Step forward (K)"
          >
            <ChevronsRight className="h-5 w-5" />
          </button>
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-md"
          style={buttonStyle}
          aria-label="Close speed reader"
          title="Close (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Customization row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* WPM */}
        <label className="flex flex-1 items-center gap-2" style={{ minWidth: "220px" }}>
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: theme.textMuted, minWidth: "4.5rem" }}
          >
            {wpm} WPM
          </span>
          <input
            type="range"
            min={SPEED_READER_WPM_RANGE.min}
            max={SPEED_READER_WPM_RANGE.max}
            step={25}
            value={wpm}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setWpm(Number(e.target.value))
            }
            className="flex-1"
            style={{ accentColor: theme.controlAccent }}
            aria-label="Words per minute"
          />
        </label>

        {/* Font size */}
        <label className="flex items-center gap-2" style={{ minWidth: "160px" }}>
          <Type className="h-4 w-4" style={{ color: theme.textMuted }} />
          <input
            type="range"
            min={2}
            max={7}
            step={0.5}
            value={fontSizeRem}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFontSizeRem(Number(e.target.value))
            }
            className="w-24"
            style={{ accentColor: theme.controlAccent }}
            aria-label="Font size"
          />
        </label>

        {/* Font selector */}
        <select
          value={font}
          onChange={(e) => setFont(e.target.value as SpeedReaderFont)}
          className="h-9 rounded-md px-2 text-sm"
          style={buttonStyle}
          aria-label="Reading font"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {FONT_LABELS[f]}
            </option>
          ))}
        </select>

        {/* Theme selector */}
        <select
          value={themePref}
          onChange={(e) => setTheme(e.target.value as SpeedReaderTheme)}
          className="h-9 rounded-md px-2 text-sm"
          style={buttonStyle}
          aria-label="Reader theme"
        >
          {THEME_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {/* Anchor (ORP) color toggle */}
        <div className="flex items-center gap-1 rounded-full p-0.5" style={{ background: theme.controlBg, border: `1px solid ${theme.controlBorder}` }}>
          <button
            type="button"
            onClick={() => setOrpColor("red")}
            className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={
              orpColor === "red"
                ? { background: "#dc2626", color: "#fff" }
                : { background: "transparent", color: theme.textMuted }
            }
            aria-pressed={orpColor === "red"}
            title="Red anchor highlight"
          >
            Red
          </button>
          <button
            type="button"
            onClick={() => setOrpColor("blue")}
            className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={
              orpColor === "blue"
                ? { background: "#2563EB", color: "#fff" }
                : { background: "transparent", color: theme.textMuted }
            }
            aria-pressed={orpColor === "blue"}
            title="Blue anchor highlight"
          >
            Blue
          </button>
        </div>
      </div>

      {/* Behaviour toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <BehaviorToggle
          label="Crescendo"
          title="Ramp up from 50% → 100% WPM over 3 s after play or resume"
          active={polish.crescendoResume}
          onToggle={() => togglePolish("crescendoResume")}
          theme={theme}
        />
        <BehaviorToggle
          label="Sentence pause"
          title="Hold ~0.9 s after each sentence before continuing"
          active={polish.pauseAtSentenceEnd}
          onToggle={() => togglePolish("pauseAtSentenceEnd")}
          theme={theme}
        />
        <BehaviorToggle
          label="Auto-start"
          title="Begin reading automatically 1 s after content loads"
          active={polish.autoStart}
          onToggle={() => togglePolish("autoStart")}
          theme={theme}
        />
        <BehaviorToggle
          label="PDF compat"
          title="Normalize PDF whitespace fragmentation — collapses split words and removes soft hyphens"
          active={pdfCompatMode}
          onToggle={onPdfCompatToggle}
          theme={theme}
        />
      </div>
    </div>
  );
}
