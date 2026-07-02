/**
 * AI Speech Generation — Audio subsystem (Phase 1)
 *
 * Server-side text-to-speech across 3 providers. Each provider's API is
 * normalized into `SpeechGenResult` (base64 audio + mimeType).
 *
 * Provider APIs:
 *   OpenAI      — AI SDK `experimental_generateSpeech` + `.speech(model)` (native)
 *   ElevenLabs  — POST /v1/text-to-speech/{voiceId} (raw bytes)
 *   Google      — POST text:synthesize (base64 audioContent)
 *
 * Mirrors `lib/domain/ai/image/generate.ts`.
 */

import "server-only";
import {
  SPEECH_FORMAT_MIME,
  SPEECH_NO_KEY_MARKER,
  type SpeechFormat,
  type SpeechGenRequest,
  type SpeechGenResult,
  type SpeechProviderId,
} from "./types";

// ─── Main Entry Point ──────────────────────────────────────────

/**
 * Generate speech audio using the specified provider and model.
 *
 * Resolves API keys in priority order:
 *   1. Explicit `apiKey` in request — callers pass the user's BYOK key here.
 *   2. Environment variable fallback — when no Connection covers the provider.
 *
 * @throws Error if API key is missing or generation fails
 */
export async function generateSpeech(
  request: SpeechGenRequest,
  userId: string,
): Promise<SpeechGenResult> {
  // userId reserved for the planned Connections-based key lookup (parity
  // with generateImage).
  void userId;
  const apiKey = request.apiKey ?? getEnvKey(request.providerId);

  if (!apiKey) {
    throw new Error(
      `${SPEECH_NO_KEY_MARKER} "${request.providerId}". ` +
        `Set the matching environment variable or pass an apiKey in the request.`,
    );
  }

  const format = request.format ?? "mp3";

  return dispatchToProvider({ ...request, apiKey, format });
}

// ─── Environment Key Fallbacks ─────────────────────────────────

function getEnvKey(providerId: SpeechProviderId): string | undefined {
  const envMap: Record<SpeechProviderId, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
    google: process.env.GOOGLE_AI_API_KEY,
  };
  return envMap[providerId];
}

// ─── Provider Dispatch ─────────────────────────────────────────

interface ResolvedRequest extends SpeechGenRequest {
  apiKey: string;
  format: SpeechFormat;
}

async function dispatchToProvider(
  req: ResolvedRequest,
): Promise<SpeechGenResult> {
  switch (req.providerId) {
    case "openai":
      return generateOpenAI(req);
    case "elevenlabs":
      return generateElevenLabs(req);
    case "google":
      return generateGoogle(req);
    default:
      throw new Error(`Unsupported speech provider: ${req.providerId}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

// ─── OpenAI (tts-1 / tts-1-hd) — AI SDK native ─────────────────

async function generateOpenAI(
  req: ResolvedRequest,
): Promise<SpeechGenResult> {
  // Dynamic imports keep the SDK provider out of bundles that never hit
  // this path (mirrors the gateway image module's import pattern).
  const [{ createOpenAI }, { experimental_generateSpeech }] =
    await Promise.all([import("@ai-sdk/openai"), import("ai")]);

  const openai = createOpenAI({
    apiKey: req.apiKey,
    ...(req.apiBaseURL ? { baseURL: req.apiBaseURL } : {}),
  });

  const modelId = req.upstreamModelId ?? req.modelId;
  // OpenAI's speech endpoint requires a voice — default to "alloy" when the
  // caller (chat tool / auto-discovery) didn't pick one.
  const voice = req.voice ?? "alloy";
  const result = await experimental_generateSpeech({
    model: openai.speech(modelId as Parameters<typeof openai.speech>[0]),
    text: req.text,
    voice,
    outputFormat: req.format,
    ...(req.speed ? { speed: req.speed } : {}),
    ...(req.language ? { language: req.language } : {}),
  });

  return {
    base64: result.audio.base64,
    mimeType: result.audio.mediaType ?? SPEECH_FORMAT_MIME[req.format],
    providerId: req.providerId,
    modelId: req.modelId,
  };
}

// ─── ElevenLabs (direct REST) ──────────────────────────────────

async function generateElevenLabs(
  req: ResolvedRequest,
): Promise<SpeechGenResult> {
  const voiceId = req.voice ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel (default)

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": req.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: req.text,
        model_id: req.modelId,
        ...(req.language ? { language_code: req.language } : {}),
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail =
      (err as { detail?: { message?: string } | string }).detail;
    const message =
      typeof detail === "string" ? detail : detail?.message ?? res.statusText;
    throw new Error(`ElevenLabs speech generation failed: ${message}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  return {
    base64: buffer.toString("base64"),
    // ElevenLabs returns MPEG regardless of our catalog format list.
    mimeType: "audio/mpeg",
    providerId: req.providerId,
    modelId: req.modelId,
  };
}

// ─── Google Cloud Text-to-Speech (direct REST) ─────────────────

async function generateGoogle(
  req: ResolvedRequest,
): Promise<SpeechGenResult> {
  // Voice names encode their languageCode prefix (e.g. "en-US-Neural2-A").
  const voiceName = req.voice ?? "en-US-Neural2-A";
  const languageCode = voiceName.split("-").slice(0, 2).join("-") || "en-US";
  const audioEncoding = req.format === "wav" ? "LINEAR16" : "MP3";

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${req.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: req.text },
        voice: { languageCode, name: voiceName },
        audioConfig: {
          audioEncoding,
          ...(req.speed ? { speakingRate: req.speed } : {}),
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Google TTS generation failed: ${
        (err as { error?: { message?: string } }).error?.message ??
        res.statusText
      }`,
    );
  }

  const json = (await res.json()) as { audioContent: string };

  return {
    // Google returns base64 directly in `audioContent`.
    base64: json.audioContent,
    mimeType: req.format === "wav" ? "audio/wav" : "audio/mpeg",
    providerId: req.providerId,
    modelId: req.modelId,
  };
}
