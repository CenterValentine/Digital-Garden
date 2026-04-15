/**
 * Timestamp Format Store
 *
 * Persists the user's default format preference for new inline timestamps.
 * Individual timestamp nodes carry their own format attr — this store only
 * determines what format is pre-selected when the slash command fires.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const FORMAT_PRESETS = [
  "MMMM D, YYYY",
  "MMM D, YYYY",
  "D MMMM YYYY",
  "MM/DD/YYYY",
  "DD/MM/YYYY",
  "YYYY-MM-DD",
] as const;

export type TimestampFormat = (typeof FORMAT_PRESETS)[number];

export type TimestampMode = "frozen" | "document-date" | "content-updated" | "custom" | "live";

interface TimestampFormatState {
  defaultFormat: TimestampFormat;
  defaultMode: TimestampMode;
  setDefaultFormat: (format: TimestampFormat) => void;
  setDefaultMode: (mode: TimestampMode) => void;
}

export const useTimestampFormatStore = create<TimestampFormatState>()(
  persist(
    (set) => ({
      defaultFormat: "MMMM D, YYYY",
      defaultMode: "frozen",
      setDefaultFormat: (defaultFormat) => set({ defaultFormat }),
      setDefaultMode: (defaultMode) => set({ defaultMode }),
    }),
    { name: "timestamp-format", version: 1 }
  )
);
