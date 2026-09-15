/**
 * Measure what the AI read formats cost for real tables
 * (AI-BULK-ROW-READING-PLAN §2b / §4.9).
 *
 * Runs the SAME loaders and formatter `query_database` uses and prints, per
 * table: index tier, "all" clipped, "all" unclipped, TSV vs labelled, and the
 * per-column cost profile. Read-only: it never writes.
 *
 * Usage (read-only prod URL recommended):
 *   DATABASE_URL="$RO" pnpm exec tsx scripts/measure-database-read.ts <tableId> [<tableId> ...]
 *   (add --user <userId> to hydrate relations as that viewer; defaults to the table owner)
 */

import { prisma } from "../lib/database/client";
import { loadRowPage, loadTable } from "../lib/domain/data/server/queries";
import {
  allBulkColumns,
  columnProfile,
  formatRows,
  indexTierColumns,
  profileClause,
} from "../lib/domain/data/read-format";
import type { DataView } from "../lib/domain/data/types";

const EMPTY_VIEW = { filters: { op: "and", children: [] }, sorts: [] } as unknown as DataView;

function k(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

async function main() {
  const args = process.argv.slice(2);
  const userFlag = args.indexOf("--user");
  const userId = userFlag >= 0 ? args[userFlag + 1] : undefined;
  const tableIds = args.filter((a, i) => !a.startsWith("--") && (userFlag < 0 || i !== userFlag + 1));
  if (tableIds.length === 0) {
    console.error("usage: measure-database-read.ts <tableId> [...] [--user <userId>]");
    process.exit(2);
  }
  for (const id of tableIds) {
    const node = await prisma.contentNode.findUnique({ where: { id }, select: { ownerId: true, title: true } });
    if (!node) {
      console.log(`\n${id}: not found`);
      continue;
    }
    const viewer = userId ?? node.ownerId;
    const table = await loadTable(id, viewer);
    if (!table) {
      console.log(`\n${id}: no data payload`);
      continue;
    }
    const live = table.columns.filter((c) => !c.deletedAt);
    const page = await loadRowPage({ tableId: id, view: EMPTY_VIEW, columns: live, cursor: null, limit: 1000, viewerId: viewer });
    const rows = page.rows;
    console.log(`\n== ${node.title} — ${rows.length} of ${page.total} rows, ${live.length} columns`);
    const variants: Array<[string, Parameters<typeof formatRows>[0]]> = [
      ["index tier (default)", { rows, columns: indexTierColumns(live), live, render: { relations: "titles", clipChars: 120 } }],
      ["index tier, relations: counts", { rows, columns: indexTierColumns(live), live, render: { relations: "counts", clipChars: 120 } }],
      ['columns: "all" (clipped 120)', { rows, columns: allBulkColumns(live), live, render: { relations: "titles", clipChars: 120 } }],
      ['columns: "all" unclipped', { rows, columns: allBulkColumns(live), live, render: { relations: "titles", clipChars: null } }],
      ['columns: "all" unclipped, labelled', { rows, columns: allBulkColumns(live), live, render: { relations: "titles", clipChars: null }, mode: "labelled" }],
    ];
    console.log(`${"variant".padEnd(40)} ${"tokens".padStart(8)} ${"per row".padStart(8)}  mode`);
    for (const [label, input] of variants) {
      const r = formatRows(input);
      console.log(`${label.padEnd(40)} ${k(r.tokens).padStart(8)} ${(rows.length ? Math.round(r.tokens / rows.length) : 0).toString().padStart(8)}  ${r.mode}`);
    }
    console.log("\ncolumn profiles:");
    for (const c of live) {
      console.log(`  ${c.name.padEnd(32)} ${c.type.padEnd(12)} ${profileClause(columnProfile(rows, c))}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
