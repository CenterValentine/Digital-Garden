/**
 * Speech-to-Text — Barrel Export (Audio subsystem, Phase 5)
 */

export type {
  TranscribeProviderId,
  TranscribeModelId,
  TranscribeRequest,
  TranscribeSegment,
  TranscribeResult,
} from "./types";

export {
  TRANSCRIBE_NO_KEY_MARKER,
  TRANSCRIBE_SETUP_HINT,
  describeTranscribeError,
} from "./types";

// Server-only: import directly from "./transcribe" in API routes —
//   import { transcribeAudio } from "@/lib/domain/ai/transcribe/transcribe";
