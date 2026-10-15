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

/**
 * Cost/usage receipt for the current read, surfaced by the mini-player's info
 * tooltip. Speech bills per INPUT CHARACTER, so this is computed before the
 * audio exists and is exact rather than an output-length guess.
 */
export interface TtsUsage {
  /** Characters in the whole read, across every chunk. */
  totalChars: number;
  /** Characters actually sent to the provider — cache hits excluded. */
  billedChars: number;
  /** USD estimate for `billedChars`, or null when the model has no list price. */
  estimatedCost: number | null;
  /** Caveat on the estimate (free tier, credit-based provider, unknown model). */
  costNote?: string;
  /** Resolved route, as reported by the synthesis response headers. */
  providerId: string | null;
  modelId: string | null;
  /** Chunks served from the session cache (free) out of `chunkCount`. */
  cachedChunks: number;
  chunkCount: number;
}

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
  /**
   * Fraction of the WHOLE read completed, 0–1. Engine-independent: derived from
   * elapsed time across chunks on cloud, and from spoken character offset on
   * Web Speech. This is what the mini-player's progress bar binds to, so the
   * fallback engine gets a real playbar instead of a blank strip.
   */
  progress: number;
  /** Speaking-rate multiplier (persists across plays within a session). */
  rate: number;
  /** Whether the active engine supports scrubbing. Now true for BOTH engines. */
  canSeek: boolean;
  /** Hard failure — nothing is playing. Distinct from `degradedReason`. */
  error: string | null;
  /**
   * Why the cloud voice isn't being used, while the fallback plays anyway.
   *
   * The whole point of GitHub #65: degrading silently left the user unable to
   * tell an expired key from a network blip from a too-long note. This holds
   * the discarded cloud error so the mini-player can explain the amber
   * indicator instead of implying "you're offline".
   *
   * Non-null + status "playing" = degraded-but-working. `error` stays null.
   */
  degradedReason: string | null;
  /** Cost receipt for the current read (cloud only; null on Web Speech). */
  usage: TtsUsage | null;
}

const INITIAL: TtsState = {
  status: "idle",
  engine: null,
  sourceLabel: null,
  lastSourceLabel: null,
  currentTime: 0,
  duration: 0,
  progress: 0,
  rate: 1,
  canSeek: false,
  error: null,
  degradedReason: null,
  usage: null,
};

export const useTtsStore = create<TtsState>(() => ({ ...INITIAL }));

/** Convenience selector — true while loading or actively speaking. */
export function selectIsActive(s: TtsState): boolean {
  return s.status === "loading" || s.status === "playing" || s.status === "paused";
}
