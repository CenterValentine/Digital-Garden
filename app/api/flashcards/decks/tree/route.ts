import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  FLASHCARD_DECK_SELECT,
  toFlashcardDeckRecordDto,
} from "@/lib/domain/flashcards";
import type { FlashcardDeckRecordDto } from "@/lib/domain/flashcards";

// GET /api/flashcards/decks/tree
//
// Returns the user's deck records (FK paradigm — flat array with
// parentDeckId so the client builds the tree) plus aggregate counts
// per deck: total cards, cards due now, cards in 'new' state.
//
// Soft-deleted decks are excluded. Soft-deleted cards are excluded from
// counts.
//
// Three Prisma queries (one for decks, three groupBys for counts) are
// the floor here; a single SQL with joined sub-aggregates would be
// faster but harder to maintain. Acceptable for v1 — deck counts are
// in the dozens, not thousands.
export async function GET() {
  try {
    const session = await requireAuth();
    const ownerId = session.user.id;
    const now = new Date();

    const [decks, cardCounts, dueCounts, newCounts] = await Promise.all([
      prisma.flashcardDeck.findMany({
        where: { ownerId, deletedAt: null },
        select: FLASHCARD_DECK_SELECT,
        orderBy: [{ path: "asc" }, { displayOrder: "asc" }],
      }),
      prisma.flashcard.groupBy({
        by: ["deckId"],
        where: { ownerId, deletedAt: null, deckId: { not: null } },
        _count: { _all: true },
      }),
      prisma.flashcard.groupBy({
        by: ["deckId"],
        where: {
          ownerId,
          deletedAt: null,
          deckId: { not: null },
          due: { lte: now },
          state: { notIn: ["suspended", "archived"] },
        },
        _count: { _all: true },
      }),
      prisma.flashcard.groupBy({
        by: ["deckId"],
        where: { ownerId, deletedAt: null, deckId: { not: null }, state: "new" },
        _count: { _all: true },
      }),
    ]);

    // Index aggregates by deckId for O(1) lookup during the join below.
    const cardCountByDeck = new Map<string, number>();
    for (const row of cardCounts) {
      if (row.deckId) cardCountByDeck.set(row.deckId, row._count._all);
    }
    const dueCountByDeck = new Map<string, number>();
    for (const row of dueCounts) {
      if (row.deckId) dueCountByDeck.set(row.deckId, row._count._all);
    }
    const newCountByDeck = new Map<string, number>();
    for (const row of newCounts) {
      if (row.deckId) newCountByDeck.set(row.deckId, row._count._all);
    }

    // childCount is derived from the deck list itself.
    const childCountByParent = new Map<string, number>();
    for (const deck of decks) {
      if (deck.parentDeckId) {
        childCountByParent.set(
          deck.parentDeckId,
          (childCountByParent.get(deck.parentDeckId) ?? 0) + 1,
        );
      }
    }

    const data: FlashcardDeckRecordDto[] = decks.map((deck) =>
      toFlashcardDeckRecordDto(deck, {
        childCount: childCountByParent.get(deck.id) ?? 0,
        cardCount: cardCountByDeck.get(deck.id) ?? 0,
        dueCount: dueCountByDeck.get(deck.id) ?? 0,
        newCount: newCountByDeck.get(deck.id) ?? 0,
      }),
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load deck tree";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}
