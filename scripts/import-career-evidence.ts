/**
 * import-career-evidence.ts — one-off, idempotent loader for the Career
 * Evidence Library migration payload (docs: ~/Downloads/career-evidence-migration/PROTOCOL.md).
 *
 * Reads payload.json (the migration contract: experiences / sources / claims /
 * library, cross-referenced ONLY by the human-readable ID columns EXP-/SRC-/CLM-)
 * and upserts it into the four linked databases through the same mutation
 * helpers the AI tools use — createRows, writeCells, writeRelationLinks,
 * updateColumn. Never raw SQL: those helpers maintain rowCount, searchText,
 * option ids and link positions.
 *
 * Usage (from the repo root, with DATABASE_URL pointing at the TARGET db):
 *   pnpm exec tsx scripts/import-career-evidence.ts --dry-run
 *   pnpm exec tsx scripts/import-career-evidence.ts --yes
 * Options:
 *   --payload <path>   default ~/Downloads/career-evidence-migration/payload.json
 *   --dry-run          plan only; reads the target, writes nothing
 *   --yes              required for any write
 *   --allow-local      permit a localhost DATABASE_URL (the library lives in prod)
 *
 * Re-running converges: rows are found by their ID column and updated in place;
 * relation cells are REPLACED (writeRelationLinks semantics); options already
 * present are not re-added. Nothing is ever deleted.
 */

import "./_load-env.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { prisma } from "../lib/database/client.js";
import { loadTable } from "../lib/domain/data/server/queries.js";
import {
  createRows,
  updateColumn,
  writeCells,
  type CellWrite,
} from "../lib/domain/data/server/mutations.js";
import { writeRelationLinks } from "../lib/domain/data/server/relation-cells.js";
import { normalizeCellInput } from "../lib/domain/data/server/resolve.js";
import { findColumn, translateOptionValue } from "../lib/domain/data/capture-core.js";
import {
  generateColumnKey,
  type DataColumn,
  type DataTable,
  type SelectOption,
} from "../lib/domain/data/index.js";

// ── Fixed targets (prod ids; the payload's meta.ledgerNoteId pins the source) ──
const OWNER_ID = "d42ef00c-d0cf-4e90-8469-81416a730c3f";
const LEDGER_NOTE_ID = "1cb12ac6-026a-48a1-a6b6-528f747cd885";
const TABLES = {
  experiences: { id: "79477f2d-76f0-47e5-8f56-2d0955ee84f8", idColumn: "Experience ID" },
  sources: { id: "8897edfb-7121-4fb3-9ce6-de4874a388be", idColumn: "Source ID" },
  claims: { id: "7c3565e1-ab90-4ca8-aac0-a6f20fac262a", idColumn: "Claim ID" },
  library: { id: "3244d69b-8db7-4ef4-8cbc-50998cd18f24", idColumn: "Name" },
} as const;
type TableKey = keyof typeof TABLES;
const LOAD_ORDER: TableKey[] = ["experiences", "sources", "claims", "library"];
/** Rows per createRows call — keeps each transaction far below Prisma's 5 s interactive limit over a pooled connection. */
const CREATE_CHUNK = 10;

/**
 * Relation columns to SKIP by (table, column name). The live Claims table
 * carries a duplicate forward `Experience` column (mirrored as
 * `Claims and metrics 2` on Experiences) that the backlog schedules for
 * deletion; the canonical pair is Experiences.`Claims and metrics` ↔
 * Claims.`Experience` (backlink). Backlinks are refused by the helper anyway.
 */
const SKIP_RELATION: Record<TableKey, string[]> = {
  experiences: [],
  sources: [],
  claims: ["Experience"],
  library: [],
};

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DRY_RUN = flag("--dry-run");
const YES = flag("--yes");
const ALLOW_LOCAL = flag("--allow-local");
const PAYLOAD_PATH = opt(
  "--payload",
  join(homedir(), "Downloads", "career-evidence-migration", "payload.json")
);

type Row = Record<string, unknown>;
interface Payload {
  meta: { ledgerNoteId: string; generatedBy?: string; notes?: string };
  proposedOptions?: Record<string, string[]>;
  experiences: Row[];
  sources: Row[];
  claims: Row[];
  library: Row[];
}

function dbTarget(): { host: string; kind: "local" | "neon" | "other" } {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const host = new URL(url).hostname;
    if (["localhost", "127.0.0.1", "::1"].includes(host)) return { host, kind: "local" };
    if (host.endsWith("neon.tech")) return { host, kind: "neon" };
    return { host, kind: "other" };
  } catch {
    return { host: "(invalid)", kind: "other" };
  }
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

async function main() {
  const target = dbTarget();
  console.log(`\nTarget database: ${target.kind.toUpperCase()} (${target.host})`);
  if (target.kind === "local" && !ALLOW_LOCAL) {
    throw new Error("DATABASE_URL is localhost; the Career Evidence Library lives in prod. Pass --allow-local to override.");
  }
  if (!DRY_RUN && !YES) {
    throw new Error("Refusing to write without --yes (or run with --dry-run to see the plan).");
  }

  const payload = JSON.parse(readFileSync(PAYLOAD_PATH, "utf8")) as Payload;
  if (payload.meta?.ledgerNoteId !== LEDGER_NOTE_ID) {
    throw new Error(`payload.meta.ledgerNoteId ${payload.meta?.ledgerNoteId} ≠ expected ${LEDGER_NOTE_ID}`);
  }
  console.log(`Payload: ${PAYLOAD_PATH}\n  generatedBy=${payload.meta.generatedBy ?? "?"}  experiences=${payload.experiences.length} sources=${payload.sources.length} claims=${payload.claims.length} library=${payload.library.length}`);

  // ── Load tables ─────────────────────────────────────────────────────────
  const tables = {} as Record<TableKey, DataTable>;
  for (const key of LOAD_ORDER) {
    const t = await loadTable(TABLES[key].id, OWNER_ID);
    if (!t) throw new Error(`Table ${key} (${TABLES[key].id}) not found on this database`);
    tables[key] = t;
    console.log(`  ${key.padEnd(12)} "${t.title}"  columns=${t.columns.length}  existing rows=${await prisma.dataRow.count({ where: { tableId: t.contentId, deletedAt: null } })}`);
  }

  // ── 1. Options ──────────────────────────────────────────────────────────
  console.log("\n[1] Proposed options");
  let optionsAdded = 0;
  for (const [ref, labels] of Object.entries(payload.proposedOptions ?? {})) {
    const [tableTitle, columnName] = ref.split(".", 2);
    const key = LOAD_ORDER.find((k) => tables[k].title === tableTitle);
    if (!key) throw new Error(`proposedOptions: unknown table "${tableTitle}"`);
    const column = findColumn(tables[key].columns, columnName);
    if (!column) throw new Error(`proposedOptions: unknown column "${ref}"`);
    const existing = column.config.options ?? [];
    const have = new Set(existing.map((o) => o.label.toLowerCase()));
    const add: SelectOption[] = labels
      .filter((l) => !have.has(l.toLowerCase()))
      .map((label) => ({ id: generateColumnKey(), label, color: "neutral" }));
    console.log(`  ${ref}: +${add.length} (${labels.length - add.length} already present)`);
    if (add.length === 0) continue;
    optionsAdded += add.length;
    if (!DRY_RUN) {
      const res = await updateColumn(column.id, { config: { ...column.config, options: [...existing, ...add] } });
      if (!res.ok) throw new Error(`updateColumn ${ref}: ${res.reason}`);
    }
  }
  // Reload so option ids are visible to the encoder.
  if (!DRY_RUN && optionsAdded > 0) {
    for (const key of LOAD_ORDER) tables[key] = (await loadTable(TABLES[key].id, OWNER_ID))!;
  }

  // ── 2. Rows (cells only; relations after every table exists) ───────────
  console.log("\n[2] Rows");
  /** human id (EXP-001 / SRC-001 / CLM-001 / library Name) → DataRow id */
  const rowIdByHuman: Record<TableKey, Map<string, string>> = {
    experiences: new Map(), sources: new Map(), claims: new Map(), library: new Map(),
  };
  const summary: Record<TableKey, { created: number; updated: number; cellErrors: string[] }> = {
    experiences: { created: 0, updated: 0, cellErrors: [] }, sources: { created: 0, updated: 0, cellErrors: [] },
    claims: { created: 0, updated: 0, cellErrors: [] }, library: { created: 0, updated: 0, cellErrors: [] },
  };

  for (const key of LOAD_ORDER) {
    const table = tables[key];
    const columns = table.columns;
    const idColumn = findColumn(columns, TABLES[key].idColumn);
    if (!idColumn) throw new Error(`${key}: id column "${TABLES[key].idColumn}" missing`);
    const rows = payload[key];

    // Duplicate human ids in the payload would make the upsert ambiguous.
    const humanIds = rows.map((r) => String(r[TABLES[key].idColumn] ?? ""));
    const dup = humanIds.filter((h, i) => h && humanIds.indexOf(h) !== i);
    if (dup.length) throw new Error(`${key}: duplicate ${TABLES[key].idColumn} in payload: ${[...new Set(dup)].join(", ")}`);

    // Existing rows keyed by the id column's stored value.
    const existing = await prisma.dataRow.findMany({
      where: { tableId: table.contentId, deletedAt: null },
      select: { id: true, data: true },
    });
    for (const r of existing) {
      const v = ((r.data ?? {}) as Row)[idColumn.key];
      if (typeof v === "string" && v) rowIdByHuman[key].set(v.trim(), r.id);
    }

    const missing = rows.filter((r) => !rowIdByHuman[key].has(String(r[TABLES[key].idColumn])));
    console.log(`  ${key.padEnd(12)} ${rows.length} in payload → ${rows.length - missing.length} update, ${missing.length} create`);
    if (!DRY_RUN && missing.length > 0) {
      // createRows runs one interactive transaction per call; 99 inserts in
      // one call crossed Prisma's 5 s transaction ceiling over the Neon
      // pooler (observed 2026-09-14). Chunk so each call stays well under it.
      const ids: string[] = [];
      for (let i = 0; i < missing.length; i += CREATE_CHUNK) {
        const n = Math.min(CREATE_CHUNK, missing.length - i);
        ids.push(...(await createRows(table.contentId, columns, n, OWNER_ID)));
      }
      missing.forEach((r, i) => rowIdByHuman[key].set(String(r[TABLES[key].idColumn]), ids[i]));
    }
    summary[key].created += missing.length;
    summary[key].updated += rows.length - missing.length;

    // Cell writes — every payload field that maps to a writable, non-relation column.
    for (const row of rows) {
      const human = String(row[TABLES[key].idColumn]);
      const rowId = rowIdByHuman[key].get(human);
      const writes: CellWrite[] = [];
      for (const [name, raw] of Object.entries(row)) {
        const column = findColumn(columns, name);
        if (!column) { summary[key].cellErrors.push(`${human}: no column "${name}"`); continue; }
        if (column.type === "relation" || column.type === "lookup" || column.type === "rollup") continue;
        if (isEmptyValue(raw)) continue;
        const value = normalizeCellInput(column, translateOptionValue(column, raw));
        writes.push({ rowId: rowId ?? "(dry-run)", columnKey: column.key, value });
      }
      if (DRY_RUN || !rowId) continue;
      const res = await writeCells(table.contentId, columns, writes);
      for (const r of res.results) {
        if (r.status !== "applied") summary[key].cellErrors.push(`${human}: ${r.status} ${"message" in r ? r.message : r.columnKey}`);
      }
    }
    if (summary[key].cellErrors.length) console.log(`    cell errors: ${summary[key].cellErrors.length} (listed at the end)`);
  }

  // ── 3. Relations ────────────────────────────────────────────────────────
  console.log("\n[3] Relations (canonical pairs only)");
  const targetKeyForTable = (tableId: string): TableKey | undefined => LOAD_ORDER.find((k) => TABLES[k].id === tableId);
  let linksPlanned = 0;
  const linkErrors: string[] = [];
  for (const key of LOAD_ORDER) {
    const table = tables[key];
    for (const column of table.columns as DataColumn[]) {
      if (column.type !== "relation" || column.config.isBacklink) continue;
      if (SKIP_RELATION[key].includes(column.name)) { console.log(`  ${key}.${column.name}: SKIPPED (duplicate pair)`); continue; }
      const targetKey = targetKeyForTable(column.config.relationTableId ?? "");
      if (!targetKey) { linkErrors.push(`${key}.${column.name}: target table not in this set`); continue; }
      let cells = 0, links = 0;
      for (const row of payload[key]) {
        const human = String(row[TABLES[key].idColumn]);
        const raw = row[column.name];
        if (!Array.isArray(raw) || raw.length === 0) continue;
        const targetIds: string[] = [];
        for (const h of raw as string[]) {
          const id = rowIdByHuman[targetKey].get(h);
          if (!id) { if (!DRY_RUN) linkErrors.push(`${key}.${column.name} ${human} → ${h}: target row missing`); continue; }
          targetIds.push(id);
        }
        cells += 1; links += DRY_RUN ? raw.length : targetIds.length;
        const fromRowId = rowIdByHuman[key].get(human);
        if (DRY_RUN || !fromRowId) continue;
        await writeRelationLinks(column.id, fromRowId, targetIds);
      }
      linksPlanned += links;
      console.log(`  ${key}.${column.name} → ${tables[targetKey].title}: ${cells} cells, ${links} links`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${DRY_RUN ? "DRY RUN — nothing written" : "DONE"}`);
  for (const key of LOAD_ORDER) console.log(`  ${key.padEnd(12)} created=${summary[key].created} updated=${summary[key].updated} cellErrors=${summary[key].cellErrors.length}`);
  console.log(`  options added=${optionsAdded}  links ${DRY_RUN ? "planned" : "written"}=${linksPlanned}  linkErrors=${linkErrors.length}`);
  const errors = [...LOAD_ORDER.flatMap((k) => summary[k].cellErrors), ...linkErrors];
  if (errors.length) { console.log("\nErrors:"); errors.forEach((e) => console.log("  - " + e)); }
  if (!DRY_RUN && errors.length) process.exitCode = 1;
}

main()
  .catch((err) => { console.error("\nFAILED:", err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
