/**
 * POST /api/flashcards/generate-card-audio
 *
 * Client-triggered text-to-speech for flashcard pronunciation (Mode A).
 * propose_pronunciation_cards returns drafts (term + language, no audio); after
 * the proposal UI's voice/provider window the client calls this to synthesize
 * each term with the chosen (or default) speech provider. Also serves the
 * per-card 🔊 "Generate pronunciation" button in the flashcard editor.
 *
 * Returns the stored audio ref per term (the caller attaches it to the card via
 * createAudioFrontDoc / appendAudioToDoc). Fail-soft per card. Capped at 10.
 *
 * Audio twin of generate-card-images/route.ts. There is no gateway branch — the
 * AI Gateway exposes no speech model, so speech routes directly to providers.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { generateAndStoreSpeech } from "@/lib/domain/ai/speech/generate-and-store";
import {
  listConnections,
  getConnectionWithKey,
} from "@/lib/features/ai-connections";
import type {
  SpeechProviderId,
  SpeechModelId,
} from "@/lib/domain/ai/speech/types";

const MAX_CARDS = 10;

interface DraftInput {
  term?: unknown;
  language?: unknown;
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

  const body = (await request.json().catch(() => null)) as {
    cards?: DraftInput[];
    connectionId?: string;
    modelId?: string;
    voice?: string;
    language?: string;
  } | null;

  const cards = Array.isArray(body?.cards) ? body.cards.slice(0, MAX_CARDS) : [];
  if (cards.length === 0) {
    return NextResponse.json(
      { success: false, error: "No cards provided" },
      { status: 400 },
    );
  }

  // Per-request route: the chosen connection (by id) + model + voice. Resolving
  // the connection's key lets it win over the saved default. Omitted →
  // generateAndStoreSpeech uses the user's configured default route / env.
  const connectionId =
    typeof body?.connectionId === "string" ? body.connectionId : undefined;
  const modelId = typeof body?.modelId === "string" ? body.modelId : undefined;
  const voice = typeof body?.voice === "string" ? body.voice : undefined;
  const batchLanguage =
    typeof body?.language === "string" ? body.language : undefined;

  let chosenApiKey: string | undefined;
  let chosenPresetId: string | undefined;
  if (connectionId) {
    try {
      const conns = await listConnections(userId);
      const match = conns.find((c) => c.id === connectionId);
      if (match) {
        const withKey = await getConnectionWithKey(userId, match.id);
        chosenApiKey = withKey.apiKey;
        chosenPresetId = match.presetId ?? undefined;
      }
    } catch {
      // Fall through — no key resolved; generation uses the default route.
    }
  }

  const results = await Promise.all(
    cards.map(async (card) => {
      const term = typeof card.term === "string" ? card.term.trim() : "";
      const language =
        typeof card.language === "string" ? card.language : batchLanguage;
      if (!term) {
        return { error: "Missing term" };
      }
      try {
        const speech = await generateAndStoreSpeech({
          text: term,
          userId,
          label: term,
          voice,
          language,
          providerId:
            chosenApiKey && chosenPresetId
              ? (chosenPresetId as SpeechProviderId)
              : undefined,
          modelId:
            chosenApiKey && modelId ? (modelId as SpeechModelId) : undefined,
          apiKey: chosenApiKey,
        });
        return {
          term,
          audioUrl: speech.url,
          audioContentId: speech.contentId,
        };
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : "Speech generation failed",
        };
      }
    }),
  );

  return NextResponse.json({ success: true, data: { results } });
}
