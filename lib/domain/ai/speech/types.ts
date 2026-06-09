/**
 * AI Speech Generation Types — Audio subsystem (Phase 1)
 *
 * Type definitions for the multi-provider text-to-speech system.
 * Mirrors `lib/domain/ai/image/types.ts` — the speech subsystem is the
 * image subsystem with a different modality (speech output vs image output).
 *
 * Client-safe — no server-only imports.
 */

// ─── Provider & Model IDs ─────────────────────────────────────

/** Providers that support text-to-speech */
export type SpeechProviderId =
  | "openai" // tts-1, tts-1-hd (AI-SDK-native)
  | "elevenlabs" // ElevenLabs multilingual (direct REST)
  | "google"; // Google Cloud Text-to-Speech (direct REST)

/** Canonical speech model IDs */
export type SpeechModelId =
  // OpenAI
  | "tts-1"
  | "tts-1-hd"
  // ElevenLabs
  | "eleven_multilingual_v2"
  | "eleven_turbo_v2_5"
  // Google Cloud TTS
  | "google-tts-neural2"
  | "google-tts-wavenet";

// ─── Audio Output Format ───────────────────────────────────────

/** Supported audio container/codec output formats */
export type SpeechFormat = "mp3" | "opus" | "aac" | "flac" | "wav";

/** MIME type for a given output format. */
export const SPEECH_FORMAT_MIME: Record<SpeechFormat, string> = {
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
};

// ─── Request / Response ────────────────────────────────────────

/** Input for speech generation */
export interface SpeechGenRequest {
  /** The text to convert to speech */
  text: string;
  /** Provider to use for generation */
  providerId: SpeechProviderId;
  /** Specific model to use */
  modelId: SpeechModelId;
  /** Voice id/name (provider-specific — see catalog) */
  voice?: string;
  /** Desired output format */
  format?: SpeechFormat;
  /** Speaking speed multiplier (provider-dependent; ~0.25–4.0) */
  speed?: number;
  /** Language hint — ISO 639-1 code (e.g. "en", "es") or "auto" */
  language?: string;
  /** BYOK API key (optional — falls back to stored key or env var) */
  apiKey?: string;
  /**
   * Optional base URL override. When set, the OpenAI dispatcher sends the
   * request to `${apiBaseURL}` instead of the provider default. Used when
   * routing speech through a gateway whose API is OpenAI-compatible but
   * lives at a different URL. Mirrors `ImageGenRequest.apiBaseURL`.
   */
  apiBaseURL?: string;
  /**
   * Resolved model id to send upstream. When gateway routing is active this
   * differs from the canonical `modelId`. Defaults to `modelId` when omitted.
   */
  upstreamModelId?: string;
}

/** Successful generation result — normalized across providers */
export interface SpeechGenResult {
  /** Base64-encoded audio bytes */
  base64: string;
  /** MIME type of the audio (e.g. "audio/mpeg") */
  mimeType: string;
  /** Duration in seconds, when the provider reports it */
  durationSeconds?: number;
  /** Provider that generated the audio */
  providerId: SpeechProviderId;
  /** Model that generated the audio */
  modelId: SpeechModelId;
}

// ─── Provider Catalog (Client-Safe) ────────────────────────────

/** A single selectable voice */
export interface SpeechVoice {
  /** Provider-specific voice id/name sent in the request */
  id: string;
  /** Human-readable label for the picker */
  name: string;
  /** Optional language tag this voice is tuned for (BCP-47 or ISO 639-1) */
  language?: string;
}

/** Static metadata about a speech model */
export interface SpeechModelMeta {
  id: SpeechModelId;
  name: string;
  /** Voices selectable for this model */
  voices: SpeechVoice[];
  /** Output formats this model can emit */
  formats: SpeechFormat[];
  defaultFormat: SpeechFormat;
  /** Whether a speaking-speed control applies */
  supportsSpeed: boolean;
  /** Languages the model supports (ISO 639-1); empty = many/auto */
  languages: string[];
}

/** Static metadata about a speech provider */
export interface SpeechProviderMeta {
  id: SpeechProviderId;
  name: string;
  requiresApiKey: boolean;
  models: SpeechModelMeta[];
}
