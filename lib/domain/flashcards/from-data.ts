/**
 * Database → Flashcard Deck conversion + auto-sync (server only).
 *
 * One reconcile, three callers: the conversion route (initial run from
 * the dialog), the sync endpoint (database viewer open), and the review
 * queue route (deck open). All three run the SAME full reconcile:
 *
 *   - new rows            → new cards
 *   - edited rows         → content-only card updates (FSRS state, and
 *                           therefore review progress, is never touched)
 *   - unchanged rows      → skipped
 *   - deleted rows        → their cards stay ACTIVE (owner decision
 *                           2026-08-28: review history beats mirroring)
 *
 * Identity: each card stores its source DataRow.id in Flashcard.noteId
 * (both UUIDs; noteId is a free grouping key with no FK), matched by
 * (deckId, noteId).
 *
 * The link that makes sync possible — {tableId, columns, deckId} — is
 * PER-USER (decks are user-owned), so it lives in user settings under
 * flashcards.dataDeckLinks (schema: lib/features/settings/validation.ts),
 * the same home as lastUsedDeckPath. No migration.
 *
 * Sync is staleness-gated: a link re-reconciles only when some row or
 * column of its table changed after lastSyncedAt (query-mode tables are
 * always treated as stale — their rows are ContentNodes, no cheap diff).
 * The stamp is taken BEFORE rows are read, so edits that race a sync are
 * caught by the next one instead of lost.
 *
 * No umbrella transaction, deliberately: the reconcile is idempotent
 * (a partial failure heals on the next run), 10k sequential inserts
 * would blow the interactive-transaction timeout, and chunked
 * createMany stays under the Postgres bind-parameter limit.
 */

import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";
import {
  createTextTiptapDoc,
  extractPlainTextFromTiptap,
  sanitizeFlashcardLabel,
} from "./content";
import { ensureDeckPath } from "./legacy-compat";
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
import type { DataRow, DataTableMode } from "@/lib/domain/data";
import {
  getUserSettings,
  updateUserSettings,
} from "@/lib/features/settings/operations";

/** Same design-scale ceiling as CSV export (plan D1: ≤10k rows). */
export const DATA_DECK_ROW_CAP = 10_000;

/** createMany chunk size — ~9 bind params per card, comfortably under 65535. */
const CREATE_CHUNK = 500;

/** Mirrors the .max(100) on flashcards.dataDeckLinks in the settings schema. */
const MAX_DATA_DECK_LINKS = 100;

/** Shape must stay structurally identical to the Zod entry in validation.ts. */
export interface DataDeckLink {
  tableId: string;
  deckId: string;
  deckPath: string;
  frontColumnId: string;
  backColumnId: string;
  tableMode: DataTableMode;
  lastSyncedAt?: string;
}

export interface DataDeckSyncResult {
  deckId: string;
  deckPath: string;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  totalRows: number;
}

/**
 * Flat result rather than a discriminated union: tsconfig has
 * `strict: false`, and without strictNullChecks the compiler does not
 * narrow a union by its boolean discriminant — `if (!outcome.ok)` leaves
 * `outcome.code` unreachable. Optional fields + runtime guards are the
 * shape this compiler configuration actually supports.
 */
export interface DataDeckOutcome {
  ok: boolean;
  /** Set when ok is false. */
  code?: "NOT_FOUND" | "INVALID_INPUT" | "NO_CARDS";
  message?: string;
  /** Set when ok is true. */
  tableMode?: DataTableMode;
  result?: DataDeckSyncResult;
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

export async function reconcileDataDeck(
  userId: string,
  args: {
    tableId: string;
    frontColumnId: string;
    backColumnId: string;
    /** Initial conversion: a user-typed path, find-or-created. */
    deckPath?: string;
    /** Re-sync: the already-linked deck. Wins over deckPath. */
    deckId?: string;
  },
): Promise<DataDeckOutcome> {
  // Mirror GET /api/content/data/[id]: 404 rather than 403 — confirming
  // a table exists is itself a disclosure to a caller with no access.
  const level = await resolveDataTableAccess(args.tableId, userId);
  if (!canRead(level)) {
    return { ok: false, code: "NOT_FOUND", message: "Database not found." };
  }
  const table = await loadTable(args.tableId, userId);
  if (!table) {
    return { ok: false, code: "NOT_FOUND", message: "Database not found." };
  }

  // Resolve columns BEFORE rows: a deleted linked column should be a
  // one-query early-out, not a 10k-row load followed by a shrug.
  const columns =
    table.mode === "query"
      ? buildQueryColumns()
      : table.columns.filter((c) => !c.deletedAt);
  const frontColumn = columns.find((c) => c.id === args.frontColumnId);
  const backColumn = columns.find((c) => c.id === args.backColumnId);
  if (!frontColumn || !backColumn) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Selected column no longer exists on this database.",
    };
  }

  // Same load shape as exportDatabaseCsv — the one other "whole table,
  // display-ready" consumer.
  let rows: DataRow[];
  if (table.mode === "query") {
    const node = await prisma.contentNode.findUnique({
      where: { id: args.tableId },
      select: { ownerId: true },
    });
    rows =
      table.query && node
        ? await loadQueryRows(node.ownerId, userId, table.query, DATA_DECK_ROW_CAP)
        : [];
  } else {
    const page = await loadRowPage({
      tableId: args.tableId,
      view: resolveView(table, null),
      columns,
      limit: DATA_DECK_ROW_CAP,
      viewerId: userId,
    });
    rows = page.rows;
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
    return {
      ok: false,
      code: "NO_CARDS",
      message:
        "No rows have values in both selected columns — nothing to convert.",
    };
  }

  const frontLabel = sanitizeFlashcardLabel(frontColumn.name, "Question");
  const backLabel = sanitizeFlashcardLabel(backColumn.name, "Answer");

  let deckId: string;
  let path: string;
  if (args.deckId) {
    const deck = await prisma.flashcardDeck.findFirst({
      where: { id: args.deckId, ownerId: userId, deletedAt: null },
      select: { id: true, path: true },
    });
    if (!deck) {
      return { ok: false, code: "NOT_FOUND", message: "Deck not found." };
    }
    deckId = deck.id;
    path = deck.path;
  } else if (args.deckPath) {
    try {
      ({ deckId, path } = await ensureDeckPath(userId, args.deckPath));
    } catch (err) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: err instanceof Error ? err.message : "Invalid deck path.",
      };
    }
  } else {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "deckPath or deckId is required.",
    };
  }

  // Reconcile against cards from earlier runs: noteId carries the
  // source DataRow.id, scoped to this deck.
  const existing = await prisma.flashcard.findMany({
    where: {
      ownerId: userId,
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
        ownerId: userId,
        sourceContentId: args.tableId,
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

  return {
    ok: true,
    tableMode: table.mode,
    result: {
      deckId,
      deckPath: path,
      created: toCreate.length,
      updated: toUpdate.length,
      unchanged,
      skipped,
      totalRows: rows.length,
    },
  };
}

// ─── Link persistence (user settings) ────────────────────────────

export async function getDataDeckLinks(userId: string): Promise<DataDeckLink[]> {
  const settings = await getUserSettings(userId);
  return settings.flashcards?.dataDeckLinks ?? [];
}

/** Upsert by (tableId, deckId); newest links win the cap. */
export async function saveDataDeckLink(
  userId: string,
  link: DataDeckLink,
): Promise<void> {
  const links = await getDataDeckLinks(userId);
  const rest = links.filter(
    (l) => !(l.tableId === link.tableId && l.deckId === link.deckId),
  );
  const next = [...rest, link].slice(-MAX_DATA_DECK_LINKS);
  await updateUserSettings(userId, { flashcards: { dataDeckLinks: next } });
}

// ─── Auto-sync ───────────────────────────────────────────────────

/**
 * Did any row or column of this table change after the link's stamp?
 * Row edits and soft-deletes both bump DataRow.updatedAt; column renames
 * bump DataColumn.updatedAt (they change the card labels). Query-mode
 * tables always count as stale — their rows are ContentNodes and there's
 * no cheap per-table diff.
 */
async function tableChangedSince(link: DataDeckLink): Promise<boolean> {
  if (!link.lastSyncedAt) return true;
  if (link.tableMode === "query") return true;
  const since = new Date(link.lastSyncedAt);
  if (Number.isNaN(since.getTime())) return true;
  const [row, column] = await Promise.all([
    prisma.dataRow.findFirst({
      where: { tableId: link.tableId, updatedAt: { gt: since } },
      select: { id: true },
    }),
    prisma.dataColumn.findFirst({
      where: { tableId: link.tableId, updatedAt: { gt: since } },
      select: { id: true },
    }),
  ]);
  return Boolean(row ?? column);
}

/**
 * Reconcile every link in scope whose table changed since its stamp.
 * Failures are isolated per link — one broken table never blocks the
 * rest, and callers (the review queue especially) treat the whole call
 * as best-effort. Links whose table or deck no longer exists are pruned.
 */
export async function syncStaleDataDecks(
  userId: string,
  scope: { deckIds?: string[]; tableId?: string } = {},
): Promise<{ checked: number; synced: number }> {
  const links = await getDataDeckLinks(userId);
  const inScope = links.filter(
    (l) =>
      (scope.tableId ? l.tableId === scope.tableId : true) &&
      (scope.deckIds ? scope.deckIds.includes(l.deckId) : true),
  );
  if (inScope.length === 0) return { checked: 0, synced: 0 };

  const keyOf = (l: DataDeckLink) => `${l.tableId}::${l.deckId}`;
  const restamped = new Map<string, DataDeckLink>();
  const dropped = new Set<string>();
  let synced = 0;

  for (const link of inScope) {
    try {
      if (!(await tableChangedSince(link))) continue;
      // Stamp BEFORE reading: edits racing this sync land after the
      // stamp and get picked up next time instead of lost.
      const startedAt = new Date().toISOString();
      const outcome = await reconcileDataDeck(userId, {
        tableId: link.tableId,
        frontColumnId: link.frontColumnId,
        backColumnId: link.backColumnId,
        deckId: link.deckId,
      });
      if (outcome.ok) {
        restamped.set(keyOf(link), { ...link, lastSyncedAt: startedAt });
        synced += 1;
      } else if (outcome.code === "NO_CARDS") {
        // All rows blank on a linked column — benign; stamp so the
        // staleness gate doesn't re-load the table every open.
        restamped.set(keyOf(link), { ...link, lastSyncedAt: startedAt });
      } else if (outcome.code === "NOT_FOUND") {
        // Table or deck is gone — nothing left to connect. Prune.
        dropped.add(keyOf(link));
      }
      // INVALID_INPUT (a linked column was deleted): keep the link and
      // keep skipping cheaply — re-running the dialog with new columns
      // overwrites it.
    } catch {
      // Isolated: a failing table must not block sibling links or the
      // caller's review session.
    }
  }

  if (restamped.size > 0 || dropped.size > 0) {
    const next = links
      .filter((l) => !dropped.has(keyOf(l)))
      .map((l) => restamped.get(keyOf(l)) ?? l);
    await updateUserSettings(userId, { flashcards: { dataDeckLinks: next } });
  }
  return { checked: inScope.length, synced };
}
