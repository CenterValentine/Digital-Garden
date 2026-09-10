---
last_updated: 2026-09-06
status: planned — no build started
---

# AI Tooling Round — choice card, capability-true gating, server-side edits, URL hygiene, deferred batch

The work selected from the AI backlog after the 3.x line closed (PR #211). Five build
items, one design-of-record, one new backlog entry. Written after a code investigation
on 2026-09-05/06; every anchor below was verified against `main` at writing time.

## Scope and verdicts

| # | Item | Verdict from investigation | Size |
|---|---|---|---|
| 1 | `ask_user_choice` tool + card | Does not exist in any form. Build, Claude-style restraint contract | 1 session |
| 2 | Capability-true web-search gating | Gate is per-provider at `route.ts:1439-1456`. Fix is small and non-regressive | ½ session |
| 3 | Full-page chat targeted edits | **Not a gate removal** — edit tools are client-executed against a live editor. But the server write-through machinery already exists | 1 session |
| 4 | URL hygiene (ClearURLs + canonical) | Vendor confirmed: 37 KB, 206 providers, LGPL-3.0. Local additions layer is **required**, not optional — data below | 1 session |
| 5 | SKILL.md import interface | **Already shipped** — backlog line was stale. Tick it | — |
| 6 | Deferred batch runner | Design of record only; build gated on volume | — |
| 7 | Model-capability spine ("master class") | New backlog entry; extends the existing catalog + drift-gate spine | — |
| 8 | HTML/content fluff pass | Reframed as a **periodic audit**, not a one-time build | recurring |

---

## 1. `ask_user_choice` — the restrained choice card

**Confirmed absent.** The app's existing cards (`propose_item_iteration`,
`propose_research_run`, `propose_column_options`, `propose_output_database`,
`phase_checkpoint`) all present *one* fully-formed action for approval. None can offer
alternatives and take a selection. The multiple-choice cards seen in planning sessions
are rendered by Claude Code, not by this application.

**Design — must work with any model.** No provider-specific structured output, no
constrained decoding: it is an ordinary tool with a Zod input schema, so any model that
can call tools can call it. It follows the established sentinel/card contract — the tool
has **no server `execute`**; the card renders the options; the user's click is submitted
as the next user turn. A model too weak to call it simply asks in prose, which is
today's behavior — no regression path.

```
ask_user_choice({
  question: string,              // one sentence, ends in a question mark
  options: Array<{               // 2-4, mutually exclusive unless multiSelect
    label: string,               // 1-5 words
    description: string,         // what happens if chosen
  }>,
  multiSelect?: boolean,
})
```

**Restraint is the whole design problem** (owner's stated concern: a naive version fires
on every ambiguity). Three mechanisms, defense in depth:

1. **Description-level policy**, phrased as a prohibition rather than an invitation:
   *"Use only when you are blocked on a decision that is genuinely the user's to make —
   one you cannot resolve from the request, the content, or a sensible default. Do not
   use it for choices with a conventional default, for facts you can verify yourself, or
   to confirm a plan you have already been asked to carry out. When one option is clearly
   right, take it and say so."*
2. **Harness guard:** at most one call per turn, and suppressed entirely while another
   proposal card is pending approval (two stacked cards is the failure mode that makes it
   feel nagging). A second call in the same turn returns a refusal string telling the
   model to proceed with its best option.
3. **Free-text escape** on the card: the user can always answer in their own words
   instead of clicking, so the tool never narrows the conversation.

**Deliberately NOT the original use case.** The backlog framed this as a
disambiguator for "note body vs row cells / which of two databases" — owner rejected
that framing (2026-09-05): building it around routine ambiguity guarantees over-firing.
Row/database ambiguity stays with the existing prompt-level "ask, name both options"
guidance.

## 2. Capability-true tool gating

Today `search_web` is attached when the *provider* is a native-search vendor
([route.ts:1439-1456](../../../app/api/ai/chat/route.ts)). Models that don't support the
server tool then fail: Anthropic 400s on older Claude models, and OpenAI's
`web_search_preview` **hangs the turn silently** on `gpt-4` (the worse failure — same
bug class, same fix).

**Rule (owner-specified, non-regressive by construction):**

- Model's effective capabilities say it **supports** search → attach (as today).
- Model's effective capabilities say it **does not** → skip.
- Model is **unknown** to the catalog (a fetched connection model with no capability
  data) → fall back to today's provider-level behavior, unchanged.

Only the middle branch is new, so nothing that works today can break. `effectiveCapabilities`
already merges catalog data by bare id at read time, which is what makes the unknown case
rare rather than routine.

**One addition beyond the stated rule:** when the tool is skipped for a known-incapable
model, emit a one-line disclosure in the turn's receipts. Silent absence is how the
original bug hid for months — a user asking "why didn't it search?" currently gets
nothing to read. Same treatment for the OpenAI preview-tool hang.

## 3. Targeted edits from a full-page chat

**The investigation corrected the premise.** This is not a gate to delete. The edit
tools are **client-executed**: `apply_diff` has no server `execute` at all
([editor-tools.ts:432](../../../lib/domain/ai/tools/editor-tools.ts)), and the header
comment records why — running in the browser against the live ProseMirror document means
the tool validates in the same representation it applies to, and its result is the edit's
*real* outcome rather than a pre-announcement. `editableContentId`
([route.ts:996](../../../app/api/ai/chat/route.ts)) therefore encodes a physical
dependency, not a permission: there must be a live editor bound to that document in the
same view. A full-page chat has none. Removing the gate would ship tools that no-op while
reporting success — the exact bug that motivated client execution.

**The good news, and why this is still one session.** The server-side write-through path
already exists and is production-hardened:
[note-edit-ops.ts](../../../lib/domain/collaboration/note-edit-ops.ts) is the sanctioned
"only place that mutates a collaborative document from outside the editor" — it applies a
**minimal diff** via `updateYFragment` (untouched blocks keep their Y identity, concurrent
cursors survive), carries shrink guards (`SHRINK_RETAIN_FLOOR`, `SHRINK_HARD_REFUSE_FLOOR`),
and persists through the normal collaboration store hook. Its single caller is
[`writeNoteContent`](../../../lib/domain/content/write-note-content.ts) (line 160). The
hard parts — Y.Doc identity, minimal diffing, refusal semantics — are done and battle-tested.

**Remaining work, precisely:**

- A third `NoteEditMode` beside `"append" | "replace"` — a targeted find/replace applied
  to the document JSON before the existing minimal-diff path takes over. The shrink
  guards apply unchanged and are exactly the right safety net.
- **Target resolution**, the real design question: a full-page chat has no open document,
  so the tool needs an explicit target. Resolution order: an explicitly named/mentioned
  note → the note this turn just wrote (the receipt envelope already carries it) → refuse
  and ask which note. Never a silent guess.
- Server-executed variants registered *only* when `editableContentId` is undefined, so
  the sidebar keeps client execution (still the better path when a live editor exists).
- Honest results: the outcome reports what actually applied, per the standing
  tools-report-real-outcomes rule.

## 4. URL hygiene

### 4a. Vendored ClearURLs catalog + local additions

Measured 2026-09-05 from `rules2.clearurls.xyz`: **37 KB minified, 206 providers,
LGPL-3.0**, 48 global parameter patterns, 15 providers carrying exceptions. Per provider:
`urlPattern` (regex selecting which URLs it governs), `rules` (parameter-name regexes),
`exceptions` (URL regexes that bypass processing entirely), plus `redirections`/`rawRules`
we deliberately ignore. Consumption from TypeScript and the extension's plain JS is one
vendored JSON plus a ~40-line matcher.

**Why a local additions layer is required — measured, not defensive.** Our 14 hand-named
parameters tested against the catalog:

| Hand-named parameter | Covered by ClearURLs |
|---|---|
| `gclid`, `fbclid`, `mc_cid`, `mc_eid`, `_hsenc`, `vero_id`, `utm_*` | ✅ global rules |
| `trackingId`, `refId` | ✅ LinkedIn provider |
| `igshid`, `_hsmi`, `ref_src` | ✅ expected via their own site providers (verify per-URL, not per-parameter) |
| **`eBP`, `origin`, `originToLandingJobPostings`** | ❌ **absent from the catalog entirely** |

Those three came from our own co-browse audit of LinkedIn job pages. They are the answer
to "why not just use ClearURLs?" — the upstream catalog does not know them, and (see
cadence below) will not learn them soon.

**Adopt their provider scoping for our own rules too — it is a safety upgrade.** Our
current `TRACKING_PARAMS` is a flat `Set` applied to every URL
([co-browse-tools.ts:31](../../../lib/domain/ai/tools/co-browse-tools.ts)), which means we
strip the bare parameter `origin` **globally**. That name is generic and functional
elsewhere (OAuth flows, redirect targets, API calls). Moving our additions into a
LinkedIn-scoped local provider fixes a real latent hazard we introduced ourselves.

**Exceptions: yes, and they are hand-named per provider** (owner's guess was right). An
`exceptions` array of URL regexes; on match, *no processing at all* happens for that URL.
The upstream entries read as a catalogue of things stripping has broken in the wild —
Google OAuth and Gmail, Amazon cart-ajax endpoints, YouTube sign-in. Our additions file
carries exceptions in the identical shape.

**Update cadence — the answer to "is ClearURLs not reliable?"** Reliability splits in two.
The *catalog* is correct and stable: tracking parameter names barely churn (`utm_*` has
been stable for over a decade). The *project* is close to dormant — the rules repository's
most recent commit is **2026-03-25**, and the one before it **2025-07-29**. Consequences,
which settle the update question exactly as the owner intuited:

- A vendored snapshot refreshed by a manual `pnpm tracking:rules:sync` script is right.
  A scheduled cron would poll a file that changes roughly twice a year.
- **Our additions file is where the value accrues**, and it is the thing that actually
  gets updated — new parameters discovered by session audits, reviewed before landing.
  Tracking parameters we discover *are* the exception that requires updating.

**License note that reinforces the architecture:** LGPL-3.0 on a data file means vendoring
it **unmodified** with its notice intact, and keeping our changes in a separate file we
own. The clean-license path and the good-engineering path are the same two-file split.

**Where stripping applies (recommended, D1 below):** model-facing context and ledger
identity keys only — never URLs the agent navigates to. The breakage risk lives entirely
in that second variant: a stripped parameter can be functional (session, filter,
pagination, presigned), and the upstream exceptions list is empirical proof that
browser-style stripping breaks real flows. Cleaning context and identity keys cannot break
navigation because navigation never reads them.

**Investigation finding — identity keys are not stripped at all today.**
`stripTrackingParams` has exactly **one** app call site
([use-conversation-engine.ts:2188](../../../lib/domain/ai/use-conversation-engine.ts),
open-tab listing) plus the extension's mirror. The quest ledger keys url-tier items on the
**raw trimmed URL**, so every tracking-parameter variant of one posting currently mints a
**separate ledger row** — a live correctness defect in cross-sitting dedup, which is the
largest measured token saving in the arc. Extending normalization to identity is therefore
a fix, not hygiene.

**Normalize on comparison, not only on write — this is what makes healing retroactive.**
The ledger already stores the item's URL in its own column alongside the key
([quests.ts:92](../../../lib/domain/ai/quests.ts)), so the raw truth survives. If dedup
compares `normalize(candidate)` against `normalize(row.URL)` at read time, then improving
a rule **retroactively repairs rows already written** — no key migration, no backfill, and
a bad rule is revertible because nothing lossy was ever persisted. Standing principle:
**store raw, normalize at use.** Any design that overwrites the stored URL with its
stripped form forecloses every healing loop below.

### 4b. Canonical-URL surfacing

Worth building, with three guards. The extension reports `<link rel="canonical">`
alongside the address-bar URL; it is a **display and dedup hint only**, never a navigation
substitute.

- Read **after navigation settles** (single-page apps leave stale canonicals) — the
  extension's settle-then-associate step is the existing hook.
- Accept only **same registrable domain, non-root path** (AMP and mirror pages point
  cross-host; a canonical pointing at `/` is a site-wide default, not an identity).
- **Never** for pagination pages, which routinely canonicalize to page 1.

Long-run reliability is good for the sites that matter, because their search ranking
depends on the tag being accurate — that incentive is durable. Its distinct value is as a
remainder-catcher: parameter rules collapse query-string variants, while canonical
additionally collapses *path and host* variants (mobile subdomains, locale prefixes) that
no parameter list can reach. LinkedIn is the flagship case — tracking-laden job URLs
canonicalize to a bare `/jobs/view/<id>`, exactly the quest-ledger identity key.

### 4c. Self-healing loops

The vendored catalog is the floor, not the product. What makes the ruleset an asset is
that real work teaches it. Two failure modes are worth naming, because a loop that watches
only one of them is how rulesets rot:

- **Under-stripping** → the same item is captured twice under different keys. Cost:
  re-reading a page the quest already judged (3–10k tokens), plus a duplicate row.
- **Over-stripping** → two genuinely different items collapse onto one key. Cost:
  silent data corruption, which is strictly worse. Upstream has made this mistake — a
  2025-06-21 commit in the rules repository reads *"remove the `q` parameter"*, i.e.
  retiring a rule that had been stripping a functional search term.

Four loops, ordered by evidence quality. None of them applies a rule automatically.

**Loop A — canonical delta (authority-driven, highest precision).** When the extension
reports `<link rel="canonical">` alongside the observed URL, the parameters present in the
observed URL and absent from the canonical are the **site's own declaration** that they do
not bear identity. This is not inference; it is the publisher telling us. Candidates are
automatically scoped to that site's provider, which is exactly the shape our local
additions need. This makes canonical surfacing (§4b) load-bearing infrastructure rather
than a nicety: it is the training signal for the ruleset, not just a dedup hint.

**Loop B — ledger reconciliation (outcome-driven, bidirectional).** An audit pass over
quest-ledger rows, and the only loop that sees the real cost of a miss:

- *Under-strip detection:* rows whose URLs are identical after path and host comparison but
  differ in query parameters. The differing parameter names are candidates, ranked by how
  many duplicate rows and re-reads they caused — a token figure you can put in the report.
- *Over-strip detection:* rows sharing one normalized key whose captured content diverges
  (different titles, different verdict fingerprints). That is proof a stripped parameter
  was identity-bearing, and it emits an **exception proposal**, not a rule.

Because normalization happens at comparison time, this loop can be run over history the
day it is written — it does not have to wait for new data.

**Loop C — upstream sync reconciliation (keeps the layers deduped).** Part of
`pnpm tracking:rules:sync`: diff the incoming snapshot against the current one and against
our additions, then (i) **retire local rules the catalog has absorbed**, so our file shrinks
as upstream grows, (ii) flag conflicts where an upstream exception contradicts one of our
rules — upstream wins by default, since an exception encodes someone's breakage, and
(iii) report coverage. Given the repository's ~twice-yearly cadence, this runs on demand,
not on a schedule.

**Loop D — session-audit ranking (discovery, never authoritative alone).** The scripted
audit harness ranks query parameters seen across recent sessions by frequency and by bytes
consumed. Its output is a **priority queue for investigation**, not a proposal: a parameter
graduates only when Loop A or Loop B corroborates it. This is the guard against fuzzy
inference, which stays banned.

**Governance — the loops propose, a human accepts.** All four write into one review file
rather than the live ruleset; `pnpm tracking:rules:audit` runs them and prints the report.
Every accepted addition records its **provenance** — which loop, what evidence, what date —
directly in the additions file, so a rule that later causes a collision can be traced and
reverted rather than archaeologically re-derived. Two standing rails: a **never-strip
allowlist** (`q`, `id`, `page`, `sort`, `filter`, `token`, and anything an item's own
identity depends on), and a promotion ladder (candidate → corroborated across ≥2 hosts or
≥3 items → proposed → accepted). Contributing confirmed rules back upstream is optional
and low-yield while that project is dormant.

**Why this satisfies "self-maintaining" without auto-discovery.** The system detects its
own failures, quantifies them in tokens, proposes the specific fix, and gates it — the same
posture chosen for the capability spine in §6: make gaps *visible and gated* rather than
silently patched.

## 5. Deferred batch execution — design of record

Not built. Recorded so the shape is settled before volume justifies it.

**Two consumption models, and they differ structurally.**

*Model A — vendor batch APIs (≈50% discount, ≤24h).* The catch is that batch endpoints
process single request→response calls, **not agentic loops**. A sitting today is a loop
(fetch, judge, write a row, repeat) and each tool round-trip would cost a batch cycle —
worst case a day per turn. Batch APIs therefore only fit work split into **acquisition
first, judgment second**: fetch page content synchronously (cheap, no model involved),
then batch the pure-LLM steps (scoring, tailoring against already-fetched content). That
split is natural for stage-2 row passes, where items are rows the system already holds,
and unnatural for stage-1 discovery.

*Model B — off-peak scheduling through the live path.* DeepSeek has no batch API but
discounts 50–75% during its off-peak window (16:30–00:30 UTC). A cron running queued row
work through the ordinary synchronous path during that window gets batch-class savings
with **zero new substrate** and the full agentic loop intact. Lowest-effort first
increment; build this before any async-batch machinery.

**How approvals work.** Consent must travel, so the grant needs a durable home the
executing job rediscovers:

- The existing proposal card gains a **"run deferred"** option showing the discounted
  estimate beside the live one. Approval enqueues row-work units instead of executing them.
- **The approval record IS the grant.** The queue row stores the approved capture config,
  charter identity, quest identity, and the row set — the same envelope that rides ledger
  metadata today. The runner never re-derives permission from ambient context, because it
  has none.
- **Scope is frozen at approval.** The job may only touch the rows named in the grant. New
  rows discovered later require a new approval; a vanished row rejects and the run moves on
  (the existing rows-pass semantics).
- Results land through the **same validate-all upsert path** as live capture — cells
  stamped, quest-ledger rows updated, one reconciliation entry in the quest log.
  Per-row failures are independent and restartable.
- **Completion announcement:** the Connections/Inbox event log is the existing surface;
  the reconciliation entry in the quest log is the durable record.
- Recurring schedules ("re-score all Screened rows nightly") are **out of scope** — that
  crosses from deferral into standing automation and needs its own consent model.

**How the system knows which models support batch.** Batch is a property of the
*endpoint*, not the model family, so it must be resolved at the connection level, not
inferred from a model id:

- A **direct-vendor BYOK connection** may advertise batch; a **gateway connection never
  does** — the gateway does not broker batch jobs, so a gateway-routed model with an
  otherwise batch-capable id must resolve to "not available."
- Express it as a capability on the provider catalog entry so the existing
  `ai:drift:check` gate enforces it the way it enforces context windows and reasoning
  config — a new vendor template with no batch declaration fails the gate rather than
  silently defaulting.
- `pricing.ts` must gain a **tier flag** before any of this ships: batch/flex tiers are
  explicitly unmodeled today, and the turn accumulator prices per-request, so batch
  results would be mispriced at full rate.

## 6. New backlog entry — the model-capability spine

Owner-identified recurring problem (2026-09-05): tracking the quirks of an
any-make-and-model multiplex is a persistent tax — capability gaps surface as production
failures (search on incapable models, DeepSeek missing from role menus, batch availability
next) rather than as something the system knows about itself.

The spine already half-exists and should be extended rather than replaced:
`PROVIDER_CATALOG` + `ModelMeta.capabilities`
([providers/types.ts:27](../../../lib/domain/ai/providers/types.ts)), the generated
`AI-CAPABILITY-MATRIX.md` (`pnpm ai:matrix`, guarded by `ai:matrix:check`), the five
`ai:drift:check` gates, and read-time `effectiveCapabilities` merging. What is missing is
**gap awareness**: capability dimensions that exist in the world but nowhere in the
tables (batch APIs, structured output, tool-use quality tiers, vision, audio), and any
signal when a fetched model lands with no capability data at all. Proposed shape: extend
the capability enum, have the matrix generator emit an explicit **"unknown / unverified"**
column rather than silently omitting, and surface at-use-time provider errors as
capability corrections. Deliberately **not** a runtime probing system — the owner's
"self-maintaining" framing is satisfied by making gaps *visible and gated*, not by
auto-discovery.

## 7. HTML/content fluff pass — reframed as periodic

Owner call (2026-09-05): this is not a one-time build but a recurring audit. The
scripted session-audit harness (the loop that discovered tracking parameters as a bloat
class) is the durable artifact; each run's findings graduate into either the local
additions file or a structural filter rule. Standing constraint unchanged: cut only what
classifies as chrome by **role and structure**, never by content similarity — fuzzy
removal of content text stays banned.

## 8. Decisions needed

- **D1 — stripping posture.** Recommended: context + identity keys only; navigation URLs
  untouched. (Default recorded; flip if you want browser-style cleaning.)
- **D2 — affiliate/referral class** (`ref=`, partner tags; ClearURLs marks these
  separately). Recommended: strip in context and identity keys like any tracker — for our
  purposes they are identity noise. No revenue interest is at stake.
- **D3 — target resolution for server-side edits** when a full-page chat names no note:
  refuse and ask (recommended) versus defaulting to the turn's last written note.
- **D4 — `ask_user_choice` free-text escape:** always present (recommended) versus
  options-only for genuinely closed sets.
- **D5 — which healing loops ship in this round.** Recommended: **C** (free, part of the
  sync script) and **B** (highest value, runs over existing history immediately), with
  **A** following the canonical work and **D** left to the periodic audit cadence of §7.

## 9. Sequencing and PR shape

One release train, one PR, per the release-PR consolidation rule; fixes ride as commits.

1. Capability-true gating (½ session) — smallest, independently verifiable.
2. `ask_user_choice` (1 session) — new tool + card + restraint guards.
3. URL hygiene (1 session) — vendored catalog, local additions with provider scoping,
   read-side normalization extended to ledger identity, canonical surfacing,
   `tracking:rules:sync` with Loop C, and `tracking:rules:audit` with Loop B.
4. Server-executed targeted edits (1 session) — the largest; lands last so a schedule
   overrun does not block the rest.

This plan document rides that PR (no standalone docs-only PRs).

## 10. Chips and traceability

- **`ask_user_choice`** renders as a card, and the user's selection persists as a visible
  chip on the resulting user turn — so a reloaded conversation still shows *which* option
  was chosen, not just the resulting text. Applied-state keyed by proposal **content**,
  never message id.
- **Skipped-tool disclosure** (item 2) appears in the turn's receipts, one line, naming
  the model and the capability that was absent.
- **Server-executed edits** attach the existing content-write receipt envelope, so an
  edit made from a full-page chat is as traceable as one made in the sidebar — clickable
  affordance, effective destination named.
- **URL hygiene** is invisible by design (context-only), with one exception: when a
  canonical URL replaces a captured item's identity key, the quest ledger row records
  both, so a surprising dedup can be explained after the fact.
- **Deferred batch** (when built): the queue entry is the chip — approved scope, model,
  window, and current state visible while it waits, not just after it finishes.

## 11. Gates

`pnpm typecheck` → `pnpm lint` (175 ratchet) → `pnpm build`, plus `pnpm ai:drift:check`
for anything touching capability tables and `pnpm ai:matrix` regeneration if the enum
changes. New gate: `pnpm tracking:rules:check` (vendored snapshot parses; hash matches;
local additions do not duplicate an upstream rule) — **mutation-test it before trusting
it**, per standing practice. Browser smoke for the choice card and for a full-page-chat
targeted edit against a note open in another window (the concurrent-cursor case the
minimal-diff path is designed to survive).
