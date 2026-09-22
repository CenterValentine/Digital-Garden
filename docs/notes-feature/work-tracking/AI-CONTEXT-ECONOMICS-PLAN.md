---
title: AI Context Economics — fold across replies, dedupe, pay for a page once
status: built — PR A (#250, `feat/context-economics`) and PR B (`feat/payload-economics`, stacked) open 2026-09-18; production smoke pending on both
created: 2026-09-18
owner: David Valentine
evidence: prod conversation 4fbf8b57-3ad8-4379-bf15-c839d8fd0cbe ("Job Charter and Quest Ledger")
related:
  - ../guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md
  - AI-BULK-ROW-READING-PLAN.md
  - AI-TOOL-SUMMONER-PLAN.md
---

# AI Context Economics

**The problem in one line:** a 5-turn charter run re-sent 21.9M tokens and stored 2.03 MB of message parts, of which roughly **60% was recoverable waste** — bytes the model had already seen, or bytes whose only durable home is somewhere the model can re-read.

**The principle in one line:** the model pays for a page **once**. Everything after that is a pointer.

---

## 0. Evidence (measured, not estimated)

Read-only prod queries against `ConversationMessage.parts`. Sizes are stored JSON bytes; ÷4 ≈ tokens.

| Where the 2.03 MB went | Bytes | Share |
|---|---|---|
| `co_browse_act` outputs (65 calls; input avg **89 B**, output avg **13 kB**) | 848 kB | 42% |
| `reasoning` (127 parts — generated, **already stripped on resend** for non-Anthropic) | 481 kB | 24% |
| `insert_rows` **inputs** (8 calls, avg 25 kB of model-written prose) | 201 kB | 10% |
| `read_page_headless_or_browser` outputs | 162 kB | 8% |
| `record_item_result` inputs | 87 kB | 4% |
| everything else, incl. all `text` parts (**44 kB — 2%**) | ~250 kB | 12% |

The model's own words are 2% of what gets re-sent. **Tool parts are the input context.** Every transform below targets them because that is where the bytes are.

### The four defects

**D1 — The context fold turns itself off when a run ends.** `findIterationFoldBoundary` returns `runActive ? lastCheckpoint : null`. The run in this thread ended at part 399 with `record_iteration_findings` — the moment its raw perception became *most* disposable — and the fold went `null` for the rest of the conversation. **905 kB** of foldable perception in message 1 was re-sent at full size on every later request. This is the single cause of the 830k-token request.

**D2 — Browser snapshots re-describe unchanging page furniture.** 55 of 65 `co_browse_act` results were FULL snapshots. 100 elements present in 40+ of them were transmitted **5,372 times (417 kB)**; only 41 kB across all 55 was genuinely new. The delta path exists and is 3–10× smaller when it fires; it fired 10 times. Cause: `coBrowseSnapshotOrDelta` keyframes on `base.url !== url`, and on LinkedIn every job-card click changes `?currentJobId=`. A query-string change is treated as a new document.

**D3 — One turn's parts are stored in four messages.** Messages 4/5/6 are three attempts to *end* the same turn (each hit the step cap, wrote a status report, was continued). Each continuation `POST`ed a new row carrying the identical 32-part prefix. 144 kB of unique content is stored as 577 kB — and 25 of those parts are *also* in message 1. Pairwise, messages 1–4 share the same 25 parts.

**D4 — Page text passes through the model twice.** 153 kB of page content came *in* via reads; 201 kB of synthesised row content went *out* via `insert_rows` — output tokens, the expensive kind — and then rode along as input on every later step, even though the database is its durable home from the moment the write returns `ok`.

### The receipts confirm it (second pass, per-request `metadata.segments`)

Turn 1 was 40 requests. Input tokens per request, from the persisted usage:

```
req  1   85,829   ← climbs ~4.5k per request (one snapshot ≈ 3.3k tokens + a verdict)
req 26  169,443
req 27  340,248   record_batch_checkpoint (2 steps)
req 28   85,759   ← the existing fold FIRED: context halved at the checkpoint
req 36  112,734
req 40  377,317   record_iteration_findings — run over, fold boundary → null
turn 2  ~326,000 per step, and climbing from there
```

So the mechanism A1 extends is proven in production: a checkpoint cuts the working set from ~170k to ~86k. The cliff after `record_iteration_findings` (86k → 326k+) is D1, measured. The ~86k floor after a fold is what B1 is for — it is mostly the model's own written inputs (`record_item_result`, `insert_rows`) plus the tool prefix.

Cache: 88% of turn 1's 13M input tokens were prefix-cache hits, which is why DeepSeek billed $0.41 for it. On a vendor with a 10% cache-read discount rather than DeepSeek's, the same turn is roughly $8 on a Sonnet-class model — the "excessive on OpenAI/Claude" intuition is right, and the lever is the uncached 12% plus the window, not the cache.

**Side-finding — D3 also corrupts cost accounting.** Messages 4/5/6 carry byte-identical `metadata.usage` (2,651,844 input each). The turn's $0.147 is counted three times in the session estimate. Fixing the storage root cause (out of scope here) also fixes the receipts; until then the session total over-reports by every continuation.

### Corrections to the first-pass analysis (recorded so they aren't re-litigated)

- **"7× identical `Save the job` click" was not a loop.** All seven returned deltas (2.7–4.4 kB, one 29 kB where a panel expanded), no `actionError`, and the `nth` ambiguity refusal already exists in `actions.js:62`. The 172 kB figure was computed against the max output. Real cost ≈ 50 kB of legitimate actions. **Nothing to build.**
- **Reasoning is not where the money is.** Persisted usage metadata for the big turn: input $0.25 + cached input $0.08 vs **all output $0.07** (reasoning was 65k of 116k output tokens). For the DeepSeek-Pro turn: input $1.45 of $1.48. Input is 90–98% of cost. `mechanicalRun → reasoningEffort: "low"` is already wired to the iteration budget. **Nothing to build.**
- Dedup catches D3 + byte-identical snapshots ≈ **543 kB**, not the 715 kB first quoted.

---

## 1. PR A — `feat/context-economics` (off `main`)

**Goal:** the two provably-safe transforms. Neither can lose information the model hasn't already seen or distilled.

### A1. Fold on distillation and on turn — not on run state

Replace the single-point boundary with a **state map**, mirroring `bulkReadFoldStates` (one implementation, two consumers: model path + UI collapse).

```
perceptionFoldStates(messages) → Map<"msgIdx:partIdx", "folded" | "kept">
```

A perception part (`PERCEPTION_TOOL_PARTS`, `output-available`, ≥ 600 chars) is **folded** when either holds:

1. **Distillation rule.** It precedes the latest `record_batch_checkpoint` *or* `record_iteration_findings` anywhere in the transcript. A new `propose_item_iteration` never lowers this boundary (the old `lastCheckpoint = null` reset goes).
2. **Turn rule.** It sits in an assistant message before the latest user message — the same `turn` lifetime bulk reads already use (AI-BULK-ROW-READING §4.6a). A reply *is* a distillation.

Never folded: anything after the latest distillation point within the current turn (the current batch keeps full context — unchanged from today). The last message is *not* exempt as a whole — the existing fold already stubs parts before the boundary inside the live message; only parts not yet `output-available` are untouchable.

**Coverage gap closed:** `tool-read_content` and `tool-search_content` are in no fold set today (the evidence thread read the same charter node four times). They join the **turn rule** only — a note body is re-readable, but never the distillation rule, because a charter read is not "raw perception digested into a ledger".

`findIterationFoldBoundary` / `shouldSupersedePart` are replaced; `ChatViewer.tsx`, `ChatPanel.tsx`, `ChatMessage.tsx` consult the map. Owner rule kept: no divergence between what the UI collapses and what the model no longer sees.

**Reclaims in the evidence thread:** 905 kB.

### A2. `dedupeRepeatedToolParts` — content-addressed, first occurrence wins

Two duplicate shapes, two treatments:

| Shape | Detection | Treatment | Why safe |
|---|---|---|---|
| Same `toolCallId` seen earlier | id set | **drop the later part whole** (call + result together — the pairing-by-absence rule `compactToolOutputs` already uses) | it is literally the same call; duplicate ids are malformed history |
| Different `toolCallId`, identical `type` + `input` + `output` (≥ 600 chars) | hash | **stub the output** → `[identical to an earlier <tool> result — nothing changed]` | the exact bytes are earlier in context; the provider still gets a result for the call |

Excluded: `reasoning` (Anthropic signed thinking must be resent verbatim); `text`, `step-start`, `data-*`; any part not `output-available`. The last message is in scope for completed outputs — a repeat of the newest result is the *most* useful place for the stub, since "identical to before — nothing changed" is exactly what the model needs to hear after an action that did nothing.

Deterministic → the same history always folds the same way → prefix cache stays warm (unlike the checkpoint fold, this never shifts a boundary per turn).

**Reclaims:** ~543 kB (433 kB cross-message + 110 kB identical snapshots).

### A3. Gate — `pnpm context:diet:check`

`scripts/validate-context-diet.ts`, fixture transcripts, in the `build` chain and `ai-drift.yml`. Mutation-tested before it counts (break the boundary rule, break the id rule, confirm each fails).

### A4. Docs

- **Revise** `guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md` (not a new doc): add a **§1b Payload economics** principle group; flip the three §4 rows this thread is the evidence for (per-run compaction, no-progress guards, effort allocation); add a §4 row per transform with its measured reclaim.
- STATUS.md / BACKLOG.md.

---

## 2. PR B — `feat/payload-economics` (stacked on A)

**Goal:** stop the big payloads at the source.

### B1. Write inputs are superseded by their writes

Once a write tool returns `ok`, its input has a durable home. Behind the **same two boundaries as A1** (distillation point, or turn over), replace the `input` of `insert_rows`, `update_rows`, `update_row`, `update_note`, `record_item_result` with a one-line stub (`{ superseded: "3 rows written to \"Job Leads\" — query_database to re-read" }`); **keep the output** (row ids are referenced later).

`convertToModelMessages` forwards historical `input` verbatim with no schema validation (verified in `ai/dist/index.mjs`), and the route never calls `validateUIMessages` on incoming history (verified) — this is why stubbing inputs is safe where stripping *outputs* (smoke #5) was not.

Also superseded, **after `record_iteration_findings` only**: the `propose_item_iteration` input (the item list, 8.9 kB per proposal). During the run the model addresses items by it; once the findings record exists, the ledger holds them.

Not before the boundary: within the current batch the model may still refer to what it just wrote. A write whose output reports failure (`ok: false`, `error`) keeps its input — the model may need it to retry. The stub keeps the input's **addresses** (short scalars: ids, targets, statuses) and drops its **payload** (rows, cells, prose), so "what did I write where" survives without "what I wrote". **A fold must shrink** (owner question, 2026-09-18): because the stub keeps every short scalar, an input made of many short fields and no payload could come out longer than it went in — such inputs are left alone, and the gate asserts every folded part is strictly shorter after than before.

**No UI change for B1, deliberately.** The parity rule ("the default view equals the retained context") is about what is *collapsed*. A write tool's bubble already leads with its receipt — the output, which the model keeps — and shows the raw input only on expand; the model's stub keeps the same addresses the bubble's summary line shows. Nothing the model lost is on screen by default.

**Reclaims:** ~324 kB — and this is the pattern that would have cost most on Claude/OpenAI, because it is *generated* text being replayed.

### B2. Delta by default: a query string is not a new document

In `coBrowseSnapshotOrDelta`, compare page identity by **origin + pathname**, not the full URL. The existing churn ratio (`DELTA_MAX_CHANGED_RATIO = 0.6`) already keyframes when a page "effectively replaced itself" — let it decide. Keep `mode: "full"` on open / explicit `read` / failure.

Client-side (web app), so it ships with the deploy — **no extension rebuild**.

**Reclaims:** most of 417 kB. Expected: 55 full / 10 delta → ~10 full / 55 delta.

### B3. System-prompt line

One sentence telling the model that folded/superseded stubs are pointers, not losses, and that `read` / `query_database` re-materialise on demand. (The stubs already say this; the prompt should agree with them.)

---

## 3. Deliberately out of scope

- **D3's storage root cause.** Traced (2026-09-18): the client persister in `use-conversation-binding.ts` already `PATCH`es continuations — it keys on `savedIdsRef` / `dbIdByClientIdRef`, which are **refs, reset by a reload**. The three rows were written within 1.4 s of each other with byte-identical `usage` metadata and different final texts: after a mid-turn reload (the owner hit Stop + refresh in this thread), each continuation started a fresh assistant message (the SDK could no longer match `originalMessages` to a live id), and the next finish pass found three unsaved assistant messages and `POST`ed each with the whole accumulated prefix. A2 removes the *context* cost, which is the cost that matters. The storage fix is its own change (BACKLOG, "Continuations after a reload persist as new rows"):
  1. **Server-side, content-addressed** (safest): in `appendMessage`, when the conversation's latest row is an assistant with no user message after it and the incoming parts' leading `toolCallId` sequence equals that row's, **update that row** instead of inserting — the same first-occurrence rule as A2, applied at write time. Lives in `lib/features/conversations/service.ts`, not the stream path.
  2. **Client-side**: after a reload, carry the last assistant row's uuid into the continuation so the route's existing `isUuid` branch extends it — `originalMessages` then matches and no fresh id is minted. Touches the approval-resume path (smoke #4's `AI_UIMessageStreamError`), so it needs a resume smoke on prod.
  3. **Receipts**: the duplicate rows each carry the turn's full `usage`, so the session estimate counts the turn once per continuation; (1) fixes that as a side effect. An owner-run repair script for existing duplicates is optional — A2 already hides them from the model and the UI.
- **Compaction / summarisation** as a fallback. Sized *after* A+B land: a threshold tuned against a transcript that is 60% recoverable waste bakes the waste into the threshold.
- Reasoning effort, `nth` refusal — see corrections above; already in place.

---

## 4. Gates

- `pnpm typecheck` · `pnpm lint` (no new warnings) · `pnpm build`
- `pnpm context:diet:check` — new, mutation-tested
- `pnpm ai:drift:check` — prompt tool references still resolve after B3

**Smoke — on production, post-deploy** (AI-capability work never smokes locally):

- **Gate A1:** run a short charter with `co_browse` for ≥ 2 batches, finish it, then send one more message. The next request's `inputTokens` (persisted `metadata.usage`) must be < 30% of the run's final step, and the transcript UI must show the same parts collapsed.
- **Gate A2:** reload a conversation that hit the step cap and was continued; the collapsed chips show one copy of each earlier tool call.
- **Gate B1:** after a batch checkpoint, expand an earlier `insert_rows` chip in the UI — full cells still visible (persistence untouched) — while the next request's token count drops by roughly the input size.
- **Gate B2:** click through 10 job cards on LinkedIn; ≥ 8 of the 10 `co_browse_act` results arrive as `snapshotDelta: true`.

---

## 6. Round 3 (2026-09-22) — what the meter and the runs showed next

Two production runs after #253 deployed. No new plan doc: the designs below were settled in conversation and this section is their home.

### 6a. Run-UX affordances — PR `feat/run-ux-affordances` (built)

| Owner report | Cause | Fix |
|---|---|---|
| Meter click "isn't launching" | The live message carries `metadata.segment` (this request, from the finish part); `segments[]` exists only after the binding hook folds the turn — so the chain was empty until reload | `extractStepChain` reads the persisted list and the live record; the binding hook writes the folded metadata back into message state after each request |
| `[[Quest Ledger]]` shown literally | The model copies the run ledger's wiki-link style; chat rendered only `@[Title](id)` | `record_iteration_findings.next` hands the model both references in mention form with ids; the renderer treats `[[Title]]` as a title-resolving pill (search, exact title, database preferred) |
| Quest not attaching; pin opens the long log | `deriveActiveQuest` used `ledgerNodeId` (the log NOTE); the quest DATABASE id was never emitted or associated | `propose_item_iteration` emits `questLedgerNodeId` and auto-associates the database; the pin opens the database with a `log` affordance beside it |
| `@[file]` mentions paste as plain names | Copy takes a pill's `textContent`; nothing serialized the selection | Composer `copy`/`cut` serialize the selected fragment with the submit walker (`@[Title](id)`); message bubbles do the same via `data-mention` on their pills; paste already revives the form |
| "Is the resume write path intact?" | It is: `create_docx` → file node id → `update_row` into the Library's `Resumes` file column | No change |

### 6b. Held for one harness PR — reserve the deliverable tail (design settled, not built)

Evidence: conversation `5e5b739d` — a one-item *fulfilment* charter (research → resume → `create_docx` → `update_row` → `record_item_result` → findings) under the *screening* cap `items × 4 + 8` = 12 steps: 17 read calls, zero writes, `finalStepReserved` forced a report. Surface-independent (PWA vs extension changes nothing; every needed tool is server-side).

1. `propose_item_iteration.deliverables` — the write tools each item must end with; cap = `items × (researchAllowance + tail) + overhead`; `prepareStep` narrows `activeTools` to the deliverables when remaining steps equal the tail (the `finalStepReserved` mechanism generalised).
2. A remaining-steps line appended per step ("Steps: 5 of 12 remaining · 4 reserved for …"), at the end of the messages so the prefix cache stays warm.
3. Gaps are data: a fact not found after ONE evidence search becomes a placeholder in the artifact and `record_item_result.gaps[]`; never a second search.
4. A denied read approval returns as a result ("read denied; use a smaller budget / narrower columns") instead of ending the turn.
5. `merge` mode for cell writes (`update_row` / `update_rows` / `capture.cells`): union for list columns, delimiter-append with token dedupe for text — computed at commit, so alias-style columns accumulate across runs without a read step or a race.

## 5. Principles → AGENTIC-RESOURCE-DISCIPLINE §1b (draft text)

9. **Pay for a page once.** A perception result is paid for when it is first read; every later appearance must be a pointer. Fold on distillation (a checkpoint, a findings record, a reply) — never on run state.
10. **A tool with a >100× output/input ratio needs a compaction story before it ships.** `co_browse_act` is 89 B in, 13 kB out.
11. **Deltas by default, keyframes by exception.** An unchanged page must never cost a full snapshot. Page identity is origin + path; a query string is state, not a document.
12. **Dedupe before you discard.** Byte-identical content is the one thing that is always safe to collapse — the model already has it.
13. **A confirmed write supersedes its own input.** The database, note, or ledger is the durable home; the input was scaffolding.
