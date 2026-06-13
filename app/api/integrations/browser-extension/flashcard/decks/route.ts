import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const status = lowered.includes("token") || lowered.includes("auth") ? 401 : 500;
  return NextResponse.json({ success: false, error: { message } }, { status });
}

// Lean deck list for the overlay picker — just the fields needed to render
// a flat/grouped list and submit a deckId. No counts or aggregate data.
export async function GET(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);

    const decks = await prisma.flashcardDeck.findMany({
      where: { ownerId: token.user.id, deletedAt: null },
      select: { id: true, name: true, parentDeckId: true },
      orderBy: [{ path: "asc" }],
    });

    return NextResponse.json({ success: true, data: { decks } });
  } catch (error) {
    logger.error({ layer: "browser_ext", event: "flashcard_decks:caught", summary: "GET caught", error });
    return errorResponse(error, "Failed to load decks");
  }
}
