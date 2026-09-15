# AI Bulk Row Reading — Plan

**Status:** DESIGN SETTLED (measurements 2026-09-14; owner decisions in §6; PR 1 = §6 items 1–4, PR 2 = digest)
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

## 3. Design — a tiered read model

The efficient path is *right-sizing the read to the ask*, not one bigger page. Four tiers, each a small addition to the existing `query_database` unless noted:

| Tier | Ask it serves | Shape | Cost (this library) |
|---|---|---|---|
| **T0 Schema** | "what is here" | the digest (exists) | 0.2–0.7k / table |
| **T1 Index** | "which rows matter" | every matching row as `[handle] Title · select/status/number/date cells` — no long text, no relations unless asked | ~30 tok / row |
| **T2 Rows by handle** | "give me these six" | `rowIds: [...]` → full cells for exactly those rows | pay only for what was picked |
| **T3 Subgraph** | "this experience with its claims and sources" | `expand: ["Claims and metrics", "Sources"]` — forward relations, each linked row nested once, per-relation cap | 0.2–0.6k / root row |
| **T4 Bulk** | "read the whole thing" | header-once TSV, clipped cells, forward relations only, token budget the model may raise deliberately | 20k for all four tables |

Plus one retrieval primitive that often beats every tier: **`search`** — a `contains` over `DataRow.searchText` (already maintained on every write) so "anything about Intercom" is one small read, not a walk.

### Cross-cutting rules (each measured above)

1. **Short handles everywhere.** Emit `[8-hex]` instead of the UUID; `update_row`, `insert_rows` relation cells, and `rowIds` accept a prefix that is unique within the resolved table (one `resolveRowRef` helper next to `resolveDatabaseRef`; ambiguous prefix → teaching refusal listing the candidates). Halves today's result size before any other change.
2. **Hydrate every cell** through `cellDisplayValue` semantics (relations, lookups, rollups, files, people) — the export already does this; the tool must see what the export sees.
3. **Relations render compactly.** Default: up to 3 linked titles each as `Title [handle]`, then `+N`. `relations: "handles" | "counts"` for cheaper reads. Backlink columns are **excluded by default** from T1/T4 (they duplicate the forward side); explicit `columns` still gets them.
4. **Clip cells** at 120 chars by default; columns named explicitly in `columns` come back whole; `maxCellChars` overrides.
5. **Budget in tokens, not chars.** Estimate at 4 chars/token; default ~6k tokens per call (≈6× today), `budget` raisable to a per-model share of `PROVIDER_CATALOG.contextWindow` (proposed 10%). The clip message names how many rows were dropped and the cheapest way to get them (narrow, `relations: "counts"`, `columns`).
6. **Header-once above 20 rows.** Labelled lines stay for small results (readable); TSV for bulk.
7. **Sorted queries page** via keyset on (sort value, sortKey, id) — needed once T4 exists, otherwise "all rows by X" stays impossible.
8. **Digest tail changes** from "Rows are never included in context" to a one-line map of the tiers, so the model knows the cheap path exists.

### What stays deliberate

- The mention capsule still carries no rows (T1 is one call away and costs ~30 tokens a row; injecting it uninvited would charge every turn).
- No SQL passthrough. No whole-table injection into the system prompt.
- Bulk reads need no user approval (they cost tokens, not data); the `budget` parameter is the model's deliberate act, and the turn accumulator already reports the spend.

## 4. Build slices (proposed order; each independently shippable)

| Slice | Contents | Size | Unlocks |
|---|---|---|---|
| **S1 Read correctness + cost** | hydrated cells; short handles on read **and** write (`resolveRowRef`); backlinks off by default; 120-char clip; token budget + `budget` param; TSV above 20 rows; digest tail | small (one file + one helper + one prompt line) | every table in the library readable in ≤2 calls; relations visible |
| **S2 Index + fetch + search** | smarter default columns (T1); `rowIds`; `search` over `searchText` | small | pick-then-fetch pattern; retrieval instead of walks |
| **S3 Subgraph** | `expand` one hop through forward relations, nested once, per-relation cap 10 | medium | "experience with claims and sources" in one call; the cheapest whole-graph encoding |
| **S4 Sorted paging + group-by** | keyset cursor on sorted queries; `groupBy` counts through the filter compiler | medium | "all rows by Fit %"; "how many per bucket" for ~50 tokens |

Gate for S1: the measurement harness (scratchpad `bulk/measure.ts`) reruns as a script under `scripts/` against a local seed, asserting the claims table with all columns fits one call and that a relation cell renders its linked titles.

## 5. Decisions for the owner

1. **Handle style:** 8-hex UUID prefix (generic, stateless) vs the table's own ID column when one exists (`EXP-007`, human, but not every table has one). Proposed: prefix always, and *also* show an ID-like text column when the table has one — the model may reference either.
2. **Relation default:** titles (readable, ~50–300 chars a cell) vs handles (~10 tokens). Proposed: titles capped at 3 per cell.
3. **Budget ceiling:** default 6k tokens, max 10% of the model's context window. Numbers are a guess at the right order; the measured library says 20k reads the whole thing.
4. **`expand` home:** a parameter on `query_database` (fewer tools; one description grows) or a separate `read_subgraph` tool (clearer, one more entry in the tool inventory + settings metadata + drift gate).

## 6. Owner decisions (2026-09-14) and first-build plumbing

**Decided:** one read tool, evolved in place — `query_database` keeps its name and ergonomics (jurisdiction, name resolution, filter compiler, lenient schema, teaching refusals) and gains `search`, `rowIds`, `expand`, `groupBy`, `budget`, `digests`. No sibling read tool: `search_content` finds tables, `query_database` finds rows, `propose_item_iteration` processes what a read picked. Row abstraction ships now (column profiles + samples in `describe_database`); a stored per-row digest ships as a second PR.

**Budget and approval.** Default threshold is a user setting in AI settings (6,000 tokens; four registrations). The server formats the real result and counts it: under threshold → returned; over → the index tier for the same rows plus the exact price ("~14,200 tokens; call again with budget: 14200, the user will be asked"). `needsApproval` is a function of `budget` so the approval card carries the number. Big read = 2 calls + 1 approval; small read = 1 call.

**Accumulation.** Bulk-read result parts are superseded in `context-diet.ts` at the next user message, the same fold as iteration snapshots; the marker names the read so the model can re-read (local, cached) if a later turn needs it.

**Per-row digest.** Sidecar, not a cell: `DataRow.agentic` JSON `{ digest, hash, generatedAt, model }`, mirroring the folder capsule's `agenticMetadata` (AI context is provenance-bearing metadata, not user content). Staleness = `hash !== sha256(canonicalJson(data) + forward link ids)` at read time — never a timestamp (writing the digest bumps `updatedAt`). Written by a second job on the folder-context refresh engine (batches of 20 rows, gen-lock, daily spend accounting, per-table opt-in). Read via `digests: true` (stale ones omitted with a count); coverage reported by `describe_database`. Grid: read-only virtual column, hidden until a view shows it. Alternative rejected: a system column in `data` leaks into search text/exports and has no home for the hash (would need a second hidden stamp column).

**Plumbing, PR 1 (no migration):** `query_database` formatting + `resolveRowRef` (8-hex handles on read and write) + backlinks-off + 120-char clip + token budget/`needsApproval` + TSV ≥ 20 rows + `search`/`rowIds`/`groupBy`; settings threshold; context fold; `describe_database` profiles (fill rate, distincts, min/max, avg length, per-column token estimate), 3 samples, digest coverage line; digest tail rewrite; measurement harness promoted to a script.
**PR 2 (migration handoff):** `DataRow.agentic`, hash helper next to `canonicalJson`, refresh-engine job + per-table setting, virtual column, `digests` param.
**Between them:** `expand` (one hop, forward relations, nested once, cap 10 per relation; linked tables reachable through a relation column of an associated table count as in jurisdiction).
