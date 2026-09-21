/**
 * Proposal-shape gate — the four payloads that died in production reach
 * execute, and execute's resolvers judge them the way the rule says.
 *
 * Run with: pnpm proposal:shape:check
 *
 * Fixtures are shape-faithful reconstructions of the four consecutive
 * propose_item_iteration rejections in prod conversation fa475acc
 * (2026-09-21) — items abridged to three, every key and every mistake kept:
 *   1. captureTo as a bare string; no `source`
 *   2. captureTo.databaseId (the sibling tools' key), no admission, no columns
 *   3. columns: []
 *   4. 21 columns (the schema capped at 20)
 * plus the fifth call that finally passed, and the refusals that must still
 * teach. See lib/domain/ai/tools/iteration-proposal.ts for the rule.
 */

import {
  ITERATION_PROPOSAL_INPUT,
  PROPOSAL_BOUNDS,
  clampInt,
  normalizeProposalItems,
  resolveAdmission,
  resolveCaptureTarget,
  resolveColumnNames,
  resolveQuestColumnType,
  resolveQuestColumns,
} from "../lib/domain/ai/tools/iteration-proposal";

const errors: string[] = [];
function assert(cond: unknown, msg: string): void {
  if (!cond) errors.push(msg);
}

const DB = "49746038-dfa9-4708-82e2-8916ad2500e2";
const ITEMS = [
  "Client Solution Engineer — e123 — Indianapolis, IN (Remote)",
  "Solutions Engineer — BackOps AI — San Francisco Bay Area (On-site)",
  "Implementation Engineer — PactFi — San Francisco, CA (Remote)",
];
const OBJECTIVE =
  "Screen every distinct job posting on the current LinkedIn search-results page against Career Hunter's hard requirements; write qualifying roles to the Library.";
const TWENTY_ONE_COLUMNS = [
  "Role Title", "Company", "Posting URL", "Source", "Date Discovered", "Working Arrangement",
  "Location", "Compensation", "Fit", "Verdict", "Role Summary", "Next Action", "Status",
  "Reposting Date", "Seniority", "Team", "Tech Stack", "Interview Notes", "Contact",
  "Referral", "Applied On",
];

// ── The four production rejections must now parse ───────────────────────────

const attempts: Array<{ name: string; payload: Record<string, unknown> }> = [
  {
    name: "1: captureTo as a bare string, no source",
    payload: { quest: "Career Hunt II — LinkedIn Test Batch", objective: OBJECTIVE, items: ITEMS, itemCap: 24, captureTo: DB },
  },
  {
    name: "2: captureTo.databaseId, no admission, no columns",
    payload: { objective: OBJECTIVE, source: "list-page", items: ITEMS, itemCap: 24, captureTo: { databaseId: DB } },
  },
  {
    name: "3: columns: []",
    payload: { objective: OBJECTIVE, source: "list-page", items: ITEMS, itemCap: 24, captureTo: { database: DB, admission: "qualified", columns: [] } },
  },
  {
    name: "4: 21 columns",
    payload: { objective: OBJECTIVE, source: "list-page", items: ITEMS, itemCap: 24, captureTo: { database: DB, admission: "qualified", columns: TWENTY_ONE_COLUMNS } },
  },
  {
    name: "5: the call that passed",
    payload: { objective: OBJECTIVE, source: "list-page", items: ITEMS, itemCap: 24, quest: "Career Hunt II", captureTo: { database: DB, admission: "qualified", columns: TWENTY_ONE_COLUMNS.slice(0, 20) } },
  },
];
for (const { name, payload } of attempts) {
  const parsed = ITERATION_PROPOSAL_INPUT.safeParse(payload);
  assert(parsed.success, `attempt ${name} must parse: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))}`);
}

// ── And resolve to what the model meant ─────────────────────────────────────

{
  const r1 = resolveCaptureTarget(DB);
  assert(r1?.ok && r1.target?.database === DB && r1.target?.admission === "all" && r1.target?.columns.length === 0,
    "attempt 1: a bare-string captureTo is the database, admission all, every writable column");

  const r2 = resolveCaptureTarget({ databaseId: DB });
  assert(r2?.ok && r2.target?.database === DB, "attempt 2: databaseId is accepted as the database");
  assert(r2?.ok && r2.notes.some((n) => /defaulted/.test(n)), "attempt 2: a missing admission is noted as defaulted, not refused");

  const r3 = resolveCaptureTarget({ database: DB, admission: "qualified", columns: [] });
  assert(r3?.ok && r3.target?.columns.length === 0 && r3.target?.admission === "qualified", "attempt 3: empty columns resolve to every-writable, admission kept");

  const r4 = resolveCaptureTarget({ database: DB, admission: "qualified", columns: TWENTY_ONE_COLUMNS });
  assert(r4?.ok && r4.target?.columns.length === 21, "attempt 4: 21 columns are passed through — the TABLE decides which exist, in the preflight");

  assert(resolveCaptureTarget(undefined) === null, "no captureTo → null (no capture requested)");
  assert(resolveCaptureTarget("   ") === null, "blank captureTo → null");
  const noDb = resolveCaptureTarget({ admission: "all" });
  assert(noDb?.ok === false && /names no database/.test(noDb.refusal ?? "") && /databaseId is accepted/.test(noDb.refusal ?? ""),
    "an object naming no database is a teaching refusal that mentions the accepted keys");
  const aliases = ["table", "tableId", "name", "id"] as const;
  for (const key of aliases) {
    const r = resolveCaptureTarget({ [key]: DB });
    assert(r?.ok && r.target?.database === DB, `alias ${key} resolves the database`);
  }
  const csv = resolveCaptureTarget({ database: DB, columns: "Role Title, Company,, Posting URL\nCompany" });
  assert(csv?.ok && csv.target?.columns.join("|") === "Role Title|Company|Posting URL",
    "columns as a comma/newline string split, trim, drop empties and dedupe case-insensitively");
  const dedupeAlias = resolveCaptureTarget({ database: DB, dedupeColumnName: "Posting URL" });
  assert(dedupeAlias?.ok && dedupeAlias.target?.dedupeColumn === "Posting URL", "dedupeColumnName is accepted for dedupeColumn");
}

// ── Admission: by meaning, with a teaching refusal at the edge ──────────────

{
  const cases: Array<[string | undefined, string]> = [
    [undefined, "all"], ["all", "all"], ["qualified", "qualified"], ["custom", "custom"],
    ["Qualified", "qualified"], ["qualifying only", "qualified"], ["passed", "qualified"],
    ["everything", "all"], ["every item", "all"], ["only roles in Utah", "custom"], ["custom rule", "custom"],
  ];
  for (const [raw, want] of cases) {
    const r = resolveAdmission(raw);
    assert(r.admission === want, `admission ${JSON.stringify(raw)} → ${want} (got ${JSON.stringify(r)})`);
  }
  const bad = resolveAdmission("sometimes");
  assert(!bad.admission && /"all"/.test(bad.refusal ?? "") && /"qualified"/.test(bad.refusal ?? "") && /"custom"/.test(bad.refusal ?? ""),
    "an unrecognizable admission refuses AND names all three accepted words");
}

// ── Items: every shape the model has sent ───────────────────────────────────

{
  const n = normalizeProposalItems([
    "Bare string label",
    { label: "Object label", url: "https://x/1" },
    { title: "Title as label", href: "https://x/2" },
    { name: "Name as label" },
    { url: "https://x/only-url" },
    { label: "   " },
    "",
  ]);
  assert(n.items.length === 5 && n.dropped === 2, `items normalize: 5 kept, 2 dropped (got ${n.items.length}/${n.dropped})`);
  // Index defensively: a broken normalizer returns fewer items, and the gate
  // must report that as a failed assertion, not crash mid-run.
  assert(n.items[0]?.label === "Bare string label" && n.items[0]?.url === undefined, "a bare string is the label");
  assert(n.items[2]?.label === "Title as label" && n.items[2]?.url === "https://x/2", "title/href stand in for label/url");
  assert(n.items[4]?.label === "https://x/only-url" && n.items[4]?.url === "https://x/only-url", "a url-only item uses its url as the label");
  const long = normalizeProposalItems([{ label: "L".repeat(500), url: "https://x/" + "u".repeat(1000) }]);
  assert(long.items[0]?.label.length === PROPOSAL_BOUNDS.labelChars && long.items[0]?.url?.length === PROPOSAL_BOUNDS.urlChars,
    "over-long label and url are CLIPPED, never rejected");
  const many = normalizeProposalItems(Array.from({ length: 300 }, (_, i) => `item ${i}`));
  assert(many.items.length === PROPOSAL_BOUNDS.items && many.clipped, "more than the item bound is clipped and flagged");
}

// ── Bounds clamp; quest columns resolve ─────────────────────────────────────

{
  assert(clampInt(0, 1, 200, 10) === 1 && clampInt(999, 1, 200, 10) === 200 && clampInt(10.6, 1, 200, 10) === 11 && clampInt(undefined, 1, 200, 10) === 10,
    "clampInt clamps, rounds, and falls back");
  assert(resolveColumnNames(undefined).length === 0, "no columns → empty list");
  const types: Array<[string | undefined, string | null]> = [
    [undefined, "text"], ["text", "text"], ["longText", "longText"], ["long text", "longText"], ["string", "text"],
    ["integer", "number"], ["score", "number"], ["link", "url"], ["date", "date"], ["boolean", "checkbox"], ["potato", null],
  ];
  for (const [raw, want] of types) {
    assert(resolveQuestColumnType(raw) === want, `quest column type ${JSON.stringify(raw)} → ${want}`);
  }
  const q = resolveQuestColumns([{ name: "Fit reason", type: "long text", description: "why" }, { name: "Score", type: "int" }]);
  assert(q.ok && q.columns[0].type === "longText" && q.columns[1].type === "number" && q.columns[1].description === "",
    "quest columns resolve types by meaning; a missing description is allowed");
  const qbad = resolveQuestColumns([{ name: "X", type: "potato" }]);
  assert(!qbad.ok && /"potato"/.test(qbad.refusal ?? "") && /"checkbox"/.test(qbad.refusal ?? ""), "an unknown quest column type refuses and lists the accepted types");
}

// ── Report ──────────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.error(`\n✖ proposal:shape:check failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log(`✓ proposal:shape:check — ${attempts.length} production payloads parse; captureTo, admission, items, bounds and quest columns resolve by meaning`);
