/**
 * Speech-to-Text — Audio subsystem (Phase 5), server-only.
 *
 * transcribeAudio(req, userId) resolves a transcription-capable key (explicit →
 * first transcription-capable Connection → env), then calls AI SDK's
 * experimental_transcribe with OpenAI's transcription model. Normalizes the
 * result to TranscribeResult.
 */

import "server-only";
import {
  TRANSCRIBE_NO_KEY_MARKER,
  type TranscribeModelId,
  type TranscribeRequest,
  type TranscribeResult,
} from "./types";
import {
  listConnections,
  getConnectionWithKey,
} from "@/lib/features/ai-connections";
import { effectiveCapabilities } from "@/lib/domain/ai/features/capabilities";

/** Connection preset ids whose keys can drive transcription (v1: OpenAI). */
const TRANSCRIBE_PRESET_IDS: ReadonlySet<string> = new Set(["openai"]);

/**
 * Resolve a transcription key + model. Priority: explicit apiKey → first
 * Connection holding a transcription-capable model → env OPENAI_API_KEY.
 * Best-effort; never throws on read errors.
 */
async function resolveTranscribeKey(
  userId: string,
  modelId: TranscribeModelId,
): Promise<{ apiKey?: string; modelId: TranscribeModelId }> {
  try {
    const conns = await listConnections(userId);
    for (const conn of conns) {
      if (!conn.presetId || !TRANSCRIBE_PRESET_IDS.has(conn.presetId)) continue;
      const model = conn.models.find((m) =>
        effectiveCapabilities(m).has("transcription"),
      );
      if (!model) continue;
      const withKey = await getConnectionWithKey(userId, conn.id);
      return { apiKey: withKey.apiKey, modelId: model.id as TranscribeModelId };
    }
  } catch {
    // fall through to env
  }
  return { modelId };
}

export async function transcribeAudio(
  req: TranscribeRequest,
  userId: string,
): Promise<TranscribeResult> {
  const requestedModel = req.modelId ?? "whisper-1";

  // Explicit key wins; else auto-discover a transcription connection; else env.
  const resolved = req.apiKey
    ? { apiKey: req.apiKey, modelId: requestedModel }
    : await resolveTranscribeKey(userId, requestedModel);

  const apiKey = resolved.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      `${TRANSCRIBE_NO_KEY_MARKER} "openai". ` +
        `Set OPENAI_API_KEY or add an OpenAI connection with a transcription model.`,
    );
  }

  const [{ createOpenAI }, { experimental_transcribe }] = await Promise.all([
    import("@ai-sdk/openai"),
    import("ai"),
  ]);
  const openai = createOpenAI({ apiKey });

  const result = await experimental_transcribe({
    model: openai.transcription(
      resolved.modelId as Parameters<typeof openai.transcription>[0],
    ),
    audio: req.audio,
    ...(req.language
      ? { providerOptions: { openai: { language: req.language } } }
      : {}),
  });

  return {
    text: result.text,
    segments: result.segments.map((s) => ({
      text: s.text,
      startSecond: s.startSecond,
      endSecond: s.endSecond,
    })),
    language: result.language,
    durationSeconds: result.durationInSeconds,
    providerId: "openai",
    modelId: resolved.modelId,
  };
}
