"use client";

import {
  formatDurationShort,
  getTimeSavedMs,
  useSpeedReaderMetricsStore,
} from "../state/metrics-store";
import { type ResolvedTheme } from "../lib/theme";

interface SessionSummaryProps {
  wordsRead: number;
  durationMs: number;
  avgWpm: number;
  theme: ResolvedTheme;
  onRestart: () => void;
  onClose: () => void;
}

export function SessionSummary({
  wordsRead,
  durationMs,
  avgWpm,
  theme,
  onRestart,
  onClose,
}: SessionSummaryProps) {
  const totalWordsRead = useSpeedReaderMetricsStore((s) => s.totalWordsRead);
  const totalSessions = useSpeedReaderMetricsStore((s) => s.totalSessions);
  const totalReadingMs = useSpeedReaderMetricsStore((s) => s.totalReadingMs);
  const bestWpm = useSpeedReaderMetricsStore((s) => s.bestWpm);
  const timeSaved = getTimeSavedMs(totalWordsRead, totalReadingMs);

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-6 px-6"
      style={{ color: theme.textPrimary }}
    >
      <div className="text-center">
        <div
          className="mb-2 text-sm uppercase tracking-widest"
          style={{ color: theme.textMuted }}
        >
          Session complete
        </div>
        <div
          className="text-4xl font-semibold tabular-nums"
          style={{ color: theme.orpAccent }}
        >
          {wordsRead.toLocaleString()} words
        </div>
        <div className="mt-1 text-sm" style={{ color: theme.textMuted }}>
          {formatDurationShort(durationMs)} at {avgWpm} WPM avg
        </div>
      </div>

      <div
        className="grid w-full max-w-md grid-cols-2 gap-4 rounded-lg p-4"
        style={{
          background: theme.controlBg,
          border: `1px solid ${theme.controlBorder}`,
        }}
      >
        <Stat
          label="Lifetime sessions"
          value={totalSessions.toLocaleString()}
          theme={theme}
        />
        <Stat
          label="Lifetime words"
          value={totalWordsRead.toLocaleString()}
          theme={theme}
        />
        <Stat
          label="Best WPM"
          value={bestWpm > 0 ? bestWpm.toString() : "—"}
          theme={theme}
        />
        <Stat
          label="Time saved"
          value={formatDurationShort(timeSaved)}
          hint="vs. 250 WPM avg"
          theme={theme}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{
            background: theme.controlBg,
            border: `1px solid ${theme.controlBorder}`,
            color: theme.textPrimary,
          }}
        >
          Read again
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: theme.orpAccent }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  theme: ResolvedTheme;
}

function Stat({ label, value, hint, theme }: StatProps) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider" style={{ color: theme.textMuted }}>
        {label}
      </div>
      <div
        className="mt-1 text-xl font-semibold tabular-nums"
        style={{ color: theme.textPrimary }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[10px] uppercase tracking-wider" style={{ color: theme.textMuted, opacity: 0.6 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
