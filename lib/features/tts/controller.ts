/**
 * TTS playback controller — imperative singleton (Audio subsystem).
 *
 * Owns the browser's audio objects (`HTMLAudioElement` for cloud, the global
 * `speechSynthesis` for Web Speech) and mirrors playback state into
 * `useTtsStore`. Module-scope on purpose: one controller = one playback at a
 * time, shared by every surface (toolbar, bubble menu, mini-player).
 *
 * Plain module, NOT a hook/component — so the React Compiler's
 * ref-mutation/impurity rules don't apply, and `Audio`/`speechSynthesis` are
 * only ever touched here, inside methods called client-side.
 */

import { useTtsStore } from "@/state/tts-store";
import { SpeechSynthesisError, getSpeechBlob } from "./synthesize";
import {
  isWebSpeechAvailable,
  speakWithWebSpeech,
} from "./web-speech";

// ── Imperative singletons ─────────────────────────────────────
let audioEl: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let utterance: SpeechSynthesisUtterance | null = null;
let abortController: AbortController | null = null;

// Remembered so the mini-player can restart a Web Speech read at a new rate
// (Web Speech can't change rate mid-utterance).
let lastText = "";
let lastWebVoiceUri: string | undefined;
let lastCloudVoice: string | undefined;
let lastLabel: string | undefined;
let sessionRate = 1;

function set(patch: Partial<ReturnType<typeof useTtsStore.getState>>) {
  useTtsStore.setState(patch);
}

export interface PlayOptions {
  /** Label for the mini-player ("Reading note", a selection snippet, …). */
  label?: string;
  /** Cloud provider voice id (see speech catalog). */
  cloudVoice?: string;
  /** Web Speech voice URI (used only on the fallback engine). */
  webVoiceUri?: string;
  /** Override the session speaking rate for this play. */
  rate?: number;
}

export const ttsController = {
  /**
   * Read `text` aloud. Stops any current playback first. Resolves the engine
   * via {@link attemptPlayback} (cloud-preferred with Web Speech fallback).
   */
  async play(text: string, options: PlayOptions = {}): Promise<void> {
    this.stop();
    const trimmed = text.trim();
    if (!trimmed) {
      set({
        status: "error",
        error: "Nothing to read here.",
        engine: null,
        sourceLabel: null,
      });
      return;
    }

    sessionRate = options.rate ?? sessionRate;
    lastText = trimmed;
    lastWebVoiceUri = options.webVoiceUri;
    lastCloudVoice = options.cloudVoice;
    const label = options.label ?? snippet(trimmed);
    lastLabel = label;
    set({
      status: "loading",
      engine: null,
      sourceLabel: label,
      lastSourceLabel: label,
      currentTime: 0,
      duration: 0,
      rate: sessionRate,
      canSeek: false,
      error: null,
    });

    await attemptPlayback(trimmed, options);
  },

  /** Replay the last read (used by the idle mini-player's replay hint). */
  replayLast(): void {
    if (!lastText) return;
    void this.play(lastText, {
      label: lastLabel,
      cloudVoice: lastCloudVoice,
      webVoiceUri: lastWebVoiceUri,
    });
  },

  pause(): void {
    const { engine, status } = useTtsStore.getState();
    if (status !== "playing") return;
    if (engine === "cloud") audioEl?.pause();
    else if (engine === "webspeech") window.speechSynthesis?.pause();
    set({ status: "paused" });
  },

  resume(): void {
    const { engine, status } = useTtsStore.getState();
    if (status !== "paused") return;
    if (engine === "cloud") void audioEl?.play();
    else if (engine === "webspeech") window.speechSynthesis?.resume();
    set({ status: "playing" });
  },

  /** Stop playback and release resources. Returns the store to idle. */
  stop(): void {
    abortController?.abort();
    abortController = null;

    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute("src");
      audioEl.load();
      audioEl = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    utterance = null;

    set({
      status: "idle",
      engine: null,
      sourceLabel: null,
      currentTime: 0,
      duration: 0,
      canSeek: false,
    });
  },

  /** Scrub to `seconds` — cloud engine only (Web Speech can't seek). */
  seek(seconds: number): void {
    if (useTtsStore.getState().engine !== "cloud" || !audioEl) return;
    audioEl.currentTime = Math.max(0, Math.min(seconds, audioEl.duration || 0));
    set({ currentTime: audioEl.currentTime });
  },

  /**
   * Change speaking rate. Applies live for cloud; for Web Speech (which can't
   * retune mid-utterance) it restarts the current read at the new rate.
   */
  setRate(rate: number): void {
    sessionRate = rate;
    set({ rate });
    const { engine, status } = useTtsStore.getState();
    if (engine === "cloud" && audioEl) {
      audioEl.playbackRate = rate;
    } else if (engine === "webspeech" && status !== "idle" && lastText) {
      void this.play(lastText, { rate, webVoiceUri: lastWebVoiceUri });
    }
  },
};

// ── Engine decision (the tunable policy) ──────────────────────
/**
 * ┌─ FALLBACK POLICY ─────────────────────────────────────────────────────┐
 * │ Decides which engine narrates and how failures degrade. This is the   │
 * │ judgment knob for the whole feature — tune freely.                    │
 * │                                                                       │
 * │ Default behaviour:                                                     │
 * │  • Offline (`navigator.onLine === false`) → go straight to Web Speech. │
 * │  • Otherwise try the cloud (BYOK, HD voices) first.                    │
 * │  • Any cloud failure (network OR missing-key 422) → fall back to       │
 * │    Web Speech so the user always hears *something*; the cloud error is │
 * │    surfaced only if Web Speech is also unavailable.                    │
 * │                                                                       │
 * │ Alternative policies you might prefer:                                 │
 * │  • Treat a 422 (no key configured) as a hard error with a setup hint   │
 * │    instead of silently using OS voices.                                │
 * │  • Make Web Speech the default and cloud an explicit "HD" opt-in.      │
 * └───────────────────────────────────────────────────────────────────────┘
 */
async function attemptPlayback(
  text: string,
  options: PlayOptions,
): Promise<void> {
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  let cloudError: string | null = null;
  if (!offline) {
    try {
      abortController = new AbortController();
      // Synthesize at the provider's neutral rate (cached, rate-independent);
      // speed is applied client-side via playbackRate in playCloud().
      const blob = await getSpeechBlob(text, {
        voice: options.cloudVoice,
        signal: abortController.signal,
      });
      playCloud(URL.createObjectURL(blob));
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      cloudError =
        err instanceof SpeechSynthesisError || err instanceof Error
          ? err.message
          : "Speech generation failed";
    }
  }

  if (isWebSpeechAvailable()) {
    playWebSpeech(text, options.webVoiceUri);
    return;
  }

  set({
    status: "error",
    engine: null,
    error:
      cloudError ??
      "Text-to-speech isn't available on this device or browser.",
  });
}

// ── Cloud engine ──────────────────────────────────────────────
function playCloud(url: string): void {
  objectUrl = url;
  const el = new Audio(url);
  audioEl = el;
  el.playbackRate = sessionRate;

  el.addEventListener("loadedmetadata", () =>
    set({ duration: Number.isFinite(el.duration) ? el.duration : 0, canSeek: true }),
  );
  el.addEventListener("timeupdate", () => set({ currentTime: el.currentTime }));
  el.addEventListener("ended", () => ttsController.stop());
  el.addEventListener("error", () =>
    set({ status: "error", error: "Audio playback failed." }),
  );

  el.play()
    .then(() => set({ status: "playing", engine: "cloud", canSeek: true }))
    .catch(() =>
      set({ status: "error", engine: "cloud", error: "Couldn't start playback." }),
    );
}

// ── Web Speech engine ─────────────────────────────────────────
function playWebSpeech(text: string, voiceUri?: string): void {
  utterance = speakWithWebSpeech(
    text,
    { rate: sessionRate, voiceUri },
    {
      onStart: () =>
        set({ status: "playing", engine: "webspeech", canSeek: false }),
      onEnd: () => ttsController.stop(),
      onError: (message) => set({ status: "error", error: message }),
    },
  );
  if (!utterance) {
    set({ status: "error", error: "Web Speech isn't available." });
  }
}

/** First ~60 chars of the text, for the mini-player label. */
function snippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}
