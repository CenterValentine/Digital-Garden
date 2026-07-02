/**
 * Cloud speech synthesis (client) — POST plain text to the ephemeral
 * `/api/ai/speech` endpoint and return the audio Blob.
 *
 * Results are cached per session (see `cache.ts`) so a repeated read reuses the
 * Blob instead of re-paying the provider. Callers turn the Blob into a fresh
 * object URL per play (`URL.createObjectURL`) and revoke it when done — the Blob
 * itself stays cached.
 *
 * NOTE: speaking rate is intentionally NOT sent here. The controller synthesizes
 * at the provider's neutral rate and applies speed via `playbackRate`, so the
 * cache is rate-independent and changing speed never re-synthesizes.
 */

import {
  getCachedSpeech,
  putCachedSpeech,
  speechCacheKey,
} from "./cache";

export interface SynthesizeOptions {
  /** Provider-specific voice id (see speech catalog). Omit for user default. */
  voice?: string;
  signal?: AbortSignal;
}

/** Error carrying the HTTP status so callers can distinguish setup vs network. */
export class SpeechSynthesisError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SpeechSynthesisError";
    this.status = status;
  }
}

/**
 * Synthesize (or reuse cached) speech audio for `text`. Returns the raw Blob;
 * the caller owns object-URL creation/revocation for playback.
 */
export async function getSpeechBlob(
  text: string,
  options: SynthesizeOptions = {},
): Promise<Blob> {
  const key = speechCacheKey(text, options.voice);
  const cached = getCachedSpeech(key);
  if (cached) return cached;

  const res = await fetch("/api/ai/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: options.voice }),
    signal: options.signal,
  });

  if (!res.ok) {
    let message = "Speech generation failed";
    try {
      const json = (await res.json()) as { error?: string };
      if (json?.error) message = json.error;
    } catch {
      // non-JSON error body — keep the default message
    }
    throw new SpeechSynthesisError(message, res.status);
  }

  const blob = await res.blob();
  putCachedSpeech(key, blob);
  return blob;
}
