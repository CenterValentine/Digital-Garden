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

## 7. Second run (2026-09-28, after PR #261 deployed) — what held, what did not

Prod conversation `ecf1d0e5` (chat `3826d0c4`, *Exploring Low-Interest Job Opportunities*, `gpt-5.6-terra`, 07:25–07:29 UTC, three minutes after the merge; the server responses carry the new text, so the deploy was live).

**Held (P1–P13 visible in the transcript):** the Career Evidence Library was read by id in one call (P1 — the manifest now prints the id); `columns: "all"` + `rowIds` returned ~2.2k tokens of full cells instead of ~377 clipped (P8); the 403 on seatgeek.com/about was answered "NOT one of the run's items … search_web can find official sources" (P6); one row write through `capture.cells`, `Resumes` sent as a list, no `update_row` (P3/P5); the docx was overwritten in place (`overwritten: true`); the closing links carry the real titles (P10); the resume names doxy.me, quantified claims (250,000 duplicates, $100,000 monthly, 120,000 users) and its own gaps; one canonical gap row landed in the Experience Gaps Library with a relation to the opportunity; the status moved to Qualified (the previous run had pushed it back to Research Queue).

**Did not hold:**
- **F14 requestCount doubled** — 4 requests reported as 8 (segments 4, durations sum to `durationMs`). The live-continuation branch (P13) priced and appended correctly but still read `requestCount` from the inherited stamp: 1, 2, 4, 8. Fix: a live request counts as one. Fixture extended to three requests.
- **F15 the phase checkpoint counted only `search_web` and `read_page`** as research; the model's `read_page_headless_or_browser` attempt (the tool the `web` family hands it) was invisible, the checkpoint was rejected as "no research", and four steps went to garden searches and a summon that could never satisfy it. Fix: `RESEARCH_TOOLS` in `checkpoint-gate.ts` includes the browser reader and `open_tab_and_read`; the messages name it.
- **F16 a `search` miss taught nothing** (P9 covered filters only): `search: "ticketing"` on a one-row table returned a bare header and the next call re-read the table. Fix: the zero-row footer also fires for a search and names the table's size (and its rows when ≤ 3).
- **Model, not harness:** `search_web` was available (summon said so twice) and never called; the closing message then claimed the checkpoint "requires a successful search_web … and the available read was blocked", which was untrue. The opening `summon` pulled four whole families (23 tools) so every step carried their schemas: 702k input tokens and $1.22 for one item versus 344k and $0.05 on the first run (part of that is `gpt-5.6-terra` pricing). A summon result that priced its own cost per step would let the model see the trade.
- **Client stale after deploy:** the message's `data-charter` part still said `phaseCount: 4` (the page was loaded before the deploy; the server context collapsed the copies). The charter note itself still holds four copies.

## 8. What the second run cost, and why (2026-09-28)

The meter read **$1.22** for `ecf1d0e5`; the same usage at base rates is **$0.82**. The step log (`metadata.segments[].steps[]`, per-step `inputTokens`/`cachedInputTokens`) explains both numbers.

| Driver | Tokens | At base rates | Status |
|---|---|---|---|
| **F17 Long-context tier applied to a request's SUM.** `computeTurnCost` compared the nine-step request's summed prompt (369k) to terra's 272k threshold; no step exceeded 46k. | — | +$0.40 phantom | **Fixed:** `UsageLike.maxStepInputTokens` / `maxStepCachedInputTokens`; the fold and the ledger stamp pass the largest step; tiers are per call. Fixtures in `ai:pricing:check` and `run-harness:check`. |
| **F18 Cached prefix froze at 27,133 tokens** for eleven consecutive steps while the prompt grew 39k → 46k. Everything past that offset was re-sent uncached on every step. | ~203k uncached | $0.37 | **Diagnostic shipped** (`AI_PROMPT_PREFIX_DIAG=1` → `ai:prompt_prefix` log line naming the first divergent 2k-char chunk with excerpts of both sides, per step and across requests). Cause not yet identified from code: `store: false`, item references stripped, the notice is appended at the END, the fold runs once per request — none of these explain a fixed-offset break. One run with the flag on names it. |
| **F19 Every HTTP request started cold** (steps 1, 4, 6, 18: zero cached) although the 23k system+tools prefix had been sent 30–90 s earlier. | ~112k | $0.20 | Same diagnostic (it compares a request's first step against the previous request's last). |
| **F20 Four wasted steps** (rejected checkpoint → two garden searches → summon). | ~84k uncached | $0.13 | Three removed by #262 (checkpoint gate); the fourth is the model not calling an available `search_web`. |
| **F21 Four families summoned at once** — 23 schemas, ~10.3k tokens on every step. | ~185k (mostly cached) | $0.10 | **Reported:** the summon result now prices what it activated ("≈N tokens of schema now ride on EVERY remaining step; summon only the tools this run will call"). `estimateToolSchemaTokens` sizes description + JSON schema. |
| Reads retained for the run (evidence library 4.3k, row 2.2k, notes 2.5k, guidance 1.1k, describe 1k) | ~12k/step | cheap once cached | Nothing to do until F18 lands. |
| Output incl. 1,890 reasoning tokens | 5,947 | $0.07 | — |

**Projected, same model:** $0.82 → $0.69 (#262) → $0.36 (F18) → $0.19 (F19) → ~$0.15 (F21). A 2.5× pricier model after those lands near $0.45. The better "spend more" lever is reasoning effort: the route ran with no reasoning config, and the wasted steps were judgment failures; 20k reasoning tokens on terra is $0.24.

## 9. Turn budget for charter work (2026-09-29)

**Evidence.** Prod `62ac2b76` (*Reviewing Low-Interest Job Opportunity*, gpt-6-sol, charter attached, "only one job"): the prompt's "ONE item is NOT an iteration" rule made the model skip `propose_item_iteration`, so the turn ran under the 8-step chat cap with no reserved tail. Five bulk reads over the 6,000-token threshold each stopped the turn for an approval; each approval opened a new request with only the remainder (8 → 3 → 1, then 8 → 6 → 5 → 4 → 3 → 1); the last request of each turn was forced to text ("still unfinished, reply continue"). Five near-identical `site:clay.com` searches; turn 2 re-read what turn 1 had read because the evidence library's read was `turn`-lifetime. Fifteen steps, nine requests, six user replies, ~$0.80, no artifact. Prod `1fc59f46` and `f51fa2d8` are the same shape (8/8 on research; a one-step continuation losing a finished resume).

**Rules (P14–P18), all harness:**
- **P14 Charter turns are run-sized.** With a charter attached (picked, bound, or mentioned) and no proposal or research run, the cap is `computeIterationStepCap({ itemBudget: 1, deliverables: CHARTER_TURN_DELIVERABLES })` = 16, cap source `charter`, and the last six steps are reserved for the write tools (`create_docx`, `create_note`, `update_row`, `insert_rows`) plus `phase_checkpoint` and `summon`; the per-step notice names them. The proposal is scope and consent, not what unlocks the budget — one job asked for plainly gets what a proposed one-item run gets.
- **P15 Continuations keep a floor.** `continuationStepCap`: a request that follows earlier spend in the same turn opens with at least the tail + 1 (charter/item turns) or 3 (plain chat), never the bare remainder.
- **P16 A charter run's attachment covers its reads.** `query_database` bulk reads up to `CHARTER_RUN_READ_CEILING` (15,000 tokens) need no approval inside a charter turn; larger reads still ask.
- **P17 Charter-named tables read at `run` lifetime.** The evidence library the charter's Inputs list names is promoted to `run` like master-linked tables, so it is read once and carried across jobs and continuations.
- **P18 Identical searches are guarded.** `search_web` / `search_content` (app-run) with byte-identical input inside one request return a pointer to the first result. Only searches: a re-read after a write is legitimate. Provider-native search has no execute to wrap.

**What two jobs would and would not have fixed (owner question):** two items would have produced a proposal and therefore the run cap and tail (P14's effect). They would not have removed the read approvals (P16), the cap decay across approvals (P15), the cold cache per request, or the repeated searches (P18).

**Gate:** `run-harness:check` §9 (charter cap 16 / tail 6 / tail tools; floor cases incl. the 8 → 3 → 1 and 16 → 14 shapes; guard key order and notice) — three mutations caught. **Cost ceiling:** a charter turn's worst case goes from 8 to 16 steps, only with a charter attached.

## 10. What a $1.35 resume cost, and the levers (2026-09-29)

**Evidence.** Prod `de65f6bb` (conversation `ece3e497`), gpt-6-sol, *Apply for a job* attached, "only one job (low interest)" → Clay Partner Technical Engineer. #267 was live and held: cap source `charter`, one user message, no "continue" replies, docx delivered. 25 steps over 6 requests; 976k input tokens, 39% cached; **$1.349, and the meter is exact** (largest step 51k, base tier). $1.19 of it is uncached input, $0.08 cached input, $0.09 output. The ~96-minute approval gap before request 6 cost **$0.04** — the cache was already mostly cold, so expiry had little left to lose.

| Finding | Cost in this run | Lever |
|---|---|---|
| **F22 The cached prefix froze again** — 21,300 → 22,419 → 22,803 tokens across four requests while the prompt grew to 51k | ~$0.79 | L1 |
| **F23 Tool-list changes flushed the cache** — s5 (summon), s16 (summon `update_rows`), s23 (tail narrowing dropped ~11k of schemas): zero cached each time | ~$0.19 after L1 | L2 |
| **F24 A validation rejection that does not teach** — `insert_rows`: "6 cells rejected by validation: Unknown option for this column" ×5, no column, value or options; six steps of recovery (s14–s19) | $0.26 today, ~$0.05 after L1 | L3a |
| **F25 Summon says "already available" for a tool the tail hid** — `phase_checkpoint` | $0.06 today | L3b |
| **F26 Two zero-row Claims queries; "Name" for "Gap Name"** — the existing teaching worked on the next step | $0.06 | none |
| **F27 Provider-native web search on 10 of 25 steps** (11 calls, near-duplicate `site:clay.com` queries) | per-call fees unmetered | L4 |

**F22 — what is new.** The frozen value moves only when tool schemas are added (+1,119 after summoning three tools priced at ≈1,273; +384 after `update_rows` priced at ≈584). It never moves as history grows, even across requests. In both measured runs it sits just past the end of request 1, at the `propose_item_iteration` approval boundary:

- `ecf1d0e5`: s3's input was 25,498. Adding the propose call and its result gives ≈27.1k, and the frozen value was 27,133.
  - Caching was normal inside request 1 (24,069 of 24,137) and request 2 (30,295 of 30,363).
  - The freeze began in request 3.
- `de65f6bb`: request 1 ends at ≈21k, and the frozen value was 21,300.

`prepareStep` does not rewrite history. It spreads `stepMessages` and appends the notice (route `prepareStep`, the tail branch). **Working hypothesis, unconfirmed:** the approved call's representation in the provider request changes between model calls. Candidates are the approval request/response pair and where the result executed at the start of a request is placed.

**The diagnostic has a blind spot.** `prompt-prefix-diag.ts` fingerprints the SDK message array, not the HTTP body. A divergence introduced in `@ai-sdk/openai`'s conversion would log "stable — grew or unchanged" while the cache still froze. Candidates for that are approval parts, reasoning items, and `web_search_call` items.

### L1 — name the break (one flagged run)

- **L1a — the wire tap (BUILT, `feat/run-cache-levers`).**
  - When the flag is on, every OpenAI provider in `providers/registry.ts` gets a `fetch` wrapper (`prompt-wire-tap.ts`).
  - The wrapper fingerprints the outgoing body in provider order: `prompt_cache_key` → model → tools → instructions → each `input[]` item.
  - It logs `ai:prompt_wire` naming the first part that stopped extending the previous call of the same conversation. For an input item it gives the index and kind (`function_call_output`, `reasoning`, `message:user`, …), with excerpts of both sides at the first differing character.
  - A replaced trailing item (the per-step notice) is not a divergence.
  - The pure helpers `fingerprintWireBody` and `findWireDivergence` are pinned by `run-harness:check` §10. Two mutations were caught: dropping the trailing-notice rule, and dropping the cache-key check.
  - **Second suspect, for F19's cold request starts:** `buildPromptCachePolicy` derives `prompt_cache_key` from the *advertised* tool set and a digest of the charter context. Either can change between requests, which reroutes the call to a cold cache. The tap reports a changed key as `part: cacheKey` before anything else.
- **The run (owner), in order:**
  1. Merge the PR carrying L1a and let Vercel deploy it.
  2. In Vercel → Settings → Environment Variables, add `AI_PROMPT_PREFIX_DIAG` = `1` for Production, then redeploy. An env change reaches new deployments only.
  3. Start a NEW chat on gpt-6-sol with *Apply for a job* attached, and ask for one *different* low-interest job, so the Clay artifacts are not duplicated. Approve the proposal and let it run to the end; answer any approval promptly (a long gap adds noise, not signal). This shape covers what is needed:
     - a proposal approval (the suspected boundary);
     - three or more steps after it inside one request;
     - a browser read (a request boundary).
  4. In Vercel → Logs, filter `ai:prompt_wire` (and `ai:prompt_prefix`) for the run's time window and export the lines, or paste them into the chat. Runtime logs are kept only briefly, so do this the same day.
  5. Remove the variable and redeploy.
- **Caveat:** both diagnostics keep their state in instance memory. Within-request comparisons are reliable; cross-request ones appear when Fluid Compute reuses the instance, which it usually does.
- **Expected:** the run names the element; the fix follows from it. This run would have cost $1.35 → ~$0.56.

### L1 result (2026-09-30, prod `e5b899a2`, gpt-6-sol, probe on)

The owner ran one job (Coinme Technical Solutions Engineer) with `AI_PROMPT_PREFIX_DIAG=1`: two turns, five requests, 31 steps, $0.67 + $0.69. The 53 probe lines and the per-step cache numbers, side by side:

- **Inside a request the body only grows.** `ai:prompt_wire` said "stable — previous body plus appended items" on every in-request step. Yet the cached count froze: 18,020 through prompts of 20k–41k (turn 1, request 1), 11,092 through 27k (request 2), 14,861 through 39k (turn 2). In every request, and in all three measured runs, **the hit ends at the first tool call**.
- **Cause: the reasoning items were missing.** OpenAI's reasoning models put a reasoning item before each tool call. With `store: false` (the #193 fix) the documented contract is to send those items back as `encrypted_content`. We did not: `stripReasoningForResend` dropped every reasoning part between requests, and inside a request `@ai-sdk/openai` sent them id-only because it does not know gpt-6 as a reasoning family (`isReasoningModel` covers o-series and gpt-5), so it never requested `reasoning.encrypted_content`. `ecf1d0e5` (gpt-5.6, a known family) cached normally inside requests 1 and 2 and froze from request 3 at request 1's first call — the point from which its stripped reasoning began. Both runs obey the same rule.
- **Two request-boundary breaks.** (a) `input[0] message:system` changed between requests 1 and 2: the checkpoint paragraph is gated on `phase_checkpoint` being advertised, and the model's step-1 summon reached the next request through `activationsFromHistory`. A changed system prompt is a cold request. (b) `input[36] function_call`: the in-request item carried `"id":"fc_…"`, the transcript's copy did not — the same call spelled two ways, so a new request diverged at the previous request's first call.
- **Not the cache key.** No `cacheKey` divergence was logged; the key held across requests.

**Fix (branch `feat/openai-reasoning-cache`):**
- `openaiModelReasons()` (`model-constraints.ts`): o-series, gpt-5 (not -chat), gpt-6, codex-mini. The route passes `forceReasoning: true` for them, which makes the adapter request `reasoning.encrypted_content` under `store: false`, use the `developer` role, and drop `temperature`.
- `stripReasoningForResend` keeps OpenAI reasoning parts that carry `reasoningEncryptedContent` (drops the rest, as before; other vendors unchanged).
- `stripOpenAIItemIdsFromModelMessages` runs in `prepareStep` for OpenAI: text and tool-call parts lose `openai.itemId` inside the request too; reasoning keeps its id (the adapter groups summary parts by it and sends it beside the blob).
- System-prompt flags read `isOffered` (base policy + charter binding), never a summon; a bound charter adds `phase_checkpoint` to the turn's tools on every request.
- Gate: `context:diet:check` G8 (three pure rules + route wiring); four mutations caught.

**Expected on the next run:** cached tokens climb with the prompt inside a request; the first step of a continuation request starts near the previous request's last prompt. The projection in this section ($1.35 → ~$0.56) applies from here.

### Round 2 (2026-09-30, branch `feat/one-prompt-per-turn`) — built

- **L2 built as the principle "one prompt per turn"** (AI-ARCHITECTURE §8).
  - A bound charter advertises `CHARTER_TURN_TOOLS` from its first request: the evidence reads, the one-item run loop, the deliverables, `update_rows`, `update_note`, the browser reader and the checkpoint.
  - System-prompt flags read `isOffered`, which covers the same set.
  - The reserved tail no longer narrows `activeTools`. A server-run tool called there gets `tailRefusalNotice` and does not run (`ai:tail_refused` log).
  - **Known limit:** provider-executed tools (OpenAI's own web search) and browser-executed tools (the page readers) have no server execute, so they cannot be refused. The steps notice names the tail tools for those. The trade: hiding cost a cache flush on every run; an ignored notice costs one step, only when the model strays.
- **L3a built.**
  - `unknownOptionError` names the column, the rejected value, up to 12 choices (then "+N more") and a single unambiguous near match.
  - `summarizeRejections` groups identical rejections with a count, in both `insert_rows` and `update_rows`.
  - The grid shows the same clearer message.
- **L3b superseded by L2:** nothing is hidden in the tail any more, so summon's "already available" is true again.
- **L4a built.**
  - Each step records `providerTools`, the calls the provider executed. Native and app-run search share the name `search_web`, so this is what tells them apart.
  - The fold prices provider-run searches per call via `webSearchCallUsd`. OpenAI's rate, verified 2026-09-30: $0.01 per call for reasoning models, $0.025 for others. Search content is already in the input tokens. Other vendors are unverified and priced at 0.
- **L4b dropped.** Hiding native search after N calls would break "one prompt per turn", and OpenAI's `web_search` tool has no per-turn cap. Anthropic's is created with `maxUses: 5`. Now that the calls are visible, the open question (D8, revised): should charter turns on OpenAI use the app-run search backend instead of native search? The app-run backend is refusable, repeat-guarded and budgetable, but gives up OpenAI's integrated citations.
- **Gates:**
  - `run-harness:check` §10: rejection text; grouping; charter tool set; tail refusal; provider-run search pricing.
  - `context:diet:check` G5: the tail is enforced through `tailGate` and never by narrowing. G8: charter tools from the first request.
  - Five mutations caught.

### Round 3 (2026-09-30, prod `e9ca56f2` → branch `fix/docx-cache-volley`)

**Run:** gpt-6-sol, one job (Coinme), one turn with docx, note, row and checkpoint, $0.64. That's $0.07 of it for 7 native searches, now metered, versus $1.36 over two turns for the same job before.
- No summons.
- Every request's first step was warm (22.5k cached; it was 0 before).
- Encrypted reasoning saved and resent (20/20 parts).
- **Still broken:** the in-request cache froze at 22,565, the end of the user's first message. Suspect: the steps notice appended as a trailing user message on every step. ecf1d0e5's requests without the notice cached normally; every run with it froze.

**Built:**
- **The budget rides the result.** `withBudgetNotice` appends the next step's budget line to the step's first server tool result (string → appended; plain object → `harnessNotice`). There is no trailing message except on the final forced-answer step. The prompt only grows.
- **DOCX links are hyperlinks.** The converter writes `link` marks as `ExternalHyperlink` with their target. The URL used to be dropped entirely.
- **The DOCX check reads the file.** The stored text of an AI-created DOCX is extracted from the generated bytes (`mammoth.convertToHtml` → `docxHtmlToCheckText`: breaks kept, `label [→ url]`, bullets marked). It is no longer the source markdown's tree, which showed breaks as spaces and hid missing URLs. mammoth's raw-text mode was rejected because it drops line breaks outright. `read_content` therefore shows the model what a parser reads.
- **Unreported cache writes are priced.** OpenAI GPT-5.6+ bills cache writes at 1.25× input, and the SDK reports none. On rows with a write rate, uncached input is billed as written. The meter had under-reported these models by up to a quarter of uncached input.
- **gpt-6 gets a `prompt_cache_key`.** `supportsOpenAIPromptCaching` had stopped at gpt-5.
- **Anthropic caching on.** A moving breakpoint on every step (`withAnthropicCacheBreakpoint`), reversing the 3.2.2 policy. Claude was never cached before.
- **Cache volley (owner-requested).**
  - While an approval is pending, the engine sends ONE `warmOnly` request at (cache lifetime − 1 min), timed from when the approval first appeared.
  - Scope: Anthropic (5 min) and pre-5.6 OpenAI (5–10 min). None for GPT-5.6+ (30 min) or providers without a controllable cache.
  - The route cuts the transcript at the approval step's `step-start`, builds the prompt through its normal path (one hoisted system prompt), and calls the model once with a 16-token ceiling and tools that have no execute. Nothing is persisted; the call is logged as `ai:cache_volley` with its cost.
  - Anthropic models with extended thinking are skipped: a one-token reply is below the thinking budget, and changing the thinking settings would itself invalidate the cache.

**Recommended charter text (owner's note, not code):** after `create_docx`, call `read_content` on the new document and check its "Extracted text":
- contact items on their own lines, with URLs visible (`label [→ url]` means the URL is not visible text);
- role headers as `Employer | Title | Dates`;
- one page is at most about 550 words, at most 4 bullets per role, each bullet at most about 200 characters;
- rewrite with `overwriteContentId` if anything fails.

The visual review is the owner's handoff, not a gap.

**Gates:**
- `run-harness:check`: budget on results; volley lifetimes, delays, key and trim; DOCX check text; a real DOCX with a hyperlink and a break.
- `context:diet:check` G5 (no trailing notice) and G8 (breakpoint per step and on the volley; volley trim; one system prompt).
- `prompt-cache:check` (gpt-6 key; breakpoint marks the last message only).
- `ai:pricing:check` (write-rate fixtures; the no-write-rate model stays at 1×).
- Matrix regenerated; the generator now probes Anthropic breakpoints.
- Six mutations caught.

### Round 4 (2026-09-30, prod `36237eb8` → branch `feat/search-choice-and-tail-check`)

**Run (after #272):** gpt-6-sol, LeanData, one turn, $0.61 on the corrected meter (about $0.53 on the old one).
- **Cache fixed:** 85% of input served from cache, up from 58%. Cached tokens climb every step (22.7k → 52.6k).
- **Budget line:** carried on 11 tool results.
- **DOCX links:** real hyperlinks, shown in the stored text as `label [→ url]`.
- **The 6-minute approval wait stayed warm.** That's gpt-6's 30-minute lifetime, so no volley was needed.
- **Web search is now the largest thing we can still control:** 12 calls, $0.12, 20% of the bill.
- **Leftovers:**
  - The model still said it "could not … test its text extraction". The charter doesn't say so yet, and the tail refused `read_content`.
  - `insert_rows` refused a dedupe key without naming the columns (one guessed retry).
  - One request started at the first-message prefix (22.7k) rather than about 39k. Requests 1 and 3 matched, so it's an isolated miss.

**Built:**
- **`read_content` is a tail tool** (`TAIL_VERIFY`): checking a deliverable is part of producing it. The in-tail notice now names it.
- **A dedupe-key miss names the columns** and says nothing was inserted.
- **Per-chat web-search choice** (owner decision D8 → default stays the model's own search). "Chat controls" gains a "Web search" row: *OpenAI* (or Claude, Google, Grok) versus *your search service*.
  - It shows only when the chat's model has its own search (`nativeSearchLabel`).
  - The service option is disabled, with a hint, when the user has no search connection.
  - Stored per chat (`use-chat-search-backend.ts`, conversation key then content key) and carried on every request body.
  - The route honours `searchBackend: "app"` only when a connection exists, and attaches the app-run tool under the same `search_web` name, so it is repeat-guarded, refusable in the tail, and priced by that service.
- **The Chat controls panel opens at its button.** Placement assumed the 420px maximum height, so the panel opened about 200px above its trigger. It now uses `anchorMenuAbove`: bottom edge pinned above the trigger, growing upward.

**The prompt-prefix diagnostic (owner question): keep the code, turn the variable off.** With `AI_PROMPT_PREFIX_DIAG` unset it costs one env read per step. It is the only tool that sees the request OpenAI actually receives, and it found this arc's two causes. The standard alternative is AI SDK telemetry (`experimental_telemetry`, OpenTelemetry spans). That records whole prompts per call, but it doesn't compute where two prompts diverge, and it adds tracing infrastructure and prompt-privacy exposure. The better upgrade is a per-conversation owner toggle that writes the divergence summary into the turn's own metadata, so a run is diagnosable from the database instead of a Vercel log export. It's backlogged, not built.

**OpenAI's cheaper search (owner question):** the pricing page (2026-09-30) lists three options.
- The `web_search` tool: $10 / 1k calls, with retrieved content billed as input at the model's rate. That's what we use.
- Web search preview on non-reasoning models: $25 / 1k calls, content free.
- A dedicated `gpt-5-search-api` model: $1.25 / $0.125 / $10 per 1M, with no per-call fee listed.

For gpt-6-sol, every search's retrieved content is billed at $2–2.50 / 1M and then re-read, cached, on every later step. Handing search to a cheaper model that returns a short summary could cost less in total. That's a delegation design, untested; backlogged.

**OpenAI as a search service (owner-requested, same round):**
- New backend `acquisition/search/openai.ts` delegates `search_web` to `gpt-5-search-api`, a Chat Completions search model: `web_search_options: { search_context_size: "low" }`, returning `url_citation` annotations.
- The tool returns the model's cited answer (`untrustedAnswer`), one result per cited URL with its supporting sentence, and `searchCostUsd` from the call's token usage at $1.25 / $10 per 1M. The search's cost is therefore visible in the transcript for the delegation trial, although the chat meter doesn't fold it in.
- **Saved-key reuse:** a search connection can store a pointer to the user's OpenAI AI connection instead of a copy of its key (`SearchKeyPayload.source = "ai-connection"`). The resolver reads that key at call time, so rotating the key in one place covers both. A removed connection is an honest error.
- **Settings:** when an OpenAI AI connection exists (the lab's own endpoint, not an openai-compat one) and there's no OpenAI search yet, the Web Search card opens on "OpenAI — gpt-5-search-api" with "Use your saved OpenAI key" selected. "Use a different key" shows the key field. Rows read "OpenAI · gpt-5-search-api · key from your AI connection".
- **Chat controls** names a search-model service by its model id (`gpt-5-search-api`), so it never reads as a second "OpenAI" beside the model's own search.
- No migration (`provider` is a free-form string).

**Gates:** `run-harness:check` round 4 (`read_content` in both tail shapes; search label only for native-search models; route honours the preference only with a connection, before the native branch; `searchBackend` on all 8 body and dependency sites). `proposal:shape:check` tail-notice fixture updated. Four mutations caught.

### Round 5 (2026-09-30) — resume quality: the profile, facts of record, finished documents

**Evidence:** the LeanData resumes from Sol (in-app) and Astra, reviewed against the posting and the evidence tables.
- Astra's is clearly stronger: outcome-first bullets; the 74%→85% satisfaction metric; QA and acceptance-criteria evidence; specific integrations; clean typography.
- Both got the job titles wrong. Sol merged Tier III Support through 2023 and dropped Customer Success Automation Engineer; Astra invented "CS Operations Analyst". The evidence stores one combined title string for 2020–2025, and the charter says "stated employment history" without stating it.
- Sol's run read the evidence index, about a third of Experiences, and **none of Claims and metrics**, where the satisfaction metric lives.
- Sol's DOCX used Word's built-in theme: blue headings, default spacing.

**Built (PR #273):**
- **`Ingest in full: [[…]]`**, a line-start charter directive (`extractIngestReferences`). The named databases, every row and column, plus their forward-linked tables (no backlinks), are appended to the charter context by `buildCharterIngest` (`charters/ingest.ts`), before the prompt-cache key.
  - It's part of the system prompt, the same on every request of a turn and cached after the first step.
  - Ceiling: 60k tokens, with an explicit "not above; read with query_database" note if the ceiling cuts a table.
  - Estimated ~30–35k tokens for the Career Evidence Library with Experiences, Claims and metrics, and Sources.
- **Two general system-prompt rules:**
  - *Reading before concluding*: a partial read is not an absence.
  - *Facts of record*: names, titles, employers, dates, credentials and figures are copied exactly, never merged, renamed, re-dated or inferred.
- **Charter gate check (system prompt):** before the closing summary, check each deliverable against the charter's gates, reading documents back first, and report each gate as met, not met or unchecked.
- **DOCX defaults:** one font family (Calibri), black headings, US Letter. AI-written documents use the compact layout: 10.5 pt, 0.6 in margins. Exports keep 11 pt and 1 in.
- **Gates:** `run-harness:check` round 5 (directive parsing; DOCX styles and margins; route wiring; prompt rules). Five mutations caught.

**Charter (owner's note, text drafted in chat):**
- The employment history of record, confirmed 2026-09-30.
- `Ingest in full: [[Career Evidence Library]]`.
- A hiring-thesis standard: why now; the employer's customer; the failure surface; ranked behaviours tagged Stated or Inferred; the screen-out risk; the candidate bridge; research → decision.
- A bullet standard, the decisive-gap strategy, the DOCX check, and the duplicated paragraphs removed.

### Round 6 (2026-09-30) — approvals: lift the formalities, keep the decisions

**Evidence.** Every approval request in four days (25 of them) was approved; none was denied.
- The last three charter runs (e5b899a2, e9ca56f2, 36237eb8) each paused three times: `create_docx`, `create_note` and `phase_checkpoint`.
- The two creates are hard-coded approvals. The charter's Required outputs already ask for both documents.
- On a one-phase charter the checkpoint is the gate right before the closing summary.
- Earlier runs also paused on `propose_item_iteration` (the scope of a multi-item run) and, before #267, on bulk evidence reads.

**Built (PR #273):** the user setting `ai.charterAutoApprove` ("Approve charter deliverables automatically", AI settings, off by default). The policy is `charters/auto-approve.ts` (pure): in a charter chat with the setting on, these no longer ask:
- creating a document or note;
- overwriting a document **this chat created**: associated with the conversation and created after it began, so a mentioned file of the user's still asks;
- the **final** phase's checkpoint, which returns `AUTO_CLOSED_CHECKPOINT_NEXT` rather than "APPROVED", because nobody clicked;
- bulk database reads (the model's ceiling still refuses an oversized read).

**Kept deliberately:** intermediate checkpoints, which are real review points since the next phase loads on the next turn, and run proposals, which carry the scope and item budget. `update_note`'s destructive-rewrite guard is unchanged.

**Round 6b (owner, same day):**
- **Both approval settings are in Chat controls:** *Auto-approve charter* (switch) and *Ask before reads over* (tokens). They're written through the same settings store as Settings → AI, so the two surfaces never disagree.
- **The read-approval default is now 25k (was 6k).** A whole evidence table or a job row with its description runs 9–12k, so every useful read paused the turn.
- **A stored 6,000 counts as the old default**, not a choice (`effectiveBulkReadThreshold`). Whole-snapshot saves had persisted it; production's only account held exactly 6000. This follows the stored-4096 maxTokens precedent.
- Pinned-read allowance stays 2× the threshold, now 50k.

**Round 6c (owner, same day) — per-tool approvals replace the charter switch:**
- The owner's two questions, "why approve creating what I asked for?" and "does a single-phase checkpoint need the checkpoint?", led to per-tool toggles in `ai.toolConfig[id].autoApprove`. They're shown in Chat controls and Settings → AI through one hook (`use-tool-approvals.ts`), apply in every chat, and use the policy in `tools/approval-policy.ts`:
  - `create_docx`: a new document skips the card; an overwrite skips it only for a document this chat created.
  - `create_note`: a new note skips the card.
  - `phase_checkpoint`: only the **final** phase's pause is lifted. The call still writes the Run Ledger and runs the integrity gate.
- `ai.charterAutoApprove` is gone (never shipped). Bulk reads are governed by the threshold alone.
- The toggles write an **explicit** true/false. The settings PATCH deep-merges, so a deleted key could never switch off (the trap the tool table's `enabled` hit on 2026-08-28).
- The tool table's "all defaults" pruning now counts `autoApprove`, so editing a tool there no longer drops the setting.

**Gate:** `run-harness:check` round 6 (policy table; the wiring of each predicate; proposal always asks; route passes the setting and marks the final phase on both charter paths). Four mutations caught.

### L2 — keep the tool list constant for the turn

Adding or removing a tool rewrites everything after the tool definitions, so every mid-turn change is a full cache flush. Today it costs 5–9¢ a time; after L1 it costs the whole prompt.

- **L2a — enforce the tail at execute, not by hiding tools.**
  - `activeTools` stays the same through the reserved tail.
  - A non-tail tool called in the tail returns a teaching refusal that names the tail tools and the steps left, which fits "schemas describe shape; execute judges".
  - Trade: a refused call costs one step (~1.5¢ once cached); hiding costs a flush.
- **L2b — a charter turn advertises its run tools from step 1.**
  - That means the tools the charter's phases name plus the run-loop set: `record_*`, `update_rows` and `read_page_headless_or_browser`. No mid-turn summon is needed.
  - With a warm cache, 10k tokens of stable schema cost ~0.2¢ a step. The summon economics (§8 F21) invert once L1 lands: stable and large beats small and changing.
- L2a also removes F25's cause.
- **Projected:** $0.56 → ~$0.37.

### L3 — two teaching fixes

- **L3a — validation rejections name what went wrong.**
  - `cells.ts` `encodeOptionId`/`encodeOptionIds` fail with a bare "Unknown option for this column". `data-tools.ts` then joins the first five of six.
  - Each rejection should name the column, the rejected value and the allowed option labels (capped at about 12), plus a case-insensitive near-match when one exists.
  - The failed-cells footer should group rejections by column and row.
  - This run's six-step recovery would have been one `update_rows` call.
- **L3b — the tail extra applies whenever a charter is bound.**
  - `CHARTER_TAIL_EXTRA` (`phase_checkpoint`) is added only for charter *turns* (route: `extra: charterTurn ? …`). An item run under a charter therefore hid `phase_checkpoint` in the tail.
  - Summon's `isAdvertised` check does not know about tail narrowing, so it answered "Already available … call them directly", and the model could not.
  - Superseded by L2a if that lands. Otherwise, apply the extra for any bound charter and make summon consult the step's narrowed list.

### L4 — provider-native search

OpenAI ran the built-in `web_search` 11 times, on 10 of 25 steps: five variants of "data enrichment waterfall" and two identical "careers partner technical engineer" queries. P18's repeat guard cannot see these: the provider executes them, so there is no execute to wrap.

- **L4a — meter:** count the turn's `web_search_call` parts and price them per call in `pricing.ts`. Today the meter omits them. OpenAI prices search per call; confirm the gpt-6 rate on developers.openai.com/api/docs/pricing before adding the row.
- **L4b — a turn budget for native search:** after N native searches in a charter turn (proposed N = 4), stop advertising the provider search tool, as one deliberate list change, and say so in the step notice.

### Decisions needed

- **D7 (L2b vs the summon design):** should a charter turn's tool list be fixed at step 1? Recommended **yes, once L1 has landed**; before that the cache is broken anyway and a larger list costs full price.
- **D8 (L4b):** is the native-search budget per turn, and N = 4? Recommended yes.

**Projection, same model:** $1.35 → ~$0.56 (L1) → ~$0.37 (L2) → ~$0.33 (L3), plus the true search fees (L4a) made visible.

**Gates when built:**
- `run-harness:check`:
  - a tail refusal fixture: tool list constant, refusal names the tail tools;
  - the tail extra applies under a bound charter.
- A cells fixture: the rejection names the column, value and options.
- `ai:pricing:check`: a search-fee fixture.
- The wire tap stays opt-in: `process.env` gated, no body logging by default.
