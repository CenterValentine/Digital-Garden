/**
 * Database → Flashcard Deck auto-sync trigger
 *
 * POST /api/flashcards/from-data/sync   { tableId?: string }
 *
 * Reconciles the caller's database-derived decks against their tables'
 * current rows — scoped to one table when tableId is given, otherwise
 * all links. Staleness-gated server-side (see syncStaleDataDecks), so
 * calling this on every database-viewer open is cheap: a no-op unless
 * rows or columns actually changed since the last sync.
 *
 * The review queue route calls syncStaleDataDecks directly; this
 * endpoint exists for the client-side trigger (DataTableViewer fires it
 * fire-and-forget on load).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { syncStaleDataDecks } from "@/lib/domain/flashcards/from-data";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as {
      tableId?: string;
      deckId?: string;
      force?: boolean;
    };
    const tableId =
      typeof body.tableId === "string" && body.tableId.trim()
        ? body.tableId.trim()
        : undefined;
    const deckId =
      typeof body.deckId === "string" && body.deckId.trim()
        ? body.deckId.trim()
        : undefined;

    const result = await syncStaleDataDecks(session.user.id, {
      ...(tableId ? { tableId } : {}),
      ...(deckId ? { deckIds: [deckId] } : {}),
      // The deck-row button is an explicit user action — always reconcile.
      ...(body.force === true ? { force: true } : {}),
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync decks";
    const status = message.includes("Authentication") ? 401 : 500;
    return NextResponse.json(
      {
        success: false,
        error: { code: status === 401 ? "UNAUTHORIZED" : "SERVER_ERROR", message },
      },
      { status },
    );
  }
}
