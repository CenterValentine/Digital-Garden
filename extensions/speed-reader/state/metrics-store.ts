import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SpeedReaderSessionRecord {
  startedAt: number;
  durationMs: number;
  wordsRead: number;
  avgWpm: number;
  sourceTitle?: string;
}

interface MetricsState {
  totalWordsRead: number;
  totalSessions: number;
  totalReadingMs: number;
  bestWpm: number;
  recentSessions: SpeedReaderSessionRecord[];
  recordSession: (session: SpeedReaderSessionRecord) => void;
  reset: () => void;
}

const MAX_RECENT = 20;

export const useSpeedReaderMetricsStore = create<MetricsState>()(
  persist(
    (set) => ({
      totalWordsRead: 0,
      totalSessions: 0,
      totalReadingMs: 0,
      bestWpm: 0,
      recentSessions: [],
      recordSession: (session) =>
        set((state) => ({
          totalWordsRead: state.totalWordsRead + session.wordsRead,
          totalSessions: state.totalSessions + 1,
          totalReadingMs: state.totalReadingMs + session.durationMs,
          bestWpm: Math.max(state.bestWpm, session.avgWpm),
          recentSessions: [session, ...state.recentSessions].slice(0, MAX_RECENT),
        })),
      reset: () =>
        set({
          totalWordsRead: 0,
          totalSessions: 0,
          totalReadingMs: 0,
          bestWpm: 0,
          recentSessions: [],
        }),
    }),
    {
      name: "speed-reader:metrics",
      version: 1,
    }
  )
);

/**
 * Estimated time *saved* vs. a 250 WPM baseline reader.
 * (250 is the cited adult average for prose, per multiple eye-tracking studies.)
 */
export function getTimeSavedMs(totalWordsRead: number, totalReadingMs: number): number {
  const baselineMs = (totalWordsRead / 250) * 60_000;
  return Math.max(0, baselineMs - totalReadingMs);
}

export function formatDurationShort(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
