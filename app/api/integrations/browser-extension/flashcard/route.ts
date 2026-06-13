import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import {
  createTextTiptapDoc,
  sanitizeFlashcardLabel,
} from "@/lib/domain/flashcards";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const status = lowered.includes("token") || lowered.includes("auth") ? 401 : 500;
  return NextResponse.json({ success: false, error: { message } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const userId = token.user.id;

    const body = (await request.json()) as Record<string, unknown>;
    const frontText = typeof body.frontText === "string" ? body.frontText.trim() : "";
    const backText = typeof body.backText === "string" ? body.backText.trim() : "";
    const deckId = typeof body.deckId === "string" ? body.deckId.trim() : "";
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : null;
    const sourceTitle = typeof body.sourceTitle === "string" ? body.sourceTitle.trim() : null;

    if (!frontText) {
      return NextResponse.json(
        { success: false, error: { message: "frontText is required" } },
        { status: 400 },
      );
    }
    if (!backText) {
      return NextResponse.json(
        { success: false, error: { message: "backText is required" } },
        { status: 400 },
      );
    }
    if (!deckId) {
      return NextResponse.json(
        { success: false, error: { message: "deckId is required" } },
        { status: 400 },
      );
    }

    const deck = await prisma.flashcardDeck.findFirst({
      where: { id: deckId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!deck) {
      return NextResponse.json(
        { success: false, error: { message: "Deck not found" } },
        { status: 400 },
      );
    }

    const frontContent = createTextTiptapDoc(frontText);
    const backContent = createTextTiptapDoc(backText);

    const card = await prisma.flashcard.create({
      data: {
        ownerId: userId,
        deckId: deck.id,
        frontLabel: sanitizeFlashcardLabel("Question", "Question"),
        backLabel: sanitizeFlashcardLabel("Answer", "Answer"),
        isFrontRichText: false,
        frontContent: frontContent as unknown as Prisma.InputJsonValue,
        backContent: backContent as unknown as Prisma.InputJsonValue,
        // sourceUrl/sourceTitle: no DB column yet — preserved in the audit log above.
      },
      select: { id: true },
    });

    logger.info({
      layer: "browser_ext",
      event: "flashcard:created",
      summary: "Flashcard created from browser extension selection",
      attrs: { card_id: card.id, deck_id: deck.id, source_url: sourceUrl, source_title: sourceTitle },
    });

    return NextResponse.json({ success: true, data: { id: card.id } }, { status: 201 });
  } catch (error) {
    logger.error({ layer: "browser_ext", event: "flashcard:create:caught", summary: "POST caught", error });
    return errorResponse(error, "Failed to create flashcard");
  }
}
