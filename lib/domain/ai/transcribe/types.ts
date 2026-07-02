/**
 * Speech-to-Text (transcription) types — Audio subsystem (Phase 5).
 *
 * The inverse of the speech subsystem: audio in → words out. v1 seeds OpenAI
 * (Whisper / gpt-4o-transcribe); Google / ElevenLabs Scribe are follow-ups.
 *
 * Client-safe — no server-only imports.
 */

export type TranscribeProviderId = "openai";

export type TranscribeModelId = "whisper-1" | "gpt-4o-transcribe";

export interface TranscribeRequest {
  /** Raw audio bytes to transcribe. */
  audio: Uint8Array;
  /** MIME type of the audio (e.g. "audio/mpeg"). */
  mimeType?: string;
  providerId?: TranscribeProviderId;
  modelId?: TranscribeModelId;
  /** Optional language hint (ISO 639-1). */
  language?: string;
  /** BYOK key — falls back to a resolved connection or env var. */
  apiKey?: string;
}

export interface TranscribeSegment {
  text: string;
  startSecond: number;
  endSecond: number;
}

export interface TranscribeResult {
  /** Full transcript text. */
  text: string;
  /** Timed segments, when the model returns them. */
  segments: TranscribeSegment[];
  /** Detected language (ISO 639-1), when available. */
  language?: string;
  /** Audio duration in seconds, when reported. */
  durationSeconds?: number;
  providerId: TranscribeProviderId;
  modelId: TranscribeModelId;
}

/** Stable substring of the "no key" error — boundary code swaps it for a hint. */
export const TRANSCRIBE_NO_KEY_MARKER =
  "No API key configured for transcription provider";

/** User-facing guidance when transcription has no provider configured. */
export const TRANSCRIBE_SETUP_HINT =
  "No speech-to-text provider is set up yet. In Settings → AI, add an OpenAI connection " +
  "(with a `whisper-1` or `gpt-4o-transcribe` model), then choose it under " +
  "Feature Routing → Speech-to-Text.";

/**
 * Map a caught transcription error to a user-facing message: the friendly setup
 * hint when no provider is configured, otherwise the original message.
 */
export function describeTranscribeError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Transcription failed";
  return message.includes(TRANSCRIBE_NO_KEY_MARKER)
    ? TRANSCRIBE_SETUP_HINT
    : message;
}
