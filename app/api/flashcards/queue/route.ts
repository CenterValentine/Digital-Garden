import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  FLASHCARD_SELECT,
  toFlashcardDto,
} from "@/lib/domain/flashcards";

// The card row shape returned by FLASHCARD_SELECT — used for the
// empty-array fallback below so the type narrows correctly when one
// of the queries is short-circuited (limit 0).
type SelectedCard = Prisma.FlashcardGetPayload<{ select: typeof FLASHCARD_SELECT }>;

// GET /api/flashcards/queue?deckId=...&cardIds=a,b,c&limit=20&includeNew=true
//
// Returns cards due for review, ordered by FSRS priority:
//   1. Review-state cards that are overdue (lapses + age the hardest)
//   2. Learning / relearning cards that are due
//   3. New cards (limited so a session isn't drowned in 200 new cards)
//
// Filters:
//   - deckId: scope to one deck (and its descendants via path prefix)
//   - cardIds: scope to a specific subset (used by the editor block's
//     Play overlay when a block pins specific cards)
//   - includeNew=false: omit new-state cards (review-only session)
//
// Suspended and archived cards are always excluded — they're the user's
// explicit "hold" signal to the scheduler.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const ownerId = session.user.id;
    const { searchParams } = new URL(request.url);

    const limit = Math.min(
      Math.max(Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      200,
    );
    const includeNew = searchParams.get("includeNew") !== "false";
    const deckId = searchParams.get("deckId");
    const cardIdsParam = searchParams.get("cardIds");
    const cardIds = cardIdsParam ? cardIdsParam.split(",").filter(Boolean) : null;

    const now = new Date();

    // Resolve deck filter to deckId list. When a deckId is given we
    // include descendants too — Anki's "Spanish::Verbs::Irregular"
    // semantics: review against the leaf includes everything beneath.
    let deckIdFilter: string[] | null = null;
    if (deckId) {
      const root = await prisma.flashcardDeck.findFirst({
        where: { id: deckId, ownerId, deletedAt: null },
        select: { id: true, path: true },
      });
      if (!root) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "Deck not found." } },
          { status: 404 },
        );
      }
      const descendants = await prisma.flashcardDeck.findMany({
        where: {
          ownerId,
          deletedAt: null,
          OR: [{ id: root.id }, { path: { startsWith: `${root.path}/` } }],
        },
        select: { id: true },
      });
      deckIdFilter = descendants.map((d) => d.id);
    }

    const baseWhere: Prisma.FlashcardWhereInput = {
      ownerId,
      deletedAt: null,
      state: { notIn: ["suspended", "archived"] },
      ...(deckIdFilter ? { deckId: { in: deckIdFilter } } : {}),
      ...(cardIds ? { id: { in: cardIds } } : {}),
    };

    // Pull due (state != new, due <= now) and new cards separately so we
    // can apply a sensible cap on new cards even when many are eligible.
    // 20 new per session is a reasonable default — matches Anki's
    // out-of-box "new cards per day" setting.
    const NEW_PER_QUEUE_CAP = 20;
    const newLimit = includeNew ? Math.min(limit, NEW_PER_QUEUE_CAP) : 0;
    const reviewLimit = limit - newLimit;

    const [dueCards, newCards, debugAllInScope]: [
      SelectedCard[],
      SelectedCard[],
      Array<{ id: string; state: string; due: Date; deckId: string }>,
    ] = await Promise.all([
      reviewLimit > 0
        ? prisma.flashcard.findMany({
            where: {
              ...baseWhere,
              state: { in: ["learning", "review", "relearning"] },
              due: { lte: now },
            },
            select: FLASHCARD_SELECT,
            // Overdue first (smallest due first), then by last-reviewed
            // so the same card isn't shown twice in quick succession.
            orderBy: [{ due: "asc" }, { lastReviewedAt: "asc" }],
            take: reviewLimit,
          })
        : Promise.resolve<SelectedCard[]>([]),
      includeNew && newLimit > 0
        ? prisma.flashcard.findMany({
            where: { ...baseWhere, state: "new" },
            select: FLASHCARD_SELECT,
            // FIFO on new cards — the order they were added.
            orderBy: [{ createdAt: "asc" }],
            take: newLimit,
          })
        : Promise.resolve<SelectedCard[]>([]),
      // ─── DEBUG (temporary) — Sprint 6 follow-up bug: dueCount and
      // queue disagree on card visibility for the same deckId. Surface
      // every card in scope so we can see what state/due/deckId they
      // actually have. Remove this diagnostic once root cause is fixed.
      prisma.flashcard.findMany({
        where: { ownerId, deletedAt: null, ...(deckIdFilter ? { deckId: { in: deckIdFilter } } : {}) },
        select: { id: true, state: true, due: true, deckId: true },
        take: 25,
      }) as unknown as Promise<Array<{ id: string; state: string; due: Date; deckId: string }>>,
    ]);

    // ─── DEBUG log (temporary) ───────────────────────────────────────
    // Uses logger.warn (no-console lint rule). attrs are scalars only
    // per the PII firewall; the card-list array is serialized as a
    // single JSON-string attr for visibility.
    logger.warn({
      layer: "editor",
      event: "flashcards_queue:diagnostic",
      summary: "deck-count vs queue mismatch — scope dump",
      attrs: {
        requested_deck_id: deckId ?? "",
        resolved_deck_id_filter: (deckIdFilter ?? []).join(","),
        include_new: includeNew,
        limit,
        new_limit: newLimit,
        review_limit: reviewLimit,
        now_iso: now.toISOString(),
        due_cards_returned: dueCards.length,
        new_cards_returned: newCards.length,
        all_cards_in_scope_count: debugAllInScope.length,
        all_cards_in_scope_json: JSON.stringify(
          debugAllInScope.map((c) => ({
            id: c.id,
            state: c.state,
            due: c.due.toISOString(),
            deckId: c.deckId,
          })),
        ),
      },
    });

    const data = [...dueCards, ...newCards].map((card) => toFlashcardDto(card));

    return NextResponse.json({
      success: true,
      data,
      meta: {
        dueCount: dueCards.length,
        newCount: newCards.length,
        limit,
        // When a session asks "is there anything due RIGHT NOW," even an
        // empty queue is informative — caller can decide to show "all
        // caught up" UI rather than retry.
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load queue";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}
