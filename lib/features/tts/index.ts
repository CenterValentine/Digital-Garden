/**
 * TTS "read aloud" feature — barrel export (Audio subsystem).
 *
 * Client engine: a singleton controller + Zustand store, abstracting cloud
 * (BYOK, HD voices, via /api/ai/speech) and the keyless Web Speech fallback
 * behind one play/pause/stop/seek interface.
 *
 * Text extraction (`extractReadableText`) and block eligibility live under
 * `lib/domain/editor/tts/` — import those directly where you have TipTap JSON.
 */

export { ttsController, type PlayOptions } from "./controller";
export {
  useTextToSpeech,
  type UseTextToSpeech,
} from "./use-text-to-speech";
export {
  getSpeechBlob,
  SpeechSynthesisError,
  type SpeechResult,
  type SynthesizeOptions,
} from "./synthesize";
export {
  chunkForSpeech,
  findSplitPoint,
  MAX_CHUNK_CHARS,
  TARGET_CHUNK_CHARS,
} from "./chunk-text";
export {
  isWebSpeechAvailable,
  getWebSpeechVoices,
  onWebSpeechVoicesChanged,
} from "./web-speech";
