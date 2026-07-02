/**
 * Speech Provider Catalog — Audio subsystem (Phase 1)
 *
 * Static metadata for text-to-speech providers and models.
 * Client-safe — used by settings UI, the voice picker, and the pre-gen window.
 *
 * Mirrors `lib/domain/ai/image/catalog.ts`.
 */

import type { SpeechProviderMeta, SpeechProviderId } from "./types";

// OpenAI's six built-in TTS voices, shared by tts-1 and tts-1-hd.
const OPENAI_VOICES = [
  { id: "alloy", name: "Alloy" },
  { id: "echo", name: "Echo" },
  { id: "fable", name: "Fable" },
  { id: "nova", name: "Nova" },
  { id: "onyx", name: "Onyx" },
  { id: "shimmer", name: "Shimmer" },
];

export const SPEECH_PROVIDER_CATALOG: SpeechProviderMeta[] = [
  {
    id: "openai",
    name: "OpenAI",
    requiresApiKey: true,
    models: [
      {
        id: "tts-1",
        name: "TTS-1",
        voices: OPENAI_VOICES,
        formats: ["mp3", "opus", "aac", "flac", "wav"],
        defaultFormat: "mp3",
        supportsSpeed: true,
        languages: [],
      },
      {
        id: "tts-1-hd",
        name: "TTS-1 HD",
        voices: OPENAI_VOICES,
        formats: ["mp3", "opus", "aac", "flac", "wav"],
        defaultFormat: "mp3",
        supportsSpeed: true,
        languages: [],
      },
    ],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    requiresApiKey: true,
    models: [
      {
        id: "eleven_multilingual_v2",
        name: "Multilingual v2",
        // ElevenLabs voices are account-scoped voiceIds; these are the
        // stable public defaults. Users can paste a custom voiceId via the
        // pre-gen window override.
        voices: [
          { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
          { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi" },
          { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella" },
          { id: "ErXwobaYiN019PkySvjV", name: "Antoni" },
          { id: "VR6AewLTigWG4xSOukaG", name: "Arnold" },
          { id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
        ],
        formats: ["mp3"],
        defaultFormat: "mp3",
        supportsSpeed: false,
        languages: [],
      },
      {
        id: "eleven_turbo_v2_5",
        name: "Turbo v2.5",
        voices: [
          { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
          { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella" },
          { id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
        ],
        formats: ["mp3"],
        defaultFormat: "mp3",
        supportsSpeed: false,
        languages: [],
      },
    ],
  },
  {
    id: "google",
    name: "Google Cloud TTS",
    requiresApiKey: true,
    models: [
      {
        id: "google-tts-neural2",
        name: "Neural2",
        voices: [
          { id: "en-US-Neural2-A", name: "Neural2 A (US English)", language: "en-US" },
          { id: "en-US-Neural2-C", name: "Neural2 C (US English)", language: "en-US" },
          { id: "en-GB-Neural2-A", name: "Neural2 A (UK English)", language: "en-GB" },
          { id: "es-ES-Neural2-A", name: "Neural2 A (Spanish)", language: "es-ES" },
          { id: "fr-FR-Neural2-A", name: "Neural2 A (French)", language: "fr-FR" },
        ],
        formats: ["mp3", "wav"],
        defaultFormat: "mp3",
        supportsSpeed: true,
        languages: ["en", "es", "fr", "de", "it", "ja"],
      },
      {
        id: "google-tts-wavenet",
        name: "WaveNet",
        voices: [
          { id: "en-US-Wavenet-D", name: "WaveNet D (US English)", language: "en-US" },
          { id: "en-GB-Wavenet-B", name: "WaveNet B (UK English)", language: "en-GB" },
          { id: "es-ES-Wavenet-B", name: "WaveNet B (Spanish)", language: "es-ES" },
          { id: "fr-FR-Wavenet-C", name: "WaveNet C (French)", language: "fr-FR" },
        ],
        formats: ["mp3", "wav"],
        defaultFormat: "mp3",
        supportsSpeed: true,
        languages: ["en", "es", "fr", "de", "it", "ja"],
      },
    ],
  },
];

/** Look up a speech provider by ID */
export function getSpeechProviderMeta(
  providerId: SpeechProviderId,
): SpeechProviderMeta | undefined {
  return SPEECH_PROVIDER_CATALOG.find((p) => p.id === providerId);
}

/** Look up a speech model across all providers */
export function getSpeechModelMeta(modelId: string) {
  for (const provider of SPEECH_PROVIDER_CATALOG) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return { provider, model };
  }
  return undefined;
}

/** Default voice for a model (first catalog voice), or undefined. */
export function getDefaultVoice(modelId: string): string | undefined {
  return getSpeechModelMeta(modelId)?.model.voices[0]?.id;
}
