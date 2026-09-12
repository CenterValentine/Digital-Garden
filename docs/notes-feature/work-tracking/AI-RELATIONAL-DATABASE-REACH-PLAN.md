---
title: AI Relational Database Reach — plan
status: built (branch feat/ai-relational-database-reach, 2026-09-12)
created: 2026-09-11
origin: prod conversation `c66c8efd` ("Database Table Proposal and Links"), chat node `f938f857`, folder "Evidence" `87b50703`
related: DATABASE-CONTENT-TYPE-PLAN.md (Phase 4), EXTRACTION-TO-DATABASE-PLAN.md (§3.6, §3.7, §10), AI-TOOLING-ROUND-PLAN.md (§2 capability-true gating)
---

# AI Relational Database Reach

The AI can read, fill, and mint databases, but it cannot *relate* them, and
nothing it can read tells it that relations exist. This plan closes both gaps,
using one recorded production session as the fixture. The session was a
deliberate first attempt at the schema; the owner's stated next step is to
migrate the "Master career evidence ledger" note into the resulting tables,
so the plan ends where that step begins.

## 0. The recorded session (what actually happened)

**Request** (owner, 2026-09-12 03:35 UTC, chat bound to the database "Career
Evidence Library" `9dd1ff96`, output target `chat`):

> Build 3 new tables and update this database to link with these tables.
> Propose the table columns to me. If there are any feature limitations that
> would prevent you from doing this, give me a feature request document to
> underline the functional gaps that can be used to improve the code library.

The message carried a pasted spec: three tables (Experiences, Claims and
metrics, Sources) and a twelve-field Experience shape, including "Outcomes —
linked claims and metrics" and "Sources — links back to the original evidence".

**What the assistant did** (one turn, six tool calls):

| Step | Tool | Outcome |
|---|---|---|
| 1 | `describe_database` | Read the bound table: one `Name` column, empty. |
| 2 | `propose_database_columns` | Turned the bound table into an *index* table: `Record Type` select, `Stable ID`, three **text** "Reference" columns, `Summary` ("copied from the corresponding detailed table"), `Readiness`. |
| 3–5 | `propose_output_database` ×3 | Experiences (15 cols), Claims and metrics (11), Sources (10). Every cross-table link is a **text** column holding hand-typed IDs (`EXP-012`, `CLM-012`). |
| 6 | `createNote` | "Feature Request — Linked Career Evidence Tables" (427 words) listing five gaps. |

The owner applied all four cards. Result in prod: four tables, 44 columns,
zero rows, zero relations. Every `Claim IDs` / `Source IDs` / `Experience ID`
column is `text`.

**What was true at the time.** The product already has all of this:

- `DataColumnType.relation` backed by `DataRowLink`, with symmetric backlink
  columns minted as one transaction (`createRelationPair`, `lib/domain/data/server/mutations.ts`).
- `lookup` and `rollup` (count, sum, min, max, join) computed at read time
  through a relation column.
- `IMPLEMENTED_COLUMN_TYPES` in `lib/domain/data/types.ts` lists all of them;
  the grid's type picker and `POST /api/content/data/[id]/columns` accept them.
- A links API (`POST/DELETE /api/content/data/[id]/links`) that refuses writes
  through backlinks and validates the column is a live relation on that table.

So four of the five "functional gaps" in the feature request describe **the
assistant's tool surface**, not the application. The note is an accurate
report of everything the assistant was given: its tool schemas listed no
relation type, and `describe_database` would not have shown one even if it
existed. The inadequacy is in what the system let it see, not in the note.
Only gap 4 (no atomic multi-table operation) is real at the product level, and
only because the proposal cards are the product's creation path for the AI.

## 1. Findings

Each finding is classified so the fix lands in the right layer.

### F1 — The proposal tools cannot propose a relation (tool-surface gap)

`propose_output_database` accepts twelve types; `propose_database_columns`
accepts eleven. Neither includes `relation`, `lookup`, `rollup`,
`contentLink`, or `person`, all of which `IMPLEMENTED_COLUMN_TYPES` offers the
grid. The Zod enums are hand-copied subsets of the product list. This is a
parallel-table drift of exactly the kind `ai:drift:check` guards elsewhere,
with no gate on it.

Consequence: the model, correctly reading its schema, degraded to text IDs and
built the "stable ID" workaround the owner now has to maintain by hand.

### F2 — The create route would reject a relation even if proposed (route gap)

`POST /api/content/data` keeps its own `creatableTypes` set (same twelve). A
relation also needs a `relationTableId`, which cannot exist for a table being
created by the same click. Three tables that reference each other cannot be
expressed as three independent creates.

### F3 — The schema digest hides the graph (context gap)

`buildDataSchemaDigest` renders a relation column as `- Claims (relation)` with
no target. `file` and `contentLink` get an intent sentence; `relation`,
`lookup`, and `rollup` get nothing. Even if the owner had hand-built the
relations first, `describe_database` could not have told the model where they
point or which side is the backlink.

### F4 — No AI write path for links (tool gap)

`insert_rows` and `update_row` refuse relation cells via `writeBlockReason`
("links change through the table UI, not cell writes — not supported by this
tool yet"). The links route exists and is safe (forward-only, validated,
deletable). Nothing wraps it as a tool. So a relation the AI *could* propose
would still be one it cannot fill, which is the next request in this exact
workflow ("link each claim to its experience").

### F5 — The assistant had no way to learn what the product supports (capability-visibility gap)

The assistant's only sources of truth about columns were the two proposal
schemas (twelve types) and the digest from `describe_database` (which never
names a relation). From that information the feature-request note is the
correct conclusion; it reported the tool surface as the product because the
tool surface was all it had. The cost landed on the owner, who received a
document asking engineering to build what already ships and had no way to
tell either.

Two things are missing. First, the information: nothing in the tool context
says what the grid supports beyond what the tools can propose. Second, a
scoping instruction: with that information present, the model should attribute
a limit to the tool that has it. Precedent: AI-TOOLING-ROUND-PLAN §2 adds a
one-line disclosure when a tool is skipped for a known-incapable model,
because "silent absence is how the original bug hid for months". Same
principle: a capability the model cannot reach is *named as unreachable*, not
reported as absent.

### F6 — "Update this database to link" produced a parallel structure (product-principle gap)

Asked to make the existing table link to three new ones, the model turned it
into an index of the other three, with a `Summary` column "copied from the
corresponding detailed table". That is the duplication the product principle
warns against (`core/PRODUCT-PRINCIPLES.md`: never make a parallel container
the convenient route). With relations available, the honest reading of the
request is: the existing table *is* one of the three (Experiences), or it gains
relation columns to the three. Without relations, the index was the only shape
left, so F6 is mostly a consequence of F1, but the prompt should say which
reading to prefer.

### F7 — Four cards, four clicks, no atomicity (UX gap, the one real product gap)

The request was one schema; the consent was split into four cards with no
ordering, no cross-references, and no rollback. Gap 4 in the owner's feature
request is legitimate. Approving a linked schema should be one card and one
Apply that either creates everything or nothing.

### F8 — The owner's next step has no paved path (gap in the same workflow)

This session was the schema step. The owner's stated next step is to migrate
the "Master career evidence ledger" (a 28,000-character **note**, not a
database) into the three tables: experiences, their claims, their sources,
linked. Today that has no governed route: `propose_item_iteration` enumerates
from `list-page`, `open-tabs`, `urls`, or `database-rows`, never from a note's
sections, and the row-writing tools refuse relation cells (F4). The only path
would be the model reading the attached note and calling `insert_rows` per
table with hand-typed text IDs, which is the workaround this plan exists to
retire. See P7.

### Noise, recorded so it is not rediscovered

- The model stamped `group: "todo"` on plain `select` options; the tool
  strips it. Harmless. Tightening the schema (`group` only when
  `type === "status"`) is a one-line refinement, bundled into P1.
- The bound table had been created nine minutes before the chat with only a
  `Name` column. The owner intended it as the root of the model, not an index.

## 2. Design

### P1 — Proposal tools speak the product's column vocabulary

Both proposal tools derive their type enum from one exported list instead of
hand-copied literals:

```ts
// lib/domain/data/types.ts
export const AI_PROPOSABLE_COLUMN_TYPES = IMPLEMENTED_COLUMN_TYPES.filter(
  (t) => t !== "person",   // needs a people picker decision; see §6
);
```

Relation, lookup, and rollup columns carry their config in the proposal:

```ts
{ name: "Experience", type: "relation",
  target: "Experiences",            // existing table title/id, or "$new:Experiences"
  backlinkName: "Claims",           // name of the mirrored column on the target
  description: "..." }

{ name: "Verified claims", type: "rollup",
  through: "Claims",                // a relation column in THIS proposal or table
  fn: "count", filter?: {...},      // fn from RollupFn; count needs no column
  description: "..." }

{ name: "Employer", type: "lookup", through: "Experience", column: "Employer" }
```

`target` resolves at apply time: an existing title/id resolves through the
same jurisdiction check as `describe_database`; `$new:<title>` refers to a
table in the same proposal (P2). `propose_database_columns` accepts relation
columns to existing tables today with no new endpoint, because the columns
route already calls `createRelationPair`.

New drift gate: `ai:drift:check` asserts the proposal enums equal
`AI_PROPOSABLE_COLUMN_TYPES` and that the create route's `creatableTypes`
equals it too. Mutation-test it (remove a type, confirm the gate fails).

### P2 — One proposal for a linked schema, one Apply, one transaction

**Approved by the owner, 2026-09-11.**

New tool `propose_linked_databases` (kept separate from
`propose_output_database`, whose single-table contract every prompt relies on,
the same reasoning as §3.6's `propose_column_changes`):

```ts
{
  tables: [ { title, purpose, columns: [...] } ],          // 1..5 new tables
  extend: [ { databaseId|title, columns: [...] } ],        // relation cols onto EXISTING tables
  rationale
}
```

Renders **one card** listing every table and every relation edge as a small
graph ("Experiences ⇄ Claims and metrics via Claims / Experience"). Apply
POSTs `POST /api/content/data/batch`, a new route that runs in one Prisma
transaction: create tables in order, then relation pairs (resolving `$new:`
references to the ids just minted), then lookups and rollups (which need the
relation ids). Any failure rolls back everything and the card reports
"nothing was created". The route reuses `createRelationPair` and the existing
column creation, so no new storage semantics.

Placement follows the existing rule in `propose_output_database` (charter
folder, else target folder, else the bound content's parent).

### P3 — The digest names the graph

`buildDataSchemaDigest` renders:

```
- Claims (relation → Claims and metrics, backlink of "Experience")
- Verified claims (rollup: count of Claims where Confidence is Verified)
- Employer (lookup: Experience → Employer)
```

Cheap, no schema change, and it makes `describe_database` the model's map of
the database graph. This alone would have let the model discover that
relations exist.

### P4 — Relation cells ride the existing write tools (no new tool)

No `link_rows`. A relation is a cell like any other from the model's point of
view, so `insert_rows` and `update_row` accept relation cells as arrays of
target row ids (from `query_database`) or exact primary-cell titles, resolved
server-side against the relation's target table. On insert the server creates
the row, then writes the links; on update it diffs the cell against the
current links (add the missing, remove the absent) under the existing `expect`
guard, so a stale read still fails safe. Forward columns only; the links
route's backlink refusal is reused. `writeBlockReason` drops its relation
branch and keeps refusing lookup/rollup, which store nothing.

Consent and limits are inherited unchanged: 25 rows per `insert_rows` call,
batches over 10 need `confirmedByUser`, one row per `update_row`. Linking
many existing rows is a query followed by one `update_row` per row, which is
already the tool's shape for any bulk edit. No new tool means no new settings
metadata, no new drift-gate entry, and one less thing for prompts to name.

### P5 — Give the model the product's capability list, then ask it to scope limits

Information first. The data-tools context line lists
`AI_PROPOSABLE_COLUMN_TYPES` and, whenever the product list is wider, adds
"the grid additionally supports: …". After P1 the two lists match and the
sentence disappears on its own; until then it is the one fact the recorded
session was missing.

Then the scoping instruction, in the tool-discipline block of
`system-prompt.ts`:

> When you cannot do something, say which TOOL cannot do it, and check the
> capability line before saying the application cannot. If asked for a
> feature request, title each gap by the tool that lacks it
> ("propose_output_database cannot declare relations") and mark anything you
> have not verified as unverified.

### P6 — Prefer the user's existing table over an index of it

One prompt sentence in the database block: "When asked to link an existing
database to new ones, add relation columns to it (or treat it as one of the
new tables); never rebuild it as an index that copies their summaries."

### P7 — A paved path from a note into linked tables

The owner's next step (F8) needs two things, and the second is optional for
this note.

**Required:** P4. With relation cells accepted on insert, the model can read
the attached ledger note (28k characters, roughly 7k tokens, well inside the
attached-content budget) and call `insert_rows` per table: experiences first,
then claims with their `Experience` cell set to the experience's title, then
sources linked to both. Titles resolve server-side to the rows just created.
Three tool calls per batch of up to 25 rows, consent through the existing
batch guard. Nothing new to build beyond P4.

**Later, for notes that do not fit in context:** a `note-sections` enumeration
source for `propose_item_iteration` (items = the note's top-level sections,
`captureTo` as today), so a long ledger becomes a governed per-item run with a
quest ledger and stamp-back. Unscheduled; listed in §8 so it is not lost.

After a linked-schema card is applied, the follow-up hint (existing
`follow-ups.ts`) offers "Populate <table> from <long note in this folder>".

## 3. PR shape — one release train (owner, 2026-09-11) — BUILT

One PR, one branch (`feat/ai-relational-database-reach`). Nothing forced a
split: no migration (relation config is JSON, `DataRowLink` exists), no TipTap
change (no Hocuspocus redeploy), no endpoint the other pieces waited on, and
every piece edits the same three files.

| Commit | Contents | State |
|---|---|---|
| `ede241e4` | P3 digest names relation targets, lookup paths, rollup fns | ✅ |
| `4f4443d4` | `applyLinkedSchema` + tx-aware column helpers + `AI_PROPOSABLE_COLUMN_TYPES` + the create route delegating to it | ✅ |
| `d9980cc2` | P1 shared `proposedColumn` schema, `propose_linked_databases`, `/api/content/data/batch`, drift gate 6 (mutation-tested ×3) | ✅ |
| `f3d53e3f` | P2 `LinkedDatabasesProposalCard`; both existing cards render graph columns; columns card moves to the batch endpoint | ✅ |
| `cbfd8f19` | P5 limit-scoping rule + P6 relational-database prompt block | ✅ |
| `f791e360` | P4 relation cells in `insert_rows` / `update_row` | ✅ |

**Defaults taken** (§6, all as planned): `person` deferred; an update
REPLACES a relation cell's links; the single-table proposal tool accepts
relations to tables that already exist.

### What the build changed about the plan

- **No `link_rows`, and no separate linking step at all.** As decided. A
  relation cell's value IS its links, so `insert_rows` resolves targets during
  validation and writes links after the row exists; `update_row` diffs against
  the current links under its existing `expect` guard.
- **Authorization moved out of the domain function.** `applyLinkedSchema`
  first resolved extend targets by `ownerId`, which would have locked out a
  database shared with owner-level rights — `canAlterSchema` is a ladder, not
  plain ownership. The batch route now resolves and authorizes; the domain
  function executes. Relation TARGETS stay owner-resolved, because drawing a
  relation into a table also mints a column there.
- **The capture path keeps refusing relations, explicitly.** Dropping
  `relation` from the shared `writeBlockReason` would have silently opened
  `captureTo` runs to relation columns they cannot write (capture stamps cells
  through `writeCells` and has no link path). Both capture call sites now
  refuse with a reason that names the alternative.
- **P7's follow-up hint became prompt guidance instead.** `follow-ups.ts`
  generates suggestions with a model from the last exchange; there is no
  rules table to add a row to. The "populate what you just created, from the
  long note in this folder, filling relation cells with titles" instruction
  went into the database prompt block, where the model actually decides.
- **The single-table create route gained transactionality** as a side effect
  of sharing the core. Its docstring used to say "atomically-ish".
- **`phone` is no longer creatable.** It was in the create route's set and in
  one tool enum, but in no type picker — the same drift in the other
  direction. Gate 6 would fail if it came back.

## 4. Chips & traceability

**Linked-schema card (P2).** States: `proposed` → `applying` → `applied`
(shows "3 tables · 4 relations · 2 rollups created", each table title a link)
or `failed` ("Nothing was created: <reason>", retry keeps the proposal).
Applied state persists in localStorage keyed by proposal hash, as the existing
cards do, and the transcript keeps the card in its applied state with the
minted ids. Content-write receipts (`__contentWrites`) are emitted per table so
the receipts line reads "Created 3 databases in Evidence".

**Relation cells (P4).** The existing `insert_rows` / `update_row` receipts
gain a link count: "Inserted 12 rows · 12 links (Claims → Experience)"; a
refused batch names the first unresolved title and writes nothing.

**Capability line (P5).** Not a chip. It is one sentence in the tool context
and, when the model names a limit, the answer is the trace.

## 5. Gates and smoke

- `pnpm ai:drift:check`: new assertion, proposal enums ≡ create-route types ≡
  `AI_PROPOSABLE_COLUMN_TYPES`. Mutation-tested before merge.
- `pnpm typecheck && pnpm lint && pnpm build`.
- Transaction test for the batch route: inject a failing third table, assert
  no `ContentNode` or `DataColumn` rows remain.
- **Smoke, schema:** in a chat bound to an empty database next to two existing
  tables, ask "add a relation to Sources and a count of linked sources" →
  card lists a relation with backlink name and a rollup → Apply → the grid
  shows both columns and the backlink appears on Sources.
- **Smoke, linked card:** replay the recorded request verbatim (§0) → one card, three
  tables plus relation columns on the bound table → Apply → relations are
  clickable in the grid; the reply contains no feature-request note.
- **Smoke, rows:** with the ledger note attached, "add the first three
  experiences and their claims, linked" → `insert_rows` on Experiences, then
  on Claims with `Experience` cells by title → the Experiences backlink cells
  show the claims; a claim naming an unknown experience is refused with the
  title named.

## 6. Decisions — settled

Settled 2026-09-11: `propose_linked_databases` (P2) approved; relation cells
ride `insert_rows` / `update_row`, no separate linking tool (P4). The rest
were taken as the plan's defaults when the train was built (§3).

1. **`person` columns in proposals.** Include now (`personSource: "person"`
   default) or defer? The plan defers; nothing in the recorded session needed it.
2. **Update semantics for relation cells.** Replace the row's links with the
   given set (recommended, matches how every other cell behaves under
   `expect`) or append only?
3. **Should `propose_output_database` itself accept relations to existing
   tables** once P1 lands, or should every relation go through the linked
   card? The plan says yes for existing targets, `$new:` only in the linked card.
4. **Referential-integrity asks** in the owner's feature request (unique stable
   IDs, refuse deleting a referenced row). With real relations the text-ID
   uniqueness problem disappears; deletion protection is a separate product
   decision and is out of scope here.

## 7. Non-goals

- Enforcing uniqueness on text columns. Relations make the workaround
  unnecessary.
- Retargeting a relation. Locked immutable in DATABASE-CONTENT-TYPE-PLAN
  Phase 4 (2026-08-26); a new target is a new column.
- `propose_column_changes` (rename/retype/delete). Tracked separately in
  EXTRACTION-TO-DATABASE-PLAN §10.

## 8. Open items

- Read back the owner's feature-request note `3cc169ea` after the PR and
  annotate each of its five gaps with what shipped and which layer it lived
  in, so the document that started this reflects the outcome.
- `note-sections` enumeration source for `propose_item_iteration` (P7,
  later): the governed route for migrating notes too long to attach.
- Decide whether the four prod tables from the session get their text
  reference columns migrated to relations by hand once the PR ships (owner
  action in the grid), or via a one-off script.
