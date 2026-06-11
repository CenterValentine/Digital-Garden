/**
 * useTextToSpeech — thin React binding over the TTS singleton.
 *
 * Returns the reactive playback state (from `useTtsStore`) plus the stable
 * controller methods. Every surface (toolbar, bubble menu, mini-player) uses
 * this same hook, so they all drive and observe one shared playback.
 */

"use client";

import { useTtsStore, type TtsState } from "@/state/tts-store";
import { ttsController, type PlayOptions } from "./controller";

export interface UseTextToSpeech extends TtsState {
  /** Read text aloud (cloud-preferred, Web Speech fallback). */
  play: (text: string, options?: PlayOptions) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
  /** Replay the last read (idle mini-player). */
  replay: () => void;
  /** True while loading, playing, or paused. */
  isActive: boolean;
}

export function useTextToSpeech(): UseTextToSpeech {
  const state = useTtsStore();
  return {
    ...state,
    isActive:
      state.status === "loading" ||
      state.status === "playing" ||
      state.status === "paused",
    play: (text, options) => void ttsController.play(text, options),
    pause: () => ttsController.pause(),
    resume: () => ttsController.resume(),
    stop: () => ttsController.stop(),
    seek: (seconds) => ttsController.seek(seconds),
    setRate: (rate) => ttsController.setRate(rate),
    replay: () => ttsController.replayLast(),
  };
}
