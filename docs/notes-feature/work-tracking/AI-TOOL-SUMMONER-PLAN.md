---
last_updated: 2026-09-17
status: planned — build starting (P0)
branch: feat/ai-tool-summoner (worktree .claude/worktrees/ai-tool-summoner, from origin/main after PR #242)
---

# AI Tool Summoner — a menu of tools, instructions on demand

Replaces the per-run tool **diet** (a hardcoded allowlist that deletes 39 of 65 tools
for the duration of an iteration run) with a three-tier model: a small always-on
**core**, a one-line **menu** of everything else, and **summoned** operating
instructions that arrive only when a tool is actually selected.

The diet traded capability for window. The summoner buys the window back *without*
the trade: measured below, a plain chat drops from 31.1k to 4.9k tokens of tool
schema while every one of the 65 tools stays reachable.

---

## 1. What went wrong, and what it revealed

Traced end-to-end through the production transcript of conversation
`c7193e14-bfc3-428b-b96e-5a71be1c3377` ("Job Description Batch Processing",
2026-09-17, charter *Career Hunt II*, 5 items).

### 1.1 The reported failure

Mid-run, the model called `query_database` and received:

```
Model tried to call unavailable tool 'query_database'. Available tools:
propose_item_iteration, record_item_result, record_batch_checkpoint,
add_quest_ledger_column, record_iteration_findings, phase_checkpoint,
search_content, read_folder_context, getCurrentNote, createNote, updateNote,
renameNote, notify_user, read_first_chunk, read_next_chunk, ...
```

Cause: the context diet at `app/api/ai/chat/route.ts:1433-1455`. Once
`itemIterationBudget != null` (an approved `propose_item_iteration`, not yet closed
by `record_iteration_findings`), every id absent from the `ITERATION_RUN_TOOLS` set is
`delete`d from the tools object. No database tool is in that set.

Three aggravating properties, all verified:

- **The model had not misremembered.** `query_database "Job Opportunities Library"`
  appears earlier in the same transcript, successful. It reached for a tool its own
  history showed working, with valid arguments.
- **The withdrawal is silent and unrecoverable within the request.** The step cap for
  an item run is `itemIterationBudget * 4 + 8` (`route.ts:2376`), so this was *one
  HTTP request of up to 48 model steps* with the tool set fixed at step 0.
- **It persists across turns.** `itemIterationBudget` is re-derived each turn from
  history, with a fallback that reads the run ledger's `questInfo` while
  `!quest.sittingClosed` (`route.ts:1233`). A sitting that never closes keeps the
  whole conversation dieted.

### 1.2 The deeper cause — the generalist read refuses a first-class content type

After the failure the model fell back correctly: `search_content` → `getCurrentNote`
on "Career Evidence Library". It got:

```
Content "Career Evidence Library" is a data, not readable as text.
```

`lib/domain/ai/tools/registry.ts:2401-2404` refuses any content type other than
`note` and `folder`. Meanwhile the machinery to render a `data` node as text already
exists and is used by the database tools — `buildDataSchemaDigest()` for the schema
capsule, `formatRows()` + `indexTierColumns()` for the index tier.

**This is the more important finding.** The run did not fail because a specialist tool
was withdrawn; it failed because the *generalist* tool refused a content type the
product fully supports. Owner's framing (2026-09-17): every content type is a note
technically, and a read should be compatible even when the content is not directly
accessible.

### 1.3 A second, costlier failure in the same run

Item 4 (Nscale, scored 91/100 — the best match in the batch) was lost entirely:

```
Invalid input for tool record_item_result: Type validation failed:
Value: {"capture":{"cells":{...}},"questCells":{...}}
Error: [{ "code": "invalid_value", "values": ["done","unreadable","blocked"],
          "path": ["status"], "message": "Invalid option" }]
```

The payload shape was *correct* — `capture.cells` and `questCells` are real fields
(`registry.ts:1167-1181`). Only the required `status` enum was missing, and strict
validation rejected the whole call before `execute`. The ledger line, the capture row
and nine quest cells vanished; the model moved to item 5 and never retried.

This contradicts the doctrine already recorded one file over, in
`lib/domain/ai/tools/data-tools.ts:723-727`: *"Deliberately LENIENT schema … a strict
shape fails the whole call before execute with an opaque validation error the model
can't learn from."* `record_item_result` never received that treatment.

---

## 2. Measured baseline

Measured 2026-09-17 by serializing every tool to what the provider actually receives
(`{name, description, input_schema}`, Zod → JSON Schema draft-7), inside Next so the
module resolution matches the real route. Tokens are `chars/4`, the estimator used in
`context-diet.ts:316` and `run-inspector/anomalies.ts:20`. JSON-Schema text tokenizes
denser than prose, so absolute values are conservative by roughly 10-20%; ratios hold.

Measured against `feat/relational-reach-for-ai` (main + the unmerged PR #231 work),
which carries `update_rows` (546 tokens) not yet in `main`. This branch is based on
`origin/main`, so its baseline is 546 lower; every ratio below is unaffected. That
branch touches only `data-tools.ts` / `data-metadata.ts` — no overlap with the
`route.ts` and `registry.ts` work in P0-P2 and P4; P3's `selectWhen` additions to
`data-metadata.ts` are per-key and rebase trivially.

| set | tools | tokens | share of a 128k window, **per step** |
|---|---:|---:|---:|
| Full prefix | 65 | 31,149 | 24% |
| Dieted (today, during a run) | 26 | 9,397 | 7% |
| Core only (proposed) | 14 | 3,917 | 3% |
| Run harness (adds, during a run) | 5 | 3,125 | 2% |
| Co-browse (adds, in the panel) | 6 | 2,105 | 2% |
| Menu line for all 65 (~15 tokens each) | 65 | ~975 | 0.8% |

Heaviest single tools: `insert_block` **5,221** (17% of the entire prefix, alone),
`propose_linked_databases` 1,563, `propose_item_iteration` 1,393,
`propose_deck_with_cards` 1,152, `query_database` 1,036.

### 2.1 What the summoner changes

| scenario | today | after | delta |
|---|---:|---:|---|
| Plain chat (no run, no panel) | 31,149 | **4,892** | −84%, all 65 reachable |
| Co-browse item run | 9,397 (26 reachable) | **10,122** | +725, **all 65 reachable** |

The run case is the headline: for ~725 extra tokens the diet's entire capability loss
is undone. The plain-chat case is where the window savings live.

### 2.2 Why the descriptions are the cost

Tool descriptions mix two jobs. Identification ("this is the tool that reads database
rows") is ~20 tokens. Operation — filter operators per column type, `lifetime`
semantics, budget/approval protocol, handle syntax — is the rest.

| tool | full | identifying clause |
|---|---:|---:|
| `insert_block` | 5,221 | ~20 |
| `query_database` | 1,036 | ~20 |
| `describe_database` | 191 | ~20 |

The model needs identification to *select*; it needs operation only to *call*. The
menu carries the first. The summon delivers the second.

---

## 3. Design

### 3.1 Three tiers

| tier | advertised? | executable? | cost |
|---|---|---|---|
| **Core** | always | always | 3,917 tokens |
| **Contextual** (run harness, co-browse, editor) | when the mode is active | always | 2-3k when active |
| **Menu** | one line in the system prompt | **yes** — see 3.2 | ~15 tokens each |
| **Summoned** | after activation, for the rest of the turn | always | its own schema |

Core set (proposed — owner confirmation pending, §7): `getCurrentNote` (universal,
per P0), `search_content`, `read_folder_context`, `createNote`, `updateNote`,
`renameNote`, `read_first_chunk` / `read_next_chunk` / `read_previous_chunk`,
`ask_user`, `notify_user`, `finish_with_summary`, `plan`, `phase_checkpoint`.

### 3.2 The tools object is never pruned

The current diet uses `delete`. That is what produces `NoSuchToolError`: incoming
tool calls resolve against the **full** `tools` object in `doParseToolCall`
(`ai@6.0.191/dist/index.mjs:3800-3813`), while `activeTools` filters only what is
**serialized into the request** (`index.mjs:1848`).

So: keep `tools` complete, always. `activeTools` decides advertisement. A tool that is
present but unadvertised costs zero tokens and still executes if called — which alone
would have prevented §1.1.

### 3.3 Summoning, and why it costs a step

The operating instructions must be in place *before* the operative call, because the
arguments are emitted in the same inference as the tool name. The sequence is:

```
step N     menu in context → model calls summon("query_database")
           server adds it to the turn's activation set; returns ~10 tokens:
           "activated: query_database — call it now"
step N+1   schema now in the tools block → model calls it with correct arguments
```

The summon result deliberately does **not** serialize the schema into the transcript.
Activation delivers it through the tools channel, where the provider can actually
constrain the arguments against it; a transcript copy would be a second charge for a
strictly weaker artifact.

**Activation is a ratchet.** Within a turn, tools are only ever added, never removed,
so the advertised set grows monotonically and each summon costs at most one prefix
change.

### 3.4 Answering "can it be summoned asynchronously?" — no, and here is the precise reason

The *fetch* is a local lookup; it is already instant. The cost is not I/O, so async
cannot touch it. Two things are genuinely expensive, and both are structural:

1. **An inference step.** The tools array is part of the request payload. A completion
   already in flight cannot have a tool added to it.
2. **Prefix-cache divergence.** `lib/domain/ai/prompt-cache.ts:116` folds the *sorted
   toolset* into the OpenAI `promptCacheKey`. Changing the advertised set mid-turn
   rotates the key, and because tools are serialized ahead of the system prompt and
   messages, the prefix diverges at its first bytes — the whole cached prefix is lost
   for the remainder of the turn.

What *can* be done, in descending order of value:

- **Predict at the turn boundary (free).** A run declares `captureTo` and
  `standingContext` at approval. Those tools are activated before the first inference
  of the turn, so the prefix is fixed for the whole turn: no extra step, no cache
  break. This covers the case that failed in §1.1 completely.
- **Batch by family (one step for several).** `summon("databases")` activates the
  read pair together.
- **Parallel summon (free).** A model may emit several tool calls in one step; a
  summon can ride alongside an unrelated read.
- **Repair as a net (zero steps when it fires).** `experimental_repairToolCall`
  (`index.d.ts:1214-1223`) receives `NoSuchToolError | InvalidToolInputError`. A call
  to an unadvertised tool activates it and retries in place.

Treat repair as a net, not the primary path: a model emitting a tool call for
something absent from the request is not guaranteed by any provider. It does happen —
§1.1 is proof — which is exactly why the net earns its place.

### 3.5 What the diet was doing that a menu does not

Tool absence is a crude but effective focusing device: a model that cannot see
`propose_deck_with_cards` will not wander into it mid-run. Restoring discoverability
restores the wandering. Mitigation: the menu is **ordered and scoped by mode** — a
run's menu leads with run-relevant entries — rather than a flat alphabetical 65.
Otherwise we trade unavailable-tool errors for off-task tool calls.

---

## 4. Phases

Each phase is independently correct and independently revertable. All five ship as
**one PR** (owner direction, 2026-09-17).

### P0 — Universal `getCurrentNote`

`registry.ts:2365-2410`. A read never dead-ends: it renders the thing, or says what
the thing is and names the way in.

| content type | returns |
|---|---|
| `note`, `folder` | unchanged (live TipTap extraction) |
| `data` | `buildDataSchemaDigest()` capsule + index-tier rows via `formatRows()` |
| `file` | title, mime, size, extracted text where held |
| `external` | URL + Open Graph metadata |
| `code`, `html` | source |
| `visualization` | title + extractable diagram text |
| anything else | what it is, and the tool that opens it — never a bare refusal |

Keeps the existing active-charter short-circuit (`ctx.activeCharter`) untouched.
Exhaustive `Record<ContentType, …>` dispatch so a new content type fails the build
rather than silently falling into a refusal (per the recorded
`reference_icon_switch_default_hides_gaps` lesson).

### P1 — `delete` → `activeTools`

`route.ts:1433-1455`. Compute an `advertised: string[]` instead of mutating `tools`;
pass `activeTools` to `streamText`. Restore `query_database` + `describe_database` to
the run set (+1,227 tokens) as the immediate capability fix; the four `propose_*`
schema-design tools stay unadvertised (3,840 tokens, genuinely irrelevant mid-run).

Note `hasDatabaseTools` / `hasItemIteration` etc. at `route.ts:2492-2493` key off
`in tools` — they must be repointed at the advertised set, or the system prompt will
start advertising sections for tools the model cannot see.

### P2 — `repairToolCall`

Wire `experimental_repairToolCall` on the `streamText` call:

- `NoSuchToolError` for a tool that **exists in `tools`** → activate it for subsequent
  steps and return the call unchanged (it executes now).
- `NoSuchToolError` for a name that exists nowhere → return `null` (error stands), but
  the error text names the menu and `summon`.
- `InvalidToolInputError` → return the schema as a teaching error. For
  `record_item_result` specifically, recover §1.3: a missing `status` with a `verdict`
  present is repaired rather than losing the item. **Open decision, §7.**

### P3 — Menu + summon

- `selectWhen: string` added per tool in `metadata.ts` and the four family metadata
  files. Model-facing register, ~15 tokens, distinct from the user-facing
  `description` (settings UI copy, second person, references Settings paths). Two
  audiences, two strings, one file — selection logic edited in exactly one place.
- Server-side menu builder renders the mode-scoped, mode-ordered menu into the system
  prompt. `metadata.ts` stays Prisma-free (client components import it); the builder
  lives server-side.
- `summon(names: string[])` tool — core tier, activates by name or family, ~200 tokens.
- Turn-scoped activation set threaded through `prepareStep`, monotonic within a turn.
- Predictive activation at turn start from the run's `captureTo` / `standingContext`.
- **Gate:** extend `pnpm ai:drift:check` — every tool id has a `selectWhen`; every
  `selectWhen` resolves to a live tool; core and menu sets are disjoint; no tool is
  unreachable from both. Mutation-test the gate before trusting a first PASS.

### P4 — Retire the diet

Delete `ITERATION_RUN_TOOLS`. Advertisement becomes core + active-mode contextual +
summoned. Remove the now-dead `search_web` allowlist entry (it never existed at diet
time — native search is attached *after*, at `route.ts:1488-1500`).

---

## 5. Chips & traceability

- **`summon` chip.** `summoning` → `activated (query_database, describe_database)`.
  Click-to-expand lists what was activated and why (model-requested / predicted from
  run config). Durable transcript line: `summon · 2 tools · +1,227 tokens advertised`.
- **Predictive activation** is not a tool call and gets no chip; it is recorded once in
  the run ledger's phase line: `Tools pre-activated from run config: query_database,
  describe_database.` Silence here would be the failure mode the recorded
  `feedback_silent_correctness_feels_like_a_bug` lesson warns about — the user should
  be able to see why a tool was available.
- **Repaired calls** render on the existing tool chip with a `repaired` marker rather
  than `failed`, and the expanded view shows the original error plus what was changed.
  A recovered `record_item_result` says so explicitly (`status defaulted to done`), so
  a repair is never mistaken for a clean call.
- **Turn accumulator:** advertised-tool tokens reported alongside the existing spend so
  the prefix cost is visible per turn, not inferred.

## 6. Gates and smoke

- `pnpm typecheck` → `pnpm lint` (175 ratchet) → `pnpm build`.
- `pnpm ai:drift:check` extended per P3, mutation-tested.
- Measurement harness promoted from the throwaway diagnostic to
  `scripts/measure-tool-prefix.ts` so §2's table can be re-derived after any change.
- **Smoke on production** (post-deploy checklist in the PR body — AI-capability work
  smokes on prod, never titled "Pre-merge"):
  1. Chat on a folder: "read the Job Opportunities Library" → `getCurrentNote` returns
     the schema capsule + index rows, not a refusal.
  2. Start a charter run with a `captureTo` → run ledger records pre-activated tools →
     mid-run, ask for a dedupe check → `query_database` succeeds inside the run.
  3. Ask for something only a summonable tool can do (e.g. a deck proposal) mid-chat →
     `summon` chip → the tool runs on the next step.
  4. Force a `record_item_result` without `status` → chip reads `repaired`, item lands.
  5. Compare turn-accumulator advertised-tool tokens against §2.1's predicted figures.

## 7. Open decisions

1. **Core set membership** — §3.1 is a proposal. Owner confirmation pending.
2. **Universal `getCurrentNote` reach into `data`** — owner-scoped (consistent with how
   notes already behave, and the asymmetry is what made the model look incompetent) or
   jurisdiction-gated (consistent with the database tools)? Proceeding owner-scoped
   unless told otherwise; reversal is a one-line gate.
3. **`record_item_result` missing `status`** — default to `"done"` when a `verdict` is
   present (recovers the item silently, marked `repaired` on the chip), or return a
   teaching refusal the model must retry against (costs a step, never guesses at an
   outcome the model did not state)?

## 8. Related

- `AI-TOOLING-ROUND-PLAN.md` — separate scope (choice card, URL hygiene, capability-true
  search gating). No overlap; both touch `route.ts` tool assembly, so whichever lands
  second rebases.
- `AI-V3.2.2-PROMPT-CACHING-PLAN.md` — P1 BUILT; `prompt-cache.ts` is the constraint
  documented in §3.4.
- `PER-ITEM-PLAYBOOK-ITERATION-SPEC.md` — the run harness this plan stops starving.
- `AI-BULK-ROW-READING-PLAN.md` §4.1 — the budget/approval contract `query_database`
  keeps regardless of advertisement.
