# AI Bulk Row Reading — Plan

**Status:** PREP (current-state map written 2026-09-14; refinements pending owner direction)
**Driving case:** the Career Evidence Library just loaded — 35 experiences / 66 sources / 99 claims / 35 index rows, 1,025 links. An AI asked to "draft a résumé bullet for every Ready experience with its claims and sources" has to read most of that graph, and today it cannot see the graph at all through the tool that reads rows.
**Related:** `AI-RELATIONAL-DATABASE-REACH-PLAN.md` (P4 relation cells on write), `EXTRACTION-TO-DATABASE-PLAN.md` (database-rows iteration), `core/PRODUCT-PRINCIPLES.md` §2.

## 1. Current state — every path by which a model reads rows

| Path | Where | What the model gets | Ceilings |
|---|---|---|---|
| **Database @-mention / bound database** | `app/api/ai/chat/route.ts` → `buildDataSchemaDigest` (`lib/domain/data/server/digest.ts`) | Schema only: columns, types, descriptions, option labels (cap 50/column), relation targets, views, row-count *bucket*. Ends with "Rows are never included in context." | No rows, by design |
| **`query_database`** | `lib/domain/ai/tools/data-tools.ts` | One page of text rows `- [rowId] Title — Col: val · Col: val`, plus total match count. Server-side filter/sort through the one filter compiler. | `DEFAULT_LIMIT 20`, `MAX_LIMIT 100`, **`RESULT_BYTE_BUDGET 4096` chars per result** (≈25–40 rows at 3 columns), default columns = primary + first 3 non-primary, sorted queries return top rows with **no cursor** |
| **`describe_database`** | same | The digest again, for exact names | — |
| **Row-page mention / bound row page** | `buildRowPropertiesBlock` | One row's cells, `cellToText`, empties skipped | One row |
| **`database-rows` iteration** (`propose_item_iteration`) | `lib/domain/ai/tools/registry.ts` | Rows enumerated server-side as items (title + row id); each item then processed one turn at a time with `record_item_result` stamping cells back | `itemCap ≤ 200`, one model turn per row — a *process* path, not a *read* path |
| **Promoted row page as a note** | ordinary note tools (`read_first_chunk`) | The page body, not the cells (cells come via the properties block above) | 2,000-char chunks |

## 2. Findings (what actually limits a bulk read today)

1. **Relation, lookup and rollup cells are invisible to `query_database`.** `loadRowPage` hydrates `row.links` / `row.derived` / `row.contentRefs`, but the tool formats each cell with `cellToText(c, row.data[c.key])` — and those types store nothing in `data`, so they render empty. The CSV export already does this right (`cellDisplayValue` in `lib/domain/data/server/export.ts` reads links/derived). A model reading the Career Evidence Library sees claims with no experience and experiences with no sources. **Highest-value fix; smallest change.**
2. **4,096 characters per result** is the real bulk ceiling, not the 100-row page. Long-text columns (`Narrative`, `Your contribution`, `Original passage`) blow it in 3–5 rows. There is no column-width truncation, so one verbose cell costs the page.
3. **Sorted queries cannot page.** "Top 20 by Fit %" works; "all rows by Fit %" does not — the model must drop the sort to walk the table.
4. **Default columns are positional** (first three non-primary), not the ones a reader needs; the model has to know names first (`describe_database`), costing a turn.
5. **No graph traversal.** Reading an experience *with* its claims *with* their sources is three queries plus id bookkeeping the model must do itself — exactly the id-juggling the relation work was meant to remove.
6. **No aggregate/count-only mode.** "How many claims are Documented per experience" is a full read today; rollups exist as columns but a query cannot ask for a group-by.
7. **The digest says "Rows are never included in context."** True and deliberate for mentions, but there is no middle tier — no "here are the 5 rows that match the bound row page" or "sample of 3 rows so you know the shape."
8. **No token accounting.** The budget is chars; nothing knows the model's context size (the mention-budget item in BACKLOG has the same shape — a per-model budget from `PROVIDER_CATALOG`).

## 3. Levers (candidate refinements — not yet chosen)

- **A. Hydrated cells in `query_database`** — use `cellDisplayValue`-style rendering so relations show linked-row titles, lookups/rollups their values; optionally `[rowId]` suffixes on linked titles so the model can follow links without a second lookup. *Small.*
- **B. Per-cell truncation + per-call budget as a parameter** — `maxCellChars` (default ~120) and a `budget` the model may raise deliberately (bounded by a per-model ceiling), with the clip message naming which rows were dropped. *Small.*
- **C. Cursor on sorted queries** — keyset on (sort value, sortKey, id). *Medium; touches `loadRowPage`.*
- **D. `expand` parameter — one-hop graph reads** — `expand: ["Claims and metrics"]` returns each row with its linked rows inline (bounded per relation, e.g. 10), so an experience + claims + sources is one call. *Medium.*
- **E. Column selection by intent** — `columns: "all" | "text" | [names]`, and a `describe`-free default that prefers primary + select/status + numbers (the cells that fit), leaving longText for explicit requests. *Small.*
- **F. `summarize` / group-by mode** — `groupBy: "Evidence strength"` returns counts (and optionally titles) per bucket; reuses the filter compiler. *Medium.*
- **G. Bulk-read tool distinct from `query_database`** — `read_rows` that returns a compact CSV/TSV-style block (header once, one line per row, no per-cell labels) — roughly 2–3× more rows per budget than the labelled format. *Small–medium; keeps `query_database` for filtered lookups.*
- **H. Row sampling in the mention capsule** — 3 sample rows after the schema so the model knows value shapes before it queries. *Small; deliberate reversal of "rows are never included", so owner decision.*
- **I. Token-aware budget** — per-model result budget from `PROVIDER_CATALOG` contextWindow, shared with the mention-budget item. *Medium; spans the AI catalog.*

## 4. Open questions for the owner

- Is the target "one call reads a whole small table" (G + B), "one call reads a subgraph" (D), or both?
- Should bulk reads be user-approved like writes (they cost tokens, not data)? Today no read tool needs approval.
- Which surfaces matter first: side chat on a database, a charter run over `database-rows`, or the folder assistant?

## 5. Not doing (unless asked)

- Injecting whole tables into the system prompt on mention.
- A SQL passthrough tool.
