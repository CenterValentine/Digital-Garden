# Agentic Resource Discipline

**Status:** living reference — maintain the state table (§4) as mechanisms land.
**Scope:** how our AI agent (chat + playbooks) manages its scarce resources —
**tokens, compute, tool budget, and attention** — across long, multi-phase runs.

> **Principles (§1) are durable.** The *how-we-apply* (§3) and the *implementation
> state* (§4) evolve with the app. When you build a new AI capability that touches
> how much work the agent does, how it decides it's finished, or how it spends
> context, revisit this doc and update §3–§4.

Related: [AI-V3.2-T3-PLAYBOOKS-PLAN.md](../../work-tracking/AI-V3.2-T3-PLAYBOOKS-PLAN.md)
(the playbook runtime these principles govern), `lib/domain/ai/run-ledger.ts`
(externalized state), `lib/domain/ai/tools/` (the tool budget).

---

## 1. Guiding principles (durable)

1. **Stop on a satisfied criterion, not on exhaustion.** An agent should finish
   because it *met a definition-of-done*, not because it ran out of tokens or
   steps. Budget caps are the **backstop** for when the criterion is mis-specified
   — never the plan.
2. **The folder is the memory, not the context window.** Externalize intermediate
   state to durable notes/folders (the Run Ledger). Context is a *working set*, not
   an archive. This is the single biggest lever for long runs.
3. **Load metadata first, bodies on demand.** Progressive disclosure + just-in-time
   retrieval. The agent sees *what exists* cheaply and pulls *contents* only when a
   step needs them.
4. **Effort is bounded by the rubric.** Do exactly enough to satisfy "done-when."
   Over-engineering is a rubric failure, not diligence.
5. **Escalate cheap → expensive.** Start with the cheapest strategy (one pass);
   escalate (deeper reasoning, more retrieval, sub-agents) *only* when the cheap
   pass fails the criterion. (Mirrors CLAUDE.md's "cheapest gate that fits" ladder.)
6. **Resource policy is authored, not hardcoded.** The playbook/phase declares its
   own done-condition and effort envelope, so an extensive plan manages its own
   variance declaratively. The runtime reads policy; it doesn't impose one.
7. **Isolate subtasks.** A sub-task (sub-playbook, fan-out job) runs in its own
   budget/context and returns a *conclusion + artifact pointer*, not its scratch
   work. Keeps the parent context clean.
8. **Observability is a control, not a report.** You cannot manage what you cannot
   see. Surface token/step/cost so both the user and the model can steer.

### 1b. Payload economics (added 2026-09-18)

Principles 1–8 govern *how much work* the agent does. These govern *how big each
exchange is* — the dimension the evidence thread behind
[AI-CONTEXT-ECONOMICS-PLAN.md](../../work-tracking/AI-CONTEXT-ECONOMICS-PLAN.md)
showed was unguarded: a 5-turn charter run re-sent 21.9M tokens, and **the
model's own words were 2% of them**. Tool parts *are* the input context.

9. **Pay for a page once.** A perception result is paid for when first read;
   every later appearance must be a pointer. Fold on **distillation** (a
   checkpoint, a findings record, a reply) — never on run state. A run ending
   is the moment its raw data is *most* disposable, not the moment to stop
   folding it.
10. **A tool with a >100× output/input ratio needs a compaction story before it
    ships.** `co_browse_act` is 89 bytes in, 13 kB out; 65 of those was 42% of a
    conversation.
11. **Deltas by default, keyframes by exception.** An unchanged page must never
    cost a full snapshot. Page identity is origin + path; a query string is
    state, not a document.
12. **Dedupe before you discard.** Byte-identical content is the one thing that
    is always safe to collapse — the model already has it. It is also the only
    transform that never perturbs the prefix cache, because it is deterministic.
13. **A confirmed write supersedes its own input.** Once `insert_rows` returns
    `ok`, the database is the durable home; the 25 kB the model typed was
    scaffolding. (Generated text replayed as input is the pattern that costs
    most on vendors with expensive output tokens.)

---

## 2. The four mechanism families

### A. Termination — "am I done?"
- **Definition-of-done / rubric** — explicit acceptance criteria the agent
  self-checks against. *The primary lever.*
- **Completion signal (a tool call)** — stopping is an observable action, not
  silence.
- **Self-critique loop** — generate → judge → revise or stop; converges on the
  rubric or a max-iteration.
- **No-progress detection** — repeated results / no new artifact → stop (loop
  guard).
- **Budget exhaustion** — hard cap → stop, report partial. The safety net.

### B. Effort calibration — "how much work per prompt?"
- **Difficulty estimation** → allocate reasoning/step budget to match.
- **Rubric-bounded effort** → the done-condition *is* the throttle.
- **Escalation ladder** → cheap first, expensive only on failure.
- **Value-of-information** → stop when new info won't change the decision.

### C. Context / token management — the resource itself
- **Progressive disclosure** — metadata first, bodies on demand.
- **Externalized state** — offload to files/folders/ledger.
- **JIT retrieval** — pull a doc in when needed, drop after.
- **Compaction / summarization** — compress transcript → summary + tail.
- **Sub-agent isolation** — subtask in its own context/budget, returns a
  conclusion.
- **Pinned vs. evictable** — which sections never drop under pressure.

### D. Decomposition — structural
- **Phase splitting** — sequential, gated units.
- **Hierarchical planning** — plans of plans (sub-playbooks).
- **Fan-out / map-reduce** — independent subtasks in parallel, then merge.
- **Per-node budgets** — a parent budget divides among children.

---

## 3. How we apply this (our system)

| Principle / mechanism | Our implementation |
|---|---|
| Completion signal | **`phase_checkpoint`** tool — pauses for the user's verdict, records the ledger |
| Definition-of-done | **`**Done when:**` per phase** in the playbook (SKILL.md) format — authored, read into the phase's context |
| Externalized state | **Run Ledger** (`run-ledger.ts`) — append-only markdown in the run's target folder |
| Progressive disclosure | **Playbook progressive disclosure** — inject standing rules + the *active phase only* |
| JIT retrieval | **`[[wiki-link]]` refs + `read_note`** — extensions/sub-playbooks traced on demand |
| Hierarchical planning | **Sub-playbooks** — a `[[ref]]` that is itself `metadata.playbook`; can be *authored* by one phase and *consumed* by a later one (`createNote` + `withPlaybookMetadata`) |
| Sub-task outputs | **`create_folder` + `createNote` / `create_docx`** — sub-playbook artifacts filed in the run folder |
| Observability | **Token meter** — per-phase/route token accounting surfaced in chat |
| Pay for a page once (§1b.9) | **`perceptionFoldStates`** (`context-diet.ts`) — raw perception behind the latest checkpoint *or* findings record, and any re-readable read from an earlier turn, resends as a stub; the UI collapses the same parts (one map, two consumers) |
| Dedupe before you discard (§1b.12) | **`dedupeRepeatedToolParts`** — a repeated `toolCallId` is dropped whole; identical type+input+output gets a pointer stub |
| Confirmed write supersedes its input (§1b.13) | **`supersedeWriteInputs`** — a successful `insert_rows` / `update_rows` / `update_row` / `update_note` / `record_item_result` behind the same boundaries keeps its addresses (short scalars) and drops its payload; failed writes keep their input; the proposal's item list folds only after findings |
| Deltas by default (§1b.11) | **`coBrowsePageIdentity`** — `coBrowseSnapshotOrDelta` keyframes on origin + pathname; a query-string change stays a delta, the churn ratio still forces a keyframe when the page really replaced itself |

---

## 4. Implementation state — **MAINTAIN THIS**

Legend: ✅ shipped · 🟡 in T3 · ⏳ deferred → **AI 3.7 "resource governance"** (owner-scoped 2026-07-25; NOT the v3.2 "T4" resumable streams, shipped as 3.3) · 💤 not planned

| Mechanism | Family | Status | Where |
|---|---|---|---|
| Completion signal (`phase_checkpoint`) | Termination | ✅ | `tools/registry.ts` |
| Externalized state (Run Ledger) | Context | ✅ | `run-ledger.ts` |
| JIT retrieval (`[[refs]]` + `read_note`) | Context | ✅ | editor wikiLink + `read_note` tool |
| Sub-task output tools (`create_folder`/`createNote`/`create_docx`) | Decomposition | ✅ | `tools/registry.ts` |
| Token meter (observability) | Effort/Context | ✅ | chat route + UI |
| Progressive disclosure (per-phase injection) | Context | 🟡 | `route.ts` playbook injection |
| Definition-of-done per phase (`**Done when:**`) | Termination | 🟡 | SKILL.md format + system prompt |
| Sub-playbook awareness in reference manifest | Decomposition | 🟡 | P4 manifest (`isPlaybookMetadata`) |
| Enforced token/step budgets (decrement + stop) | Termination | ✅ | `route.ts` step cap, turn-scoped (PR #248) |
| **Reserved deliverable tail + visible remaining steps** (a budget the model cannot see is one it cannot plan against; a run's writes are knowable at approval, so hold the last steps for them) | Termination / Effort | ✅ | `propose_item_iteration.deliverables` → `computeIterationStepCap` (`items × (research + tail) + overhead`); `prepareStep` narrows `activeTools` to the tail and appends a remaining-steps notice each step (`iteration-proposal.ts`, `route.ts`); gated by `proposal:shape:check` + `context:diet:check`. Evidence: prod `5e5b739d` — 12 steps, 17 reads, 0 writes |
| **Gaps are data** (one evidence search, then a placeholder + `record_item_result.gaps[]`; never a second search, never an invented value) | Effort | ✅ | prompt run rules + `record_item_result.gaps` → ledger line |
| Sub-agent isolation for sub-playbooks | Context | ⏳ | T4 |
| Per-run fold (perception → stub at distillation / turn) | Context | ✅ | `context-diet.ts` `perceptionFoldStates` — **905 kB** reclaimed on the evidence thread; gate `pnpm context:diet:check` |
| Content-addressed dedupe of tool parts | Context | ✅ | `context-diet.ts` `dedupeRepeatedToolParts` — **~543 kB**; same gate |
| Write-input supersession | Context | ✅ | `context-diet.ts` `supersedeWriteInputs` — **~324 kB** on the evidence thread; same gate |
| Delta-by-default snapshots (page identity = origin + path) | Context | ✅ | `co-browse-page-identity.ts` + `coBrowseSnapshotOrDelta` — 55/65 full snapshots → expected ~10/65; same gate |
| Per-run compaction/summarization (fallback under the folds) | Context | ⏳ | sized after PR B — a threshold tuned against a 60%-waste transcript bakes the waste in |
| Self-critique / no-progress loop guards | Termination | ✅ | repeat-failure loop stop (PR #248); `nth` ambiguity refusal (`actions.js`) |
| Difficulty-based effort allocation | Effort | ✅ | `mechanicalRun → reasoningEffort: "low"` during item iteration (`route.ts` `buildProviderOptions`) |

---

## 5. Maintenance

- Update **§4** whenever a mechanism ships, moves T3→shipped, or a new one is
  adopted — this table is the source of truth for "what resource control we
  actually have."
- Keep **§1** stable; if a principle genuinely changes, note *why* (these are the
  north star for future builds).
- Adapt **§3** as we learn how each principle maps to *this* app — it's expected to
  drift as the product evolves.
