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
 *
 * ── CHARACTER POSITION IS THE CLOCK ──────────────────────────────────────
 * The two engines expose incompatible progress signals: cloud audio has
 * `currentTime`/`duration`, Web Speech has only a character index from
 * `onboundary` and no duration at all. Rather than special-case the UI, both
 * are normalized to ONE quantity — `progress`, the fraction of the read's
 * characters spoken so far. That single definition buys:
 *   • a working progress bar on the fallback engine (previously a blank strip)
 *   • seeking on BOTH engines (cloud: find the chunk; Web Speech: re-speak
 *     from `text.slice(offset)`)
 *   • rate changes that resume where you were instead of restarting at the top
 *   • an honest clock across chunks whose durations aren't all known yet
 *
 * ── LONG READS ARE CHUNKED ───────────────────────────────────────────────
 * Every cloud provider caps a single request (OpenAI at 4096 chars). A whole
 * note exceeds that, so it is split by `chunkForSpeech` and the pieces are
 * played back-to-back as one continuous read, with the next chunk prefetched
 * while the current one plays. Before this, a long note failed the cloud call
 * outright and silently dropped to the browser voice (GitHub #65).
 */

import { useTtsStore, type TtsUsage } from "@/state/tts-store";
import { estimateSpeechCost } from "@/lib/domain/ai/speech/pricing";
import { chunkForSpeech } from "./chunk-text";
import {
  SpeechSynthesisError,
  getSpeechBlob,
  type SpeechResult,
} from "./synthesize";
import { hasCachedSpeech, speechCacheKey } from "./cache";
import { isWebSpeechAvailable, speakWithWebSpeech } from "./web-speech";

// ── Imperative singletons ─────────────────────────────────────
let audioEl: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let utterance: SpeechSynthesisUtterance | null = null;
let abortController: AbortController | null = null;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Monotonic epoch for the active read. Every async continuation captures the
 * token it started under and bails if it no longer matches.
 *
 * Load-bearing: `speechSynthesis.cancel()` fires the current utterance's
 * `onend`, which is indistinguishable from a natural finish. Without this
 * guard, a rate change or a seek (both of which cancel) would trigger the
 * `onEnd → stop()` path and tear down the read we were mid-way through
 * restarting.
 */
let epoch = 0;

/** Everything about the read currently in flight. */
interface ReadSession {
  token: number;
  /** Full narratable text — the coordinate space `progress` is measured in. */
  text: string;
  totalChars: number;
  /** Provider-sized pieces, in reading order (cloud engine only). */
  chunks: string[];
  /** Absolute start offset of each chunk within `text`. */
  chunkStarts: number[];
  /** Index of the chunk currently playing (cloud). */
  index: number;
  /** Measured seconds per chunk, filled in as each loads. null = not yet known. */
  durations: (number | null)[];
  /** Absolute character offset Web Speech has spoken up to. */
  spokenChars: number;
  /** Offset the current Web Speech utterance started at (boundary events are relative). */
  utteranceBase: number;
  // Cost accounting
  billedChars: number;
  cachedChunks: number;
  providerId: string | null;
  modelId: string | null;
  // Voice selection, remembered for restarts
  cloudVoice?: string;
  webVoiceUri?: string;
  label: string;
}

let session: ReadSession | null = null;
let sessionRate = 1;

/**
 * Snapshot of the last read's INPUT, surviving `stop()` (which clears
 * `session`). The idle mini-player's replay hint needs this after playback has
 * torn down. Carries the voices and label too — the old implementation kept
 * them in parallel `last*` variables that drifted, so a replay after a speed
 * change silently lost both the cloud voice and the label.
 */
let lastRead: {
  text: string;
  label: string;
  cloudVoice?: string;
  webVoiceUri?: string;
} | null = null;

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
  /** Resume from this character offset instead of the beginning. */
  startChar?: number;
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
    const label = options.label ?? snippet(trimmed);
    const chunks = chunkForSpeech(trimmed);

    // Absolute start offsets let a chunk index translate to a character
    // position (and back), which is how seeking crosses chunk boundaries.
    const chunkStarts: number[] = [];
    let running = 0;
    for (const chunk of chunks) {
      chunkStarts.push(running);
      running += chunk.length;
    }

    const token = ++epoch;
    session = {
      token,
      text: trimmed,
      totalChars: trimmed.length,
      chunks,
      chunkStarts,
      index: 0,
      durations: chunks.map(() => null),
      spokenChars: 0,
      utteranceBase: 0,
      billedChars: 0,
      cachedChunks: 0,
      providerId: null,
      modelId: null,
      cloudVoice: options.cloudVoice,
      webVoiceUri: options.webVoiceUri,
      label,
    };
    // Mirror the INPUT into a snapshot that outlives `stop()`. Captured here,
    // at the one place a read begins, so it can never drift from `session`.
    lastRead = {
      text: trimmed,
      label,
      cloudVoice: options.cloudVoice,
      webVoiceUri: options.webVoiceUri,
    };

    set({
      status: "loading",
      engine: null,
      sourceLabel: label,
      lastSourceLabel: label,
      currentTime: 0,
      duration: 0,
      progress: 0,
      rate: sessionRate,
      canSeek: false,
      error: null,
      degradedReason: null,
      usage: previewUsage(session),
    });

    await attemptPlayback(session, options.startChar ?? 0);
  },

  /** Replay the last read (used by the idle mini-player's replay hint). */
  replayLast(): void {
    // Read the snapshot, NOT `session` — the replay hint only ever renders once
    // playback is idle, and `stop()` has cleared `session` by then. Reading
    // `session` here made the button a no-op in exactly the state it appears in.
    const prev = lastRead;
    if (!prev?.text) return;
    void this.play(prev.text, {
      label: prev.label,
      cloudVoice: prev.cloudVoice,
      webVoiceUri: prev.webVoiceUri,
    });
  },

  pause(): void {
    const { engine, status } = useTtsStore.getState();
    if (status !== "playing") return;
    if (engine === "cloud") audioEl?.pause();
    else if (engine === "webspeech") {
      stopKeepAlive();
      window.speechSynthesis?.pause();
    }
    set({ status: "paused" });
  },

  resume(): void {
    const { engine, status } = useTtsStore.getState();
    if (status !== "paused") return;
    if (engine === "cloud") void audioEl?.play();
    else if (engine === "webspeech") {
      window.speechSynthesis?.resume();
      startKeepAlive();
    }
    set({ status: "playing" });
  },

  /** Stop playback and release resources. Returns the store to idle. */
  stop(): void {
    // Invalidate every in-flight continuation before tearing anything down.
    epoch += 1;
    session = null;

    abortController?.abort();
    abortController = null;
    stopKeepAlive();
    releaseCloudAudio();

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
      progress: 0,
      canSeek: false,
      degradedReason: null,
    });
  },

  /** Scrub to `seconds` — translated to a fraction of the estimated duration. */
  seek(seconds: number): void {
    const { duration } = useTtsStore.getState();
    if (duration <= 0) return;
    this.seekFraction(seconds / duration);
  },

  /**
   * Scrub to a fraction (0–1) of the whole read.
   *
   * Engine-independent by construction: the fraction resolves to a character
   * offset, and each engine knows how to resume from one. This is what gives
   * the Web Speech fallback a working scrubber — it re-speaks from
   * `text.slice(offset)` rather than seeking, which is indistinguishable to a
   * listener.
   */
  seekFraction(fraction: number): void {
    const active = session;
    if (!active) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    const targetChar = Math.floor(clamped * active.totalChars);
    const { engine } = useTtsStore.getState();

    if (engine === "webspeech") {
      restartWebSpeechAt(active, targetChar);
    } else {
      void restartCloudAt(active, targetChar);
    }
  },

  /**
   * Change speaking rate. Applies live for cloud; for Web Speech (which can't
   * retune mid-utterance) it re-speaks FROM THE CURRENT POSITION.
   *
   * The restart used to begin at character 0, so every speed change on a long
   * note threw the listener back to the top — the single most-reported
   * annoyance with the fallback engine.
   */
  setRate(rate: number): void {
    sessionRate = rate;
    set({ rate });
    const { engine, status } = useTtsStore.getState();
    if (engine === "cloud" && audioEl) {
      audioEl.playbackRate = rate;
      return;
    }
    const active = session;
    if (engine === "webspeech" && status !== "idle" && active) {
      restartWebSpeechAt(active, active.spokenChars);
    }
  },
};

// ── Engine decision (the tunable policy) ──────────────────────
/**
 * ┌─ FALLBACK POLICY ─────────────────────────────────────────────────────┐
 * │ Decides which engine narrates and how failures degrade. This is the   │
 * │ judgment knob for the whole feature — tune freely.                    │
 * │                                                                       │
 * │ Current behaviour:                                                     │
 * │  • Offline (`navigator.onLine === false`) → go straight to Web Speech. │
 * │  • Otherwise try the cloud (BYOK, HD voices) first, CHUNKED so a long  │
 * │    note is a sequence of legal requests rather than one illegal one.   │
 * │  • Any cloud failure falls back to Web Speech so the user always hears │
 * │    *something* — but the reason is now RECORDED in `degradedReason`    │
 * │    and shown on the amber indicator (GitHub #65). Degrading silently   │
 * │    made an expired key, a billing lapse, a network blip and an         │
 * │    over-long note all look identical to "you're offline".              │
 * │                                                                       │
 * │ Alternative policies you might prefer:                                 │
 * │  • Treat a 422 (no key configured) as a hard error with a setup hint   │
 * │    instead of using OS voices — rejected in triage: it trades a        │
 * │    confusing experience for a broken one.                             │
 * │  • Make Web Speech the default and cloud an explicit "HD" opt-in.      │
 * └───────────────────────────────────────────────────────────────────────┘
 */
async function attemptPlayback(
  active: ReadSession,
  startChar: number,
): Promise<void> {
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  let cloudError: string | null = null;
  if (!offline) {
    try {
      // Either it started, or the read was superseded mid-synthesis. Both mean
      // this call is done: a newer read owns the controller.
      await startCloudAt(active, startChar);
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      cloudError = describeCloudFailure(err);
    }
  } else {
    cloudError = "You're offline — using the browser's built-in voice.";
  }

  if (isWebSpeechAvailable()) {
    // Degraded but working: `error` stays null so the player renders as a
    // healthy transport, while `degradedReason` explains the amber badge.
    set({ degradedReason: cloudError });
    startWebSpeechAt(active, startChar);
    return;
  }

  set({
    status: "error",
    engine: null,
    error:
      cloudError ?? "Text-to-speech isn't available on this device or browser.",
  });
}

/** Turn a cloud failure into a sentence a user can act on. */
function describeCloudFailure(err: unknown): string {
  if (err instanceof SpeechSynthesisError) {
    if (err.status === 401) return "Sign-in expired — using the browser voice.";
    if (err.status === 422) {
      return "No AI voice is set up yet (Settings → AI → Text-to-Speech). Using the browser voice.";
    }
    if (err.status === 429) {
      return "AI voice rate-limited — using the browser voice.";
    }
    if (err.status === 413) return `${err.message} Using the browser voice.`;
    return `${err.message} Using the browser voice.`;
  }
  if (err instanceof Error) return `${err.message} Using the browser voice.`;
  return "AI voice unavailable — using the browser voice.";
}

// ── Cloud engine (chunked playlist) ───────────────────────────

/**
 * Begin (or restart) cloud playback at an absolute character offset.
 *
 * Returns false when the read was superseded mid-synthesis. Throws on a genuine
 * synthesis failure so `attemptPlayback` can fall back and record why.
 */
async function startCloudAt(
  active: ReadSession,
  startChar: number,
): Promise<boolean> {
  const index = chunkIndexForChar(active, startChar);
  const chunk = active.chunks[index];
  if (!chunk) return false;

  const myToken = active.token;
  abortController = new AbortController();
  // Synthesize at the provider's neutral rate (cached, rate-independent);
  // speed is applied client-side via playbackRate in playChunk().
  const result = await getSpeechBlob(chunk, {
    voice: active.cloudVoice,
    signal: abortController.signal,
  });
  if (myToken !== epoch) return false;

  recordUsage(active, result, chunk.length);
  active.index = index;

  // Offset WITHIN the chunk, so a seek lands mid-chunk rather than at its start.
  const within = startChar - active.chunkStarts[index];
  playChunk(active, index, result.blob, within / chunk.length);
  prefetchChunk(active, index + 1);
  return true;
}

/** Seek the cloud engine by restarting at a character offset. */
async function restartCloudAt(
  active: ReadSession,
  targetChar: number,
): Promise<void> {
  const index = chunkIndexForChar(active, targetChar);
  const within = targetChar - active.chunkStarts[index];
  const chunk = active.chunks[index];
  if (!chunk) return;

  // Same chunk and already loaded → a plain audio seek, no re-synthesis.
  if (index === active.index && audioEl && audioEl.duration > 0) {
    audioEl.currentTime = (within / chunk.length) * audioEl.duration;
    publishProgress(active);
    return;
  }

  const myToken = active.token;
  set({ status: "loading" });
  try {
    await startCloudAt(active, targetChar);
  } catch (err) {
    if (myToken !== epoch) return;
    // A seek into an unsynthesized chunk can fail where chunk 0 succeeded
    // (rate limit, key revoked mid-read). Degrade rather than dead-end.
    set({ degradedReason: describeCloudFailure(err) });
    if (isWebSpeechAvailable()) startWebSpeechAt(active, targetChar);
    else set({ status: "error", error: describeCloudFailure(err) });
  }
}

/** Attach and play one chunk's audio, starting `fromFraction` into it. */
function playChunk(
  active: ReadSession,
  index: number,
  blob: Blob,
  fromFraction = 0,
): void {
  // Release the previous chunk before replacing it — a long note is many
  // clips, and leaking an element/URL per chunk adds up over a session.
  releaseCloudAudio();
  const url = URL.createObjectURL(blob);
  objectUrl = url;

  const el = new Audio(url);
  audioEl = el;
  el.playbackRate = sessionRate;

  // Captured by value — see the note in startWebSpeechAt.
  const myToken = active.token;

  el.addEventListener("loadedmetadata", () => {
    if (myToken !== epoch || audioEl !== el) return;
    if (Number.isFinite(el.duration)) {
      active.durations[index] = el.duration;
      if (fromFraction > 0) el.currentTime = fromFraction * el.duration;
    }
    publishProgress(active);
  });

  el.addEventListener("timeupdate", () => {
    if (myToken !== epoch || audioEl !== el) return;
    publishProgress(active);
  });

  el.addEventListener("ended", () => {
    if (myToken !== epoch || audioEl !== el) return;
    void advanceChunk(active);
  });

  el.addEventListener("error", () => {
    // A teardown (`removeAttribute("src") + load()`) fires `error` on the
    // element we just abandoned; `audioEl !== el` filters those out so a
    // normal chunk transition can't paint a failure over a healthy read.
    if (myToken !== epoch || audioEl !== el) return;
    set({ status: "error", error: "Audio playback failed." });
  });

  el.play()
    .then(() => {
      if (myToken !== epoch || audioEl !== el) return;
      set({ status: "playing", engine: "cloud", canSeek: true });
    })
    .catch(() => {
      if (myToken !== epoch || audioEl !== el) return;
      set({
        status: "error",
        engine: "cloud",
        error: "Couldn't start playback.",
      });
    });
}

/** Move to the next chunk, or finish the read. */
async function advanceChunk(active: ReadSession): Promise<void> {
  const next = active.index + 1;
  if (next >= active.chunks.length) {
    ttsController.stop();
    return;
  }

  const chunk = active.chunks[next];
  const myToken = active.token;
  try {
    abortController = new AbortController();
    const result = await getSpeechBlob(chunk, {
      voice: active.cloudVoice,
      signal: abortController.signal,
    });
    if (myToken !== epoch) return;
    recordUsage(active, result, chunk.length);
    active.index = next;
    playChunk(active, next, result.blob);
    prefetchChunk(active, next + 1);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (myToken !== epoch) return;
    // Mid-read failure: rather than cutting the read short, finish the
    // remainder on the fallback engine from exactly where we left off.
    set({ degradedReason: describeCloudFailure(err) });
    if (isWebSpeechAvailable()) {
      startWebSpeechAt(active, active.chunkStarts[next]);
    } else {
      set({ status: "error", error: describeCloudFailure(err) });
    }
  }
}

/**
 * Warm the cache for the next chunk while the current one plays, so chunk
 * transitions are seamless instead of stalling for a round-trip.
 *
 * Deliberately fire-and-forget: a prefetch failure is not an error, because the
 * real attempt in `advanceChunk` will surface it with proper handling.
 */
function prefetchChunk(active: ReadSession, index: number): void {
  const chunk = active.chunks[index];
  if (!chunk) return;
  void getSpeechBlob(chunk, { voice: active.cloudVoice }).catch(() => {
    /* surfaced later by advanceChunk if it matters */
  });
}

// ── Web Speech engine ─────────────────────────────────────────

/** Start (or restart) the fallback engine at an absolute character offset. */
function startWebSpeechAt(active: ReadSession, startChar: number): void {
  // Switching engines mid-read (a chunk failed, or a seek landed on an
  // unsynthesizable chunk) must silence the cloud clip first, or both voices
  // talk over each other.
  releaseCloudAudio();

  const offset = Math.max(0, Math.min(startChar, active.totalChars));
  active.utteranceBase = offset;
  active.spokenChars = offset;

  // Capture the token BY VALUE. `active.token` is reassigned on every restart,
  // and these closures hold the same session object — reading `active.token`
  // inside them would see the NEW token and let a cancelled utterance's
  // `onend` tear down the utterance that replaced it.
  const myToken = active.token;

  utterance = speakWithWebSpeech(
    active.text.slice(offset),
    { rate: sessionRate, voiceUri: active.webVoiceUri },
    {
      onStart: () => {
        if (myToken !== epoch) return;
        // canSeek is true on BOTH engines now — Web Speech "seeks" by
        // re-speaking from an offset, which a listener can't distinguish.
        set({ status: "playing", engine: "webspeech", canSeek: true });
        startKeepAlive();
      },
      onBoundary: (charIndex) => {
        if (myToken !== epoch) return;
        active.spokenChars = active.utteranceBase + charIndex;
        publishProgress(active);
      },
      onEnd: () => {
        // Guarded: cancel() during a rate change or seek also fires onend, and
        // without this the restart would immediately tear itself down.
        if (myToken !== epoch) return;
        ttsController.stop();
      },
      onError: (message) => {
        if (myToken !== epoch) return;
        set({ status: "error", error: message });
      },
    },
  );

  if (!utterance) {
    set({ status: "error", error: "Web Speech isn't available." });
  }
}

/** Tear down the cloud audio element and its object URL, if any. */
function releaseCloudAudio(): void {
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
}

/**
 * Re-speak from `targetChar`. Bumps the epoch first so the cancel-induced
 * `onend` from the outgoing utterance can't stop the incoming one.
 */
function restartWebSpeechAt(active: ReadSession, targetChar: number): void {
  stopKeepAlive();
  active.token = ++epoch;
  startWebSpeechAt(active, targetChar);
  publishProgress(active);
}

/**
 * Chrome silently stops `speechSynthesis` after roughly 15 seconds of a single
 * long utterance — a long-standing engine bug. Nudging pause/resume on a timer
 * is the established workaround and is inaudible in practice.
 *
 * Only relevant now that whole-note reads can land on this engine; the old
 * selection-sized reads were short enough never to trip it.
 */
function startKeepAlive(): void {
  stopKeepAlive();
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  keepAliveTimer = setInterval(() => {
    const { status, engine } = useTtsStore.getState();
    if (status !== "playing" || engine !== "webspeech") return;
    window.speechSynthesis.pause();
    window.speechSynthesis.resume();
  }, 10_000);
}

function stopKeepAlive(): void {
  if (keepAliveTimer !== null) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// ── Progress + usage ──────────────────────────────────────────

/** Which chunk contains an absolute character offset. */
function chunkIndexForChar(active: ReadSession, char: number): number {
  for (let i = active.chunkStarts.length - 1; i >= 0; i--) {
    if (char >= active.chunkStarts[i]) return i;
  }
  return 0;
}

/**
 * Recompute `progress` / `currentTime` / `duration` and push them to the store.
 *
 * Progress is CHARACTER-weighted for both engines. For cloud that means the
 * position within the current chunk is scaled by that chunk's share of the
 * document, which stays correct even though later chunks haven't been
 * synthesized yet and their durations are unknown.
 */
function publishProgress(active: ReadSession): void {
  const { engine } = useTtsStore.getState();
  let charsDone: number;

  if (engine === "webspeech") {
    charsDone = active.spokenChars;
  } else {
    const chunk = active.chunks[active.index] ?? "";
    const start = active.chunkStarts[active.index] ?? 0;
    const within =
      audioEl && audioEl.duration > 0
        ? (audioEl.currentTime / audioEl.duration) * chunk.length
        : 0;
    charsDone = start + within;
  }

  const progress =
    active.totalChars > 0
      ? Math.max(0, Math.min(1, charsDone / active.totalChars))
      : 0;

  // Estimate total duration from the chars-per-second we've actually measured,
  // so the clock is plausible from the first chunk and self-corrects as more
  // durations arrive. Without this the readout would show only the current
  // chunk's length and imply a 3-minute note is 30 seconds long.
  const cps = measuredCharsPerSecond(active);
  const duration = cps ? active.totalChars / cps : 0;

  set({
    progress,
    duration,
    currentTime: duration > 0 ? progress * duration : 0,
  });
}

/** Characters per second, averaged over chunks whose duration we've measured. */
function measuredCharsPerSecond(active: ReadSession): number | null {
  let chars = 0;
  let seconds = 0;
  active.durations.forEach((d, i) => {
    if (d && d > 0) {
      chars += active.chunks[i].length;
      seconds += d;
    }
  });
  if (seconds <= 0) return null;
  // Durations are measured at neutral rate; the audio element plays faster or
  // slower, so scale by the current rate to keep the clock honest.
  return (chars / seconds) * sessionRate;
}

/** Fold one synthesis result into the session's cost accounting. */
function recordUsage(
  active: ReadSession,
  result: SpeechResult,
  chars: number,
): void {
  if (result.cached) active.cachedChunks += 1;
  else active.billedChars += chars;
  active.providerId = result.providerId ?? active.providerId;
  active.modelId = result.modelId ?? active.modelId;
  set({ usage: buildUsage(active) });
}

/**
 * Cost preview computed BEFORE anything is synthesized, by checking which
 * chunks are already cached. Lets the tooltip quote a price for the whole read
 * up front rather than counting up as playback proceeds.
 */
function previewUsage(active: ReadSession): TtsUsage {
  let billed = 0;
  let cached = 0;
  for (const chunk of active.chunks) {
    if (hasCachedSpeech(speechCacheKey(chunk, active.cloudVoice))) cached += 1;
    else billed += chunk.length;
  }
  const estimate = estimateSpeechCost(active.modelId, billed);
  return {
    totalChars: active.totalChars,
    billedChars: billed,
    estimatedCost: estimate.usd,
    costNote: estimate.note,
    providerId: active.providerId,
    modelId: active.modelId,
    cachedChunks: cached,
    chunkCount: active.chunks.length,
  };
}

function buildUsage(active: ReadSession): TtsUsage {
  // Chunks not yet reached are priced at list, so the figure is a whole-read
  // estimate rather than a running total of what's played so far.
  const remaining = active.chunks
    .slice(active.index + 1)
    .filter((c) => !hasCachedSpeech(speechCacheKey(c, active.cloudVoice)))
    .reduce((n, c) => n + c.length, 0);

  const billed = active.billedChars + remaining;
  const estimate = estimateSpeechCost(active.modelId, billed);
  return {
    totalChars: active.totalChars,
    billedChars: billed,
    estimatedCost: estimate.usd,
    costNote: estimate.note,
    providerId: active.providerId,
    modelId: active.modelId,
    cachedChunks: active.cachedChunks,
    chunkCount: active.chunks.length,
  };
}

/** First ~60 chars of the text, for the mini-player label. */
function snippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}
