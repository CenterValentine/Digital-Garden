# AI Bulk Row Reading — Plan

**Status:** BUILT 2026-09-15 on `feat/right-sized-database-reads` (parts A + B; migration handed off — `scripts/handoff/2026-09-15-data-row-digests.md`); PRODUCTION SMOKE PENDING (§4.9, §5.6). Build notes in §8. PR 2 (subgraph + sorted paging) §6; risks §7.
**Driving case:** the Career Evidence Library just loaded — 35 experiences / 66 sources / 99 claims / 35 index rows, 1,025 links. An AI asked to "draft a résumé bullet for every Ready experience with its claims and sources" has to read most of that graph, and today it cannot see the graph at all through the tool that reads rows.
**Related:** `AI-RELATIONAL-DATABASE-REACH-PLAN.md` (P4 relation cells on write), `EXTRACTION-TO-DATABASE-PLAN.md` (database-rows iteration), `core/PRODUCT-PRINCIPLES.md` §2.

## 1. Current state — every path by which a model reads rows

| Path | Where | What the model gets | Ceilings |
|---|---|---|---|
| **Database @-mention / bound database** | `app/api/ai/chat/route.ts` → `buildDataSchemaDigest` (`lib/domain/data/server/digest.ts`) | Schema only: columns, types, descriptions, option labels (cap 50/column), relation targets, views, row-count *bucket*. Ends with "Rows are never included in context." | No rows, by design |
| **`query_database`** | `lib/domain/ai/tools/data-tools.ts` | One page of text rows `- [rowId] Title — Col: val · Col: val`, plus total match count. Server-side filter/sort through the one filter compiler. | `DEFAULT_LIMIT 20`, `MAX_LIMIT 100`, **`RESULT_BYTE_BUDGET 4096` chars per result**, default columns = primary + first 3 non-primary, sorted queries return top rows with **no cursor**; **7 tool steps per ordinary chat turn** (`stepCap`, chat route) |
| **`describe_database`** | same | The digest again, for exact names | — |
| **Row-page mention / bound row page** | `buildRowPropertiesBlock` | One row's cells, `cellToText`, empties skipped | One row |
| **`database-rows` iteration** (`propose_item_iteration`) | `lib/domain/ai/tools/registry.ts` | Rows enumerated server-side as items (title + row id); each item then processed one turn at a time with `record_item_result` stamping cells back | `itemCap ≤ 200`, one model turn per row — a *process* path, not a *read* path |
| **Promoted row page as a note** | ordinary note tools (`read_first_chunk`) | The page body, not the cells (cells come via the properties block above) | 2,000-char chunks |

## 2. Findings (what actually limits a bulk read today)

1. **Relation, lookup and rollup cells are invisible to `query_database`.** `loadRowPage` hydrates `row.links` / `row.derived` / `row.contentRefs`, but the tool formats each cell with `cellToText(c, row.data[c.key])` — and those types store nothing in `data`, so they render empty. The CSV export already does this right (`cellDisplayValue` in `lib/domain/data/server/export.ts` reads links/derived). A model reading the Career Evidence Library sees claims with no experience and experiences with no sources.
2. **4,096 characters per result** is the real bulk ceiling, not the 100-row page. Long-text columns (`Narrative`, `Your contribution`, `Original passage`) blow it in 2–11 rows. There is no column-width truncation, so one verbose cell costs the page.
3. **Sorted queries cannot page.** "Top 20 by Fit %" works; "all rows by Fit %" does not — the model must drop the sort to walk the table.
4. **Default columns are positional** (first three non-primary), not the ones a reader needs; the model has to know names first (`describe_database`), costing a turn.
5. **No graph traversal.** Reading an experience *with* its claims *with* their sources is three queries plus id bookkeeping the model must do itself — exactly the id-juggling the relation work was meant to remove.
6. **No aggregate/count-only mode.** "How many claims are Documented per experience" is a full read today; rollups exist as columns but a query cannot ask for a group-by.
7. **The digest says "Rows are never included in context."** True and deliberate for mentions, but there is no middle tier — no "here are the 5 rows that match the bound row page" or "sample of 3 rows so you know the shape."
8. **No token accounting.** The budget is chars; nothing knows the model's context size (the mention-budget item in BACKLOG has the same shape — a per-model budget from `PROVIDER_CATALOG`).
9. **No fetch-by-id and no row search.** There is no way to ask for "these 6 rows" once the model has picked them, and `DataRow.searchText` (maintained by every write, used by the picker in `suggest.ts`) is not reachable from any tool.

## 2b. Measurements (2026-09-14, prod read-only, real loaders + formatters, `o200k_base` tokens)

Harness: the real `loadTable` / `loadRowPage` / `cellToText` / `cellDisplayValue` / `buildDataSchemaDigest` / `exportDatabaseCsv` run against the four Career Evidence Library tables; each candidate format written to a file and counted with tiktoken. Claude's tokenizer differs from OpenAI's, but the *ratios* are what matter and they are stable across the two.

### What today's tool delivers

| Table (rows) | Default columns, one call | All columns, one call | Calls to read all columns | Relations visible |
|---|---|---|---|---|
| Experiences (35) | 22 rows / 1,242 tok | **4 rows** / 755 tok | 9 | no |
| Claims (99) | 27 rows / 1,416 tok | **11 rows** / 1,050 tok | 9 | no |
| Sources (66) | 4 rows / 840 tok | **2 rows** / 268 tok | 33 | no |

With **7 tool steps per turn**, no table in the library can be read with its long-text columns in one turn, and the sources table cannot be read at all. The step cap, not the model, is the wall.

### Where the tokens go

- **Row ids.** A UUID costs ~22 tokens; an 8-hex prefix ~5. In the current labelled format the ids are **49% of the claims result** (99 × 22 = 2,180 of 5,231 tokens with the budget removed). The format's chars-per-token is 2.9 versus 4.4 for prose because of them.
- **Mirrored backlink columns.** Every link is rendered twice across the pair. Backlinks are 22% of the claims table and 40% of the sources table as flat TSV. A subgraph read that nests each linked row once is the *cheapest* encoding of a linked set: whole library **22.7k tokens** nested vs **37.9k** as four flat tables.
- **Long text.** Clipping cells at 120 chars: sources −50%, experiences −40%, claims −15%. `Original passage` averages 534 chars per filled cell; `Open questions` 317.
- **Relation cells rendered as titles.** Linked titles average 140–337 chars per cell in this library. Rendered as short handles (`src 52f556dc,3e46a724`) the same cell is ~10 tokens.
- **Per-cell labels vs header-once.** Labelled lines cost ~15% more than TSV for the same content. JSON costs +40–65%. A markdown table ≈ TSV +6%. Format matters less than ids, backlinks, and clipping.

### What right-sized reads cost

| Read | Tokens | Today |
|---|---|---|
| Schema digest, one table | 190–680 | same |
| **Index tier**: handle + title + select/status columns, every row (claims) | 3,000 (30/row) | impossible without long-text bleed |
| One experience with its claims (narratives) and sources, nested | 195–600 | 3 calls + id bookkeeping, relations invisible |
| All 9 **Ready** experiences + claims + sources, nested | 7,340 (6,357 clipped) | not reachable in a turn |
| Claims where Evidence strength = Needs verification (17), narrative clipped, sources as titles | 848 | ~2 calls, relations invisible |
| Whole claims table, forward relations, clipped | 7,837 | 9 calls, relations invisible |
| **Whole library**, forward-only, clipped TSV | 20,369 | ~50 calls |
| Whole library, nested graph, full narratives | 22,712 | — |
| Real CSV export, all four tables | 38,636 | vault export only |

For context: a 200k-window model can hold the entire library eleven times over; the 128k models six times. The library is about the size of one long web page.

## 3. Decisions (settled with the owner, 2026-09-14)

| # | Decision | Consequence |
|---|---|---|
| D1 | **One read tool: `query_database`, evolved in place.** No sibling `read_rows`. | Keeps the jurisdiction, name resolution, filter compiler, lenient schema and teaching refusals; touches no tool inventory, settings metadata or drift gate. `search_content` finds *tables*, `query_database` finds *rows*, `propose_item_iteration` processes what a read picked. |
| D2 | **Whole-table reads are allowed, governed by a token budget, not a row cap.** | The server formats the real result and counts it. Under the threshold it returns; over it returns the index tier plus the exact price and how to approve. |
| D3 | **The threshold is a user setting** (AI settings, default 6,000 tokens) with a per-model ceiling (10% of the catalog `contextWindow`). | Four registrations (schema, defaults, setter, page) or it silently reverts. |
| D4 | **Bulk reads carry a `lifetime`.** `"turn"` (default) folds at the next user message, the same mechanism as iteration snapshots; `"run"` survives every batch checkpoint of the active iteration run and folds when the run ends; `"chat"` stays pinned until the user unpins it or the chat's pinned allowance (2× the threshold) is exceeded. Pins are visible on the chip and in the transcript. | A job first pass reads the library once and scores every item against it; a one-off question costs nothing after its turn. Amended 2026-09-14 (owner: reads must be able to live between bulk reads). |
| D5 | **Row abstraction ships now** in `describe_database`: per-column profiles, three sample rows, digest coverage. Column descriptions stay in the digest. | ~300 tokens tells the model which columns are worth reading before any row is fetched. The mention capsule keeps schema + descriptions only; profiles are one call away. |
| D6 | **Per-row digests are a sidecar with a migration**, mirroring `AgenticMetadata`, never a cell. Staleness by hash, sweep discovery by dirty bit. **Ships in PR 1** with the reads — one release train, migration deployed ahead of code per the handoff rule. | Honest about what it is: AI-generated, provenance-bearing metadata. |
| D7 | Not doing: SQL passthrough (backlogged as "considering" with its risks); rows in the mention capsule; user approval for small reads. | — |
| D8 | **Charter- and quest-linked databases persist for the run by default.** A read of a table reachable through the attached charter's registry (master ledger, quest ledgers, output tables) during an active run gets `run` lifetime unless the charter, quest, or the user's prompt says otherwise; an explicit `lifetime: "turn"` from the model (following such an instruction) is honored. The iteration card states the standing context in plain words. | The charter's links are the consent; the rubric a charter names should not have to be re-read per batch. |
| D9 | **Standing context is declared on the charter's registry, defaulted by the harness, overridden on the card.** A mention or charter link passes consent and the schema, never rows. The master ledger's registry rows gain a system column **Standing context** (`none` / `index` / `index with digests` (default) / `full`) with optional `Columns` and `Filter` text; during a run the first read of that table lands at the declared tier and is pinned for the run (D8). The iteration card shows each line with release / drop-to-index controls. Prose instructions still steer the model's `lifetime`/`columns`; the harness trusts only the column and the card. | The rubric a charter names is a property of the charter, versioned with it and visible in the grid — never a hidden setting. Associations the model makes across items are written as relation cells with handles, so they are data in the ledger, not memory. |

## 4. PR 1 (part A) — "Right-sized database reads"

### 4.1 `query_database` contract

**Parameters** (all optional; existing ones unchanged in meaning):

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `databaseId` | id or name | bound database | as today |
| `filters` | `[{column, op, value}]` | none | as today, one filter compiler |
| `search` | string | — | `contains` over `DataRow.searchText` (case-insensitive), ANDed with filters. Retrieval before walking. |
| `rowIds` | string[] | — | handles or UUIDs; returns exactly these rows (in the given order), filters ignored |
| `sortBy` / `sortDirection` | | | as today (cursor on sorted queries is PR 3) |
| `columns` | string[] \| `"all"` | index tier | names → those columns, full length; `"all"` → every non-backlink column |
| `relations` | `"titles"` \| `"handles"` \| `"counts"` | `"titles"` | how relation cells render (see 4.3) |
| `groupBy` | column name | — | counts per value; no rows returned. select, status, checkbox, multiSelect, relation (by linked title) |
| `limit` | number | 100 | `MAX_LIMIT` raised 100 → 1,000; the budget is the governor, not the page |
| `budget` | number (tokens) | the user's threshold | above the threshold → `needsApproval`; above the model ceiling → refusal naming the ceiling |
| `cursorSortKey` / `cursorId` | | | as today |
| `lifetime` | `"turn"` \| `"run"` \| `"chat"` | `"turn"` | how long the result stays in the resent context (§4.6); `"run"` outside an active iteration run degrades to `"turn"` with a note |
| `digests` | boolean | false | §5 |

**Index tier (the default `columns`):** primary + every `select`, `status`, `checkbox`, `number`, `date`, `url`, `email`, `person` column, plus the first `text` column that is not the primary. Never `longText`, never backlink relations, never `file`/`contentLink`. Forward relations included as titles. Measured at ~30 tokens a row on the claims table.

**Sizing pass.** Load the page (`loadRowPage`, hydrated), format it, `estimateTokens` (the shared 4-chars/token helper in `lib/domain/ai-context/tokens.ts`; handles instead of UUIDs make the heuristic honest). Then:

- `≤ effective budget` → return it.
- `> effective budget` and the request was not the index tier → return the **index tier** for the same rows (itself budget-checked), then one footer line: `Full read: ~14,200 tokens (99 rows × 9 columns; largest: Narrative ~4.1k, Sources ~3.0k). Call again with budget: 14200 to read it — the user will be asked to approve. Cheaper: columns: [...] or relations: "counts".`
- `> effective budget` and it already was the index tier (huge table) → the first rows that fit, the total, and `Narrow with filters, search, or groupBy.`

The effective budget is `min(input.budget ?? setting, modelCeiling)`. Nothing is silently truncated: every clip names what was dropped and the cheapest way to get it.

**Approval.** `needsApproval: (input) => (input.budget ?? 0) > threshold` — the function form the phase-checkpoint tool already uses; verify at build time that this SDK version passes `input` to it (§7). The card is the existing `ToolApprovalCard`; `ApprovalPreview` gets a `query_database` branch: `Read "Claims and metrics" — up to 14,200 tokens (99 rows, 9 columns)`. The number is in the input, so the card cannot show a different figure from the one the model was quoted. Big read = 2 calls + 1 approval; small read = 1 call. Reads never need approval below the threshold. The `propose_item_iteration` card additionally lists the reads it will pin for the run (§4.6a).

### 4.2 Output formats

Small results (≤ 20 rows) keep the labelled line, with handles:

```
17 matching rows; showing 17.
- [ba00e8be] [gap] No quantified result recorded · Claim ID: CLM-001 · Claim type: Qualitative outcome · Evidence strength: Needs verification · Experience: Reflection [bb36eb1f] · Sources: Original ledger passage — section 1 [52f556dc]
```

Bulk results (> 20 rows) switch to header-once TSV inside a fence, cells tab/newline-escaped, ids first:

```
99 rows (all). Columns: id, Claim or metric, Claim ID, Claim type, Evidence strength, Experience, Sources
id	Claim or metric	Claim ID	Claim type	Evidence strength	Experience	Sources
ba00e8be	[gap] No quantified result recorded	CLM-001	Qualitative outcome	Needs verification	Reflection [bb36eb1f]	Original ledger passage — section 1 [52f556dc]
```

`groupBy` returns one line: `Evidence strength — Documented 8 · Partially documented 45 · Recollection only 29 · Needs verification 17 · (empty) 0 — 99 rows.`

### 4.3 Cells, handles, relations, clipping

- **Hydration.** One formatter, `cellDisplayValue` semantics (relations, lookups, rollups, files, people, contentLinks) — extracted from `export.ts` into a pure module `lib/domain/data/read-format.ts` shared by export and the tool, so "the AI sees what the export sees" is one code path.
- **Handles.** Rows are emitted as `[8-hex]` (the UUID prefix). `resolveRowRef(tableId, ref)` next to `resolveDatabaseRef`: 36-char UUID → exact; 8+ hex chars → unique prefix among the table's live rows; ambiguous → teaching refusal listing the candidates with titles; none → refusal. Accepted by `update_row.rowId`, `update_row.expect`, relation cells in `insert_rows`/`update_row` (`resolveRelationCell`'s UUID branch grows a prefix branch), `rowIds` here, and `propose_item_iteration.rowIds`.
- **Relations.** `"titles"` (default): up to 3 linked rows as `Title [handle]`, then `+N more`. `"handles"`: handles only. `"counts"`: `3 linked`. Backlink columns (`config.isBacklink`) are excluded from the index tier and from `"all"`; naming one in `columns` includes it.
- **Clipping.** Cells in the index tier and in `"all"` are clipped at 120 chars with `…`; columns named explicitly in `columns` come back whole. Linked titles clip at 60.

### 4.4 `describe_database` — column profiles, samples, coverage

`buildDataSchemaDigest(nodeId, { profile: true })`; the mention capsule and `source-resolver.ts` keep calling it without the flag, so capsule cost does not move. With the flag, each column line keeps its description and gains a profile clause computed from the live rows (one pass over `data`/links, capped at the first 5,000 rows; the cap is stated when hit):

- text/longText: `— filled 94/99 · avg 134 chars · ~4.4k tokens to read`
- select/status/multiSelect/checkbox: `— Documented 8 · Partially documented 45 · Recollection only 29 · Needs verification 17 · empty 0`
- number/date: `— 0 … 250,000 · filled 41/99` / `— 2019-01 … 2025-06`
- relation/lookup/rollup: `— 96/99 linked · avg 1.4 · ~3.0k tokens as titles`
- file/contentLink/person: `— filled n/N`

Then `Samples (index tier):` three rows (first, middle, last by sort key) in the labelled format, and the digest coverage line (§5.4). Whole addition ≈ 300–400 tokens for the claims table.

The digest tail changes from "Rows are never included in context." to: `Rows: query_database reads them — index tier by default (~30 tokens/row), columns/rowIds/search/groupBy to narrow, budget to read more (the user approves above their threshold).`

### 4.5 Settings

`ai.bulkReadTokenThreshold`: integer 1,000–100,000, default 6,000.

1. `lib/features/settings/validation.ts` — `aiSettingsSchema` field + `DEFAULT_SETTINGS.ai`.
2. `state/settings-store.ts` — flows through `setAISettings` (generic patch; verify the persisted `ai` object includes the new key in `saveToBackend`).
3. `components/settings/AISettingsPage.tsx` — numeric field beside "Max tokens", same draft/commit pattern, help text: "Database reads larger than this ask for your approval; the request shows the estimated tokens."
4. Server read: the tool reads the user's settings at execute time (as the chat route does for `maxTokens`); model ceiling from `PROVIDER_CATALOG[model].contextWindow × 0.10`.

### 4.6 Context fold and lifetimes

`supersedeBulkReads(messages)` in `lib/domain/ai/context-diet.ts`, applied in the chat route next to `supersedeIterationHistory`. It folds `tool-query_database` parts whose output is ≥ 600 chars according to the part's recorded `lifetime`:

- **`turn`**: parts in assistant messages before the latest user message are stubbed: `[superseded — this database read (99 rows of "Claims and metrics", 6.1k tokens) was digested into the reply that followed; call query_database again if a later step truly needs the rows]`.
- **`run`**: exempt while an iteration run is active (the `findIterationFoldBoundary` run state), so the read survives every `record_batch_checkpoint`; stubbed once `record_iteration_findings` lands. The iteration fold itself never touches `query_database` parts (they are not perception parts): the rubric outlives the evidence by design.
- **`chat`**: exempt until the user unpins it from the chip, or a newer `chat`-lifetime read pushes the chat's pinned total over the allowance (2× the threshold), in which case the oldest pin folds and the footer of the new read says so.

Model path only; the transcript keeps every byte. The UI collapse reuses the same predicate (one boundary implementation, two consumers — the existing rule for the iteration fold), rendering the folded chip already used for perception parts. Pinned reads render a pin state on the chip with size and lifetime and an unpin action. Cache note: at most one prefix re-miss per user turn from `turn` folds; pins never move the boundary.

Guidance in the tool description: pin the **index tier with digests** for a run (≈6k for this library) and fetch specific rows by handle per item; pin full narratives only when the items need them.

### 4.6a Lifetime judgement — what the prompt asks, what the harness decides

The model's judgement is deliberately thin ("harness over prompt": a flag the model may set on its own authority is a flag it sets whenever convenient).

**Tool description text (verbatim intent):**
- `turn` (default): you are answering, drafting, or deciding now. Re-reads are cheap — never pin to avoid one.
- `run`: the rows are a rubric or reference you will consult once per item across an iteration. Set it only on the read made just before proposing the run, or during one. Read the index tier with digests, not the narratives.
- `chat`: only when the user asked to keep the table at hand or to work with it for a while. Never pin on your own initiative.
- Anti-rule: a pin costs its size on every later turn. If you cannot name the future step that will use the rows, use `turn`.

**Harness rules (no judgement required):**
1. **Promotion by adjacency.** A `query_database` part in the same assistant turn as, and before, an approved `propose_item_iteration` is promoted to `run` whether or not the model set it.
1b. **Promotion by charter link (D8).** During an active run with a charter attached, a read of a table reachable through the charter registry (`charterRegistryAuthorizes`) is promoted to `run` unless the model set `lifetime: "turn"` explicitly — which it does only when the charter, quest, or user prompt instructs it (the tool description says so). Tables the charter does not link follow rules 1–2.
2. **Degradation by absence.** `run` with no active run and no proposal in the turn degrades to `turn`; the footer says so.
3. **Consent travels — card wording.** The iteration approval card carries a "Standing context for this run" block, one line per read that will stay in context, with a per-line *release* control (released reads fold at the next user message instead). Wording, verbatim:

   ```
   Standing context for this run
   • Claims and metrics — index with digests · 99 rows · ~6.1k tokens · from the Job Fit charter
   • Experiences — index · 35 rows · ~0.9k tokens · read this turn
   ~7.0k tokens are re-sent with every item. These reads stay until the run ends, then fold.
   ```

   "from the <charter> charter" marks a D8 promotion; "read this turn" marks adjacency; a read the model pinned explicitly says "kept at the model's request". The block appears only when at least one read will persist; a run with none says nothing, so the absence is not noise.
4. **`chat` needs the user's words.** Granted only when the latest user message asked to keep or pin the table (soft check); otherwise degrades to `turn` and the footer tells the model to ask the user.

The chip and transcript line always show the lifetime that was *applied*, never the one requested.

### 4.6b Standing context declared on the charter registry (D9)

- **Column.** `Standing context` — a `select` system column (`config.system: true`, options `none`, `index`, `index with digests`, `full`) on the charter's master ledger, minted at mark alongside the existing machinery columns; plus `Context columns` (text, comma-separated column names) and `Context filter` (text, one `column op value` clause) — both optional. Existing masters get the columns on next attach (the same lazy-mint path the quest code uses for missing system columns).
- **Harness.** When a run starts with a charter attached, the harness reads the registry rows: for each linked table with a tier other than `none`, the run's first `query_database` on that table is executed at that tier (`columns`, `filters`, `digests` derived from the declaration) and pinned with `lifetime: "run"`; `full` is sized against the threshold like any read and asks for approval on the card if over. Tables at `none` follow the ordinary rules (§4.6a). A table with no registry row is not charter-linked and follows rules 1–2.
- **Card.** The standing-context block (§4.6a rule 3) lists each declared table with its tier and estimated size; controls per line: *release* (do not pin) and *index only* (drop `full`/`digests` to the index tier). What the user leaves is what runs.
- **Ledger.** Cross-item associations are written, not remembered: the quest ledger needs a relation column to each standing-context table (`propose_linked_databases` offers it at proposal time when missing), and `record_item_result` writes handles into it.
- **Chips.** The pinned chip names the origin: `pinned for this run · declared by the Job Fit charter (index with digests)`.

### 4.7 Text surfaces that change (all reference `query_database` today)

`data-tools.ts` (four tool descriptions), `data-metadata.ts` (settings descriptions — "never the whole table" is no longer true), `digest.ts` (tail), `relation-cells.ts` (error text now says "handle or title"), `capture.ts`, `filters.ts`, `types.ts` comments, the chat route's prompt lines, `AI-ARCHITECTURE.md` tool paragraph. `pnpm ai:drift:check` (prompt tool references) and `pnpm ai:matrix:check` run unchanged; no new tool, so the inventory gates are untouched.

### 4.8 Chips & traceability

Tool chip for `query_database`, live states: `reading` → `done` (`99 rows · 6.1k tokens`, plus `pinned for this run` / `pinned` with an unpin action when lifetime is `run`/`chat`) / `index served` (`99 rows as index · full read ~14.2k`) / `approval requested` → `approved` → `reading` → `done`, or `rejected` (`nothing read`). Degraded: `refused` with the refusal text. Folded (later turns): the existing folded chip, `query_database · folded — re-read if needed`. Click-to-expand shows the parameters, the row/column counts, the estimate versus the budget, and the threshold in force. Durable transcript line inside the tool part output header: `99 rows · 7 columns · ~6.1k tokens · budget 14.2k (approved) · pinned for this run`. The turn accumulator already reports the model-side token spend; nothing new is needed there.

### 4.9 Gates and smoke

- **Pure module gate.** The formatter, sizing pass, index-tier column selection and handle resolution rules live in `lib/domain/data/read-format.ts` with no Prisma import; `scripts/check-read-format.ts` (`pnpm data:read:check`, wired into `build` like the other checks) runs fixtures: a relation cell renders its linked titles with handles; a backlink is absent from the index tier; a 99-row × 9-column fixture sizes over 6k and the over-budget path serves the index; a 35-row fixture with clipped cells sizes under; an ambiguous 8-hex prefix refuses with candidates. Mutation-test the gate before trusting a first PASS.
- **Measurement harness** promoted to `scripts/measure-database-read.ts` (read-only URL, prints the §2b table for any table id) so the numbers can be re-checked after the change.
- **Smoke on production** (post-deploy checklist in the PR body, Career Evidence Library):
  1. Side chat on Claims: "Which claims need verification, and from which experience?" → one call, relations visible, handles shown.
  2. "Read all experiences." → index tier, under 6k, no approval.
  3. "Read the sources with their passages." → index + price → model asks → `budget` call → approval card shows the estimate → full TSV.
  4. "Set CLM-012's evidence strength to Documented" → `update_row` with the handle from the read.
  5. "Add a claim to EXP-007 linked to SRC-003" → `insert_rows` with handles in relation cells.
  6. "How many claims per evidence strength?" → `groupBy`, one line.
  7. "Anything about Intercom?" → `search`.
  8. `describe_database` → profiles + samples + descriptions.
  9. Next user turn after step 3 → the transcript shows the folded chip; the model answers a follow-up without re-reading unless it needs rows.
  9c. Set Standing context = `full` on the library's registry row → the card shows the full read's estimate and asks for approval when over the threshold; *index only* on the card drops it to the index tier without re-proposing.
  9a. Attach the Job Fit charter (registry links the library) and start a first pass without reading first → the run's first read of Claims is promoted to `run`; the card would have shown nothing (no read yet), and the chip shows `pinned for this run · from the Job Fit charter`.
  9b. Start a job first pass (`propose_item_iteration`) after a `lifetime: "run"` read of the claims index → the read survives the first batch checkpoint and folds after `record_iteration_findings`; the chip shows the pin throughout.
  10. Set the threshold to 2,000 in settings → step 2 now asks for approval with the number on the card.

## 5. PR 1 (part B) — "Row digests" (the PR's migration)

### 5.1 Schema

New model, 1:1 with `DataRow`, mirroring `AgenticMetadata`:

```prisma
model DataRowDigest {
  rowId       String    @id @db.Uuid
  digest      String    @db.VarChar(400)
  /// sha256 of canonicalJson(data) + sorted forward link ids at generation time — read-time staleness
  sourceHash  String    @db.VarChar(64)
  /// set by every cell/link write, cleared on generation — sweep discovery (indexed), never read-time truth
  dirty       Boolean   @default(false)
  model       String?   @db.VarChar(100)
  generatedAt DateTime  @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @db.Timestamptz(6)
  row         DataRow   @relation(fields: [rowId], references: [id], onDelete: Cascade)
  @@index([dirty])
}
```

`DataPayload.rowDigests Boolean @default(false)` — per-table opt-in (the table's settings sheet gets a switch: "AI digests — one line per row, refreshed in the background"). The PR ships the migration file plus the `prisma migrate diff` SQL and the exact steps in the body, per the handoff rule.

### 5.2 Staleness and dirtiness

- **Read-time truth is the hash.** `rowSourceHash(row, forwardLinkIds)` in `lib/domain/data/digest-hash.ts` (pure): `sha256(canonicalJson(data) + "|" + sortedLinkIds.join(","))`, `canonicalJson` lifted out of `mutations.ts` and exported. Stale ⇔ `sourceHash !== rowSourceHash(now)`. Undo back to the same content is fresh again; a relation change is stale because the links are in the hash.
- **Dirty bit is discovery only.** `writeCells`, `createRows`, `writeRelationLinks`, and the relation-cell path set `dirty = true` on the touched rows (both ends of a link) inside their transactions; generation clears it. Same reasoning as `contextDirty`: "what needs work" as an indexed query, not a hash scan. A hiccup here can never fail a save (fire-and-log, as `context-dirty.ts` does).

### 5.3 Generation

- **Feature route** `row-digest` in `FEATURE_REGISTRY` (text, low-cost preferred, default Haiku 4.5; unconfigured → falls back to `studio-metadata`'s model, as `ai-context-enhanced` does). Run `pnpm ai:matrix` after adding it.
- **Job** `refreshRowDigests(userId, tableId, { maxRows, budgetMs })` in `lib/domain/data/server/digests.ts`: candidates = dirty or missing rows of an opted-in table, oldest first; batches of 20; prompt = table description + column names with descriptions + each row's index-tier cells and clipped long text (400 chars/cell) + forward relation titles; output = JSON `[{ handle, digest }]`, digest ≤ 200 chars, evidence-preserving (states only what the cells say; a `[gap]` row digests as a gap). Validate handles against the batch; write `digest`, `sourceHash` (computed from the same snapshot the prompt saw), `model`, `generatedAt`, `dirty = false`. `recordSpend` per call against the existing `dailyCallCap`; a table-level claim stamp for cross-instance single flight (same CAS as `claimScope`).
- **Triggers.** (a) On access: `query_database` with `digests: true` on an opted-in table whose candidates ≤ 40 refreshes them synchronously within a 3 s budget before formatting (the `ensureFolderContextFresh(budgetMs)` pattern), else serves what is fresh. (b) Nightly: the existing `studio-context-sweep` cron drains opted-in tables in bounded batches under the same cap stack. (c) Manual: a "Refresh digests" action in the table settings sheet.

### 5.4 Reads and UI

- `query_database({ digests: true })` appends `· ≈ <digest>` to each index-tier line; stale or missing ones are omitted and counted in the footer (`12 digests stale, 7 missing — omitted`). Index + digest measured at ~60 tokens a row, so 99 claims fit the default threshold.
- `describe_database` coverage line: `AI digests: 80 fresh · 12 stale · 7 none (refreshed nightly; last 2026-09-14 02:10, Haiku 4.5)`.
- Grid: read-only virtual column "AI digest" rendered like a lookup (`DataGridRow.tsx`/`DataRowFields.tsx`), hidden by default via the view's `ColumnPref.hidden`, stale rows badged. Row page properties block shows it last with the same badge. Export: `.schema.md` notes the column as AI-generated; the CSV includes it only when the view shows it.

### 5.5 Chips & traceability

Background job chip on the table (and in the side chat when triggered on access): `checking` → `refreshing 20/99` → `fresh` / `stale-served (12 stale)` / `failed (route unconfigured / cap reached)`. Click-to-expand: rows touched, model, tokens, elapsed. Durable line in the transcript when triggered from chat: `Digests refreshed: 20 rows · Haiku 4.5 · 2.1k tokens`; in the table's activity: the same line with the trigger (access / nightly / manual).

### 5.6 Gates and smoke

- `digest-hash` fixtures in the read-format gate: same content → same hash; a link change → different hash; key order irrelevant.
- Smoke on production: opt the Claims table in → manual refresh → 99 digests → edit one claim's narrative → its digest reads stale in the grid and is omitted by `digests: true` → nightly (or manual) refresh clears it → describe shows coverage.

## 6. PR 2 — subgraph reads and sorted paging

- `expand: string[] | { [relation]: string[] }` — one hop through forward relation columns; each linked row nested once under its parent with its own index tier (or the named columns), cap 10 per relation with `+N more`; the nested block for a linked table is sized into the same budget. Jurisdiction rule: a table reachable through a relation column of an associated table is readable, behind the usual access checks (the charter-registry precedent: the link is the consent). Measured: nesting is the cheapest whole-graph encoding (22.7k vs 37.9k for this library).
- Keyset cursor on sorted queries in `loadRowPage` (sort value, sortKey, id), so "all rows by Fit %" pages.

## 7. Risks and things to verify first

1. **`needsApproval` input.** Confirm this SDK version invokes the function form with the tool input (the checkpoint tool uses the zero-arg form). If it does not, fall back to a two-step: the over-budget call returns the price; the follow-up call carries `confirmedByUser` and the card is rendered by a proposal part instead.
2. **Token estimate accuracy.** 4 chars/token underestimates UUID-heavy and code-heavy text; handles remove most of that. Measured hydrated TSV runs 4.3–4.6 chars/token, so the estimate is slightly conservative for prose, which is the safe direction.
3. **Fold cache cost.** One prefix re-miss per user turn when a bulk read folds; accepted, same trade as the iteration fold.
4. **Profiles on large tables.** The 5,000-row sample cap keeps `describe_database` bounded; state the cap in the output when hit.
5. **`MAX_LIMIT` 1,000 with sorted queries** preselects ids then orders in SQL — already the design scale (≤10k rows).
6. **Digest honesty.** The prompt must forbid inference beyond the cells (Principle 2, "gaps are data"); the read-format gate includes a fixture asserting a `[gap]` row's digest contains "gap".
7. **Settings key placement.** `ai.*` is the right home (not `studio.*`); the digest opt-in is per table on `DataPayload`, not a user setting.

## 8. Build notes (2026-09-15)

- **Shipped as specified** except: mirrored relation halves stay in the index tier (§4.3 rule 3, reversed on prod evidence); index-tier relation cells show one 40-char title + `+N more`; `MAX_LIMIT` 100 → 1,000; the digest read side lives in `digest-read.ts` (below the row loader) and generation in `digests.ts` (above it) to avoid a cycle; the dirty bit is set inside the same transaction as the cell/link write (atomic, no fire-and-forget needed) and fire-and-log only on the links route.
- **Standing context (D9)** is read by `propose_item_iteration` from the master row and returned as `standingContext` + an instruction; the read tool's charter promotion (rule 1b) makes those reads `run`. The `Reference tables` column is where the evidence library is declared for a job-hunt quest.
- **Deferred to follow-ups (BACKLOG):** per-line *release* controls on the iteration card (the card only lists reads made in the same message before the proposal, and a generic line for charter-declared tables — sizes for declared tables would need a pre-approval fetch); the grid's virtual "AI digest" column (the view layer has no column-visibility mechanism yet; digests show on the row page/peek with a stale badge); `expand`; sorted cursor.
- **Verification:** `pnpm data:read:check` (26 checks, two mutations caught); loaders, handle resolver, search, rowIds, group counts smoked read-only against the prod claims table; migration SQL ran clean in a rolled-back transaction on local Postgres; typecheck, lint (0 new warnings), `ai:drift:check`, `ai:matrix:check` green. The tool module cannot be loaded standalone under tsx (TipTap through the quests import), so the execute glue is covered by typecheck and the production smoke.
- **Migration handoff:** `scripts/handoff/2026-09-15-data-row-digests.patch` + `.md` — additive; deploy ahead of the code; CI typecheck is red until the schema is applied on the branch.
