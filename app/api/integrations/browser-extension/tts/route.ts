/**
 * POST /api/integrations/browser-extension/tts
 *
 * Text-to-speech PROXY for the browser extension (Audio subsystem). The
 * extension highlights text and sends it here with its bearer token; the server
 * resolves THAT user's BYOK speech key, synthesizes, and streams audio back.
 *
 * Why a proxy and not a shared key: a provider key must NEVER ship into an MV3
 * extension (its storage/bundle is user-readable = leaked key). The key stays
 * encrypted server-side, scoped to the signed-in user, and metered through the
 * same Connection as the rest of the app. The extension only ever sees audio.
 *
 * The extension falls back to the browser's Web Speech API when offline or when
 * this route is unreachable — so this is the quality path, not the only path.
 *
 * Body:  { text, voice? }
 * Reply: raw audio bytes, `Content-Type` = the provider's mime (e.g. audio/mpeg)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { generateSpeech } from "@/lib/domain/ai/speech/generate";
import { resolveSpeechGenRoute } from "@/lib/domain/ai/speech/generate-and-store";
import {
  describeSpeechError,
  SPEECH_NO_KEY_MARKER,
} from "@/lib/domain/ai/speech/types";

/** Selections from a web page can be long — cap to bound cost/latency. */
const MAX_TTS_CHARS = 8000;

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    userId = token.user.id;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ success: false, error: message }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    text?: string;
    voice?: string;
  } | null;

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { success: false, error: "No text to read." },
      { status: 400 },
    );
  }
  const clipped = text.slice(0, MAX_TTS_CHARS);

  const resolved = await resolveSpeechGenRoute(userId, {
    providerId: "openai",
    modelId: "tts-1",
  });

  try {
    const result = await generateSpeech(
      {
        text: clipped,
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        voice: body?.voice ?? resolved.voice,
        language: resolved.language,
        format: "mp3",
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
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speech generation failed";
    // 422 = no provider configured (extension should fall back to Web Speech).
    const status = message.includes(SPEECH_NO_KEY_MARKER) ? 422 : 502;
    return NextResponse.json(
      { success: false, error: describeSpeechError(error) },
      { status },
    );
  }
}
