# Iteration Run Harness Fixes — Plan

**Status:** BUILDING 2026-09-27 on `feat/charter-run-harness` (worktree `.claude/worktrees/run-harness-fixes`, cut from `origin/main` 4a3d5552). Production smoke pending (§6).
**Driving case:** prod conversation `23fd28d6-7af1-4ba3-a482-c963fae991c2` (chat node `dce6cf56`, *Job Opportunity Exploration Task*, 2026-09-27 01:50–01:56 UTC, `openai/gpt-5.6-luna`). One-item `database-rows` pass of the *Apply for a job* charter over the Job Opportunities Library. The run shipped a resume with `[YOUR NAME]` placeholders and no verified evidence, wrote the row twice, spent five of sixteen tool calls on nothing, and mis-recorded its own diagnostics. Every finding below is anchored to that transcript (parts are in `ConversationMessage.parts`; the row is `DataRow 10fde52d`).
**Related:** `AI-CONTEXT-ECONOMICS-PLAN.md` §6b (deliverables, reserved tail, gaps-are-data — PR #256), `EXTRACTION-TO-DATABASE-PLAN.md` (charter → quest → sitting doctrine, capture), `AI-RELATIONAL-DATABASE-REACH-PLAN.md` (relation-graph jurisdiction), `AI-BULK-ROW-READING-PLAN.md` (read tiers, `BULK_CLIP_CHARS`), `core/AI-ARCHITECTURE.md` §5 (tool input contracts).

## 1. What the run did (evidence)

| Step | Call | Outcome |
|---|---|---|
| 1 | `summon` | ok |
| 2 | `query_database` filter `Interest Level is 0` | 0 rows (guess; real minimum is 6) |
| 3 | `query_database` sort `Interest Level asc` | 20 of 29 rows |
| 4 | `propose_item_iteration` (captureTo `""`) | refused — rows pass needs captureTo |
| 5 | `propose_item_iteration` (captureTo object, 8 redundant keys) | approved; `deliverables: [create_docx, update_row]`; nextAction says "include capture.cells" AND stepBudget note says "create_docx → update_row → record_item_result" |
| 6 | `summon` | 2 of 7 already available |
| 7 | `query_database` rowIds + `columns: "all"` + budget 5000 | 34 columns, every long cell clipped at 120 chars, ~377 tokens |
| 8 | `read_page_headless_or_browser` LinkedIn posting | "success": 4.3 KB of *Similar jobs* chrome; description already in the row |
| 9 | `read_content` Resume Guidence | ok |
| 10 | `query_database` 7 named columns | full text (the read step 7 should have been) |
| 11 | `query_database` "Career Evidence Library" | **refused — not associated** (charter wiki-links it; no relation column reaches it) |
| 12 | `read_page_headless_or_browser` seatgeek.com/about | 403; tab-open off; result told the model to record the page as an item |
| 13 | `create_docx` | draft with placeholders (only "evidence" is the row's own Initial Match Assessment text) |
| 14 | `update_row` (Resumes as a string) | rejected — "Expected a list" |
| 15 | `update_row` (9 cells) | **written** |
| 16 | `record_item_result` (`capture` flat) | **Zod error** — `capture.cells` required nested key |
| 17 | `record_item_result` (`capture.cells`, shorter text) | **row written again — clobbered step 15** (verified: DataRow holds the short versions) |
| 18 | `record_iteration_findings` | told the model to link "… — Quest Log" (real title: "Run Ledger — Apply for one low-interest opportunity · Indigo Reef") |

Metadata: 6 requests, 350,374 tokens, $0.048 est., `segments: [1 of 6]`, `durationMs 72,136` for a ~5-minute turn, `segmentsTruncated: 0`. The run ledger note also carries an unfinished *Iteration plan* from 2026-09-22 with no item and no reconciliation. The charter note holds four identical copies of its content (66 KB TipTap, 3,794 words; last modified 22:19 UTC, after the run).

## 2. Findings

- **F1 Charter inputs are outside jurisdiction.** `resolveJurisdiction` (`lib/domain/data/server/resolve.ts`) admits the bound table, @-mentions, tables created under the chat, the charter's master ledger and anything reachable by relation column. The charter's own `[[Career Evidence Library]]` counts for nothing: `collectReferences` (`charters/parse.ts`) drops `targetId`, and `resolveCharterReferenceContext` (`chat/route.ts`) resolves references only against `note`/`folder`, so a database reference renders as "not found in your notes". A link the user wrote into the rubric is refused by the tools — the same contradiction PR #231 closed for relation columns.
- **F2 The loop forbids the one pause the charter requires.** `record_item_result.next` and the iteration prompt block say "Do NOT stop or ask the user". The charter says "ask focused questions when missing details could materially improve the resume". The harness instruction won and the run substituted a hollow draft for a one-line question. The allowed stops (captcha, login wall, session end) do not include "a charter-named input the tools cannot reach".
- **F3 Two write paths for the same cells.** The model declared `update_row` as a deliverable; the proposal echoed it in `stepBudget.note` and, separately, demanded `capture.cells` on `record_item_result`. Both ran. `captureUpsertRow` (`data/server/capture.ts`) replaces unconditionally, so the second, abbreviated write won.
- **F4 A required nested key in a run-loop schema.** `record_item_result.capture` is `z.object({ cells: z.record(...) })` — exactly the shape `iteration-proposal.ts` forbids ("required keys inside a nested object"). Drift gate 7 scans for refinements only, so it never caught it. The flat map the model sent was semantically complete and died before execute.
- **F5 Scalar for a list column is fatal, not normalized.** `encodeStringIdList` (`data/cells.ts`) rejects a bare id for `file`/`contentLink`; `normalizeCellInput` (`data/capture-core.ts`) wraps nothing. One id for a file column is unambiguous.
- **F6 The read tool treats every URL in a run as an item.** `deriveActiveItemIteration` (`use-conversation-engine.ts`) carries only counts, so `iteration` is truthy for research reads too; the failure suffix "This is an attempted iteration item — record it unreadable" was wrong for seatgeek.com/about, and the success-path thin-page note has the same blind spot. Nothing suggested `search_web` for a blocked research page.
- **F7 Navigation chrome passes as a successful read.** `extractReadableContent` (`acquisition/extract.ts`) returns Readability's pick as `readable` whenever it is non-empty; LinkedIn's anonymous page yields a 4 KB *Similar jobs* list that clears every length gate (200 / 500 / 800 chars), so no escalation, no note, and the model reads a page of job titles as the posting.
- **F8 `columns: "all"` is a preview that ignores `budget`.** `data-tools.ts` clips every non-named cell at `BULK_CLIP_CHARS` (120) and never uses the budget to widen; a one-row read with `budget: 5000` came back at ~377 tokens with `…` in every long cell, forcing a second call. The header does not say cells were clipped.
- **F9 A zero-row filter teaches nothing.** The first query guessed `Interest Level is 0`; the result was a bare header. The digest carries select vocabularies but no number ranges, and the empty result did not say what values the column holds.
- **F10 Synthesized artifact labels.** `record_iteration_findings` hands the model `@[<quest> — Quest Log](id)`; the note is titled by `buildRunLedgerTitle` ("Run Ledger — … · Indigo Reef"). The link resolves, the label lies. The Quest Ledger label matches only until someone renames the table.
- **F11 An unfinished sitting is silently superseded.** `ensureQuest` reports `continued: true` and nothing notes that the previous sitting (2026-09-22) recorded no items and never closed.
- **F12 A duplicated charter note becomes an N-phase charter.** `parseCharter` treats four identical top-level sections as four phases; the next run would show "Phase 1 of 4" and a checkpoint would replay the whole workflow four times. No duplicate detection exists.
- **F13 Turn diagnostics drop every request after the first.** `use-conversation-binding.ts` writes the folded blob (stamped `diagnosticsVersion: 1`) back into message state after request 1; the SDK deep-merges request 2's raw metadata over it, so `mergeTurnUsageMetadata` (`turn-diagnostics.ts`) sees a "merged blob", ignores its `segment`, and re-adds request 1's persisted cost instead of pricing the new request. Usage sums survive (each request's `usage` overwrites), segments and cost do not.

## 3. Fixes

Each fix names its mechanism, where it lands, and how it is proven. Harness over prompt throughout (owner rule 2026-08-08): prompt text changes ride only where the harness already speaks (tool results, the charter context block).

### P1 Charter references are jurisdiction roots (F1)
- `charters/parse.ts`: `CharterReference` keeps `targetId` when the wikiLink node has one.
- `resolve.ts`: new `charterReferencedTableIds(ctx)` — load the active charter's TipTap, collect wiki-link refs (`collectWikiLinkRefs`), resolve id-first then exact title (case-insensitive) against the user's `data` nodes. `jurisdictionRoots` adds those ids AND the master ledger id (the doc comment already claims the master is a root; it was not). `resolveJurisdiction` therefore admits charter-named databases and everything they link (the Career Evidence Library's Experiences/Claims/Sources). Bounded: one note load, one `findMany` by title, only on the refusal path.
- `chat/route.ts` `resolveCharterReferenceContext`: include `data` nodes; render `- [[Career Evidence Library]] — DATABASE (query_database databaseId: <id>; reachable this run)` so the manifest names the tool and the id.
- Gate: unit fixture for `charterReferencedTableIds` resolution order (id beats title; ambiguous title = no grant); mutation-test by breaking the title match.

### P2 A missing charter input is a legitimate pause (F2)
- `resolve.ts` refusal, when `ctx.activeCharter` is set: append "If the attached charter names this database as an input, do NOT substitute or infer — stop, tell the user which database to @-mention, and end the turn; recorded progress resumes from the first pending item." (harness-authored text in a tool result).
- `registry.ts` `record_item_result.next` for `status: "blocked"`: the continuation directive becomes "Blocked by a captcha, login wall, session end, or a charter input the tools cannot reach → STOP and tell the user; any other obstacle → next item."
- `system-prompt.ts` iteration block: the allowed-stop list gains "a charter-named input (database/note) the tools refuse — ask for the mention instead of substituting".

### P3 One write path when capture is on (F3)
- `registry.ts` propose: when `captureCfg` is set, strip `update_row`/`update_rows` from `deliverables` with a `shapeNote` ("update_row dropped — CAPTURE IS ON: capture.cells on record_item_result IS the row write; a second write would overwrite it"). `stepBudget.note` and the reserved tail follow automatically.
- `capture-core.ts` `CaptureConfig.approvedAt?: string` (stamped at proposal, additive). `capture.ts` `captureUpsertRow` gains `keepFilledSince?: Date`: on the update path, if the row's `updatedAt >= since`, cells whose current value is non-empty are kept, only empty cells are written, and `keptCells` rides the result. `record_item_result` passes `approvedAt`, and the ledger line / result say "N cells kept — already written this sitting (update_row or the grid); capture fills only empty cells after a same-sitting write". Rationale: a new signal never outranks recorded data (owner rule); the fuller first write survives.
- Gate: pure fixture over `partitionCaptureWrites(current, writes, rowUpdatedAt, since)`.

### P4 `capture` describe-only + gate 7 catches nested required keys (F4)
- `registry.ts`: `capture: z.record(z.string(), z.unknown()).optional()`; execute normalizes `{cells:{…}}` or a flat map via `normalizeCaptureArg` (pure, in `iteration-proposal.ts`), reporting `shapeNotes: ["capture sent flat — read as capture.cells"]`.
- `scripts/validate-ai-drift.ts` gate 7: a run-loop schema block with more than one `.object(` fails ("nested objects must be `z.record` — normalize in execute"). Mutation-tested by re-adding the nested object.

### P5 Scalar → list for id-list columns (F5)
- `capture-core.ts` `normalizeCellInput`: `file`/`contentLink` with a non-empty string → `[string]` (split on commas/whitespace for several ids); `multiSelect` without `splitOn` with a string → `[string]`. Shared by `update_row`, `update_rows`, capture. `applyRowUpdates` appends "(normalized: Resumes wrapped as a one-item list)" so the coercion is visible.

### P6 Item-scoped read hints + research fallback (F6)
- `use-conversation-engine.ts` `deriveActiveItemIteration` also returns `itemUrls` (from the proposal's `items[].url`). The failure suffix and the thin-page `iterationNote` apply only when the URL matches an item (normalized: lowercase host, no trailing slash, no hash). A non-item failure during a run says: "This URL is not one of the run's items — do not record it as one. If it was research, record the gap and continue; search_web can find official sources when a page is blocked."

### P7 Chrome-only bodies are flagged, not celebrated (F7)
- `acquisition/extract.ts`: pure `looksLikeNavigationChrome(text)` — ≥ 15 non-empty lines, median ≤ 4 words, ≥ 75 % of lines ≤ 6 words, no sentence longer than 120 chars. When true the extraction quality is `raw` and the envelope carries `contentNote: "The fetched body is link lists / navigation, not the page's main content — this site serves it only to signed-in sessions."` (`AcquiredContent.contentNote?`, additive).
- `acquire-url.ts` `isThin` also treats `contentNote` as thin, so P2/P3 escalate when the extension is present. The engine forwards `contentNote` in the tool result so the model knows the description was NOT read.
- Gate: fixture with the LinkedIn body from the run (chrome) vs. a prose page (not chrome).

### P8 `"all"` honours the budget; clipping is announced (F8)
- `data-tools.ts`: `columns: "all"` with an explicit `budget` or `rowIds` renders every shown column in full (`fullColumns` = all); the existing over-budget ladder clips if it does not fit. Without either, the 120-char preview stays but the result appends `[cells clipped at 120 chars — name columns, or pass rowIds/budget, for full text]` whenever a cell was actually clipped.

### P9 Zero rows teach the column (F9)
- `data-tools.ts`: when a filtered read returns 0 rows, append one footer per filtered column: number/date → `Interest Level holds 6 … 9 across 29 rows (3 at the minimum)`; select/status/multiSelect → the option labels that have rows. Computed with `columnProfile` over one unfiltered `loadRowPage` (≤ 100 rows), only on the empty path.

### P10 Real titles in the closing references (F10)
- `registry.ts` `record_iteration_findings`: read the `ContentNode.title` of the quest ledger and the log note; fall back to the synthesized label only when the read fails. Same for the proposal's `nextAction` link.

### P11 Surface an unclosed prior sitting (F11)
- `quests.ts` `QuestInfo.openedAt?: string` (stamped at proposal). `registry.ts` propose: read the ledger's prior `questInfo`; if `sittingClosed !== true`, count its ledger rows (`Sitting` column = prior `sittingId`) and emit `quest.priorSitting: { openedAt, itemsRecorded, closed: false }` plus a ledger line "Previous sitting (opened <date>) recorded N items and never closed — superseded by this sitting."

### P12 Duplicate charter content collapses to one copy (F12)
- `charters/parse.ts`: after phase split, collapse consecutive phases whose title AND content hash match into one and set `ParsedCharter.duplicatePhasesCollapsed`. `chat/route.ts` charter context appends "**Note:** the charter note repeats identical content N times — one copy is used. Clean the note to stop paying for the copies." Logged once per request.
- Gate: fixture — a doc with 4 identical H1 sections parses to 1 phase with `duplicatePhasesCollapsed: 3`; two different phases with the same title stay 2.

### P13 Live continuations fold as requests (F13)
- `turn-diagnostics.ts` `mergeTurnUsageMetadata`: a blob carrying a raw `segment` is a live request even when `diagnosticsVersion` is present (the client's write-back put it there). Such a blob appends its segment and is priced from its own usage; `persistedCost*` is honoured only for stamped blobs WITHOUT a `segment` (reload seeding). Fixture: R1 → write-back → R2 deep-merged; expect 2 segments, cost = price(R1) + price(R2).

## 4. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Charter wiki-links grant reach; a mention is not required | The charter is the user's rubric; naming a database in it is the pointing. Same consent structure as master-ledger and relation-graph reach. |
| D2 | Capture never overwrites a same-sitting non-empty cell | Prefer the fuller first write; make the rule visible in the result. |
| D3 | `update_row` is not a deliverable when capture is on | One code path for one set of cells. |
| D4 | Chrome detection is a heuristic on line shape, not a site list | Site lists rot; the shape of a link list does not. Fixture-pinned. |
| D5 | The "all columns" read clips only when nothing tells us the caller wants it whole | Budget or rowIds is that signal. |
| D6 | Status regressions (Qualified → Research Queue) are not guarded | Charter wording, not harness. Out of scope. |

## 5. Gates

- `pnpm typecheck`, `pnpm lint`, `pnpm ai:drift:check` (gate 7 extended), `pnpm proposal:shape:check` (new fixtures: flat `capture`, deliverables stripped under capture).
- New pure fixtures: `scripts/validate-run-harness.ts` — charter duplicate collapse, chrome detection, capture partition, diagnostics fold, charter reference resolution order, capture normalization. Mutation-tested (each fixture broken once, then restored).

## 6. Production smoke (owner, post-deploy)

1. Re-run the SeatGeek item with the same message. Expect: Career Evidence Library readable without a mention; one row write; `Resumes` accepted as a string; closing message links "Run Ledger — …" by its real title.
2. Query with a filter that matches nothing → footer names the column's range.
3. `query_database` `columns: "all"` + `rowIds` → full cells.
4. Read a LinkedIn posting anonymously → result carries `contentNote`.
5. Open the *Apply for a job* charter chat → context says the note repeats 4× (until the note is cleaned).
6. Message metadata after a multi-request turn shows one segment per request.
