---
title: Per-item playbook iteration — build spec
status: BUILT + owner-smoke-validated (tabs + LinkedIn list) — PR-ready. A reliability sweep followed the build (see STATUS.md 2026-08-05): loop continuation, completeness, URL links, collab-write, ambient-captcha, session recovery.
branch: feat/per-item-playbook-checkpoints (this worktree; base origin/main post #145)
last_updated: 2026-08-04
---

> **Build record (2026-08-04):** approved and built at level 2 per the open-question
> resolutions: tiered stable key (url → label, tier recorded), plan card
> (`propose_item_iteration`, needsApproval), one roll-up note, loaded-set scope,
> tabs-first. Shipped: `list_tabs` (client-executed, explicit-ask-gated) +
> `propose_item_iteration` / `record_item_result` / `record_iteration_findings`
> (server, ledger-backed) + item budget derived from message history (soft-stop at
> the read tools; fail-open) + prompt methodology (gated by `hasItemIteration` /
> `hasListTabs`) + chat pills. Gates green: typecheck, lint, prompt-cache.

# Per-item playbook iteration over a co-browsed list

**Design decision (owner, 2026-08-04): the HARNESS owns the loop; the playbook is
the per-item unit.** A playbook reasons about ONE posting ("given this JD, score
fit, document if >75%") and may contain per-item *acting* ("open the description,
expand requirements"). The iteration over items lives OUTSIDE the playbook — the
user's chat instruction or a thin harness — so the same "job fit" playbook works
on a single JD (loop of 1) or a list (loop of N). This matches the linear-phase
progressive-disclosure model (a playbook has no native "for each of N" primitive)
and keeps per-item runs from colliding with an outer playbook's phase pointer.

Sits on the **proven** Slice 4 co-browse engine (cross-frame acting, 3-tier match,
captcha detect-pause, `collect`). Part of the Agentic Browsing line; upholds the
CDP interaction-reliability two-category standard.

## North-star scenario

> "Iterate through each job description on this page and apply this playbook,
> ensuring all qualified (>75% fit) postings are documented."

The page may be a **single JD** or a **list**. Same playbook either way.

---

## Operating principles — the harness WRAPS a playbook, it does not flatten it

This doc dwells on iteration because iteration is the **net-new plumbing and the
risk surface** — the single-pass playbook already works and needs no new code.
Emphasis is NOT dominance. Ground the whole feature in these:

1. **A playbook is a dynamic, interpretive prompt — not a script.** The model
   reads its phases + context and *reasons*: adapts to what the page actually
   shows, skips inapplicable steps, handles variance. Iteration changes none of
   this. The ledger is bookkeeping for **completeness of the outer loop**, never a
   constraint on the **inner reasoning**.
2. **"Per-item unit" = one FULL playbook run, not one atomic action.** A single
   item can be a multi-phase deliverable (research phase -> synthesize -> output),
   exactly as authored. The item boundary is "one complete execution of the
   playbook," internally as rich as the author wrote it. The loop never compresses
   a multi-phase playbook into one step.
3. **Iteration is opt-in and orthogonal.** The DEFAULT is a loop of one — the
   playbook runs once against the current page, fully dynamic. A single JD is not a
   degenerate loop; it is just the playbook running normally. The loop layer only
   engages on an explicit multi-item request ("for each of these").
4. **The full playbook + surrounding chat context travel into EVERY iteration.**
   A per-item run receives the whole playbook (all phases + its context) plus the
   user's framing and any `@`-mentions (résumé, rubric) — not a stripped
   "do one thing." Cross-cutting context ("focus on remote roles," "weight comp
   heavily") applies across all items.
5. **The harness must not over-literalize.** It supplies structure (enumerate,
   record, reconcile, cap, pause) so nothing is dropped; it must never replace the
   playbook's judgement or force cookie-cutter behaviour where the author intended
   dynamic reasoning. Structure for completeness, freedom for interpretation.

---

## The core principle

**The model's context is the WRONG place to store loop state.** Nearly every
failure mode below is the same root cause — treating the LLM's memory as the
iteration's source of truth. The fix is uniform: **the ledger is the loop's
authoritative state; the model advances it one item at a time.** That is what
turns "all qualified documented" from a hope into a *checkable* claim.

Iteration needs no new *acting* primitives (Slice 4 proved those). It needs a
**reconciliation layer**: enumerate → stable-key → per-item sub-run → record →
verify none dropped.

---

## Enumeration sources — the harness is source-agnostic

The loop doesn't care where items come from. Enumerate → ledger → per-item
playbook run → reconcile is identical downstream; only the doorway differs.
Three first-class sources:

| Source | Enumerate via | Stable key | Net-new |
|---|---|---|---|
| **List page** | `collect()` on the board | tiered (URL -> company+title -> title+group) | — (this spec) |
| **Open tabs** | `list_tabs` (new, thin, gated) | **tab URL — perfect, free** | one thin tool |
| **Pasted URLs** | the prompt itself | URL | none |

### Open tabs — tabs-as-curation (owner scenario, 2026-08-04)

Motivation: on boards with weak filtering (Greenhouse), the user pre-curates by
opening each promising JD **in its own tab**. The human does the filtering the
site can't — and the harness should treat that as a first-class enumeration
source, not a special case.

**Capability status (verified against post-#145 main):** ~90% shipped.
`listTabs()` / `resolveTab(query)` exist in the extension session layer
(`session.js`), with background handlers (`cobrowse-list-tabs` /
`cobrowse-resolve-tab`) and typed client fns (`coBrowseListTabs` /
`coBrowseResolveTab`) through the trust-gated panel bridge — built in Slice 5b
for tab targeting. **The gap:** the AI tool layer exposes no doorway — the model
cannot see the user's tabs. Net-new = ONE thin tool (`list_tabs`) returning lean
title+URL; per-item reading then uses the EXISTING `read_page` by URL (background
tab, no debugger attach, no tab switching). Sequential co-browse attach per tab
is possible (attach -> detach -> attach under the single-session guard) but
unnecessary weight for reading.

**Why this source is the EASIEST variant — it deletes half the risk register:**
- Risk section A (losing your place in the list) vanishes: no list to return to,
  no `back()`, no reshuffle — each item IS its own tab.
- Risk section B gets its best-case stable key for free: every tab has its own
  URL (tier 1, no fallback needed).
- The remaining register (C page-shape variance, D mid-loop obstacles, E budget,
  F governance, G phase coupling) applies unchanged.

**Privacy gate (the one real consideration — description/gating, not
architecture):** the user's open tabs are a sensitive surface. `list_tabs`
activates only on an EXPLICIT "go through my (job) tabs" request — never
ambiently; returns lean title+URL only; the tool description instructs the model
to use it solely when the user asks to iterate over their tabs. Optionally accept
a filter query (e.g. "greenhouse") so the model requests the narrowest slice.

---

## Risk register — what can happen when iterating (drives the design)

Legend: [have] already covered by Phase 2b / Slice 4 · [add] harness must add.

### A. Losing your place in the list
- [have] URL-based page classification (new-page vs in-place) + `back`.
- [add] **List re-renders on return** — `back()` can reset scroll, re-run the
  search, or reshuffle order (LinkedIn). Re-anchor by **stable item key**, never
  by position/scroll.
- [add] **In-place vs navigating detail varies by site** — side-pane (URL same,
  no back) vs navigate (URL changes, back required). Classify per item from the
  URL delta before deciding to `back`.

### B. Item identity & completeness
- [add] **Duplicate titles** under `role+name` collide -> process-twice /
  skip-one. Stable key = posting URL (preferred), else company+title, else
  snapshot `group`.
- [have] `collect()` gathers virtualized lists, deduped by `role|name|value`.
- [add] **Ephemeral handles** — re-resolve fresh each iteration; never cache list.
- [add] **"All documented" can't trust model memory** (lost count, re-dos, false
  "documented"). External **ledger checklist** the harness reconciles.

### C. Page-shape variance per item
- [have] Cross-frame reading + acting (OOPIF) proven.
- [add] **Unreadable item** (login-wall, hostile, cross-frame fail) -> record
  "couldn't read", **never silently skip** (silent skip breaks completeness).
- [add] **Pagination boundary** — "this page" = loaded set? all pages? infinite?
  Explicit **scope + cap**.

### D. Mid-loop obstacles
- [have] `captchaDetected` signal + detect-and-pause standard.
- [add] **Captcha / login / consent / throttle mid-loop** -> pause-and-hand-to-
  user, **preserve progress** (ledger), don't grind.
- [have] `cobrowse-session-ended` broadcast exists.
- [add] **Session detach mid-loop** -> stop gracefully, progress saved, resumable.

### E. Resource & agent-loop drift
- [add] **Token/context blowup** (N x full-JD read + playbook phase) -> externalize
  per-item state to the ledger; **budget cap + resume**.
- [add] **Early "done" / runaway** -> **harness-driven termination**, not model-
  judged.
- [have] Prior art: Phase-1 research-run page budget (`researchRunRef` in
  use-conversation-engine) — same client-side, run-scoped, fail-open pattern.

### F. Governance / blast radius
- [add] **Destructive per-item acting amplified across N** (the "Dismiss" sibling
  hazard, xN). Acting past read/navigate stays **gated**; the loop defaults to
  read/navigate only.

### G. Playbook-phase coupling
- [add] Playbook = linear phases + single `phase_checkpoint` pointer. Running it
  inside an outer loop collides the two checkpoint cadences. Each per-item run is
  a **self-contained sub-run** (own ledger row), never entangled with an outer
  playbook phase pointer. (This is *why* the harness owns the loop.)

---

## Proposed design (to review — NOT yet built)

### Shape: a run-ledger-backed iteration, model-advanced, harness-reconciled

1. **Enumerate** (once): `collect()` the list -> harness derives a **stable key**
   per item (posting URL if resolvable, else company+title+group) -> seed a
   **run ledger** with one row per item, status `pending`. This is the checklist.
2. **Per item, in order** (loop body = the playbook as a self-contained run):
   a. Re-resolve the item fresh by stable key (never a cached handle).
   b. Open it (classify in-place vs navigate from URL delta).
   c. Read the JD (Phase-0 settle-then-extract; cross-frame if needed).
   d. Run the per-item playbook -> verdict (fit %, qualified y/n, rationale).
   e. **Record to the ledger row** (`done` + verdict, or `unreadable`/`blocked`);
      if qualified, **document** (createNote / append to a roll-up).
   f. Return to the list (`back` only if the URL navigated).
3. **Reconcile & terminate** (harness, not model): loop until every ledger row is
   non-`pending` OR budget cap hit OR an obstacle pauses (captcha/detach). Report:
   N processed, M qualified+documented, K unreadable/blocked, any skipped.

### Reuse (composition-first — minimal net-new)
- **Ledger**: `upsertRunLedger` + a per-item `phase_checkpoint`-style row (existing
  playbook runtime), keyed by run key + item stable key.
- **Budget/resume**: the Phase-1 research-run budget pattern (`researchRunRef`),
  re-scoped to items instead of pages — client-side, run-scoped, fail-open,
  soft-stop ("document what you have").
- **Acting**: the shipped `co_browse_*` tools (open/collect/read/back) — unchanged.
- **Documentation**: `createNote` / output-placement — a roll-up table of
  qualified postings (GFM table -> real TipTap table), like Phase-1 synthesis.

### Why a loop controller — and how much (right-sizing)

A loop controller is a **reliability & scale** investment, not a capability one.
It adds ZERO new ways to touch the page — every acting primitive shipped in
Slice 4. What it changes is *guarantees*:

**Enables (model-only iteration cannot guarantee):**
- **Completeness** — "all N processed, none dropped" as a *checkable* claim (the
  model narrates completeness from memory; it loses count / declares done early).
- **Resumability / crash-safety** — pause on detach/captcha, resume from item K
  (context-window state is erased by a session drop or compaction).
- **Bounded cost + deterministic termination** (model-judged termination risks
  runaway re-processing or premature stop).
- **Context survival at scale** — one item in flight, compact ledger rows behind
  (at ~15-20 items, full JDs flood the window and early items fall out).
- **Auditable reconciliation** — "M qualified, K unreadable" computed from state,
  not narrated.
- **Obstacle handling as invariants** — pause-on-captcha, record-don't-skip run
  ALWAYS, not "if the model remembers."

**Does NOT change:** no new acting primitives; per-item judgement quality (that's
the playbook + model); hard blockers (login/captcha stay blockers — it records
them, not beats them); item identity (depends on a good stable key, doesn't
conjure one); not a general workflow engine (linear loop, no branching/nesting);
governance unchanged (destructive acting stays gated).

**The one real move: loop state lives OUTSIDE the model's context.** Every
guarantee above is a corollary. Model-only iteration works fine until the context
is the bottleneck — long runs, interruptions, audited completeness. Below that
threshold a controller is over-engineering. Hence a spectrum:

1. **Prompt-only** — methodology section + shipped tools; model records to a note.
   Cheapest; fine for short lists; no hard guarantees.
2. **Ledger + reused budget (recommended first cut)** — seed a ledger from
   `collect`, reuse the Phase-1 `researchRunRef` budget pattern, model advances
   item-by-item, harness reconciles at the end. Most of the reliability for a
   fraction of the code; grows into (3) if scale demands.
3. **Full loop controller** — deterministic enumerate/advance/reconcile/resume in
   the engine. Full guarantees; the most code; build only when (2) measurably
   falls short (N >> 20, cross-session resume, hard audit requirements).

### Net-new (the reconciliation layer)
- A **loop controller** (client, in use-conversation-engine): seed ledger from
  `collect`, drive item-by-item, enforce cap, reconcile completeness, handle
  pause/detach -> resumable.
- A **system-prompt methodology** section: "iterate a list with a per-item
  playbook" — enumerate first, one item at a time, record each, never trust
  memory for completeness, stop on captcha/detach, read/navigate only unless gated.
- Possibly one thin tool (`propose_item_iteration`?) with `needsApproval` — the
  plan card (scope, item count, cap, playbook) before a long run, mirroring
  `propose_research_run`. **Open question — see below.**
- **`list_tabs`** — a thin, explicitly-gated tool over the shipped
  `coBrowseListTabs` (see Enumeration sources): lean title+URL, only on an
  explicit "iterate my tabs" ask, optional filter query. Unlocks the
  tabs-as-curation source; per-item reads ride the existing `read_page`.

---

## Open questions for owner

Each with: why it matters, the recommendation, the live alternative, and the
honest "how we'd do without" — which exposes which decisions are load-bearing
vs deferrable.

### 1. Kickoff surface — plan card vs prompt-only

- **Why it matters:** an N-item iterate is the most expensive thing the chat can
  do (N x read + playbook run) and it drives the user's real browser for minutes.
  Whether that starts silently or behind an approval determines cost surprise and
  informed consent.
- **Recommend:** a `needsApproval` plan card (mirror `propose_research_run`) for
  multi-item runs — shows scope, item count, cap, attached playbook BEFORE spend.
  Single-item runs (loop of one) stay prompt-driven, no card.
- **Alternative:** purely prompt-driven; the model narrates "I'll go through 12
  jobs" and starts. Lighter, faster, one less tool; relies on the user to
  interrupt if the scope reads wrong.
- **Doing without:** viable early — the co-browse indicator + Stop already give
  visibility/abort, and the budget cap bounds the worst case. The card becomes
  important the first time a run costs more than expected; it can be added later
  without rework (it's a thin `needsApproval` tool in front of the same loop).
  **Deferrable, low-regret either way.**

### 2. Stable item key — posting URL vs company+title

- **Why it matters:** the key is what "no item dropped, none done twice" hangs on
  across list re-renders/reshuffles. A weak key silently corrupts the checklist
  (dup titles collide; reshuffled positions lie).
- **Recommend:** tiered — posting URL when resolvable (a11y often exposes link
  hrefs; the detail-page URL after opening is definitive), else company+title,
  else title+group. Record WHICH tier keyed each item so weak keys are visible.
- **Alternative:** company+title only — always available pre-click, no URL
  resolution work; collides when one company lists the same title twice (real on
  big boards) and breaks if the visible title text shifts between renders.
- **Doing without (a single fixed key):** works on well-behaved boards
  (Greenhouse) and quietly double-processes/skips on hostile ones (LinkedIn
  reshuffles). Because the failure is SILENT — the ledger looks complete while
  being wrong — this is the one decision NOT to cheap out on. **Load-bearing;
  decide up front.**

### 3. Documentation shape — one roll-up vs note-per-item

- **Why it matters:** shapes what the user actually receives ("all qualified
  documented" lands HERE) and how noisy their garden gets.
- **Recommend:** one roll-up note per run (table: company / title / fit % /
  rationale / link — GFM -> real TipTap table, Phase-1 style), optional per-item
  detail notes only for qualified postings, linked from the roll-up row.
- **Alternative:** a note per qualified posting — richer per-item artifacts,
  better for downstream per-application work; N notes of clutter, no single
  at-a-glance view, harder to verify completeness visually.
- **Doing without (deciding):** cheap to defer — the playbook's own output
  instructions + the existing output-target preset already let the AUTHOR say
  where output goes; the harness only needs a default for when the playbook is
  silent. Could even be a plan-card field later. **Deferrable; author-overridable
  by design.**

### 4. Scope default — loaded set vs auto-paginate

- **Why it matters:** bounds run size and cost, and decides whether "each job on
  this page" can silently become "each job on 40 pages" (infinite scroll makes
  "the page" genuinely ambiguous).
- **Recommend:** the loaded/collected set only (post-`collect`), with explicit
  continuation — finish the set, report, offer "continue to next page?". No
  silent pagination.
- **Alternative:** auto-paginate to a cap (e.g. 3 pages / 50 items) — better for
  "scout the whole board" in one command; larger cost surprise, longer
  unattended driving, and compounds every risk in the register (more re-renders,
  more obstacles).
- **Doing without (deciding):** defaulting to loaded-set costs nothing and loses
  nothing — pagination remains available by just ASKING ("do the next page too"),
  which is the continuation flow anyway. Auto-pagination can be added later as a
  plan-card option. **Default to loaded-set; effectively decided unless you
  object.**

### 5. Controller depth — how much of the spectrum to build first

- **Why it matters:** determines net-new code size and what guarantees the first
  release actually makes (see "Why a loop controller — and how much").
- **Recommend:** level (2) — ledger + reused Phase-1 budget pattern, model-
  advanced, harness-reconciled. Most of the reliability, fraction of the code,
  clean growth path to (3).
- **Alternative:** (1) prompt-only methodology now (fastest, no guarantees — fine
  if first users only iterate short lists), or (3) full controller now (max
  guarantees, most code, risks over-engineering before usage data).
- **Doing without (any controller):** the feature still "works" via prompt +
  shipped tools — but "ensuring ALL qualified are documented" (the north star's
  own words) is precisely the guarantee prompt-only cannot make. If the
  completeness claim matters, some external state is non-optional; (2) is the
  cheapest thing that makes the claim honest. **Load-bearing for the north-star
  promise; (2) unless you want to start at (1).**

## Gate (when built)
`co_browse` live: "iterate these N jobs, apply the fit playbook, document >75%" ->
enumerated ledger, one item at a time, roll-up note lists exactly the qualified
set, unreadable items surfaced (not dropped), a captcha mid-run pauses-and-hands,
budget cap respected, resumable. typecheck + lint + prompt-cache + build green.
