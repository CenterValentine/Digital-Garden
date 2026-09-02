/**
 * Capture validation gate (EXTRACTION-TO-DATABASE-PLAN P2).
 *
 * Asserts the anti-`insert_rows` guarantee at the pure-helper level:
 * `prepareCaptureCells` must reject the WHOLE row on any cell failure —
 * callers only create rows for `ok: true` results, so a rejection here IS
 * "zero new rows". Runs with `pnpm capture:check` (tsx, no database).
 */

import assert from "node:assert/strict";
import {
  parseCaptureConfig,
  prepareCaptureCells,
} from "../lib/domain/data/capture-core";
import type { DataColumn } from "../lib/domain/data/types";

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

function col(partial: Partial<DataColumn> & Pick<DataColumn, "key" | "name" | "type">): DataColumn {
  return {
    id: `id-${partial.key}`,
    tableId: "t1",
    position: "a0",
    isPrimary: false,
    config: {},
    description: null,
    ...partial,
  } as DataColumn;
}

const columns: DataColumn[] = [
  col({ key: "ttl", name: "Title", type: "text", isPrimary: true }),
  col({ key: "cmp", name: "Company", type: "text" }),
  col({ key: "url", name: "URL", type: "url" }),
  col({ key: "fit", name: "Fit %", type: "number" }),
  col({ key: "qly", name: "Qualified", type: "checkbox" }),
  col({ key: "dat", name: "Posted", type: "date" }),
  col({
    key: "stg",
    name: "Stage",
    type: "select",
    config: {
      options: [
        { id: "opt-sourced", label: "Sourced", color: "blue" },
        { id: "opt-applied", label: "Applied", color: "green" },
      ],
    },
  } as Partial<DataColumn> & Pick<DataColumn, "key" | "name" | "type">),
  col({ key: "rlp", name: "Team size", type: "rollup" }),
];

check("valid row prepares with normalization + label→id translation", () => {
  const res = prepareCaptureCells(columns, {
    Title: "  Senior FE  ",
    "Fit %": "85",
    Qualified: "yes",
    Posted: "9/2/2026",
    Stage: "applied",
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const byKey = Object.fromEntries(res.writes.map((w) => [w.columnKey, w.value]));
  assert.equal(byKey.ttl, "Senior FE");
  assert.equal(byKey.fit, 85);
  assert.equal(byKey.qly, true);
  assert.equal(byKey.dat, "2026-09-02");
  assert.equal(byKey.stg, "opt-applied");
});

check("unknown option label rejects the WHOLE row (zero writes)", () => {
  const res = prepareCaptureCells(columns, {
    Title: "Fine title",
    Stage: "Remote-first", // not in the vocabulary
  });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok((res.errors ?? []).some((e) => e.startsWith("Stage:")));
  assert.equal(res.writes.length, 0, "a rejection must carry zero writes");
});

check("unknown column name rejects whole row and names the columns", () => {
  const res = prepareCaptureCells(columns, { Titel: "typo" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok((res.errors ?? [])[0].includes('No column named "Titel"'));
  assert.ok((res.errors ?? [])[0].includes("Title"));
});

check("non-numeric number rejects whole row", () => {
  const res = prepareCaptureCells(columns, { Title: "ok", "Fit %": "eighty" });
  assert.equal(res.ok, false);
});

check("computed column targeted → rejected with the teaching reason", () => {
  const res = prepareCaptureCells(columns, { "Team size": 5 });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok((res.errors ?? [])[0].includes("computed"));
});

check("mixed valid+invalid reports EVERY error, still zero writes", () => {
  const res = prepareCaptureCells(columns, {
    Title: "good",
    "Fit %": "high",
    Stage: "Nowhere",
  });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal((res.errors ?? []).length, 2);
});

check("empty / null values are dropped, not written and not errors", () => {
  const res = prepareCaptureCells(columns, {
    Title: "kept",
    Company: "",
    URL: null,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.writes.length, 1);
  assert.equal(res.writes[0].columnKey, "ttl");
});

check("parseCaptureConfig accepts a stamped config and rejects garbage", () => {
  const good = parseCaptureConfig({
    tableId: "t1",
    tableTitle: "Job Leads",
    admission: "qualified",
    columns: [{ key: "ttl", name: "Title", type: "text" }],
  });
  assert.ok(good && good.admission === "qualified");
  assert.equal(parseCaptureConfig(null), null);
  assert.equal(parseCaptureConfig({ tableId: "t1" }), null);
  assert.equal(
    parseCaptureConfig({ tableId: "t1", columns: [], admission: "sometimes" }),
    null,
  );
});

console.log(`capture checks passed (${checks} checks)`);
