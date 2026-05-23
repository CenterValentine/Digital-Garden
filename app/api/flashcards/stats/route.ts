import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

// GET /api/flashcards/stats
//
// Per-state and per-deck aggregate counts for the user. Used by the
// dashboard header to show "12 due, 8 new" and by the deck-picker.
//
// Distinct from /api/flashcards/decks/tree:
//   - tree returns the deck records themselves with their counts attached
//   - stats returns only the counts, grouped by deckId and by state
//
// Designed to be cheap (groupBys, not per-deck queries). One call,
// stable shape — clients can poll this if they want a live header.
export async function GET() {
  try {
    const session = await requireAuth();
    const ownerId = session.user.id;
    const now = new Date();

    const [byState, byDeck, dueByDeck, totalDue] = await Promise.all([
      prisma.flashcard.groupBy({
        by: ["state"],
        where: { ownerId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.flashcard.groupBy({
        by: ["deckId"],
        where: { ownerId, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.flashcard.groupBy({
        by: ["deckId"],
        where: {
          ownerId,
          deletedAt: null,
          due: { lte: now },
          state: { notIn: ["suspended", "archived"] },
        },
        _count: { _all: true },
      }),
      prisma.flashcard.count({
        where: {
          ownerId,
          deletedAt: null,
          due: { lte: now },
          state: { notIn: ["suspended", "archived"] },
        },
      }),
    ]);

    const stateCounts: Record<string, number> = {};
    for (const row of byState) {
      stateCounts[row.state] = row._count._all;
    }

    const deckTotals = new Map<string, number>();
    for (const row of byDeck) {
      if (row.deckId) deckTotals.set(row.deckId, row._count._all);
    }
    const deckDue = new Map<string, number>();
    for (const row of dueByDeck) {
      if (row.deckId) deckDue.set(row.deckId, row._count._all);
    }

    return NextResponse.json({
      success: true,
      data: {
        // Global counts.
        totalCards: byState.reduce((acc, row) => acc + row._count._all, 0),
        totalDue,
        byState: stateCounts,
        // Per-deck counts (null deckId rolled up under "__unassigned").
        byDeck: Object.fromEntries(deckTotals.entries()),
        byDeckDue: Object.fromEntries(deckDue.entries()),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stats";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}
