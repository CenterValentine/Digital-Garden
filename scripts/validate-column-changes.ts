/**
 * column:changes:check — the judgements behind propose_column_changes.
 *
 * The tool is the only AI path that can RESHAPE a schema (rename, remove);
 * every other column tool is add-only. What stops it reaching a charter
 * ledger's machinery columns, or the primary column every row is titled
 * from, is `planColumnChanges` — so that function is pinned here rather
 * than left to a live chat to discover.
 *
 * Mutation-tested 2026-10-15: deleting the system-column guard, the
 * primary-column guard, the collision guard or the duplicate guard each
 * fails this script.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { planColumnChanges, type DataColumn } from "@/lib/domain/data";

function column(
  over: Partial<DataColumn> & { id: string; name: string }
): DataColumn {
  return {
    tableId: "t1",
    key: over.id,
    type: "text",
    position: "a0",
    isPrimary: false,
    config: {},
    description: null,
    deletedAt: null,
    ...over,
  } as DataColumn;
}

// A charter master ledger: Quest is primary AND system; Notes is the
// user's own column sitting beside the machinery.
const LIVE: DataColumn[] = [
  column({ id: "c-quest", name: "Quest", isPrimary: true, config: { system: true } }),
  column({ id: "c-status", name: "Status", type: "select", config: { system: true } }),
  column({ id: "c-notes", name: "Notes", type: "longText" }),
  column({ id: "c-owner", name: "Owner" }),
];

// ── A system column is untouchable, by either verb ───────────────────────
{
  const plan = planColumnChanges(LIVE, [
    { column: "Status", op: "rename", to: "Stage" },
    { column: "Quest", op: "remove" },
  ]);
  assert.equal(plan.changes.length, 0, "no system column may be changed");
  assert.equal(plan.refused.length, 2);
  for (const r of plan.refused) {
    assert.match(r.reason, /SYSTEM column of a charter ledger/);
  }
}

// ── The primary column: renameable, never removable ──────────────────────
{
  const live = [
    column({ id: "p", name: "Title", isPrimary: true }),
    column({ id: "x", name: "Other" }),
  ];
  const removal = planColumnChanges(live, [{ column: "Title", op: "remove" }]);
  assert.equal(removal.changes.length, 0);
  assert.match(removal.refused[0].reason, /primary column/);

  const rename = planColumnChanges(live, [
    { column: "Title", op: "rename", to: "Name" },
  ]);
  assert.equal(rename.refused.length, 0, "renaming the primary is fine");
  assert.deepEqual(rename.changes[0], {
    columnId: "p",
    columnName: "Title",
    columnType: "text",
    op: "rename",
    to: "Name",
  });
}

// ── A removal reaches the card as the API's verb, with its reason ────────
{
  const plan = planColumnChanges(LIVE, [
    { column: "Notes", op: "remove", reason: "superseded by Verdict" },
  ]);
  assert.equal(plan.refused.length, 0);
  assert.equal(plan.changes[0].op, "delete");
  assert.equal(plan.changes[0].columnId, "c-notes");
  assert.equal(plan.changes[0].columnType, "longText");
  assert.equal(plan.changes[0].reason, "superseded by Verdict");
}

// ── Resolution: exact name (case-insensitive), or id ─────────────────────
{
  const byCase = planColumnChanges(LIVE, [
    { column: "  nOtEs ", op: "rename", to: "Remarks" },
  ]);
  assert.equal(byCase.changes[0]?.columnId, "c-notes");

  const byId = planColumnChanges(LIVE, [
    { column: "c-owner", op: "rename", to: "Assignee" },
  ]);
  assert.equal(byId.changes[0]?.columnId, "c-owner");

  const missing = planColumnChanges(LIVE, [
    { column: "Nope", op: "remove" },
  ]);
  assert.equal(missing.changes.length, 0);
  assert.match(missing.refused[0].reason, /no column by that name/);
  // The refusal names the real columns, so the model can correct itself.
  assert.match(missing.refused[0].reason, /Quest, Status, Notes, Owner/);
}

// ── Renames that cannot mean anything ────────────────────────────────────
{
  const noTarget = planColumnChanges(LIVE, [{ column: "Notes", op: "rename" }]);
  assert.match(noTarget.refused[0].reason, /needs `to`/);

  const noop = planColumnChanges(LIVE, [
    { column: "Notes", op: "rename", to: "notes" },
  ]);
  assert.match(noop.refused[0].reason, /already called that/);

  const collision = planColumnChanges(LIVE, [
    { column: "Notes", op: "rename", to: "Owner" },
  ]);
  assert.equal(collision.changes.length, 0);
  assert.match(collision.refused[0].reason, /already another column/);

  const twice = planColumnChanges(LIVE, [
    { column: "Notes", op: "rename", to: "Remarks" },
    { column: "Notes", op: "remove" },
  ]);
  assert.equal(twice.changes.length, 1, "the first wins, the second is refused");
  assert.match(twice.refused[0].reason, /named twice/);
}

// ── A rename frees its old name for a later one in the same proposal ─────
{
  const plan = planColumnChanges(LIVE, [
    { column: "Notes", op: "rename", to: "Remarks" },
    { column: "Owner", op: "rename", to: "Notes" },
  ]);
  assert.equal(plan.refused.length, 0, "the freed name is available");
  assert.deepEqual(
    plan.changes.map((c) => `${c.columnName}→${c.to}`),
    ["Notes→Remarks", "Owner→Notes"]
  );
}

// ── Partial sets survive: refusals never drop the whole ask ──────────────
{
  const plan = planColumnChanges(LIVE, [
    { column: "Status", op: "rename", to: "Stage" }, // system → refused
    { column: "Notes", op: "rename", to: "Remarks" }, // fine
    { column: "Owner", op: "remove" }, // fine
  ]);
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.refused.length, 1);
}

// ── The tool stays USER-INITIATED (owner directive, 2026-10-16) ─────────
//
// The card is the consent to APPLY; it is not consent to reach for the tool
// at all. Nothing in code can stop a model from calling a tool it was
// offered, so the only brake is what the description and the menu say — and
// the first draft of both stated capability and no trigger, which reads as
// an invitation to tidy a schema nobody asked about. Pinned as source text
// because that IS the mechanism; a future edit that drops the constraint
// fails here instead of shipping a quietly keener tool.
{
  const tools = readFileSync("lib/domain/ai/tools/data-tools.ts", "utf8");
  const description = tools.slice(
    tools.indexOf("propose_column_changes: tool({"),
    tools.indexOf("inputSchema", tools.indexOf("propose_column_changes: tool({"))
  );
  assert.match(
    description,
    /ONLY when the user has asked/,
    "propose_column_changes must state that the user has to ask"
  );
  assert.match(
    description,
    /not a tool you reach for on your own initiative/,
    "propose_column_changes must forbid self-initiated use"
  );
  assert.match(
    description,
    /is NOT a reason to call it/,
    "noticing a messy schema must be named as insufficient grounds"
  );
  assert.match(
    description,
    /Never re-propose a change they rejected/,
    "a rejected change must not come back"
  );

  // The menu is the DISCOVERY surface — a model browsing for something to do
  // reads this line, not the description.
  const menu = readFileSync("lib/domain/ai/tools/menu.ts", "utf8");
  const entry = menu
    .split("\n")
    .find((l) => l.includes("propose_column_changes:"));
  assert.ok(entry, "propose_column_changes needs a TOOL_MENU entry");
  assert.match(
    entry,
    /THE USER ASKED/,
    "the menu line must name the user as the trigger"
  );
  assert.match(
    entry,
    /never on your own initiative/,
    "the menu line must forbid self-initiated use"
  );
}

console.log(
  "✓ column:changes:check — system columns, the primary column, unknown names, no-op and colliding renames, duplicates; partial sets and freed names survive; the tool stays user-initiated"
);
