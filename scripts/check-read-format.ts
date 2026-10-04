/**
 * CI gate: AI database read formatting (AI-BULK-ROW-READING-PLAN §4.9).
 *
 * Runs the PURE read-format module against fixtures — no database — and
 * asserts the rules the measurements bought:
 *   1. a relation cell renders its linked titles with [handles];
 *   2. mirrored relation halves STAY in the index tier and "all" (a child sees
 *      its parent through them); file/contentLink columns are out of "all";
 *   3. long text clips at 120 chars unless the column was named;
 *   4. a 99-row × 9-column table sizes OVER a 6k budget and a 35-row clipped
 *      table sizes under (the over-budget path exists for a reason);
 *   5. an ambiguous 8-hex prefix refuses with candidates; a unique one resolves;
 *   6. the result header round-trips through parseReadHeader (the fold and
 *      the chip depend on it);
 *   7. groupBy counts every value and the empties.
 *
 * Mutation-tested at introduction (2026-09-15): breaking each rule fails.
 *
 * Usage: pnpm data:read:check
 */

import {
  allBulkColumns,
  columnProfile,
  formatRows,
  groupCountsLine,
  indexTierColumns,
  matchRowRef,
  overBudgetFooter,
  parseReadHeader,
  profileClause,
  readHeaderLine,
  rowHandle,
} from "../lib/domain/data/read-format";
import type { DataColumn, DataRow } from "../lib/domain/data/types";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function col(
  partial: Partial<DataColumn> & Pick<DataColumn, "name" | "type" | "key">
): DataColumn {
  return {
    id: partial.id ?? `col-${partial.key}`,
    position: partial.position ?? "a",
    isPrimary: partial.isPrimary ?? false,
    config: partial.config ?? {},
    description: partial.description ?? null,
    deletedAt: null,
    ...partial,
  } as DataColumn;
}

const uuid = (n: number, tail = "0000") =>
  `${n.toString(16).padStart(8, "0")}-1111-4222-8333-${tail}00000000`;

const columns: DataColumn[] = [
  col({ name: "Claim or metric", type: "text", key: "title", isPrimary: true, id: "c-title" }),
  col({ name: "Claim ID", type: "text", key: "cid", id: "c-cid" }),
  col({
    name: "Claim type",
    type: "select",
    key: "ctype",
    id: "c-ctype",
    config: {
      options: [
        { id: "o1", label: "Quantitative metric", color: "neutral" },
        { id: "o2", label: "Qualitative outcome", color: "neutral" },
      ],
    },
  }),
  col({ name: "Before value", type: "number", key: "before", id: "c-before" }),
  col({ name: "Narrative", type: "longText", key: "narr", id: "c-narr" }),
  col({
    name: "Experience",
    type: "relation",
    key: "exp",
    id: "c-exp",
    config: { relationTableId: "t-exp", symmetricColumnId: "c-exp-back" },
  }),
  col({
    name: "Experience (mirror)",
    type: "relation",
    key: "expb",
    id: "c-expb",
    config: { relationTableId: "t-exp", symmetricColumnId: "c-exp", isBacklink: true },
  }),
  col({ name: "Sources", type: "relation", key: "src", id: "c-src", config: { relationTableId: "t-src" } }),
  col({ name: "File", type: "file", key: "file", id: "c-file" }),
];

const LONG = "x".repeat(400);
function row(i: number, opts: { narrative?: string; links?: number } = {}): DataRow {
  const links = opts.links ?? 2;
  return {
    id: uuid(i),
    tableId: "t-claims",
    sortKey: `a${i}`,
    contentId: null,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    data: {
      title: `Claim ${i} about recovery`,
      cid: `CLM-${String(i).padStart(3, "0")}`,
      ctype: i % 2 ? "o1" : "o2",
      before: i * 10,
      narr: opts.narrative ?? LONG,
    },
    links: {
      "c-exp": [{ linkId: `l${i}`, rowId: uuid(1000 + i), title: `Experience ${i}`, restricted: false }],
      "c-src": Array.from({ length: links }, (_, k) => ({
        linkId: `s${i}-${k}`,
        rowId: uuid(2000 + i * 10 + k),
        title: `Source ${i}-${k} original passage`,
        restricted: false,
      })),
    },
  };
}

console.log("read-format gate");

// 1. Relation cells render titles with handles.
{
  const r = row(1);
  const out = formatRows({ rows: [r], columns: indexTierColumns(columns), live: columns, render: { relations: "titles", clipChars: 120, maxLinkedTitles: 1, linkedTitleClip: 40 } });
  check("index tier shows one linked title then +N more", /Sources: Source 1-0 original passage \[[0-9a-f]{8}\] \+1 more/.test(out.text), out.text);
  const longTitle = { ...row(1), links: { "c-src": [{ linkId: "x", rowId: uuid(3), title: "A".repeat(80), restricted: false }] } } as DataRow;
  const clippedTitle = formatRows({ rows: [longTitle], columns: [columns[7]], live: columns, render: { relations: "titles", clipChars: 120, maxLinkedTitles: 1, linkedTitleClip: 40 } });
  check("linked titles clip at linkedTitleClip", clippedTitle.text.includes("A".repeat(39) + "…") && !clippedTitle.text.includes("A".repeat(41)), clippedTitle.text);
  check("relation renders linked title with handle", out.text.includes(`Experience 1 [${rowHandle(uuid(1001))}]`), out.text);
  const handles = formatRows({ rows: [r], columns: [columns[7]], live: columns, render: { relations: "handles", clipChars: 120 } });
  check("relations: handles renders handles only", /Sources: [0-9a-f]{8},[0-9a-f]{8}/.test(handles.text), handles.text);
  const counts = formatRows({ rows: [r], columns: [columns[7]], live: columns, render: { relations: "counts", clipChars: 120 } });
  check("relations: counts renders a count", counts.text.includes("Sources: 2 linked"), counts.text);
}

// 2. Mirrored halves stay (the parent reference); long text and files do not.
{
  const idx = indexTierColumns(columns).map((c) => c.name);
  check("index tier keeps the mirrored relation half", idx.includes("Experience (mirror)"), idx.join(","));
  check("index tier excludes long text", !idx.includes("Narrative"), idx.join(","));
  check("index tier excludes files", !idx.includes("File"), idx.join(","));
  check("index tier keeps select, number, relations, first text", ["Claim ID", "Claim type", "Before value", "Experience", "Sources"].every((n) => idx.includes(n)), idx.join(","));
  const all = allBulkColumns(columns).map((c) => c.name);
  check('"all" excludes file columns and keeps long text', !all.includes("File") && all.includes("Narrative") && all.includes("Experience (mirror)"), all.join(","));
}

// 3. Clipping unless named.
{
  const r = row(2);
  const clipped = formatRows({ rows: [r], columns: [columns[4]], live: columns, render: { relations: "titles", clipChars: 120 } });
  check("long text clips at 120 chars", clipped.text.includes("x".repeat(119) + "…") && !clipped.text.includes("x".repeat(121)), `${clipped.text.length} chars`);
  const named = formatRows({ rows: [r], columns: [columns[4]], live: columns, render: { relations: "titles", clipChars: 120, fullColumns: new Set(["c-narr"]) } });
  check("a named column comes back whole", named.text.includes(LONG));
}

// 4. Sizing: 99 × all columns over 6k; 35 rows clipped index under.
{
  const rows99 = Array.from({ length: 99 }, (_, i) => row(i + 1));
  const full = formatRows({ rows: rows99, columns: allBulkColumns(columns), live: columns, render: { relations: "titles", clipChars: 120 } });
  check("99 rows × all columns exceeds a 6k budget", full.tokens > 6000, `${full.tokens} tokens`);
  check("bulk results switch to TSV above 20 rows", full.mode === "tsv");
  const index = formatRows({ rows: rows99.slice(0, 35), columns: indexTierColumns(columns), live: columns, render: { relations: "titles", clipChars: 120 } });
  check("35-row index tier fits a 6k budget", index.tokens <= 6000, `${index.tokens} tokens`);
  const footer = overBudgetFooter({ fullTokens: full.tokens, rows: full.rows, columns: full.columns, largest: full.columnTokens, budget: 6000, threshold: 6000 });
  check("over-budget footer names the price and the approval", /Call again with budget: \d+ to read it — the user will be asked to approve/.test(footer), footer);
  check("over-budget footer names the largest column", footer.includes("Narrative"), footer);
}

// 5. Handles.
{
  const live = [uuid(1, "aaaa"), uuid(1, "bbbb"), uuid(2)];
  const unique = matchRowRef(rowHandle(uuid(2)), live);
  check("unique 8-hex prefix resolves", "id" in unique && unique.id === uuid(2));
  const ambiguous = matchRowRef(rowHandle(uuid(1)), live);
  check("ambiguous prefix refuses with candidates", "ambiguous" in ambiguous && ambiguous.ambiguous.length === 2);
  const bracketed = matchRowRef(`[${rowHandle(uuid(2))}]`, live);
  check("bracketed handle is accepted", "id" in bracketed);
  const missing = matchRowRef("ffffffff", live);
  check("unknown prefix is missing", "missing" in missing);
  const invalid = matchRowRef("Claim 2", live);
  check("a title is not a handle", "invalid" in invalid);
}

// 6. Header round-trip.
{
  const line = readHeaderLine({ table: "Claims and metrics", rows: 99, total: 120, columns: 7, tokens: 6140, lifetime: "run", lifetimeOrigin: "charter", mode: "tsv", budgetTokens: 14200, approved: true });
  const parsed = parseReadHeader(`${line}\nbody`);
  check("header parses back", !!parsed && parsed.table === "Claims and metrics" && parsed.rows === 99 && parsed.total === 120 && parsed.lifetime === "run" && parsed.lifetimeOrigin === "charter" && Math.abs(parsed.tokens - 6100) < 100, JSON.stringify(parsed));
  const small = readHeaderLine({ table: "T", rows: 1, total: 1, columns: 2, tokens: 240, lifetime: "turn", mode: "labelled" });
  check("small header parses back", parseReadHeader(small)?.tokens === 240, small);
}

// 7. Group counts.
{
  const rows = [row(1), row(2), row(3), { ...row(4), data: { ...row(4).data, ctype: undefined as unknown as string } }];
  const line = groupCountsLine(rows, columns[2]);
  check("groupBy counts values and empties", line.includes("Quantitative metric 2") && line.includes("Qualitative outcome 1") && line.includes("(empty) 1"), line);
}

// 8. Profiles.
{
  const rows = Array.from({ length: 10 }, (_, i) => row(i + 1, { narrative: i < 8 ? "short text" : "" }));
  const narr = profileClause(columnProfile(rows, columns[4]));
  check("text profile reports fill and cost", narr.startsWith("filled 8/10") && narr.includes("tokens to read"), narr);
  const sel = profileClause(columnProfile(rows, columns[2]));
  check("select profile lists the vocabulary counts", sel.includes("Quantitative metric 5") && sel.includes("empty 0"), sel);
  const rel = profileClause(columnProfile(rows, columns[7]));
  check("relation profile reports linkage", rel.startsWith("10/10 linked · avg 2"), rel);
  const num = profileClause(columnProfile(rows, columns[3]));
  check("number profile reports the range", num.startsWith("10 … 100"), num);
}

if (failures > 0) {
  console.error(`\nread-format gate FAILED: ${failures} check${failures === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log("\nread-format gate passed");
