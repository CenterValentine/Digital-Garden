/**
 * POST /api/flashcards/generate-card-images
 *
 * Client-triggered image generation for identification flashcard drafts.
 * propose_image_cards returns drafts (no images); after the proposal UI's
 * provider-choice window, the client calls this to generate the images with
 * the chosen (or default) provider. Returns a rich front (image + caption) per
 * card. Fail-soft per card. Capped at 5 (matches the propose-time limit).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { generateAndStoreImage } from "@/lib/domain/ai/image/generate-and-store";
import { createImageFrontDoc } from "@/lib/domain/flashcards";
import {
  listConnections,
  getConnectionWithKey,
} from "@/lib/features/ai-connections";
import type { ImageProviderId, ImageModelId } from "@/lib/domain/ai/image/types";

const MAX_CARDS = 5;

interface DraftInput {
  imagePrompt?: unknown;
  identifyLabel?: unknown;
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
    providerId?: string;
    modelId?: string;
  } | null;

  const cards = Array.isArray(body?.cards) ? body.cards.slice(0, MAX_CARDS) : [];
  if (cards.length === 0) {
    return NextResponse.json(
      { success: false, error: "No cards provided" },
      { status: 400 },
    );
  }

  // Per-request provider choice: resolve the chosen connection's key so it
  // wins over the saved default. Omitted → generateAndStoreImage uses the
  // user's configured default route.
  const providerId =
    typeof body?.providerId === "string" ? body.providerId : undefined;
  const modelId = typeof body?.modelId === "string" ? body.modelId : undefined;

  let chosenApiKey: string | undefined;
  if (providerId) {
    try {
      const conns = await listConnections(userId);
      const match = conns.find((c) => c.presetId === providerId);
      if (match) {
        const withKey = await getConnectionWithKey(userId, match.id);
        chosenApiKey = withKey.apiKey;
      }
    } catch {
      // Fall through — no key resolved; generation will use the default route.
    }
  }

  const results = await Promise.all(
    cards.map(async (card) => {
      const prompt =
        typeof card.imagePrompt === "string" ? card.imagePrompt : "";
      const label =
        typeof card.identifyLabel === "string" ? card.identifyLabel : "";
      if (!prompt) {
        return { error: "Missing image prompt" };
      }
      try {
        const img = await generateAndStoreImage({
          prompt,
          userId,
          providerId:
            chosenApiKey && providerId
              ? (providerId as ImageProviderId)
              : undefined,
          modelId:
            chosenApiKey && modelId ? (modelId as ImageModelId) : undefined,
          apiKey: chosenApiKey,
        });
        return {
          frontImageUrl: img.url,
          frontImageContentId: img.contentId,
          frontContent: createImageFrontDoc(img.url, img.contentId, label),
        };
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : "Image generation failed",
        };
      }
    }),
  );

  return NextResponse.json({ success: true, data: { results } });
}
