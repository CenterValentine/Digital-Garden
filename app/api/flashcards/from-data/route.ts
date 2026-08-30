/**
 * Database → Flashcard Deck Conversion
 *
 * POST /api/flashcards/from-data
 *
 * Turns two columns of a data table into a flashcard deck: the front
 * column becomes each card's question side, the back column its answer
 * side, with the column NAMES as the card labels. One card per row;
 * rows blank on either side are skipped.
 *
 * A successful run also persists a {table, columns, deck} link in user
 * settings, which powers auto-sync-on-open: the review queue and the
 * database viewer reconcile the deck against the table's current rows.
 * The reconcile itself (row↔card identity via noteId, FSRS-preserving
 * updates, chunked creates) lives in lib/domain/flashcards/from-data.ts
 * — one code path shared by this route, the sync endpoint, and the queue.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  getDataDeckLinks,
  reconcileDataDeck,
  saveDataDeckLink,
} from "@/lib/domain/flashcards/from-data";

/**
 * GET /api/flashcards/from-data — the caller's database→deck links.
 * Powers the client-side link cache (state/data-deck-links-store.ts):
 * dynamic "Create vs Sync" labels, the deck-row sync button, and the
 * dialog's prefill.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const links = await getDataDeckLinks(session.user.id);
    return NextResponse.json({ success: true, data: links });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load deck links";
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

interface FromDataBody {
  contentId?: string;
  frontColumnId?: string;
  backColumnId?: string;
  deckPath?: string;
}

function invalid(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "INVALID_INPUT", message } },
    { status: 400 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as FromDataBody;

    const contentId =
      typeof body.contentId === "string" ? body.contentId.trim() : "";
    const frontColumnId =
      typeof body.frontColumnId === "string" ? body.frontColumnId.trim() : "";
    const backColumnId =
      typeof body.backColumnId === "string" ? body.backColumnId.trim() : "";
    const deckPath =
      typeof body.deckPath === "string" ? body.deckPath.trim() : "";

    if (!contentId || !frontColumnId || !backColumnId || !deckPath) {
      return invalid(
        "contentId, frontColumnId, backColumnId and deckPath are required.",
      );
    }
    if (frontColumnId === backColumnId) {
      return invalid("Front and back must be different columns.");
    }

    // Stamp before reading, so rows edited while the conversion runs are
    // caught by the first auto-sync instead of lost behind the stamp.
    const startedAt = new Date().toISOString();
    const outcome = await reconcileDataDeck(session.user.id, {
      tableId: contentId,
      frontColumnId,
      backColumnId,
      deckPath,
    });
    if (!outcome.ok || !outcome.result) {
      const status = outcome.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: outcome.code ?? "SERVER_ERROR",
            message: outcome.message ?? "Failed to create deck from database",
          },
        },
        { status },
      );
    }

    await saveDataDeckLink(session.user.id, {
      tableId: contentId,
      deckId: outcome.result.deckId,
      deckPath: outcome.result.deckPath,
      frontColumnId,
      backColumnId,
      tableMode: outcome.tableMode ?? "inline",
      lastSyncedAt: startedAt,
    });

    return NextResponse.json(
      { success: true, data: outcome.result },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create deck from database";
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
