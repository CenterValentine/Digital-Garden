# Extraction → Database Capture Plan

**Status:** PLANNED (owner decisions locked 2026-08-29; re-instructed 2026-08-31 post-Database II)
**Driving use case:** job hunting — co-browse/iteration runs land qualified leads as `DataRow`s instead of markdown tables, so leads stay normalized, dedupable, and iterable.
**Related:** `DATABASE-CONTENT-TYPE-PLAN.md` (Phase 6 tools, decision O3), `PER-ITEM-PLAYBOOK-ITERATION-SPEC.md` (the loop this extends), `docs/notes-feature/core/AI-ARCHITECTURE.md`.

> **Re-instruction 2026-08-31** (Database II, PR #201, merged after this plan was written): (1) an AI path for **select/status options** now exists — `propose_column_options`, proposal-card contract, user's Apply does the PATCH — so the preflight's option-gap failure becomes an in-chat repair loop instead of a dead end (D1 amended; §3.1); (2) `create_shortcut` + `alsoShortcutTo`/`overwriteContentId` establish the **single-source + shortcuts doctrine** the owner directed for playbooks and run outputs (new §3.5); (3) File cells are enforced upload/file-node attachments and the AI can attach file nodes it created — the stage-2 materials story upgrades from contentLink pointers to File cells with convergent in-place iteration (§3.3, §3.4).

> **Re-instruction 2026-09-01 (owner position changes)**: (1) **D1 reversed** — the AI now structures databases: it proposes the *output* database (schema + AI-written column descriptions) when none exists — saving user time is a first-order objective — and *ledger* databases are system-provisioned with no user design at all (§3.7, §3.6). (2) **The run ledger goes database-backed** — deliberately reversing the "no run database" doctrine (run-ledger.ts:7-8), which predates the data content type: iterative item-state lives in **durable, reusable ledger databases** — a ledger is an ongoing *matter*, continued or created per run (D9) — tracked by a per-playbook **index database, a ledger of other ledgers** (one playbook serves many matters that must not co-mingle); operational/narrative context stays in the per-session run note (D5/D6/D8/D9, §3.6). Existing markdown playbooks transition additively and lazily (D10, §3.8). (3) **The playbook node becomes the hub** — through its index database, which supersedes the momentary per-session-shortcuts idea (owner-flagged overlap; D7, §3.5). New decisions D5–D8; open items in §10.

---

> **Terminology settled (2026-09-01, final): Charter → Quest → Sitting** — see the §0 glossary. Earlier notes' "playbook / quest ledger / operation / matter" vocabulary is superseded; the concepts are unchanged.

## 0. Terminology (settled 2026-09-01)

| Term | Meaning |
|---|---|
| **Charter** | The template — the written commissioning document (what shipped as "playbook"). A charter states the method and standing rules; the AI's role is unambiguous: **fulfilling a commission**. |
| **Master ledger** | The charter's own database — its registry: **one row per quest** commissioned from it. |
| **Quest** | One implementation of a charter — an ongoing matter ("Job Hunt 2026"), alive across many sittings. |
| **Quest ledger** | The quest's working item database, AI-sculpted around the machinery core. **One quest, one ledger** — jobs scraped across different sites all contribute to the same quest's ledger. |
| **Quest log** | The quest's narrative record — phase prose, anomalies, decisions — appended per sitting. Successor of the legacy "Run Ledger" note. |
| **Sitting** (session) | One attempt/bout at a quest — LinkedIn today, Indeed tomorrow, **and each agent that picks up the quest gets its own sitting**. A context marker that shapes memory about what the user is doing. Sittings have **no artifacts of their own**: the ledger and log *track* sittings, never the reverse. |

**Legacy mapping**: playbook → charter (product vocabulary; the shipped identifiers `metadata.playbook`, `/playbook`, `search_playbooks` alias or migrate in P4/P5, not before). "Run Ledger" / "runbook" → retired (§3.6 historical note). Earlier drafts' "quest ledger" / "operation" / "matter" → quest ledger / quest. **Sections of this doc that describe shipped code deliberately keep legacy identifiers; sections describing the future system use this vocabulary.**

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
| D1 | Schema provisioning | **REVERSED 2026-09-01 — the AI structures databases.** *Output* databases: when no suitable table exists, the AI proposes one from the playbook's objective — schema, types per §3.4's rules, and **AI-written column descriptions** — on a one-time approval card (§3.7); binding to a user-made table remains fully supported, no longer required. *Ledger* databases: the per-playbook **index** is system-standardized; per-session **run ledgers are AI-sculpted to the task** around a small machinery core (§3.6) — zero user design either way. Options stay proposable via `propose_column_options` (data-tools.ts:779; user's Apply writes). Preflight + loud-drift behavior unchanged. Rationale: the AI structures a decent schema from even a rough playbook, and writes clearer column descriptions faster than the user would — **saving user time is a first-order product objective**. |
| D2 | Where the write lives | **Inside `record_item_result`.** The harness-internal ledger tool also upserts the `DataRow` in the same call — decide+do is one code path, no per-batch confirmations. Approval concentrates in the up-front `propose_item_iteration` card, which now names the target database. |
| D3 | Admission (which items get rows) | **Dictated by the user's prompt per run.** Owner's own use: qualified-only. Other runs may admit everything, or admit according to qualifying passes (i.e., only items surviving a 2nd/3rd refinement pass). Admission is a declared run parameter, not a fixed policy. |
| D4 | Stage-2 execution posture | **Live now, batch-shaped.** Lead investigation / resume / CL runs execute as interactive playbook runs on existing infra, specced row-driven (pull work from rows, stamp results back) so a deferred batch runner can slot in later **without redesign**. Batch API itself: **backlogged** (BACKLOG.md → "Deferred batch execution"), savings noted there. |
| D5 | Quest & ledger storage (2026-09-01, settled) | **Databases, two tiers.** A **quest is an ongoing matter, not a bout** — one implementation of a charter, a session that stays open (one job hunt = one quest for months). **One quest, one ledger**; sittings (per site, per attempt, per agent) all contribute to the same ledger. The charter owns exactly one **master ledger** ("a ledger of other ledgers") — one row per quest, mandatory contentLinks, per-sitting history; every sitting of a quest updates its same master row. Iterative item-state → ledger rows; narrative/operational context → the quest log. Deliberately reverses the "no run database" doctrine (run-ledger.ts:7-8), which predates the data content type. |
| D6 | Ledger affordance (2026-09-01; icons APPROVED same day) | Ledger databases **borrow the `data` content type** (viewer, rows, views come free) but present distinctly. **Approved icon spec ("all distinct", full swaps, lucide):** charter = `ScrollText` · master ledger = `LibraryBig` · quest ledger = `Map` · quest log = `BookOpenText`; ordinary user databases keep the plain `Database` icon untouched. Ships in P0a. Remaining special properties — file-tree mobility and movable nested outputs — are **still undefined and tracked in §10**. |
| D7 | Charter = hub (2026-09-01, amended same day) | The charter keeps track of its quests **through its master ledger** (D5) — one row per quest, with links and queryable facts. This **supersedes the per-session-shortcuts idea**: master rows and shortcuts under the charter would represent the same quests twice (owner-flagged overlap), and the master wins because rows carry data (status, counts, cost), not just pointers. Everything about a charter's history stays one hop away; §3.5's shortcut machinery keeps its role for *materials*, not quest registry. |
| D8 | Mid-flight schema grace (2026-09-01) | For **ledger databases only** (extension to output tables is an open question, §10): the AI may add a **single column mid-run** when a task or context change requires it — the user needs it going forward and the ledger doesn't have it — enabling self-improvement without a card. Bounded: one column per event, mid-flight points only, logged in the quest log, surfaced as a chip. |
| D9 | Quest continuity (2026-09-01) | **Continue-or-create per run — the AI decides from user context.** An explicit mention of a quest or past matter → that quest; continuation cues → the best master-ledger match, **named on the proposal card** so the choice is visible and correctable before any write; blank context → a new quest. A later sitting on the same quest updates the **same rows** (upsert by `itemKey` — "every session could write to a ledger on the same row"); per-sitting touches ride the row's history (§3.6). |
| D10 | Markdown-playbook transition (2026-09-01) | **Additive, lazy, no bulk migration** (§3.8). A playbook stays a markdown note — "database-backed" is attached harness infrastructure, not a format change, so there are no two playbook formats to reconcile. The index is find-or-created on a playbook's next run post-P4, its id stamped in `metadata` (presence = transitioned; idempotent, self-healing). Old run-ledger notes remain historical records; backfill only on explicit user request, as an ordinary run. **"Standard even when unused" = the index exists, not that rows do.** |

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
2. **Preflight — code, not model.** `canWrite` required; query-mode tables refused; every named column must exist and be writable (`writeBlockReason`, data-tools.ts:249). The preflight result returns, per intended column: name, type, **description** (`DataColumn.description` — the D9 AI-facing help field, already woven into the schema digest), and for select/status/multiSelect the **full option vocabulary (labels)** — the model gets exact labels and each column's intent once, up front, instead of guessing per item. **Column descriptions are critical capture context**: they are what tells the model *how* to map scraped page content into a column ("Fit %" alone is ambiguous; "0–100 score from the job-fit playbook's rubric" is not). The owner may or may not have written them, so the preflight flags description-less capture columns as a capture-quality warning in the proposal result (soft — never a refusal), and the §3.4 recipe instructs the owner to fill them. Any hard gap → `ok:false` with the specific missing column/option and the available names. This is D1's teeth: owner-precreated schema, loud drift. **Gap resolution is two-tier** (Database II): a missing *option* → the model calls `propose_column_options` (the user's Apply does the PATCH; owner-gated) and then re-proposes the run — repairable without leaving chat; a missing *column* → still names the gap and hands it to the owner in the grid, no AI path. **What the preflight does and does not check**: it compares the run's *declared* columns against the table's *existing* vocabulary — it does **not** pre-scan the still-unread job descriptions, so category values that only emerge from the pages surface mid-run instead (handled in §3.2; the model *may* choose, guided by the playbook, to propose vocabulary up front after enumeration — e.g., 40 collected titles suggest the category set — but that is model judgment, not an automatic pre-scan).
3. **Jurisdiction grant.** `addAutoAssociation(userId, conversationId, tableId, "tool-call")` — the same call the ledger already gets (registry.ts:602). Card approval *is* the write authorization; the existing structural jurisdiction model is unchanged, we just create the association at the moment consent happens.
4. **Durable capture config.** Stamp `{ tableId, admission, columnKeys, dedupeColumnKey }` into the ledger note's `NotePayload.metadata` beside `runLedgerKey`. **The ledger is the run's reload-surviving state** — capture config lives there, never in model memory or client state, so a resumed or reloaded conversation keeps capturing correctly; `record_item_result` re-derives config from it by `ledgerRunKey`. Option vocabularies are deliberately **not** frozen into this config — the write path reads them live (§3.2), so a mid-run `propose_column_options` Apply takes effect immediately.
5. **Cross-run dedup at plan time.** Load existing values of the dedupe column (the `dedupeBy` scan pattern, data-tools.ts:530) and annotate already-captured items in the checklist (`— already in Job Leads`). The model (and the user, on the card) sees up front which items would be skips/updates.

### 3.2 `record_item_result` — new optional `capture`

```ts
capture: z.object({
  cells: z.record(z.string(), z.unknown()),  // column NAME → value; labels OK for selects
}).optional()
```

**Write semantics (the part that must be better than `insert_rows` v1):**

- **Config from ledger metadata**, keyed by `ledgerRunKey`. No `captureTo` on the run → `capture` is refused with a note (prevents un-approved writes). Select/status **option vocabularies are read live from the table at write time**, never from config frozen at propose — required for the mid-run repair loop below.
- **Mid-run option repair** (job categories that only emerge from reading the JDs): an unknown option value fails that item's capture whole (no partial row) with the label named. The model then raises `propose_column_options` *mid-run*, the user Applies (the grid updates via `dg:data-schema-changed`), and the model re-records the item — the live option read picks up the new vocabulary without re-proposing the run. If the user declines the card, the model falls back per the playbook (usually: leave the cell empty, note it in the verdict).
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
- Long-form materials (tailored resume, cover letter) do **not** go in cells — but Database II upgrades how cells *point at* them. A tailored resume produced by `create_docx` is a file node the AI created, and **File cells accept AI-created file nodes** (File-vs-ContentLink doctrine: File = external/produced artifacts, Content Link = references to app content). So the lead row carries a File cell for the artifact, and iteration is **convergent**: re-tailoring passes `overwriteContentId` — same node id, new bytes — and every File cell and shortcut referencing it sees the new version. One artifact per lead, updated in place, never a trail of copies. Prose research stays in notes under the promoted row page (`app/api/content/data/[id]/promote/`). Cells hold state and pointers; documents hold prose.

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
| Materials | file (optional) | tailored resume/CL artifacts — `create_docx` output attached in place (§3.3) |

Rule of thumb the preflight result should restate: **select/status only for vocabularies the owner controls; text for vocabularies the web controls.** (With `propose_column_options`, "owner controls" now includes owner-*approves*: the model may propose vocabulary, but nothing lands without the Apply click.)

Post-Database II refinements to the recipe: Materials is a **file** column (enforced upload/file-node attachments; the AI attaches the `create_docx` artifacts it produced — see §3.3), with prose research under the promoted row page rather than a second link column. Fit % stays a plain `number` — percent presentation belongs to the display-formatting layer (`cellToDisplayText` appends `%`; `cellToText` stays raw for search/CSV/digest, so the token analysis in §6 is unaffected). Qualified can carry a creation-time default of unchecked.

**Write a `description` on every capture column** — this is part of the recipe, not a nicety. Descriptions (`DataColumn.description`, the D9 AI-facing field) are the model's mapping context for scraped content: "Fit %" → *"0–100 score from the job-fit playbook's rubric"*; "Stage" → *"pipeline stage; advance only via refinement runs"*; "URL" → *"the posting's canonical URL — the dedupe identity"*. They already ride the AI schema digest, and the §3.1 preflight surfaces them (flagging blanks as a capture-quality warning). A description-less column forces the model to guess from the name alone — the guess is where inconsistent capture comes from.

### 3.5 Shortcuts & the single-source doctrine (owner directives, 2026-08-31)

Database II shipped `create_shortcut` (registry.ts:1141 — deliberately **no approval gate**: shortcuts are folder-weight, find-or-create, chains collapse to the final target) plus `alsoShortcutTo` on `createNote`/`create_docx`. Two owner rules this plan adopts as design constraints:

- **Playbooks maintain a single source.** The job-fit / investigation playbook is never copied per run, per company, or per lead — one canonical note, referenced by every run, so every run executes the same current instructions. When a playbook should be *visible* elsewhere (a job-search hub, a workbench), it is pulled in as a **shortcut**, never duplicated. Any run or template guidance that would copy a playbook is wrong by construction.
- **Run outputs keep one canonical home; shortcuts mirror.** Materials land once (under the row page / database node per the output-target preset) and are mirrored into `job-search/{Company}` or other hubs via `alsoShortcutTo` / `create_shortcut`. Combined with `overwriteContentId` (§3.3), the whole materials lifecycle is single-source: one artifact node, mirrored wherever useful, updated in place — referencers follow automatically.
- **Playbook prose can carry shortcut directives** — "file the tailored resume under the lead's row; shortcut it into `job-search/{Company}`" — and the tools already honor them: `create_docx` respects active-playbook routing (`outputLocation`), `alsoShortcutTo` does the mirror in the same call, and `create_shortcut` covers after-the-fact placement. The stage-2 playbook recipe (P3 documentation) must demonstrate this pattern so job-hunt playbooks lean on it instead of inventing per-company copies.

This section is why the capture design stores **pointers** in cells and never content: the shortcut/overwrite machinery only converges when there is exactly one real node per artifact.

- **The charter is the hub (D7, amended)**: the charter tracks every quest through its **master ledger** (§3.6) — one row per quest linking the quest ledger, quest log, and output table, with queryable facts (dates, status, counts, cost). This supersedes per-session shortcuts under the charter node: master rows and shortcuts would represent the same quests twice (owner-flagged overlap), and rows win because they carry data, not just pointers. The user still finds everything from the charter — one hop into the master — and gap-fixing never requires hunting. `create_shortcut`/`alsoShortcutTo` keep their role here for **materials** mirroring; they are not a quest registry.

### 3.6 Charters, quests, and their ledgers (D5/D6/D8/D9)

**The hierarchy (owner, settled 2026-09-01): charter → quest → sitting; the ledger serves the quest.**

A **quest is one implementation of a charter** — its commission — and an ongoing matter, not a bout: the essence is *a session that stays open*. One job hunt is one quest, alive for months, every sitting adding to and refreshing the same list. Each run therefore **continues an existing quest or opens a new one** (D9) — separate quests never co-mingle, one quest never fragments. **One quest, one ledger**: jobs scraped on LinkedIn today and Indeed tomorrow are different *sittings* of the same quest contributing to the same ledger, and a second agent picking up the quest gets **its own sitting, the same ledger**. Sittings have no artifacts of their own — they are context markers that shape memory about what the user is doing; the ledger and quest log *track* sittings, never the reverse. The charter owns exactly one **master ledger** — "a ledger of other ledgers" — created at charter setup: **one row per quest**, updated by every sitting (same quest → same master row), linking the quest ledger, the output table, and the quest log, with cumulative facts and per-sitting history. The charter keeps track of its quests through the master; quest artifacts **default-home in the charter's folder** (one findable cluster — owner, 2026-09-02: a quest ledger minted at root among hundreds of files is invisible), while tracking stays by reference, so the user may move them freely afterward. The **quest log** (successor of the run note) stays the narrative home: operational context — phase prose, anomalies, decisions. **Iterative matters → rows; the story → the log.**

**Artifact-reuse policy (owner, 2026-09-02 — standing, applies to every phase):** *reuse existing artifacts unless the user explicitly asks for distinct, separate documents; instructions about desired output content are never a request for separate documentation.* Concretely: (a) the quest log's identity follows the **quest**, not the run's wording — `runKey = quest:<label-slug>`, looked up **globally per user** (never scoped to the calling chat), so every sitting from any conversation adopts the same note and objective rephrasing can never mint a second one; (b) quest runs create **no roll-up note at all** — the quest log holds the reconciliation, the quest ledger holds the rows, and the closing chat message links both (quest-less runs keep the legacy roll-up, having no ledger to link); (c) steady state per quest is **exactly two artifacts, reused every sitting**: one quest log note + one quest ledger database.

*Naming, settled (owner, 2026-09-01)*: **Charter → Quest → Sitting**. A charter is a written commissioning document — the book shape is traded away, and nothing is lost on the user, for something better: the term is far less ambiguous about **the AI's role — fulfilling a commission**. "Ledger" keeps its accounting sense (a long-lived book accumulating entries across sittings). *Historical note*: the legacy system's formal term was **"Run Ledger"** (run-ledger.ts, `upsertRunLedger`, `runLedgerKey` — the markdown note this plan reworks); **"runbook" was never a system term** — one informal code comment (registry.ts:663) plus showcase copy, retired for its temporary connotation. Earlier drafts' "playbook / play ledger / operation / matter" vocabulary is superseded per §0.

**Schemas — standardized index, sculpted ledgers (owner, 2026-09-01):**

- **The master ledger has a standardized system schema** (a versioned constant, never user- or AI-designed), **one row per quest**: quest label/objective, status (active / dormant / closed), createdAt / lastRunAt, sitting count, cumulative items / qualified / tokens / estimated cost, a **per-sitting history** (one entry per sitting — date, agent, counts, cost; carrier: the JSON-cell note below), and `contentLink` columns → quest ledger, → output table, → quest log. **The contentLink columns are mandatory members of the standard** (owner, 2026-09-01): the links are what make the master a *registry* rather than a log — every quest row must resolve to its artifacts, and every consumer (quest selection, dedup, resume, the hub view) navigates through them.
- **Quest ledgers are AI-sculpted to the task**, around a minimal **machinery core** the loop physically requires: `itemKey`, `keyTier`, `status` (pending / done / unreadable / blocked / capture-failed), `pass`, `outputRowId`, timestamps. Everything beyond the core is shaped per matter at ledger creation — a scoring task adds `fitPercent`/`qualified`, a comparison task adds its criteria columns, a collection task adds neither. Sculpting is §3.7's AI-structuring capability (types per §3.4's rules, AI-written descriptions); D8's mid-flight grace is its evolution mechanism. **Rows are continuous across sessions** — the upsert key is `itemKey`, so a later sitting on the same matter updates the *same row* (owner: "every session could write to a ledger on the same row"), with an optional standard `sessionHistory` cell recording per-sitting touches so the AI reads an item's *trajectory*, not just its latest state.
- **JSON cells (owner suggestion)**: per-session histories want a `json` column capability, which doesn't exist yet. Per the Database II config-specialization doctrine (D11: config over enum members — a new `DataColumnType` is a Postgres migration needing strong justification), evaluate `longText` + `config.format: "json"` (validate-on-write, formatted render) before minting a true `json` type. Decision open (§10).

**Continue-or-create (D9).** The AI decides which quest a run continues, from user context: an explicit mention of a quest or past matter → that quest; continuation cues → the best master-ledger match, **named on the proposal card** so the choice is visible and correctable before any write; blank context → a new quest. The master ledger is what makes this decision cheap — candidates are one bounded query over its rows, not a garden search.

**What the reversal buys — why database-as-ledger is right despite the old doctrine:**

- **Enforcement state becomes authoritative and compaction-proof.** Items-recorded and batch position are O(1) row counts instead of message-history scans that grow with the run and can be eaten by conversation compaction. The ledger rows — not the transcript — are the loop's state.
- **Cross-sitting memory including rejects — the quest is the memory.** The output table stays the clean, qualified-only shortlist, while the quest's ledger remembers every item any sitting saw and scored — months of one hunt in one table. Plan-time dedup is primarily the continuing quest's own rows (rejects included); sibling quests found through the master (same output table) are the secondary net. Unrelated quests of the same charter never cross-contaminate. The D3 token leak resolves; the overlap the owner flagged doesn't happen.
- **Token leanness, restated as a design objective (owner, 2026-09-01): each run touches only the rows it needs.** Per-item context is one row; resume is a bounded query ("pending items, limit 10", ~4KB budget) instead of re-reading an ever-growing markdown note; stage-2 pulls one lead's row, not a run's history.
- **Checkable reconciliation.** Counts (processed / qualified / failed, per batch and per run) are queries the harness computes, never arithmetic the model asserts.
- **Prose keeps a home.** A ledger row's promoted page (row→page) holds long-form per-item narrative when a verdict outgrows a cell; the quest log holds the quest-level story. Nothing narrative is lost to the grid.

**Mid-flight single-column grace (D8).** When a task or context change mid-run needs a column the quest ledger lacks, the AI adds **one column at a time** without a card — a scoped exception to `canAlterSchema` for system ledger DBs only — logged in the quest log and surfaced as a chip. Self-improvement, bounded on three axes: single columns, mid-flight points only, ledger databases only.

**Affordance (D6).** Ledgers borrow the `data` content type with a registry-level marker (mirroring `metadata.playbook`) and a **distinct icon**, so every surface can tell a ledger from a user database. Intended special properties — file-tree mobility, and which outputs nested beneath may be moved — are **deliberately undefined for now and tracked in §10**.

**Non-iterative runs.** With one master row per *quest*, a purely non-iterative sitting touches no quest and registers no row — it leaves its note, as today. The database standard is satisfied at the charter level by the always-present master ledger ("there and not used"); quests and their ledgers are minted lazily at the first iterative proposal, so non-iterative runs never litter the tree with empty databases. If a complete sitting registry (iterative and not) proves wanted, the master's per-sitting history is the natural hook — open item, §10.

### 3.7 AI-structured output databases (D1 reversed — added 2026-09-01)

When `captureTo` names no existing table (or the user asks for one), the AI **proposes the output database**: schema derived from the playbook's objective — a well-written playbook yields a precise schema, a rough one still yields a workable draft — with types chosen by §3.4's rules (text for web-controlled vocabulary, select for closed sets) and **AI-written descriptions on every column** (§3.1's load-bearing capture context, produced in seconds instead of asked of the user). One approval card creates the whole thing; the sentinel/card contract of §5 applies. Binding to an existing user-made table remains the preferred route when one fits (existing-structure principle) — the reversal removes the *requirement*, not the preference.

`propose_column_options` **stays load-bearing in this flow**: the generation card carries the initial option vocabularies inline, and every post-creation vocabulary change — proposal-time gap repair, mid-run categories emerging from pages (§3.2) — continues through the options card. Generation and evolution are two moments of the same Apply-gated contract.

The §3.4 recipe accordingly demotes from "what the owner must build" to **"the shape the AI's proposals follow"** — and a reference for users who prefer building by hand.

**Multi-database runs** (progressive iterations plausibly want more than one output table — leads + contacts, say): the likely route is **playbook nesting** (sub-playbooks already exist in the linked-extensions manifest), each nested playbook carrying its own `captureTo`. Not designed here; the contracts in §3.1–3.2 must not preclude it (§10).

### 3.8 Transitioning existing markdown playbooks (D10)

There are no "two playbook formats" to reconcile — there is one format (a flagged markdown note; §3.5's single-source rule) plus optional attached infrastructure. That framing is what makes the transition safe and cheap:

- **Lazy, on next use.** The first post-P4 run of any playbook find-or-creates its master ledger and stamps the master's id into the playbook's `metadata` (beside `playbook: true`). No bulk migration, no touching playbooks nobody runs, idempotent by construction.
- **The marker is the version.** A `metadata` pointer to the master *is* the "transitioned" signal — no version enum to maintain, and a lost pointer self-heals on the next find-or-create.
- **History stays where it is.** Pre-transition run-ledger notes are records, not state — nothing executes from them, so they are never parsed or migrated in bulk. When the user explicitly wants an old matter continued ("pick up my July job-hunt note"), the AI imports it as an *ordinary run*: read the note, sculpt a quest ledger, seed it, first sitting — the same continue-or-create card, with the old note as source.
- **"Standard even when unused" means the master, not rows.** Every playbook that has run since P4 has a master ledger; a playbook whose runs are all non-iterative has a master with zero rows. That empty master *is* compliance with the standard, at the cost of one node — and it's ready the moment an iterative run arrives.

## 4. Phases

- **P0a — Transition prep: vocabulary + affordances (FIRST, owner directive 2026-09-01).** User-facing rename lands before any new machinery: `/charter` command (keeping `/playbook` as a hidden alias), picker/settings/chip copy → charter/quest vocabulary, and the distinct tree icon affordances (D6 spec). Code identifiers (`metadata.playbook`, `search_playbooks`, `lib/domain/ai/playbooks/`) only *alias* here — the physical rename stays its own dedicated PR. Gate: every surface that said "playbook" says "charter"; old links/commands still work.
- **P0 — Shared plumbing.** Extract database ref-resolution / column lookup / normalize+translate helpers from `data-tools.ts` into `lib/domain/data/server/` (both callers keep behavior); association-on-approval helper. Gates: typecheck, existing data-tool behavior unchanged.
- **P1 — `captureTo` on the proposal.** Preflight, grant, ledger-metadata stamp, plan-time dedup annotation, card copy (§5). Gate: preflight failure paths return actionable `ok:false` (smoke: propose against a table missing a column → exact gap named).
- **P2 — `capture` on `record_item_result`.** Validate-all upsert, admission enforcement, `rowId` in result + chip, reconciliation counts. Gate: a rejected cell yields **zero** new rows (the anti-`insert_rows` assertion, unit-tested at the helper level).
- **P3 — `source: "database-rows"`.** Row enumeration, `keyTier: "row"`, stamp-back upsert; stage-2 playbook recipe documented — including the §3.5 shortcut directives and the File-cell + `overwriteContentId` materials lifecycle. Gate: a refinement run over 10 rows updates in place — row count unchanged, `updatedAt` advanced; a re-tailored resume keeps its node id and its File cell follows.
  **Also in P3 (owner asks from the P2 smoke, 2026-09-02):** (a) the message token popover shows **cumulative per-chat-session usage** alongside the turn total — the turn accumulator already computes per-turn; the session sum is display aggregation over persisted `metadata.cost` — so a 105k turn total reads correctly as "2 steps × ~53k context, 95% cached" instead of one alarming number; (b) **`captureTo` renders first-class on the proposal card** (database chip + admission rule per §5) — today it hides in Raw JSON while the generic fields show, which makes the user's consent-check needlessly archaeological.
- **P4a — Quest infrastructure (additive; no cutover; split approved 2026-09-02).** Standardized master-ledger schema constant (find-or-create at charter setup or next run, id stamped in the charter's metadata — the D10 transition; one row per quest, per-sitting history stamped); AI-sculpted quest ledgers around the machinery core (continue-or-create per D9, named on the proposal card, minted lazily at first iterative proposal); quest log; `record_item_result` dual-writes the ledger row (upsert by `itemKey` — cross-sitting continuity) alongside its existing behavior; D8 single-column grace; registry marker. Capture config's home relocates here from the markdown ledger's metadata (closes the P1 seam). **Old enforcement and dedup untouched — rows accumulate beside them.** Gates: dual-write correctness; quest-continuity smoke (§9 #6).
- **P4b — Cutover (small diff, high scrutiny).** Harness enforcement (item budget, batch position) derives from ledger row counts; plan-time dedup reads the continuing quest's ledger first, sibling quests via the master second (rejects included). Gates: **enforcement parity** (row-derived budget equals history-derived budget on a replayed run — run both, assert equal, before switching), compaction-resume smoke (fresh conversation resumes from pending rows), `run-ledger.ts` doctrine header updated to record the reversal.
- **P4c — Lean context (ships as a pair, owner: no divergence).** Batch-boundary context folding (§6.1) + the fold's UI mirror (§5): model-facing assembly folds a recorded batch into its checkpoint summary + ledger references; the chat renders exactly those parts collapsed; persisted parts untouched. Depends on P4b (folding requires rows to be proven truth). Gate: **folded-context smoke** (items recorded after a fold process correctly with earlier pages absent; collapsed content equals retained context). *As built (PR 3): the mirror shipped as per-part pills sharing the server's boundary rule; the batch gallery card (§5) is the full presentation, riding PR 4.*
- **P5 — Charter hub + AI-structured output databases (D1-reversal/D7).** Output-database proposal card (schema + AI-written descriptions + initial option vocabularies; one new tool id, classified in ai:drift metadata); hub polish on the master-as-registry view (quest registration itself is P4 scope, not repeated here). Gate: §9 smoke (5) — generation card yields a schema with a description on **every** column; the run registers in the master.
- **P6 — DEFERRED: batch execution.** Backlogged with savings analysis (BACKLOG.md). Not in this build.

P1–P3 do not depend on P4x/P5 (capture works against a hand-made table with the markdown ledger) — the tracks can interleave; P4b's parity gate is what makes the ledger cutover safe whenever it lands.

Prompt methodology sections keyed on `hasItemIteration` change in P1/P2/P4a — `validate-prompt-cache` must be updated in the same PR (the per-item iteration work established this gate).

### 4.1 PR packaging — the release train (as built + compressed; owner directive 2026-09-02: consolidate smoke/gate cycles where justified)

**Shipped:**

| PR | Release | Contained | Status |
|---|---|---|---|
| **#202** | "Charters & Capture (prep)" | P0a + P0 + the mechanical rename (originally planned as a separate PR R — the hard-swap directive folded it in) + search/mention fixes | MERGED 2026-09-02 |
| **#203** | "Charter capture" | P1 + P2 + smoke-driven hardenings (empty-row guard, empty-vocab preflight, LOCATE-before-read) | Smoked live; owner checklist ticking |

**Remaining — compressed from four gate cycles to two** (owner call: automated gates stay per-PR and per-commit; what consolidates is *owner smoke sessions and review rounds*, one per PR):

| PR | Release | Contains | Why the combine is safe | The ONE smoke session |
|---|---|---|---|---|
| **3** | **"Quests & Lean Context"** | P4a + P4b + P4c | The parity assertion (row-derived == history-derived enforcement) runs INSIDE the PR — it is exactly the rows-are-trustworthy proof P4c was previously waiting a release cycle for. Folding activates only on batched runs (a natural scope limiter), and the carousel is rendering over persisted parts. Themed commits keep it reviewable. | One batched, captured, multi-sitting run: propose (quest named on card) → batch 1 completes → checkpoint folds + carousel collapses → kill the chat → resume from pending rows in a fresh chat → finish → next sitting dedups rejects via the quest ledger. Covers §9 #4, #6, folded-context, and the master-registry hub in a single session. |
| **4** | **"Stage 2 & Generation"** | P3 + P5 (incl. the P3 owner asks: session-cumulative token popover, first-class captureTo on the card) | Both are capability additions atop a stable capture core; they share the proposal-card surface (captureTo rendering + the generation card are the same component neighborhood). No cutover risk anywhere in the PR. | One session: generation card creates an output DB with AI-written descriptions (§9 #5) → `database-rows` refinement run updates rows in place (§9 #3) → materials File-cell + overwrite → popover shows session totals. |

**P6** (deferred batch) unchanged; **§9.1 cost verification** runs once, at the end of PR 4's smoke — it was always end-of-build. **T4** sequences after P4 per §9.2.

*As built (2026-09-03):* PR 3 = **#204**, smoke-complete, merged into `feat/charter-capture` — so **#203 is the combined Release 2+3** (merge it to ship both). PR 4 = **#206** (`feat/stage2-generation`, stacked; retarget to main after #203): P3 database-rows + owner asks (captureTo card, session popover) + P5 generation card (`propose_output_database` + `POST /api/content/data` + card) + §5 batch gallery card + the deferred P4a pair (sculpted `questColumns`/`questCells`, D8 `add_quest_ledger_column`) + the stage-2 recipe doc (`guides/ai/STAGE2-CHARTER-RECIPE.md`). Full build + all gates green at open; owner smoke lines on the PR. Open decision on #206: rows-derived `qualifiedCount` at closeSitting.

What deliberately does NOT compress: the per-PR automated gate suite (typecheck/lint/build/capture:check/drift/prompt-cache/inspector — near-zero owner cost), the parity assertion, and the §9 smoke lines themselves — every contract still gets verified, just batched into fewer sittings.

## 5. Chips & traceability

(Required section per AI-plan convention.)

- **Proposal card**: shows a database chip (icon + table title) + the admission rule in plain language ("→ Job Leads · qualified items only") + the intended columns + how many enumerated items are already captured. The card stays approve/reject only (registry.ts:518 — never promise editable fields). Card implementation follows the established sentinel/card contract (`propose_column_options` / flashcards pattern), including the Database II lesson: any applied/consumed flag must be keyed by proposal **content**, not message id — streamed-message ids change when the conversation persists, and id-keyed localStorage breaks silently.
- **Option-gap repair — two moments, one card**: the `propose_column_options` card (ColumnOptionsProposalCard) is the repair surface in both; the user's Apply does the columns PATCH and the grid hears it via `dg:data-schema-changed`. (a) **Proposal-time**: preflight compares declared columns against the table's existing vocabulary; gaps repair before item one — but this is a schema-vs-schema check, *not* a pre-scan of the unread JDs. (b) **Mid-run**: a category that only emerges from reading pages fails that item's capture loudly; the card raised mid-run + the live option read (§3.2) lets the run absorb the new vocabulary and re-record the item without re-proposing. The model may also front-load vocabulary by judgment (enumerated titles often reveal the category set) — the card supports it; nothing automates it.
- **Per-item result part**: when a row was written/updated, the `record_item_result` part renders a row chip — table title + row title, deep-linking to the table's URL-addressable view with the row peeked (`DataRowPeek`). Distinct visual for created vs updated.
- **Provenance, both directions**: the ledger line already links the source URL; the reconciliation entry links the table view. The `ConversationAssociation` created at approval means the conversation lists the database in its associations panel, and `addAutoAssociation` on the ledger ties run ↔ chat ↔ table together. A row's story is recoverable: row → (dedupe URL) → ledger item entry → conversation.
- **Failure visibility**: a capture-failed item renders its ledger line with the rejection reason — a blank cell must never be the silent signature of a validation failure (that is `insert_rows` v1's exact trap, D1 forbids it here).
- **Batch gallery card (owner, 2026-09-01; shape CONFIRMED 2026-09-03)**: each recorded batch collapses to **one card** — header (batch #, item range, qualified count, cost) + an internal **gallery of that batch's completed items** (label · fit % · qualified badge · verdict snippet · row chip → DataRowPeek); expand a panel for that item's raw exchanges. The scale that makes this work is the realistic batch size (~10): one card condenses 10 items' reads/records, so a 50-item run reads as ~5 cards — at the smoke's batch-of-2 the cards feel trivial, which briefly misled the design review; the per-batch shape stands. The in-flight batch (no checkpoint yet) renders live and unfolded, then docks into its card when the checkpoint records. Pure rendering over already-persisted parts, grouped between the existing checkpoint anchors — no data-model change. **The collapsed view IS the model's retained view** (§6.1): default presentation and model context show the same folded shape; expansion is user-initiated, temporary, and reveals what the model dropped. A capture-failed item's panel shows its failure reason inline. *Build status: the fold mechanism + minimal per-part pill mirror shipped in PR 3 (#204); the gallery card is the presentation layer riding PR 4 with the other card-surface work (captureTo card, token popover) — pills remain the fallback for folded parts outside any batch.*

## 6. Cost & token analysis (priority: honest numbers)

**Capture is ~cost-neutral at write time.** The row rides an existing tool call: `capture.cells` adds roughly 50–150 output tokens per item — and the roll-up stops re-emitting every item as a markdown table (it becomes counts + a link to the view), which claws most of that back. Step budgets are untouched: same calls, same `itemIteration → budget*4 + 8` cap (route.ts:2198).

**The savings are downstream, and they compound:**

1. **Plan-time dedup** (the big one for a scraper that revisits the same boards): items already seen are marked before the run starts — each skipped item avoids a page read + scoring pass, ~3–10k input tokens per JD. *The D3 limit is resolved by D5/D9/P4*: with qualified-only admission rejects aren't in the *output* table, but **the continuing quest ledger is itself the memory** — months of one job hunt live in one ledger, so plan-time dedup is primarily the ledger's own rows, rejects included; sibling ledgers found via the master (same output table) are the secondary net for new-ledger-same-campaign cases. (Until P4 lands, the interim limit stands: rejects re-score on revisit; the per-run escape hatch is `admission: all` + a Qualified filtered view.)
2. **Stage-2 reads are bounded**: `query_database` serializes through a ~4KB budget (data-tools.ts:5-9); pulling one lead's row is a few hundred tokens vs re-reading roll-up notes. Rows never ride the mention capsule; the schema digest buckets rowCount so continuous writes never dirty the context hash (digest.ts).
3. **Preflight front-loads vocabulary once**: option labels arrive in one proposal result instead of per-item trial-and-error against the strict encoder.
4. **Model routing already exists** for the expensive stage: playbook `model:` directives (model-directives.ts) let stage-2 research phases run on cheaper models per phase; `extract_structured` already uses a cheap-model `generateObject`.

**Where the real money is**: stage 2, not capture. Per-lead investigation (JD re-read + company research + materials drafting) plausibly runs 20–80k input / 2–10k output tokens per lead depending on model and depth. At tens of leads/week this is single-digit dollars at list price on mid-tier models — which is why the ~50% batch discount is **backlogged rather than built**: it halves a number that is currently small, at the price of an entire async substrate the repo doesn't have (zero deferred-AI infrastructure exists; the only offline-AI precedent is the `studio-context-sweep` cron). It becomes worth building when row volume or model tier moves the weekly number, and the row-driven unit of work (§3.3) is deliberately shaped so it slots in then. Savings survey and trigger conditions: **BACKLOG.md → "Deferred batch execution for row-driven AI runs."**

Cost observability rides existing rails: batch checkpoints and reconciliation already stamp `tokensSoFar` + `estimatedCostUsd` into the ledger (registry.ts:746, run-ledger.ts:58) — per-phase cost is recoverable by subtraction, per-run cost lands in the run's own record.

### 6.1 Per-item context economy (owner question, 2026-09-01)

> **Build note (2026-09-02):** the server-side fold specced below turned out
> to ALREADY EXIST — `supersedeIterationHistory` in
> `lib/domain/ai/context-diet.ts` stubs perception outputs behind the latest
> batch checkpoint (with a min-chars guard this spec lacked). P4c therefore
> delivered the missing HALF: the boundary/predicate are now exported
> (`findIterationFoldBoundary`, `shouldSupersedePart`) and the chat UI
> collapses **exactly** the parts the model no longer sees — one rule, two
> consumers, the owner's no-divergence guarantee by construction.

**The leak**: within a sitting, each job's page read stays in the conversation and is re-sent on every later step — by item 20, items 1–19's JD text still rides (prompt caching discounts it to ~10% list price but the carried context grows without bound, and each job is scored with all prior jobs in view — rubric drift, not just cost). **The enabler the db scope provides**: today the transcript cannot be trimmed because enforcement state is derived by scanning message history; P4's ledger-as-truth severs that dependency — once an item's row is written, its page text and tool chatter are disposable.

**Mechanism — batch-boundary context folding (rides P4):** after each `record_batch_checkpoint`, the *model-facing message assembly* replaces that batch's per-item tool bulk (page reads, snapshots, intermediate chatter) with the checkpoint summary + ledger row references; optionally the raw page read is stubbed immediately after its item records (read → extract → drop). Two rules:
- **The persisted parts are untouched; the default *view* mirrors the fold** (owner refinement, 2026-09-01): parts are never deleted (resume, audit, and expansion depend on them), but the chat renders each recorded batch as a collapsed carousel card (§5) whose collapsed state equals the model's retained context — **no divergence between front and back by default**; expanding a panel is the user's choice and costs no tokens. Precedent: progressive disclosure already sends only the active charter phase.
- **Fold at batch boundaries, never per item** — a prefix rewrite invalidates the prompt cache (writes ~125% of list, reads ~10%), so per-item folding re-pays the cache every item and loses early; per-batch folding amortizes one cache rewrite against a whole batch's dropped pages. Carried context plateaus at ~one batch + summaries instead of growing with the sitting.

Never folded: charter standing rules + active phase, the approved proposal/capture config (message-bound), and the current in-flight item. **Quality bonus**: each job is scored against the charter's rubric with a near-fresh view, not against nineteen earlier JDs.

## 7. Risks & honest gaps

- **Concurrent sittings can double-insert.** Dedup is application-level (no unique index on any `data` path). Two simultaneous sittings on one quest — now an *intended* pattern (a second agent gets its own sitting, same ledger) — race the check-then-insert on the same `itemKey`; cell-level CAS covers updates but not creation races. Mitigation candidates when it bites: an itemKey re-check inside the write transaction, or advisory locking per (ledger, itemKey). Accepted for v1; documented.
- **Label-tier items dedupe weakly.** Items without URLs get rows with no identity guarantee. Mitigation is visibility (flagged in checklist + result), not false confidence.
- **`insert_rows` keeps its partial-row flaw** — out of scope here, but the new helper's validate-all path is the fix; port it back in a cleanup pass (tracked as a P2 stretch note, not a gate).
- **Owner-precreated schema drift over time** (renamed columns, pruned options): every run re-preflights, so drift surfaces at the next proposal, not mid-run — but preflight checks the *named* columns only; it cannot warn about vocabulary the playbook implies but doesn't declare. Softened post-Database II: option-level drift is repairable in-chat (`propose_column_options` → Apply → re-propose); column-level drift still requires the owner in the grid.
- **User toggles**: capture writes go through `mutations.ts` directly, so disabling the (toggleable) data tools cannot strand a run — but `describe_database`/`query_database` remain toggleable and stage-2 enumeration may want them; enumeration therefore also runs harness-side (proposal execute), not via toggleable tools.
- **AI-structured schemas embed guesses** (D1-reversed): a wrong type choice is expensive later (column types are immutable). Mitigations: the card shows the full schema before creation, the §3.4 type rules ride the generation prompt, and descriptions make every guess legible and correctable. Accepted trade for the time saved; watch the first real generations.
- **Mid-flight grace could accrete columns** across many runs of one playbook. Bounded by design (one column per event, ledger-only, logged + chipped); if a playbook's ledger sprouts junk columns, that's a playbook-quality signal, surfaced, not hidden.
- **Accumulation, post-reuse**: node count stays modest (one quest ledger per *matter*, one master per playbook), but a continuing ledger accumulates rows for the life of its matter — a heavy daily hunt (~50 items/sitting) reaches the 10k design scale in ~200 sittings. Long matters eventually want closing or splitting; the master's status column (active/dormant/closed) is the affordance. Archival policy deferred (§10).
- **Sculpted schemas vary across quest ledgers of one playbook** — a run continuing last month's ledger must read *that ledger's* actual schema (the digest provides it), never assume the shape it would sculpt today; the machinery core is the only invariant contract.
- **Continue-vs-create is a judgment call the AI can get wrong** — continuing the wrong matter co-mingles what the owner wanted separate; minting a new ledger fragments a matter. Mitigation: the choice is always **named on the proposal card** before any write (D9), and a wrong continue is recoverable (rows are keyed; a matter can be split by re-running against a fresh ledger) — but watch early behavior.

## 8. Non-goals

- No *unapproved* output-database creation — the AI structures, the user's card click creates (D1-reversed, §3.7). The only card-free schema write anywhere is D8's single-column grace, scoped to system ledger databases.
- No new extension, no `DataRow` schema change, no unique-constraint migration. New tool ids are limited to P5's output-database proposal card; P0–P4 ride existing tools.
- No deferred/batch execution in this build — backlogged (D4).
- No deletion of the narrative note — D5 *splits* state (iterative → ledger rows, narrative → the quest log); it does not replace prose with cells. Ledger databases are system infrastructure; the existing-structure principle continues to govern *output* tables.

## 9. Gates & smoke

- `pnpm typecheck` / `pnpm lint` / `pnpm build`; `pnpm ai:drift:check` (schema fields on existing tools — no new ids, so metadata classification is unchanged; prompt edits touching iteration methodology re-run `validate-prompt-cache`).
- Unit: validate-all rejection creates zero rows; admission=qualified refuses cells on unqualified items; upsert converges on url-tier key; preflight names the exact missing column/option.
- Smoke (PR checklist lines): (1) side-panel co-browse run with `captureTo` against a pre-created Job Leads table → approve card → rows appear with correct cells, re-run marks existing items and updates instead of duplicating; (2) propose against a table missing "Fit %" → actionable refusal, no writes; (3) `source: "database-rows"` refinement run updates rows in place; (4) [P4] kill and resume a run in a fresh conversation → resumes from pending ledger rows, no re-processing of done items; (5) [P5] run a charter with no output table → generation card → approved schema has descriptions on every column; the run registers in the master ledger (new quest row, or the continued quest's row updated); (6) [P4/D9] mention a past matter → the proposal card names the continued quest; a later sitting updates the same item rows, not duplicates.

### 9.1 Cost-mechanism verification (owner directive, 2026-09-02 — runs when the build completes)

When P4c lands, a dedicated verification pass confirms the cost machinery works *as measured*, not as designed. Using a real multi-sitting quest (the P2 smoke's Job Leads table is the natural fixture):

- [x] **Dedup actually skips** *(measured 2026-09-04)*: an all-already-scored sitting short-circuited to ZERO page reads and ZERO re-records, closing straight through findings; master stamps show the skip sitting adding a small fraction of an acquisition sitting's tokens. Cross-sitting memory held across sources after the URL-identity fix (rows pass advanced the same ledger rows, Pass 1→2).
- [x] **Folding actually shrinks resends** *(measured, Run B3 segments)*: per-request input stayed FLAT across the run (~26k → ~21k → ~22k avg per request) while four page reads accumulated in the transcript — without the fold each request would have grown monotonically by the read bulk. The fold holds resend size at ~(digest + current batch).
- [x] **Cache behavior** *(measured, Run B3)*: cache-read ratio 61–93% per segment (72% turn-wide) across a folded batched run — the batch-boundary fold costs one bounded invalidation per batch, never a thrash; unfolded turns measured ~95% for comparison. Matches the §6.1 economics (fold per batch, never per item).
- [x] **Roll-up slimming** *(exceeded — measured as zero)*: quest runs create NO roll-up note at all (reuse policy §3.6); the reconciliation lives in the quest log, rows in the ledger, and the closing message links both. Verified zero new notes across three sittings.
- [ ] **Acquisition conservatism**: NOT exercisable in this smoke (all runs used given URLs — no search/locate phase). Prompt guidance shipped 2026-09-02; measure on the first real job-hunt quest (spot-check its pages-read list for speculative crawling).
- [ ] **Model-role routing engaged**: NOT exercised in this smoke (the Test charter carries no model directives; everything ran on one model). The routing machinery itself is gate-verified (`model-routing:check`); measure per-phase cost stamps on the first charter with scout/analyst directives.

### 9.2 Graceful budgets — T4 design constraints (owner doctrine, 2026-09-02)

Resource governance has burned this product before: a mid-run hard cap wastes everything in flight and kills the conversation. When T4 (enforced budgets) is built, it must obey:

- **Never choke mid-item.** Caps land only at safe boundaries — after a `record_item_result`, at a batch checkpoint — where the ledger and rows already hold everything. (The existing item-budget soft-stop-at-read-tools is the precedent.)
- **Warn → checkpoint → ask, never abort.** At threshold: force a batch checkpoint, surface a "budget reached — continue / stop here" card. The user extends or accepts the stop; the harness never unilaterally discards work.
- **Budgets are consented up front** on the proposal card (pages, items, and — with routing — an approximate cost envelope), so a stop is the *agreed* outcome, not a surprise.
- **Durable state makes stopping cheap** — this is why governance becomes safe to build *after* P4: with quest rows + ledger as truth, a stopped run resumes from a bounded query. Pre-P4, a kill wasted the transcript's working state; post-P4, a stop costs one resume query. Sequencing matters: T4 lands after the ledger spine, never before.

**T4 enforcement DELIBERATELY NOT BUILT (owner + judgment, 2026-09-04).** The graceful budgets already exist: item caps consented on the card, batch checkpoints, step caps — all boundary-safe — and §9.1's measurements show them working (runs at $0.003–$0.015, dedup short-circuits, flat resends). An enforced token cap would add card noise, a model-obedience surface and an extension protocol against a problem the data no longer shows; the §9.2 doctrine exists because caps hurt before. Build token-cap enforcement only if real usage produces a runaway the existing caps miss — the constraints above are its spec when that day comes. *Where cost improvement actually lives (in priority order): model-role routing (charter `model:` directives — the price-tier lever, still unmeasured), acquisition conservatism (unmeasured), reasoning-token budgets per phase (B3 spent 18.5k reasoning tokens on a 2-step segment; `deepseek:adaptive+low` on iteration phases already helps — extend), and the §10 per-item isolation endgame via the P6 batch runner.*

## 10. Open items — tracked so they don't get lost (owner, 2026-09-01)

- **Ledger special properties are undefined**: what file-tree mobility means for ledger and index nodes (moving one must not break the index's links — contentLink tracking is by reference, which should make this safe, but verify), and *which outputs nested beneath a ledger/playbook may be moved* — flagged explicitly by the owner as currently undefined; define before or during P4, not after.
- **Live gallery window (owner, 2026-09-03 — deferred until after all other work)** — the batch gallery card (§5) ships with dock-on-checkpoint: the in-flight batch renders live/unfolded and collapses into its card when the checkpoint records. The owner notes the eager alternative is structurally free: batch counts and every item's stable key are known at approval (the proposal returns the full list), so the gallery could exist from the start with **pending panels** that fill as each `record_item_result` lands — a live window onto what's being worked on, honest because panel fills are server tool results, not narration. Open question is purely presentational (does the live window read better than dock-on-checkpoint, or just add motion); settle or backlog after PR 4's gallery ships.

- **Mid-flight column grace on output tables** — D8 is scoped to ledger databases; whether the same grace extends to output tables (vs. everything going through proposal cards) is open.
- **Multi-database runs via playbook nesting** — plausible for progressive iterations; needs a contract sketch (does a nested playbook's `captureTo` inherit associations? does the parent's ledger subsume the child's?). §3.1–3.2 contracts must not preclude it meanwhile.
- **Ledger archival policy** — long-lived quest ledgers accumulate rows toward the 10k design scale; closed matters accumulate as nodes. Retention (row age-out within a matter? archive-on-close via the master's status? split a matter at a size threshold?) — decide when evidence arrives.
- **Dedup relatedness definition** — the continuing ledger covers most dedup; "same output table" is the v1 marker for consulting *sibling* ledgers via the master. Whether master rows need an explicit campaign tag (two tables, one campaign — or one table, two campaigns) is open.
- **JSON cell capability** — sitting histories (master quest rows and quest-ledger item trajectories) want structured cells; per the D11 doctrine, evaluate `longText` + `config.format: "json"` (config-specialization: validate-on-write, formatted render) against a true `json` `DataColumnType` (Postgres migration, needs strong justification). Decide in P4.
- **Sitting registry breadth** — the master tracks quests; purely non-iterative sittings leave only notes. If a complete sitting registry (every sitting, iterative or not) proves wanted, the master's per-sitting history is the hook.
- **Per-item sub-agent isolation (context endgame)** — a fresh sub-context per job returning only verdict + cells (~200 tokens to the parent) is the purest "fresh view"; the stage-2/deferred-batch unit `(tableId, rowId, charter)` already has exactly this shape, so the deferred runner gets isolation structurally free. Live co-browse cannot use it (must stay in the user's session/tab) — §6.1 folding is the live-path answer; revisit isolation when the batch runner is built (ties to the T4 resource-governance deferral in AGENTIC-RESOURCE-DISCIPLINE.md).
- **App-wide wording refresh (owner, 2026-09-01)** — playbook → charter and the quest vocabulary must land across the app's user-facing copy: the `/playbook` picker, settings labels, chips, tool descriptions, prompt methodology text, docs. Tedious but invigorating (owner's words). **Sequencing (owner, revised): this is P0a — the FIRST prep step**, before any new machinery, so P4/P5 ship into an app already speaking charter/quest. Code identifiers (`metadata.playbook`, `search_playbooks`, `lib/domain/ai/playbooks/`) alias in P0a and physically rename in a dedicated low-risk PR — behavior changes and rename churn never share a diff.
- ~~Ledger icon design~~ — **RESOLVED 2026-09-01 (owner-approved, "all distinct"):** `ScrollText` charter, `LibraryBig` master ledger, `Map` quest ledger, `BookOpenText` quest log; plain `Database` for user tables. Ships in P0a. Trade-off accepted knowingly: quest artifacts stop reading as note/database at a glance — the viewer that opens is the tell.
