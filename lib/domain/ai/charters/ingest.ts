/**
 * Charter ingestion (ITERATION-RUN-HARNESS-FIXES §10 round 5, owner decision
 * 2026-09-30: "I'd prefer AI just ingested the whole database").
 *
 * A charter line `Ingest in full: [[Career Evidence Library]]` loads that
 * database — every row, every column — AND every table its relation columns
 * point at, into the charter's context. The model reads the profile instead
 * of choosing what to read: prod 36237eb8 read the evidence index, a third
 * of Experiences and none of Claims and metrics, and so never saw the
 * strongest support metric the candidate has.
 *
 * Placement: the section is appended to the charter context, which sits in
 * the system prompt — the same on every request of a turn (one prompt per
 * turn) and cached after the first step. Forward relations only: a table
 * that merely points AT the named one (a backlink) is not pulled in, so the
 * job library that links to the evidence never rides along.
 */

import "server-only";

import { prisma } from "@/lib/database/client";
import { loadRowPage, loadTable } from "@/lib/domain/data/server/queries";
import {
  allBulkColumns,
  formatRows,
  isBacklink,
} from "@/lib/domain/data/read-format";
import type { DataRow } from "@/lib/domain/data/types";
import {
  resolveCharterReferencedTables,
  type ParsedCharter,
} from "./parse";

/** The whole ingestion's ceiling. A profile past it is cut with a note, never silently. */
export const INGEST_MAX_TOKENS = 60_000;
/** Rows per page while loading a table in full. */
const PAGE = 100;
/** Hard stop on rows per table (design scale is far below this). */
const MAX_ROWS_PER_TABLE = 2_000;

export interface IngestedTable {
  id: string;
  title: string;
  rows: number;
  tokens: number;
  /** Set when the ceiling cut this table short. */
  truncatedAfter?: number;
  /** The table this one was reached from, when linked. */
  linkedFrom?: string;
}

export interface CharterIngest {
  text: string;
  tokens: number;
  tables: IngestedTable[];
}

async function loadAllRows(tableId: string, userId: string, columns: Parameters<typeof loadRowPage>[0]["columns"]): Promise<DataRow[]> {
  const rows: DataRow[] = [];
  let cursor: Parameters<typeof loadRowPage>[0]["cursor"] = null;
  do {
    const page = await loadRowPage({ tableId, view: null, columns, cursor, limit: PAGE, viewerId: userId });
    rows.push(...page.rows);
    cursor = page.nextCursor;
  } while (cursor && rows.length < MAX_ROWS_PER_TABLE);
  return rows;
}

/**
 * Build the "Ingested in full" section for a parsed charter, or null when it
 * names nothing to ingest (or nothing it names resolves to the user's data).
 */
export async function buildCharterIngest(
  userId: string,
  parsed: ParsedCharter,
): Promise<CharterIngest | null> {
  const refs = parsed.ingest ?? [];
  if (refs.length === 0) return null;

  const ids = refs.map((r) => r.targetId).filter((id): id is string => !!id);
  const titles = [...new Set(refs.map((r) => r.targetTitle.trim()))];
  const dataNodes = await prisma.contentNode.findMany({
    where: {
      ownerId: userId,
      contentType: "data",
      deletedAt: null,
      OR: [
        ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
        { title: { in: titles, mode: "insensitive" as const } },
      ],
    },
    select: { id: true, title: true },
  });
  const roots = resolveCharterReferencedTables(refs, dataNodes);
  if (roots.length === 0) return null;

  // Roots first, then each root's forward-linked tables, in column order.
  const order: Array<{ id: string; linkedFrom?: string }> = roots.map((id) => ({ id }));
  const schemas = new Map<string, NonNullable<Awaited<ReturnType<typeof loadTable>>>>();
  for (const { id } of [...order]) {
    const table = await loadTable(id, userId);
    if (!table) continue;
    schemas.set(id, table);
    for (const column of table.columns) {
      const target = column.config.relationTableId;
      if (column.type !== "relation" || isBacklink(column) || !target) continue;
      if (order.some((o) => o.id === target)) continue;
      order.push({ id: target, linkedFrom: id });
    }
  }
  // Linked tables are read only when they are the user's own live data.
  const owned = new Set(
    (
      await prisma.contentNode.findMany({
        where: { id: { in: order.map((o) => o.id) }, ownerId: userId, contentType: "data", deletedAt: null },
        select: { id: true },
      })
    ).map((n) => n.id),
  );
  const titleOf = new Map(
    (
      await prisma.contentNode.findMany({
        where: { id: { in: [...owned] } },
        select: { id: true, title: true },
      })
    ).map((n) => [n.id, n.title]),
  );

  const sections: string[] = [];
  const tables: IngestedTable[] = [];
  let spent = 0;
  for (const { id, linkedFrom } of order) {
    if (!owned.has(id)) continue;
    const table = schemas.get(id) ?? (await loadTable(id, userId));
    if (!table) continue;
    const live = table.columns.filter((c) => !c.deletedAt);
    const rows = await loadAllRows(id, userId, live);
    const title = titleOf.get(id) ?? "Untitled database";
    const render = {
      relations: "titles" as const,
      clipChars: null,
      maxLinkedTitles: 50,
      linkedTitleClip: 80,
    };
    let shown = rows;
    let formatted = formatRows({ rows: shown, columns: allBulkColumns(live), live, render });
    let truncatedAfter: number | undefined;
    if (spent + formatted.tokens > INGEST_MAX_TOKENS) {
      // Keep the largest prefix that fits; say what was left out.
      const room = Math.max(0, INGEST_MAX_TOKENS - spent);
      const perRow = formatted.tokens / Math.max(1, rows.length);
      const fits = Math.max(0, Math.floor(room / Math.max(1, perRow)));
      shown = rows.slice(0, fits);
      formatted = formatRows({ rows: shown, columns: allBulkColumns(live), live, render });
      truncatedAfter = shown.length;
    }
    spent += formatted.tokens;
    const via = linkedFrom ? ` · linked from ${titleOf.get(linkedFrom) ?? "the table above"}` : "";
    const cut =
      truncatedAfter !== undefined
        ? `\n[Ingestion ceiling reached — ${rows.length - truncatedAfter} more row(s) of this table are NOT above; read them with query_database databaseId ${id} before concluding anything is missing.]`
        : "";
    sections.push(
      `### ${title} — ${rows.length} row${rows.length === 1 ? "" : "s"}${via} · databaseId ${id}\n${formatted.text || "(no rows)"}${cut}`,
    );
    tables.push({
      id,
      title,
      rows: rows.length,
      tokens: formatted.tokens,
      ...(truncatedAfter !== undefined ? { truncatedAfter } : {}),
      ...(linkedFrom ? { linkedFrom } : {}),
    });
    if (spent >= INGEST_MAX_TOKENS) break;
  }
  if (sections.length === 0) return null;

  const text =
    `\n\n## Ingested in full\n` +
    "The charter asks for these databases to be INGESTED IN FULL. They are loaded below — every row and every column as of this turn's start, plus the tables they link to — and they are the standing record for this charter's work: read them here, completely, instead of querying them for content. " +
    "A linked row appears as `Title [handle]`; the same handle is that row's id in its own table below. Use query_database only for row ids to write to, or for rows added during this turn.\n\n" +
    sections.join("\n\n");
  return { text, tokens: spent, tables };
}
