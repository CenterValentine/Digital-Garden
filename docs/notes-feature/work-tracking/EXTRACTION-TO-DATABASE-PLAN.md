# Extraction → Database Capture Plan

**Status:** PLANNED (owner decisions locked 2026-08-29)
**Driving use case:** job hunting — co-browse/iteration runs land qualified leads as `DataRow`s instead of markdown tables, so leads stay normalized, dedupable, and iterable.
**Related:** `DATABASE-CONTENT-TYPE-PLAN.md` (Phase 6 tools, decision O3), `PER-ITEM-PLAYBOOK-ITERATION-SPEC.md` (the loop this extends), `docs/notes-feature/core/AI-ARCHITECTURE.md`.

---

## 1. Problem

Today the per-item iteration loop captures structured judgments and immediately throws the structure away:

- `extract_structured` (registry.ts:198) persists **nothing** — rows exist only in model context.
- `record_item_result` (registry.ts:637) already captures `status` / `qualified` / `fitPercent` / `verdict` per item, but writes them as **markdown lines** in the run ledger (run-ledger.ts:71).
- The roll-up re-emits every item as a markdown table via `createNote` — lossy the moment it lands, unqueryable, and un-dedupable across runs.

Meanwhile a real structured write path exists — `insert_rows` (data-tools.ts:481), shipped *for this exact flow* (DATABASE-CONTENT-TYPE-PLAN.md O3: "the co-browse job-hunting flow requires it") — but the loop never calls it, and four of its properties fight an iteration run:

1. **Jurisdiction refusal.** `resolveJurisdiction` (data-tools.ts:94) requires the chat to be bound to the database or hold a `ConversationAssociation`. A side-panel co-browse chat rooted on a job board has neither.
2. **Approval stacking.** `CONFIRM_THRESHOLD = 10` (data-tools.ts:57) forces a `confirmedByUser` attestation per >10-row batch; iteration runs default to 10–15 items per batch.
3. **Partial rows.** `insert_rows` creates rows before cell validation completes — a rejected cell lands as a blank in an already-committed row (its own result string admits "cells rejected by validation (rows created without them)").
4. **Tool-class mismatch.** The data tools are user-toggleable; the iteration tools are harness-internal *precisely so a loop can't be stranded mid-run*. A loop that depends on a toggleable tool is a live hazard.

## 2. Owner decisions (locked 2026-08-29)

| # | Decision | Choice |
|---|---|---|
| D1 | Schema provisioning | **Owner pre-creates the table.** No AI path creates tables/columns/options (schema alteration stays owner-only REST). The run preflights the schema and fails **loudly** on drift — never silently blanks cells. |
| D2 | Where the write lives | **Inside `record_item_result`.** The harness-internal ledger tool also upserts the `DataRow` in the same call — decide+do is one code path, no per-batch confirmations. Approval concentrates in the up-front `propose_item_iteration` card, which now names the target database. |
| D3 | Admission (which items get rows) | **Dictated by the user's prompt per run.** Owner's own use: qualified-only. Other runs may admit everything, or admit only after a 2nd/3rd refinement pass. Admission is a declared run parameter, not a fixed policy. |
| D4 | Stage-2 execution posture | **Live now, batch-shaped.** Lead investigation / resume / CL runs execute as interactive playbook runs on existing infra, specced row-driven (pull work from rows, stamp results back) so a deferred batch runner can slot in later **without redesign**. Batch API itself: **backlogged** (BACKLOG.md → "Deferred batch execution"), savings noted there. |

## 3. Architecture

No new tool ids, no new extension, no schema change to `DataRow`. Two existing harness-internal tools grow optional capture fields; a preflight and a write helper are shared server modules.

```
propose_item_iteration (+captureTo)          record_item_result (+capture)
        │  post-approval execute:                     │  per item:
        │  1. resolve database ref                    │  1. read captureTo from ledger metadata
        │  2. schema PREFLIGHT (code, not model)      │  2. enforce admission rule
        │  3. ConversationAssociation grant           │  3. normalize + encode ALL cells (reject whole row on any failure)
        │  4. stamp captureTo into ledger metadata    │  4. UPSERT by dedupe key (update if key exists, else create)
        │  5. mark already-captured items             │  5. ledger line + rowId in result (→ chip)
        ▼                                             ▼
   Run Ledger note  ◄──────────────────────────  DataRow (via createRows/writeCells directly,
   (loop state, unchanged role)                   NOT via the toggleable insert_rows tool)
```

### 3.1 `propose_item_iteration` — new optional `captureTo`

```ts
captureTo: z.object({
  database: z.string(),            // id or exact name — resolved like resolveDatabaseRef
  admission: z.enum(["all", "qualified", "custom"]),
  admissionNote: z.string().max(300).optional(),  // e.g. "only items surviving the 3rd pass"
  columns: z.array(z.string()).min(1).max(20),    // column NAMES the run intends to write
  dedupeColumn: z.string().optional(),            // default: the first url-type column
}).optional()
```

**Post-approval execute additions** (runs only after the user approves the card):

1. **Resolve** the database (share/extract the ref-resolution + `findColumn` helpers from data-tools.ts:143/:179 into `lib/domain/data/server/` so both callers use one implementation).
2. **Preflight — code, not model.** `canWrite` required; query-mode tables refused; every named column must exist and be writable (`writeBlockReason`, data-tools.ts:249). For select/status/multiSelect columns, the preflight returns the **full option vocabulary (labels)** in the tool result — the model gets exact labels once, up front, instead of guessing per item. Any gap → `ok:false` with the specific missing column/option and the available names, so the model re-proposes or tells the user what to add. This is D1's teeth: owner-precreated schema, loud drift.
3. **Jurisdiction grant.** `addAutoAssociation(userId, conversationId, tableId, "tool-call")` — the same call the ledger already gets (registry.ts:602). Card approval *is* the write authorization; the existing structural jurisdiction model is unchanged, we just create the association at the moment consent happens.
4. **Durable capture config.** Stamp `{ tableId, admission, columnKeys, dedupeColumnKey, optionMaps }` into the ledger note's `NotePayload.metadata` beside `runLedgerKey`. The ledger is already the run's reload-surviving state; `record_item_result` re-derives config from it by `ledgerRunKey` — never from model memory.
5. **Cross-run dedup at plan time.** Load existing values of the dedupe column (the `dedupeBy` scan pattern, data-tools.ts:530) and annotate already-captured items in the checklist (`— already in Job Leads`). The model (and the user, on the card) sees up front which items would be skips/updates.

### 3.2 `record_item_result` — new optional `capture`

```ts
capture: z.object({
  cells: z.record(z.string(), z.unknown()),  // column NAME → value; labels OK for selects
}).optional()
```

**Write semantics (the part that must be better than `insert_rows` v1):**

- **Config from ledger metadata**, keyed by `ledgerRunKey`. No `captureTo` on the run → `capture` is refused with a note (prevents un-approved writes).
- **Admission enforced where checkable**: `admission: "qualified"` + `qualified !== true` + cells present → cells refused, ledger line still written. `"all"` → any `done` item may carry cells. `"custom"` → the model applies the prompt's rule; the harness records which items carried cells so reconciliation can audit.
- **Validate-all-then-write, per row**: normalize (`normalizeCellInput`, data-tools.ts:227) and encode-check **every** cell before any DB write. Any rejection → **no row**, `ok:false` with the exact cell failure, ledger records `capture failed: <reason>`, and the result's `next` tells the model to fix and re-record *this item* before moving on. This deliberately does NOT reuse `insert_rows`' create-then-write sequence (the partial-row flaw); it calls `createRows` + `writeCells` (mutations.ts:252/:66) only after the full row validates.
- **Upsert by dedupe key**: dedupe-column value = item URL (url-tier key) → if a live row already holds it, `writeCells` **updates** that row instead of creating. This is what makes multi-pass refinement (D3) work: pass 2 re-records the same item and the row converges. Label-tier items (no URL) get created without a dedup guarantee and the result says so — weak keys stay visible, matching the ledger's `keyTier` philosophy.
- **Defense in depth**: `canWrite` re-checked per call; the association grant does not bypass access resolution.
- **Result carries `rowId`** for the chip (§5) and for reconciliation counts.

`record_iteration_findings` gains `rowsWritten` / `rowsUpdated` / `rowsFailed` counts so the reconciliation is checkable against the table, and the roll-up note **references the database view instead of re-emitting the table** (a token saving, §6).

### 3.3 Stage 2 — rows as the enumeration source (D4, live path)

Extend `propose_item_iteration.source` with `"database-rows"`:

- Items enumerate from the bound/associated table (via the same jurisdiction machinery): `label` = `deriveRowTitle`, `url` = the row's url-column value when present, `key` = **row id** (new `keyTier: "row"` — the strongest tier; survives everything short of row deletion).
- `capture` upserts stamp back to the *same row by id* — investigation results, materials links, status transitions.
- This makes refinement passes ("the list gets further refined", "only 3rd pass makes the list") and stage-2 lead investigation **the same machinery** as capture: a run over rows is just an iteration whose items happen to be rows.
- **Batch-shaped by construction**: the unit of work is `(tableId, rowId, playbook)` with results stamped back via CAS-able cell writes — independent, restartable, order-free. A future deferred runner (BACKLOG) consumes exactly this unit via a vendor batch API; nothing in the live path assumes interactivity except acquisition itself.
- Long-form materials (tailored resume, cover letter) do **not** go in cells: they are notes created per item (existing `createNote`), with the row linked via row→page promotion (`app/api/content/data/[id]/promote/`) and/or a `contentLink` column in the owner's schema. Cells hold state and pointers; documents hold prose.

### 3.4 Canonical Job Leads schema (documentation, not code)

Ships as a documented recipe (guides/), per D1. Recommended shape — and the reasoning is prescriptive:

| Column | Type | Why |
|---|---|---|
| Title | text | free vocabulary — never select |
| Company | text | free vocabulary |
| URL | url | **the dedupe column** — url-tier identity |
| Location | text | volatile vocabulary (D1: select options hard-reject unknowns; text for anything the web invents) |
| Fit % | number | from `fitPercent` |
| Stage | select (owner-controlled: Sourced / Screened / Investigated / Materials / Applied / …) | closed set the *owner* curates — the multi-pass ratchet |
| Qualified | checkbox | from `qualified` |
| Notes | longText | from `verdict` |
| Materials | contentLink (optional) | resume/CL notes |

Rule of thumb the preflight result should restate: **select/status only for vocabularies the owner controls; text for vocabularies the web controls.**

## 4. Phases

- **P0 — Shared plumbing.** Extract database ref-resolution / column lookup / normalize+translate helpers from `data-tools.ts` into `lib/domain/data/server/` (both callers keep behavior); association-on-approval helper. Gates: typecheck, existing data-tool behavior unchanged.
- **P1 — `captureTo` on the proposal.** Preflight, grant, ledger-metadata stamp, plan-time dedup annotation, card copy (§5). Gate: preflight failure paths return actionable `ok:false` (smoke: propose against a table missing a column → exact gap named).
- **P2 — `capture` on `record_item_result`.** Validate-all upsert, admission enforcement, `rowId` in result + chip, reconciliation counts. Gate: a rejected cell yields **zero** new rows (the anti-`insert_rows` assertion, unit-tested at the helper level).
- **P3 — `source: "database-rows"`.** Row enumeration, `keyTier: "row"`, stamp-back upsert; stage-2 playbook recipe documented. Gate: a refinement run over 10 rows updates in place — row count unchanged, `updatedAt` advanced.
- **P4 — DEFERRED: batch execution.** Backlogged with savings analysis (BACKLOG.md). Not in this build.

Prompt methodology sections keyed on `hasItemIteration` change in P1/P2 — `validate-prompt-cache` must be updated in the same PR (the per-item iteration work established this gate).

## 5. Chips & traceability

(Required section per AI-plan convention.)

- **Proposal card**: shows a database chip (icon + table title) + the admission rule in plain language ("→ Job Leads · qualified items only") + the intended columns + how many enumerated items are already captured. The card stays approve/reject only (registry.ts:518 — never promise editable fields).
- **Per-item result part**: when a row was written/updated, the `record_item_result` part renders a row chip — table title + row title, deep-linking to the table's URL-addressable view with the row peeked (`DataRowPeek`). Distinct visual for created vs updated.
- **Provenance, both directions**: the ledger line already links the source URL; the reconciliation entry links the table view. The `ConversationAssociation` created at approval means the conversation lists the database in its associations panel, and `addAutoAssociation` on the ledger ties run ↔ chat ↔ table together. A row's story is recoverable: row → (dedupe URL) → ledger item entry → conversation.
- **Failure visibility**: a capture-failed item renders its ledger line with the rejection reason — a blank cell must never be the silent signature of a validation failure (that is `insert_rows` v1's exact trap, D1 forbids it here).

## 6. Cost & token analysis (priority: honest numbers)

**Capture is ~cost-neutral at write time.** The row rides an existing tool call: `capture.cells` adds roughly 50–150 output tokens per item — and the roll-up stops re-emitting every item as a markdown table (it becomes counts + a link to the view), which claws most of that back. Step budgets are untouched: same calls, same `itemIteration → budget*4 + 8` cap (route.ts:2198).

**The savings are downstream, and they compound:**

1. **Plan-time dedup** (the big one for a scraper that revisits the same boards): items already in the table are marked before the run starts — each skipped item avoids a page read + scoring pass, ~3–10k input tokens per JD. *Honest limit of D3*: with qualified-only admission, **rejects are not in the table**, so re-encountered rejects are re-scored unless the run also consults prior ledgers. If re-scoring rejects turns out to dominate cost, the escape hatch is an admission choice (`all` + Stage=Rejected view), not new machinery — the design supports it today, per run, by prompt.
2. **Stage-2 reads are bounded**: `query_database` serializes through a ~4KB budget (data-tools.ts:5-9); pulling one lead's row is a few hundred tokens vs re-reading roll-up notes. Rows never ride the mention capsule; the schema digest buckets rowCount so continuous writes never dirty the context hash (digest.ts).
3. **Preflight front-loads vocabulary once**: option labels arrive in one proposal result instead of per-item trial-and-error against the strict encoder.
4. **Model routing already exists** for the expensive stage: playbook `model:` directives (model-directives.ts) let stage-2 research phases run on cheaper models per phase; `extract_structured` already uses a cheap-model `generateObject`.

**Where the real money is**: stage 2, not capture. Per-lead investigation (JD re-read + company research + materials drafting) plausibly runs 20–80k input / 2–10k output tokens per lead depending on model and depth. At tens of leads/week this is single-digit dollars at list price on mid-tier models — which is why the ~50% batch discount is **backlogged rather than built**: it halves a number that is currently small, at the price of an entire async substrate the repo doesn't have (zero deferred-AI infrastructure exists; the only offline-AI precedent is the `studio-context-sweep` cron). It becomes worth building when row volume or model tier moves the weekly number, and the row-driven unit of work (§3.3) is deliberately shaped so it slots in then. Savings survey and trigger conditions: **BACKLOG.md → "Deferred batch execution for row-driven AI runs."**

Cost observability rides existing rails: batch checkpoints and reconciliation already stamp `tokensSoFar` + `estimatedCostUsd` into the ledger (registry.ts:746, run-ledger.ts:58) — per-phase cost is recoverable by subtraction, per-run cost lands in the run's own record.

## 7. Risks & honest gaps

- **Concurrent runs can double-insert.** Dedup is application-level (no unique index on any `data` path). Two simultaneous runs against one table race the check. Accepted for single-user reality; documented, revisit only with evidence.
- **Label-tier items dedupe weakly.** Items without URLs get rows with no identity guarantee. Mitigation is visibility (flagged in checklist + result), not false confidence.
- **`insert_rows` keeps its partial-row flaw** — out of scope here, but the new helper's validate-all path is the fix; port it back in a cleanup pass (tracked as a P2 stretch note, not a gate).
- **Owner-precreated schema drift over time** (renamed columns, pruned options): every run re-preflights, so drift surfaces at the next proposal, not mid-run — but preflight checks the *named* columns only; it cannot warn about vocabulary the playbook implies but doesn't declare.
- **User toggles**: capture writes go through `mutations.ts` directly, so disabling the (toggleable) data tools cannot strand a run — but `describe_database`/`query_database` remain toggleable and stage-2 enumeration may want them; enumeration therefore also runs harness-side (proposal execute), not via toggleable tools.

## 8. Non-goals

- No AI schema creation (tables/columns/options) — D1.
- No new tool ids, no new extension, no `DataRow` schema change, no unique-constraint migration.
- No deferred/batch execution in this build — backlogged (D4).
- No replacement of the run ledger: markdown ledger stays the loop's state; the database is the *output*, not the state store.

## 9. Gates & smoke

- `pnpm typecheck` / `pnpm lint` / `pnpm build`; `pnpm ai:drift:check` (schema fields on existing tools — no new ids, so metadata classification is unchanged; prompt edits touching iteration methodology re-run `validate-prompt-cache`).
- Unit: validate-all rejection creates zero rows; admission=qualified refuses cells on unqualified items; upsert converges on url-tier key; preflight names the exact missing column/option.
- Smoke (PR checklist lines): (1) side-panel co-browse run with `captureTo` against a pre-created Job Leads table → approve card → rows appear with correct cells, re-run marks existing items and updates instead of duplicating; (2) propose against a table missing "Fit %" → actionable refusal, no writes; (3) `source: "database-rows"` refinement run updates rows in place.
