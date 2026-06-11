/**
 * TTS playback store — "read aloud" (Audio subsystem).
 *
 * Reactive mirror of the imperative playback controller
 * (`lib/features/tts/controller.ts`). The controller pushes updates here via
 * `useTtsStore.setState(...)`; UI surfaces (toolbar button, bubble-menu item,
 * floating mini-player) subscribe. One global store = one playback at a time.
 *
 * Deliberately NOT persisted — playback is ephemeral session state.
 */

import { create } from "zustand";

export type TtsStatus = "idle" | "loading" | "playing" | "paused" | "error";

/** Which engine produced the current playback. */
export type TtsEngine = "cloud" | "webspeech";

export interface TtsState {
  status: TtsStatus;
  /** Engine backing the current/last playback (null when idle from cold). */
  engine: TtsEngine | null;
  /** Human label for the mini-player (e.g. "Reading note" or a snippet). */
  sourceLabel: string | null;
  /**
   * Label of the LAST read — unlike `sourceLabel` this survives `stop()`, so the
   * idle mini-player can offer a replay hint instead of vanishing entirely.
   */
  lastSourceLabel: string | null;
  /** Playback position in seconds (cloud only; 0 for Web Speech). */
  currentTime: number;
  /** Total duration in seconds (cloud only; 0 when unknown/Web Speech). */
  duration: number;
  /** Speaking-rate multiplier (persists across plays within a session). */
  rate: number;
  /** Whether the active engine supports scrubbing (cloud yes, Web Speech no). */
  canSeek: boolean;
  /** Last error message, surfaced by the mini-player. */
  error: string | null;
}

export const useTtsStore = create<TtsState>(() => ({
  status: "idle",
  engine: null,
  sourceLabel: null,
  lastSourceLabel: null,
  currentTime: 0,
  duration: 0,
  rate: 1,
  canSeek: false,
  error: null,
}));

/** Convenience selector — true while loading or actively speaking. */
export function selectIsActive(s: TtsState): boolean {
  return s.status === "loading" || s.status === "playing" || s.status === "paused";
}
