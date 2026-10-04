/**
 * Per-row AI digests (AI-BULK-ROW-READING-PLAN §5) — SERVER-ONLY.
 *
 * One line per row, generated in batches by a low-cost model and stored in
 * the `DataRowDigest` sidecar (never a cell: it is provenance-bearing AI
 * metadata, the same stance as the folder capsule's AgenticMetadata).
 *
 *  - Truth at read time is the HASH (`rowSourceHash`): stale ⇔ the row's
 *    cells or forward links changed since generation. Undo back to the same
 *    content reads fresh again.
 *  - The `dirty` bit is DISCOVERY only — set by every cell/link write so
 *    the sweep finds work with an indexed query instead of a hash scan.
 *    A hiccup here never fails a save (fire-and-log).
 *  - Spend rides the folder-context engine's daily cap (`recordSpend`), so
 *    digests and capsules share one budget the user already controls.
 */

import { generateObject } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { resolvePrimaryRoute } from "@/lib/domain/ai/features/router";
import { resolveChatModelFromConnection } from "@/lib/domain/ai/providers/registry";
import { getTodaySpend, recordSpend } from "@/lib/domain/ai-context/context-spend";
import { getAiContextSettings } from "@/lib/domain/ai-context/settings";
import { getUserSettings } from "@/lib/features/settings";
import { hashRow, loadRowDigests } from "@/lib/domain/data/server/digest-read";
import {
  allBulkColumns,
  formatRows,
  rowHandle,
} from "@/lib/domain/data/read-format";
import { loadRowPage, loadTable } from "@/lib/domain/data/server/queries";
import type { DataView } from "@/lib/domain/data";

/** Rows per generation call. */
export const DIGEST_BATCH_SIZE = 20;
/** Digest length the prompt asks for and the writer enforces. */
export const DIGEST_MAX_CHARS = 200;
/** On-access refresh (query_database digests: true) handles at most this many. */
export const ON_ACCESS_MAX_ROWS = 40;
/** Per-cell chars shown to the digest model. */
const DIGEST_CELL_CLIP = 400;
/** Sweep: rows per table per pass. */
const SWEEP_MAX_ROWS = 200;

const EMPTY_VIEW = { filters: { op: "and", children: [] }, sorts: [] } as unknown as DataView;

export {
  attachRowDigests,
  coverageLine,
  digestCoverageForRows,
  forwardLinkIds,
  hashRow,
  loadRowDigests,
  markRowDigestsDirty,
  type DigestCoverage,
  type RowDigestView,
} from "@/lib/domain/data/server/digest-read";

// ── Generation ──────────────────────────────────────────────────────────

const DigestBatchSchema = z.object({
  items: z.array(
    z.object({
      handle: z.string().min(8).max(8),
      digest: z.string().min(1).max(DIGEST_MAX_CHARS * 2),
    })
  ),
});

export interface RefreshOutcome {
  status: "refreshed" | "nothing-to-do" | "off" | "no-route" | "budget-exhausted" | "time-up";
  refreshed: number;
  candidates: number;
  calls: number;
  modelId: string | null;
  elapsedMs: number;
}

export interface RefreshOptions {
  /** Candidates above this are left for the next pass. */
  maxRows?: number;
  /** Stop starting new batches after this many ms (on-access budget). */
  budgetMs?: number;
  trigger: "access" | "sweep" | "manual";
}

/**
 * Generate or regenerate digests for a table's stale/missing/dirty rows,
 * in batches, under the user's daily cap. Idempotent: a fresh row is never
 * re-sent.
 */
export async function refreshRowDigests(
  userId: string,
  tableId: string,
  options: RefreshOptions
): Promise<RefreshOutcome> {
  const started = Date.now();
  const done = (status: RefreshOutcome["status"], extra: Partial<RefreshOutcome> = {}): RefreshOutcome => ({
    status,
    refreshed: 0,
    candidates: 0,
    calls: 0,
    modelId: null,
    elapsedMs: Date.now() - started,
    ...extra,
  });

  const payload = await prisma.dataPayload.findUnique({
    where: { contentId: tableId },
    select: { rowDigests: true, description: true, content: { select: { title: true } } },
  });
  if (!payload?.rowDigests) return done("off");

  const table = await loadTable(tableId, userId);
  if (!table) return done("off");
  const columns = table.columns.filter((c) => !c.deletedAt);
  const page = await loadRowPage({
    tableId,
    view: EMPTY_VIEW,
    columns,
    cursor: null,
    limit: 5000,
    viewerId: userId,
  });
  const digests = await loadRowDigests(page.rows, columns);
  const dirtyRows = new Set(
    (
      await prisma.dataRowDigest.findMany({
        where: { rowId: { in: page.rows.map((r) => r.id) }, dirty: true },
        select: { rowId: true },
      })
    ).map((d) => d.rowId)
  );
  const candidates = page.rows.filter((r) => {
    const d = digests.get(r.id);
    return !d || !d.fresh || dirtyRows.has(r.id);
  });
  if (candidates.length === 0) return done("nothing-to-do");

  const maxRows = options.maxRows ?? SWEEP_MAX_ROWS;
  const work = candidates.slice(0, maxRows);

  // Route: the row-digest feature, else the studio-metadata model (the
  // same fallback the enhanced-signals tier uses).
  const route =
    (await resolvePrimaryRoute(userId, "row-digest")) ??
    (await resolvePrimaryRoute(userId, "studio-metadata"));
  if (!route) return done("no-route", { candidates: candidates.length });

  const cap = getAiContextSettings(await getUserSettings(userId)).dailyCallCap;
  let callsRemaining = cap - (await getTodaySpend(userId));
  if (callsRemaining <= 0) return done("budget-exhausted", { candidates: candidates.length });

  const model = await resolveChatModelFromConnection(route.connection, route.modelId);
  const bulkColumns = allBulkColumns(columns);
  const columnGuide = columns
    .filter((c) => !c.deletedAt)
    .map((c) => `- ${c.name} (${c.type})${c.description ? `: ${c.description}` : ""}`)
    .join("\n");

  let refreshed = 0;
  let calls = 0;
  let status: RefreshOutcome["status"] = "refreshed";
  for (let i = 0; i < work.length; i += DIGEST_BATCH_SIZE) {
    if (options.budgetMs !== undefined && Date.now() - started > options.budgetMs) {
      status = "time-up";
      break;
    }
    if (callsRemaining <= 0) {
      status = "budget-exhausted";
      break;
    }
    const batch = work.slice(i, i + DIGEST_BATCH_SIZE);
    const rendered = formatRows({
      rows: batch,
      columns: bulkColumns,
      live: columns,
      render: { relations: "titles", clipChars: DIGEST_CELL_CLIP, maxLinkedTitles: 3 },
      mode: "labelled",
    });
    const prompt = [
      `You write one-line digests of database rows for a user's own knowledge base.`,
      `Table: "${payload.content.title}"${payload.description ? ` — ${payload.description}` : ""}.`,
      `Columns:\n${columnGuide}`,
      ``,
      `For EACH row below, return one item with its 8-character handle copied exactly (the [handle] at the start of the line) and a digest of at most ${DIGEST_MAX_CHARS} characters.`,
      `A digest states ONLY what the cells say — the row's identity, its key values, and what it links to. Never infer, embellish, or add facts. A row marked as a gap or with empty cells is digested as a gap ("no result recorded; …"). Keep each digest strictly about its own row.`,
      ``,
      rendered.text,
    ].join("\n");

    callsRemaining -= 1;
    calls += 1;
    try {
      const { object } = await generateObject({
        model,
        schema: DigestBatchSchema,
        prompt,
        temperature: 0,
      });
      const byHandle = new Map(batch.map((r) => [rowHandle(r.id), r]));
      const now = new Date();
      for (const item of object.items) {
        const row = byHandle.get(item.handle);
        if (!row) continue;
        const text = item.digest.trim().slice(0, DIGEST_MAX_CHARS);
        if (!text) continue;
        await prisma.dataRowDigest.upsert({
          where: { rowId: row.id },
          create: {
            rowId: row.id,
            digest: text,
            sourceHash: hashRow(row, columns),
            dirty: false,
            model: route.modelId,
            generatedAt: now,
          },
          update: {
            digest: text,
            sourceHash: hashRow(row, columns),
            dirty: false,
            model: route.modelId,
            generatedAt: now,
          },
        });
        refreshed += 1;
      }
    } catch (error) {
      logger.error({
        layer: "ai",
        event: "data:digest_batch_failed",
        summary: "row digest batch failed — rows stay stale",
        error,
        attrs: { tableId, batch: batch.length },
      });
    }
  }
  await recordSpend(userId, calls);
  logger.info({
    layer: "ai",
    event: "data:digests_refreshed",
    summary: `row digests: ${refreshed}/${work.length} refreshed (${options.trigger})`,
    attrs: { tableId, refreshed, candidates: candidates.length, calls, model: route.modelId, trigger: options.trigger },
  });
  return {
    status,
    refreshed,
    candidates: candidates.length,
    calls,
    modelId: route.modelId,
    elapsedMs: Date.now() - started,
  };
}

/** The durable one-liner for chips and transcripts. */
export function describeRefresh(o: RefreshOutcome): string {
  switch (o.status) {
    case "refreshed":
    case "time-up":
      return `Digests refreshed: ${o.refreshed} row${o.refreshed === 1 ? "" : "s"}${o.candidates > o.refreshed ? ` of ${o.candidates} stale` : ""}${o.modelId ? ` · ${o.modelId}` : ""} · ${o.calls} call${o.calls === 1 ? "" : "s"} · ${(o.elapsedMs / 1000).toFixed(1)}s${o.status === "time-up" ? " (time budget reached; the rest refresh in the nightly sweep)" : ""}`;
    case "nothing-to-do":
      return "Digests: all fresh.";
    case "off":
      return "Digests: off for this table.";
    case "no-route":
      return "Digests: no model route configured (Settings → AI → Routing → Row digests).";
    case "budget-exhausted":
      return "Digests: daily auto-context budget reached — rows stay stale until tomorrow.";
  }
}

// ── Nightly sweep ───────────────────────────────────────────────────────

export interface DigestSweepStats {
  tables: number;
  refreshed: number;
  calls: number;
}

/** Drain stale digests across every opted-in table, bounded per table. */
export async function runRowDigestSweep(): Promise<DigestSweepStats> {
  const tables = await prisma.dataPayload.findMany({
    where: { rowDigests: true, content: { deletedAt: null } },
    select: { contentId: true, content: { select: { ownerId: true } } },
    take: 200,
  });
  const stats: DigestSweepStats = { tables: 0, refreshed: 0, calls: 0 };
  for (const t of tables) {
    stats.tables += 1;
    try {
      const o = await refreshRowDigests(t.content.ownerId, t.contentId, { trigger: "sweep", maxRows: SWEEP_MAX_ROWS });
      stats.refreshed += o.refreshed;
      stats.calls += o.calls;
    } catch (error) {
      logger.error({
        layer: "ai",
        event: "data:digest_sweep_table_failed",
        summary: "digest sweep failed for a table",
        error,
        attrs: { tableId: t.contentId },
      });
    }
  }
  return stats;
}
