/**
 * POST /api/ai/speech
 *
 * Ephemeral text-to-speech for "read aloud" (Audio subsystem). Synthesizes the
 * given text with the user's configured speech provider (BYOK via
 * `resolveSpeechGenRoute`) and streams the audio bytes straight back. Unlike
 * `generateAndStoreSpeech`, this NEVER persists a ContentNode — read-aloud is
 * throwaway playback.
 *
 * The client extracts narratable text (`extractReadableText`) and POSTs plain
 * text here, so this route has no block-awareness and is reused verbatim by the
 * browser-extension proxy.
 *
 * Body:  { text, voice?, providerId?, modelId?, format?, speed? }
 * Reply: raw audio bytes, `Content-Type` = the provider's mime (e.g. audio/mpeg)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { generateSpeech } from "@/lib/domain/ai/speech/generate";
import { resolveSpeechGenRoute } from "@/lib/domain/ai/speech/generate-and-store";
import {
  describeSpeechError,
  SPEECH_NO_KEY_MARKER,
  type SpeechFormat,
  type SpeechModelId,
  type SpeechProviderId,
} from "@/lib/domain/ai/speech/types";

/** Upper bound on a single read — guards cost/latency on a whole-doc read. */
const MAX_TTS_CHARS = 8000;

interface SpeechRequestBody {
  text?: string;
  voice?: string;
  providerId?: SpeechProviderId;
  modelId?: SpeechModelId;
  format?: SpeechFormat;
  speed?: number;
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const session = await requireAuth();
    userId = session.user.id;
  } catch {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request
    .json()
    .catch(() => null)) as SpeechRequestBody | null;

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { success: false, error: "Nothing to read — no narratable text." },
      { status: 400 },
    );
  }
  if (text.length > MAX_TTS_CHARS) {
    return NextResponse.json(
      {
        success: false,
        error: `Text too long to read in one request (${text.length} > ${MAX_TTS_CHARS} characters).`,
      },
      { status: 413 },
    );
  }

  // Resolve the user's configured speech route (saved → auto-discover → env).
  const resolved = await resolveSpeechGenRoute(userId, {
    providerId: body?.providerId ?? "openai",
    modelId: body?.modelId ?? "tts-1",
  });

  try {
    const result = await generateSpeech(
      {
        text,
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        voice: body?.voice ?? resolved.voice,
        language: resolved.language,
        format: body?.format ?? "mp3",
        speed: body?.speed,
        apiKey: resolved.apiKey,
      },
      userId,
    );

    const audio = Buffer.from(result.base64, "base64");
    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Length": String(audio.length),
        "Cache-Control": "no-store",
        "X-Speech-Provider": result.providerId,
        "X-Speech-Model": result.modelId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speech generation failed";
    // Missing-key is a setup problem (422 + actionable hint); everything else
    // is an upstream/provider failure (502).
    const status = message.includes(SPEECH_NO_KEY_MARKER) ? 422 : 502;
    return NextResponse.json(
      { success: false, error: describeSpeechError(error) },
      { status },
    );
  }
}
