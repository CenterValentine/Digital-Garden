/**
 * AI Speech Generation — Barrel Export (Audio subsystem, Phase 1)
 */

// Client-safe types and catalog
export type {
  SpeechProviderId,
  SpeechModelId,
  SpeechFormat,
  SpeechVoice,
  SpeechGenRequest,
  SpeechGenResult,
  SpeechModelMeta,
  SpeechProviderMeta,
} from "./types";

export { SPEECH_FORMAT_MIME } from "./types";

export {
  SPEECH_PROVIDER_CATALOG,
  getSpeechProviderMeta,
  getSpeechModelMeta,
  getDefaultVoice,
} from "./catalog";

// Server-only: import directly from "./generate" / "./generate-and-store" in
// API routes —
//   import { generateAndStoreSpeech } from "@/lib/domain/ai/speech/generate-and-store";
