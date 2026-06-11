/**
 * POST /api/flashcards/cards-from-media
 *
 * Mode C — "AI cards from uploaded media". For each uploaded image/audio the
 * user picked, an input-capable model EXAMINES it and forms one identification
 * card per the user's prompt: front = the uploaded media, back = the AI's
 * answer/label (+ optional detail). The inverse of identification-IMAGE cards
 * (which GENERATE an image front) — here the AI consumes media input.
 *
 * Capability is chosen by mediaType: image/* → vision, audio/* → audio-input.
 * Opt-in, fail-soft per item, capped. Clones generate-card-images' connection
 * resolution; the media already exists (no generation step for the media).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import {
  listConnections,
  getConnectionWithKey,
} from "@/lib/features/ai-connections";
import { createImageFrontDoc, createAudioFrontDoc } from "@/lib/domain/flashcards";

const MAX_CARDS = 6;

const bodySchema = z.object({
  items: z
    .array(z.object({ contentId: z.string().min(1) }))
    .min(1)
    .max(MAX_CARDS),
  prompt: z.string().min(1),
  connectionId: z.string().nullish(),
  modelId: z.string().nullish(),
});

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    const session = await requireAuth();
    userId = session.user.id;
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }
  const { items, prompt, connectionId, modelId } = parsed.data;

  // Resolve the input-capable model: the gate passes the chosen connection +
  // model; fall back to the chat feature route. The model must support vision
  // (images) / audio-input (audio) — the gate filters connections to those.
  const [{ generateObject }, { resolveChatModelFromConnection }, { resolvePrimaryRoute }] =
    await Promise.all([
      import("ai"),
      import("@/lib/domain/ai/providers/registry"),
      import("@/lib/domain/ai/features/router"),
    ]);

  let model;
  try {
    if (connectionId) {
      const conns = await listConnections(userId);
      const match = conns.find((c) => c.id === connectionId);
      if (match) {
        const withKey = await getConnectionWithKey(userId, match.id);
        model = await resolveChatModelFromConnection(withKey, modelId ?? match.models[0]?.id ?? "");
      }
    }
    if (!model) {
      const route = await resolvePrimaryRoute(userId, "chat");
      if (route) model = await resolveChatModelFromConnection(route.connection, route.modelId);
    }
  } catch {
    /* fall through — handled below */
  }
  if (!model) {
    return NextResponse.json(
      { success: false, error: "No input-capable model configured" },
      { status: 422 },
    );
  }

  const { getUserStorageProvider } = await import("@/lib/infrastructure/storage");
  const storageProvider = await getUserStorageProvider(userId);

  const results = await Promise.all(
    items.map(async ({ contentId }) => {
      try {
        const node = await prisma.contentNode.findFirst({
          where: { id: contentId, ownerId: userId, deletedAt: null },
          include: { filePayload: true },
        });
        const fp = node?.filePayload;
        if (!fp?.storageKey || !fp.mimeType) return { error: "Media not found" };

        const isImage = fp.mimeType.startsWith("image/");
        const isAudio = fp.mimeType.startsWith("audio/");
        if (!isImage && !isAudio) return { error: "Unsupported media type" };

        const url = await storageProvider.generateDownloadUrl(fp.storageKey);

        const { object } = await generateObject({
          model,
          schema: z.object({
            answer: z.string().describe("The identification / answer revealed on the back of the card."),
            detail: z.string().describe("Optional extra detail for the back. Empty string for none."),
          }),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    `Examine this ${isImage ? "image" : "sound"} and create one flashcard per the instruction. ` +
                    `Instruction: ${prompt}\n\n` +
                    `Return the answer (what's shown/heard) and an optional detail for the back.`,
                },
                { type: "file", data: new URL(url), mediaType: fp.mimeType },
              ],
            },
          ],
        });

        const back = [object.answer, object.detail].filter((s) => s && s.trim()).join("\n\n");
        const frontContent = isImage
          ? createImageFrontDoc(url, contentId, "")
          : createAudioFrontDoc(url, contentId, "", { autoplayOnFlip: true });

        return {
          front: isImage ? "Identify this image" : "Identify this sound",
          back,
          frontContent,
          frontMediaUrl: url,
          isFrontRichText: true,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Card generation failed",
        };
      }
    }),
  );

  return NextResponse.json({ success: true, data: { results } });
}
