/**
 * AI row digests — READ side (AI-BULK-ROW-READING-PLAN §5). Imported by the
 * row loader, so it must not import queries.ts (digests.ts, the generation
 * side, sits above both).
 */

import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { rowSourceHash } from "@/lib/domain/data/digest-hash";
import type { DataColumn, DataRow } from "@/lib/domain/data/types";

/** Forward relation link ids of a hydrated row (backlinks own no links). */
export function forwardLinkIds(row: DataRow, columns: DataColumn[]): string[] {
  const out: string[] = [];
  for (const c of columns) {
    if (c.type !== "relation" || c.config.isBacklink) continue;
    for (const l of row.links?.[c.id] ?? []) out.push(l.linkId);
  }
  return out;
}

export function hashRow(row: DataRow, columns: DataColumn[]): string {
  return rowSourceHash(row.data as Record<string, unknown>, forwardLinkIds(row, columns));
}

/**
 * Mark rows' digests dirty after a write. Fire-and-log: a save must never
 * fail because staleness bookkeeping hiccuped. Rows without a digest are
 * untouched — "missing" is already a candidate state.
 */
export async function markRowDigestsDirty(rowIds: string[]): Promise<void> {
  const ids = [...new Set(rowIds)].filter(Boolean);
  if (ids.length === 0) return;
  try {
    await prisma.dataRowDigest.updateMany({
      where: { rowId: { in: ids }, dirty: false },
      data: { dirty: true },
    });
  } catch (error) {
    logger.warn({
      layer: "content",
      event: "data:digest_dirty_failed",
      summary: "could not mark row digests dirty",
      error,
      attrs: { rows: ids.length },
    });
  }
}

export interface RowDigestView {
  text: string;
  /** hash matches the row now */
  fresh: boolean;
  generatedAt: string;
  model: string | null;
}

/** Digests for a page of hydrated rows, freshness decided by hash. */
export async function loadRowDigests(
  rows: DataRow[],
  columns: DataColumn[]
): Promise<Map<string, RowDigestView>> {
  const out = new Map<string, RowDigestView>();
  if (rows.length === 0) return out;
  const stored = await prisma.dataRowDigest.findMany({
    where: { rowId: { in: rows.map((r) => r.id) } },
    select: { rowId: true, digest: true, sourceHash: true, generatedAt: true, model: true },
  });
  if (stored.length === 0) return out;
  const byRow = new Map(stored.map((s) => [s.rowId, s]));
  for (const row of rows) {
    const s = byRow.get(row.id);
    if (!s) continue;
    out.set(row.id, {
      text: s.digest,
      fresh: s.sourceHash === hashRow(row, columns),
      generatedAt: s.generatedAt.toISOString(),
      model: s.model,
    });
  }
  return out;
}

/** Attach `row.digest` to a hydrated page (read-model, never stored cell state). */
export async function attachRowDigests(rows: DataRow[], columns: DataColumn[]): Promise<void> {
  if (rows.length === 0) return;
  const digests = await loadRowDigests(rows, columns);
  if (digests.size === 0) return;
  for (const row of rows) {
    const d = digests.get(row.id);
    if (d) row.digest = { text: d.text, fresh: d.fresh, generatedAt: d.generatedAt };
  }
}

export interface DigestCoverage {
  fresh: number;
  stale: number;
  none: number;
  lastGeneratedAt: string | null;
  model: string | null;
}

export async function digestCoverageForRows(
  rows: DataRow[],
  columns: DataColumn[]
): Promise<DigestCoverage> {
  const digests = await loadRowDigests(rows, columns);
  let fresh = 0;
  let stale = 0;
  let last: string | null = null;
  let model: string | null = null;
  for (const row of rows) {
    const d = digests.get(row.id);
    if (!d) continue;
    if (d.fresh) fresh++;
    else stale++;
    if (!last || d.generatedAt > last) {
      last = d.generatedAt;
      model = d.model;
    }
  }
  return { fresh, stale, none: rows.length - fresh - stale, lastGeneratedAt: last, model };
}

export function coverageLine(enabled: boolean, c: DigestCoverage): string {
  if (!enabled) return "AI digests: off for this table (the owner can turn them on in the schema rail).";
  const when = c.lastGeneratedAt
    ? ` (last ${c.lastGeneratedAt.slice(0, 16).replace("T", " ")}${c.model ? `, ${c.model}` : ""})`
    : "";
  return `AI digests: ${c.fresh} fresh · ${c.stale} stale · ${c.none} none${when}. query_database digests: true appends them (stale ones omitted).`;
}
