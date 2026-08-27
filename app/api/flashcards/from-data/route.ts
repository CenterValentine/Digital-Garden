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
 * Re-running is a SYNC, not a duplicate-import: each card stores its
 * source row's id in `noteId` (both are UUIDs; `noteId` is a free
 * grouping key with no FK), so a second run matches cards by
 * (deckId, noteId) and updates changed rows in place. The database
 * wins on conflict — content fields are overwritten, but FSRS
 * scheduling state is untouched, so fixing a typo in a row never
 * resets that card's review progress.
 *
 * Deliberately NOT wrapped in one umbrella transaction: the operation
 * is idempotent (a partial failure heals on re-run), 10k sequential
 * inserts would blow the interactive-transaction timeout, and chunked
 * createMany keeps us under the Postgres bind-parameter limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  createTextTiptapDoc,
  extractPlainTextFromTiptap,
  sanitizeFlashcardLabel,
} from "@/lib/domain/flashcards";
import { ensureDeckPath } from "@/lib/domain/flashcards/legacy-compat";
import {
  loadRowPage,
  loadTable,
  resolveView,
} from "@/lib/domain/data/server/queries";
import {
  buildQueryColumns,
  loadQueryRows,
} from "@/lib/domain/data/server/query-mode";
import {
  canRead,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";
import { cellDisplayValue } from "@/lib/domain/data/server/export";
import type { DataColumn, DataRow } from "@/lib/domain/data";

/** Same design-scale ceiling as CSV export (plan D1: ≤10k rows). */
const ROW_CAP = 10_000;

/** createMany chunk size — ~9 bind params per card, comfortably under 65535. */
const CREATE_CHUNK = 500;

interface FromDataBody {
  contentId?: string;
  frontColumnId?: string;
  backColumnId?: string;
  deckPath?: string;
}

/**
 * extractPlainTextFromTiptap collapses internal whitespace runs to single
 * spaces; the raw cell value doesn't. Compare through the same collapse on
 * BOTH sides, or multi-line cells read as "changed" on every re-sync
 * forever. The raw value (newlines intact) is still what gets written.
 */
function collapseWs(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

    // Mirror GET /api/content/data/[id]: 404 rather than 403 — confirming
    // a table exists is itself a disclosure to a caller with no access.
    const level = await resolveDataTableAccess(contentId, session.user.id);
    if (!canRead(level)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Database not found." },
        },
        { status: 404 },
      );
    }
    const table = await loadTable(contentId, session.user.id);
    if (!table) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Database not found." },
        },
        { status: 404 },
      );
    }

    // Same load shape as exportDatabaseCsv — the one other "whole table,
    // display-ready" consumer.
    let columns: DataColumn[];
    let rows: DataRow[];
    if (table.mode === "query") {
      columns = buildQueryColumns();
      const node = await prisma.contentNode.findUnique({
        where: { id: contentId },
        select: { ownerId: true },
      });
      rows =
        table.query && node
          ? await loadQueryRows(node.ownerId, session.user.id, table.query, ROW_CAP)
          : [];
    } else {
      columns = table.columns.filter((c) => !c.deletedAt);
      const page = await loadRowPage({
        tableId: contentId,
        view: resolveView(table, null),
        columns,
        limit: ROW_CAP,
        viewerId: session.user.id,
      });
      rows = page.rows;
    }

    const frontColumn = columns.find((c) => c.id === frontColumnId);
    const backColumn = columns.find((c) => c.id === backColumnId);
    if (!frontColumn || !backColumn) {
      return invalid("Selected column no longer exists on this database.");
    }

    const faces: Array<{ rowId: string; front: string; back: string }> = [];
    let skipped = 0;
    for (const row of rows) {
      const front = cellDisplayValue(row, frontColumn).trim();
      const back = cellDisplayValue(row, backColumn).trim();
      if (!front || !back) {
        skipped += 1;
        continue;
      }
      faces.push({ rowId: row.id, front, back });
    }
    if (faces.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NO_CARDS",
            message:
              "No rows have values in both selected columns — nothing to convert.",
          },
        },
        { status: 400 },
      );
    }

    const frontLabel = sanitizeFlashcardLabel(frontColumn.name, "Question");
    const backLabel = sanitizeFlashcardLabel(backColumn.name, "Answer");

    // Find-or-create the deck chain; idempotent, backed by the
    // (ownerId, path) unique constraint.
    const { deckId, path } = await ensureDeckPath(session.user.id, deckPath);

    // Reconcile against cards from earlier runs: noteId carries the
    // source DataRow.id, scoped to this deck.
    const existing = await prisma.flashcard.findMany({
      where: {
        ownerId: session.user.id,
        deckId,
        noteId: { in: faces.map((f) => f.rowId) },
        deletedAt: null,
      },
      select: {
        id: true,
        noteId: true,
        frontContent: true,
        backContent: true,
        frontLabel: true,
        backLabel: true,
      },
    });
    const byRowId = new Map(
      existing.filter((c) => c.noteId).map((c) => [c.noteId as string, c]),
    );

    const toCreate: Array<{ rowId: string; front: string; back: string }> = [];
    const toUpdate: Array<{ cardId: string; front: string; back: string }> = [];
    let unchanged = 0;
    for (const face of faces) {
      const match = byRowId.get(face.rowId);
      if (!match) {
        toCreate.push(face);
        continue;
      }
      // Text-level comparison, not JSON equality: JSONB reorders keys,
      // and a hand-formatted card whose TEXT still matches its row
      // should be left alone.
      const same =
        collapseWs(extractPlainTextFromTiptap(match.frontContent)) ===
          collapseWs(face.front) &&
        collapseWs(extractPlainTextFromTiptap(match.backContent)) ===
          collapseWs(face.back) &&
        match.frontLabel === frontLabel &&
        match.backLabel === backLabel;
      if (same) {
        unchanged += 1;
      } else {
        toUpdate.push({ cardId: match.id, front: face.front, back: face.back });
      }
    }

    for (let i = 0; i < toCreate.length; i += CREATE_CHUNK) {
      const chunk = toCreate.slice(i, i + CREATE_CHUNK);
      await prisma.flashcard.createMany({
        data: chunk.map((face) => ({
          ownerId: session.user.id,
          sourceContentId: contentId,
          deckId,
          noteId: face.rowId,
          frontLabel,
          backLabel,
          frontContent: createTextTiptapDoc(
            face.front,
          ) as unknown as Prisma.InputJsonValue,
          backContent: createTextTiptapDoc(
            face.back,
          ) as unknown as Prisma.InputJsonValue,
          isFrontRichText: false,
        })),
      });
    }

    // Updates touch content/labels only — never the FSRS columns, so
    // review progress survives a re-sync.
    for (const item of toUpdate) {
      await prisma.flashcard.update({
        where: { id: item.cardId },
        data: {
          frontContent: createTextTiptapDoc(
            item.front,
          ) as unknown as Prisma.InputJsonValue,
          backContent: createTextTiptapDoc(
            item.back,
          ) as unknown as Prisma.InputJsonValue,
          isFrontRichText: false,
          frontLabel,
          backLabel,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          deckId,
          deckPath: path,
          created: toCreate.length,
          updated: toUpdate.length,
          unchanged,
          skipped,
          totalRows: rows.length,
        },
      },
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
