---
title: Folder Context Capsule — folder mentions, context modes, and graduating AI context to content-graph infrastructure
status: draft (decisions locked 2026-08-06; pre-build)
last_updated: 2026-08-06
owner: centervalentine
branch: planned — `feat/ai-context-capsule` off origin/main (own branch; do not stack on other feature branches)
related:
  - extensions/studio/server/ (graduating substrate: context-dirty, context-refresh, metadata, gen-lock, context-spend, source-resolver)
  - lib/domain/ai-context/ (new home for the graduated substrate)
  - lib/domain/ai/features/registry.ts (studio-metadata route; new ai-context-enhanced route)
  - lib/domain/ai/tools/registry.ts (new read_folder_context tool)
  - components/content/ai/ChatInput.tsx (folder mention entry point)
  - extensions/studio/components/ContextTab.tsx (AI Context rail — relocating to core ownership)
  - prisma/schema.prisma (AgenticMetadata.contextOptOut → contextMode enum)
  - docs/notes-feature/work-tracking/FOLDER-STUDIO-PLAN.md (incubator plan; auto-context V1 addendum)
---

# Folder Context Capsule Plan

Let a prompt or playbook **mention a folder** and have the AI dynamically draw from it —
context-lean — instead of ingesting the subtree. The AI receives a **capsule** (purpose +
summary + machine-readable child index + signals) and navigates down the chain with tools,
reading only the files it needs. Built on the existing auto-context V1 self-healing engine
(dirty-bit cascade + output-hash damping + compositional roll-ups + packed batches +
deepest-first ordering); this plan adds no second staleness system.

Three coupled workstreams:

1. **Graduation** — the agentic-metadata substrate moves from `extensions/studio/server/`
   to `lib/domain/ai-context/`. It was incubated in Folder Studio ("the prototype for
   future autonomous metadata management" — its own plan) and now has consumers outside
   the extension (chat mentions, playbooks). Content-graph infrastructure, not a studio
   feature.
2. **Context modes** — a per-node, inheritable investment ladder
   (`optOut < reference < standard < enhanced`) replacing the `contextOptOut` boolean.
3. **The mention pipeline** — code-side freshness gate → capsule injection → navigation
   tools (`read_folder_context`), with chip-visible traceability.

---

## Decisions of record (locked 2026-08-06)

| # | Decision | Rationale / notes |
|---|----------|-------------------|
| D1 | **Graduation option A, 100%** — substrate code moves to `lib/domain/ai-context/`; studio becomes consumer + UX steward | Layer is per-ContentNode (files AND folders); second consumer outside the extension has arrived. Doing seam-now/graduate-later touches everything twice |
| D2 | **Code moves, identifiers don't** — keep `StudioContextSpend` table name, `studio-metadata` route id, `autoContextMode` settings location | Renames = migrations + settings churn for zero behavioral gain. Relocation is backlog |
| D3 | **Hybrid capsule assembly** — structure (ids, titles, types, existence) queried live from `ContentNode`; semantics (one-liners, summaries, signals) from cached `AgenticMetadata` | Never cache what's free to compute; never compute what's expensive to cache. Output-hash damping deliberately suppresses meaning-neutral changes (renames), so a *stored* child index would be systematically stale exactly where it must be exact |
| D4 | **Freshness gate is code-side, blocking, bounded** — the mention resolver (not the AI) checks coverage and refreshes before prompt assembly | User requirement: the model never has to decide whether to trust stale context |
| D5 | **Failure ladder**: (1) refresh OK → fresh capsule; (2) refresh fails / budget exceeded / spend ceiling → serve **stale, visibly flagged**, background retry (dirty bits make retry free); (3) no context exists at all → hard fail with retry affordance | Softened from "always fresh": stale-flagged beats blocking forever; hard-fail only when there is literally nothing to inject |
| D6 | **Context mode ladder** — single ordered enum `OPT_OUT < REFERENCE < STANDARD < ENHANCED`, not a mode + separate enhancement flag | Ordered investment levels; a separate flag creates unrepresentable-nonsense states (reference+enhanced). Current generation behavior == `STANDARD` (the economy tier); `ENHANCED` is additive |
| D7 | **Inheritance: nearest explicit ancestor wins; `OPT_OUT` is absolute downward** — descendants cannot opt back in under an opted-out ancestor | Lower-level overrides higher-level (user rule), except privacy trumps specificity |
| D8 | **Mode-change side effects**: upgrade → mark subtree dirty (signals generate on next access); downgrade from enhanced → **prune** stored signals | A stale gaps list nobody maintains is worse than none, and it rides into every capsule. ("Or something better if we come to it" — prune is the default) |
| D9 | **Per-mode model routing** — `STANDARD` and below share one model configuration (existing `studio-metadata` route); `ENHANCED` gets its own feature route (`ai-context-enhanced`) | Negative-space reasoning (gaps/misalignment) is the one task cheap models are weakest at; the enhanced route is the escalation lever. Reference-mode work is a strict subset of standard's, so no third knob |
| D10 | **Signals are enhanced-only** — gaps, misalignment (directives vs role-strategy vs contents), ambiguities generate only for `ENHANCED` nodes | Spend follows declared priority instead of being uniform. Disabled by default; enabled per-folder, inherited downstream |
| D11 | **UI = the AI Context rail, single mode selector** — user selects the mode and sees the context that mode produces (or disables). No toggles-per-feature. **Not mixed into Studio surfaces** | User decision. Rail relocates to core ownership (registered via the Tool Surfaces sidebar-tab registry, not the studio extension runtime) |
| D12 | **Tool phasing: walk first** — `read_folder_context` ships v1; `search_folder` (scoped probe) is backlog | Walk answers structure-shaped questions and is testable end-to-end with the smoke scenario |
| D13 | **Chips & traceability documented in every AI plan** (standing requirement, saved to memory) — live state machine + durable transcript trace | A labeled wait spends patience; a silent failure spends trust. See section below |
| D14 | **Fix stale model default**: `studio-metadata`'s `defaultSuggestion` is `claude-haiku-3-5` — retired 2026-02-19; must become `claude-haiku-4-5` | Day-one item; the mention gate will exercise this route constantly. Bug found during plan grounding |
| D15 | **Write-back loop** — ambiguities the AI resolves mid-run are proposed into the folder's `role-strategy` section via the existing `ai-proposed` → human-confirm machinery | Context that learns, not just describes. No new plumbing |
| D16 | **SWR semantics confirmed** — a gate refresh is durable and shared: first mention heals for every later consumer (same playbook run, other sessions). Concurrent calls single-flight via a **refresh mutex** (sweep B2 — note: gen-lock is the anti-feedback-loop rule, *not* a mutex) | Mentions become a demand-driven indexing schedule; the nightly sweep mops up what usage never touched |
| D17 | **Runtime frugality nudge** — the capsule preamble and `read_folder_context` description carry a single light-touch economy line (read what the request needs; budget reads with the index's token estimates). Prudence, not prohibition — no hard caps | Owner call 2026-08-06: one word like "frugal" saves tokens long-run; heavy instruction would harm the cases where depth is warranted |

---

## Architecture

### The capsule

What a folder mention injects, and what `read_folder_context(folderId)` returns:

1. **Purpose** — `directives` (human) + `role-strategy` (AI-inferred), with an explicit
   misalignment note when they disagree (enhanced mode)
2. **Summary** — existing roll-up prose (standard+)
3. **Child index** (projection, all modes ≥ reference) — one row per direct child:
   `{ id, title, kind, oneLiner, estTokens, coverage: fresh | stale | none }`.
   Opt-out children are silently absent. Structure live from `ContentNode`; `oneLiner`
   from the child's cached `AgenticMetadata`
4. **Signals** (enhanced only) — gaps, ambiguities, pending assumptions
5. **Resolved mode + freshness banner** — "mode: reference (inherited from Banks)";
   "generated <date> with <model>; N children stale" — so the AI's read policy is explicit

Generation-side addition: a dedicated **`oneLiner`** field in the generated-sections JSON
(alongside `summary`) so the index never crudely truncates prose. JSON-level change, not
a Prisma column.

### Context mode ladder

| Mode | Generates | Refresh cost | AI read policy |
|---|---|---|---|
| `OPT_OUT` | Nothing | Zero | Invisible (absolute for subtree) |
| `REFERENCE` | Index + one-liners | Leaf batches only; no roll-ups; no cascade participation above lite | "Draw from; don't audit" (banks, exemplar archives) |
| `STANDARD` (default) | + summary, structure, roll-ups | Today's engine behavior — the economy tier | "Understand as a system" |
| `ENHANCED` | + signals | Adds the negative-space pass, on its own model route | "Understand and audit" |

- Stored as **nullable** `contextMode` on `AgenticMetadata`: `null` = inherit.
- Resolution: nearest explicit ancestor wins (reuse the recursive-CTE ancestor walk from
  `markContextDirty`); no ancestor → `STANDARD`. `OPT_OUT` wins over any descendant setting.
- A parent's roll-up consumes a reference child's *index + one-liners* — the portfolio
  still "knows" what's in the bank without paying to understand it.

### Freshness gate (mention resolution, server-side, pre-prompt-assembly)

1. Resolve folder id → resolved mode. `OPT_OUT` → mention degrades to name-only.
2. Coverage query: folder row + direct children rows — missing (`uncovered`) or `contextDirty`?
3. Scoped refresh: engine invoked for folder + direct children only (packed batches →
   typically 1–3 LLM calls), depth per resolved mode (reference = leaf one-liners only,
   fastest). Model via Feature Routing per D9. Single-flight via a per-(owner, folder)
   Postgres advisory lock (sweep B2); a losing caller polls coverage until the budget
   expires, then follows the failure ladder.
4. Bounded block (~3–5s budget): finish → fresh capsule. Budget expires / provider fails /
   spend ceiling → **failure ladder D5** (stale-flagged, or hard-fail if nothing exists).
5. Each `read_folder_context` descent runs the same depth-1 gate for its own level —
   coverage materializes lazily along the paths the AI actually walks.

The gate is a new *access site* for the existing stale-while-revalidate machinery — not
new machinery. The bounded budget also self-protects against slow reasoning models routed
here by a user: worst case is stale-served + background completion, never a hung chat.

### Navigation model

- **Walk**: `read_folder_context(folderId)` → capsule for any folder (drill-down).
  Registered in `lib/domain/ai/tools/registry.ts`, importing from `lib/domain/ai-context/`
  (post-graduation this is an ordinary domain import — no extension-boundary seam needed).
- **Read**: existing `read_note` for leaves. Index token estimates let the model budget.
- **Probe** (`search_folder`) — backlog.
- Progressive disclosure mirrors the T3 playbook pattern: mention injects a little;
  every deeper look is a visible tool call.
- **Frugality (D17)**: capsule preamble + tool description include one economy sentence —
  e.g. *"Be frugal: read only what this request needs, using the index's token estimates
  to budget."* Deliberately a sentence, not a protocol.

---

## Schema changes

One migration (full DATABASE-CHANGE-CHECKLIST applies; migration-bearing PR ships the
owner-reviewable script per convention):

```prisma
enum ContextMode {
  OPT_OUT
  REFERENCE
  STANDARD
  ENHANCED
}

model AgenticMetadata {
  // contextOptOut Boolean  ← REMOVED (backfilled into contextMode)
  contextMode ContextMode?   // null = inherit from nearest ancestor; root default STANDARD
}
```

Backfill: `contextOptOut = true` → explicit `OPT_OUT`; `false` → `null` (inherit).
All `contextOptOut` call sites (dirty marking, refresh eligibility, source selection,
roll-up inputs, capsule assembly) move to resolved-mode checks. No TipTap schema change,
no collab registration, no Hocuspocus redeploy (AgenticMetadata is deliberately
non-collaborative).

---

## Graduation map (Phase 0 — pure relocation, zero behavior change)

| Moves to `lib/domain/ai-context/` | Stays in `extensions/studio/` |
|---|---|
| `context-dirty.ts` (dirty-bit cascade) | Studio tools, shelves, runs, invocable |
| `context-refresh.ts` (refresh engine) | Source selection UI + `SourcePicker` |
| `metadata.ts` (sections, assembly, hashes) | Settings page (`autoContextMode` stays here — D2) |
| `gen-lock.ts`, `context-spend.ts` | Studio chat + generation surfaces |
| `source-resolver.ts` | `AiContextBanner` / toggle (updated to mode selector, relocating with the rail — Phase 3) |
| *(new)* `capsule.ts`, `mode-resolve.ts`, `gate.ts` | |

Rules: identifiers stay (D2); studio imports from the domain like any consumer; the
domain layer reads `autoContextMode` through the settings store (documented wrinkle;
relocation is backlog). Gate for the phase: typecheck + lint + build green with **no
behavioral diff** — moves and import updates only, plus D14 (route default fix).

Consequence worth stating: AI context is **core infrastructure** after graduation — it no
longer disappears if the studio extension is disabled. Its governance is `contextMode`
(users can set any subtree to Disabled) plus the existing auto-context settings.

---

## Feature routes

| Route | Serves | Default suggestion | Notes |
|---|---|---|---|
| `studio-metadata` (existing id, kept per D2) | `STANDARD` and below generation | `claude-haiku-4-5` (**fix from retired `claude-haiku-3-5`** — D14) | `preferredCapabilities: ["low-cost"]` already declared |
| `ai-context-enhanced` (new) | `ENHANCED` signals generation | mid-tier low-cost (e.g. Haiku-class to start; user-routable higher) | The escalation lever if smoke shows weak gap detection |

Both BYOK-routable across the full provider spectrum already templated (Anthropic, OpenAI,
Google, xAI, Mistral, DeepSeek, Moonshot, Groq, Fireworks, Together, OpenRouter, Vercel
Gateway). Verify current model ids/prices via the catalog-freshness system at build time —
do not hardcode. Fallback chain via `executeWithFallback` so one provider's rate limit
doesn't stall a mention. Rate-limit posture: packed batches (~10× call reduction), depth-1
gate bound, per-invocation caps, refresh-mutex single-flight (B2), honor provider
`retry-after`.

---

## Chips & traceability (required section — standing rule for all AI plans)

**Live chip state machine** (mention chip in ChatInput / transcript; precedent:
`TargetFolderChip`):

```
○ checking            coverage query running
◐ updating (4/9 · Haiku 4.5)   gate refreshing; count + model visible
● fresh               steady state, quiet
◍ stale-served ⚠      failure ladder rung 2 — served stale, background retry running
✗ failed [retry]      failure ladder rung 3 — nothing to inject
```

Click-to-expand: nodes refreshed, resolved mode, model used, token spend (from the spend
ledger).

**Durable trace**: one system-style transcript line per gate action, surviving after the
chip settles — e.g. `Context refreshed: 7 nodes · Haiku 4.5 · 3.2k tokens` or
`Served stale context (provider timeout) — refresh completing in background`. Extends the
existing write-receipt transcript pattern; do not invent a new annotation channel.

---

## UI: the AI Context rail (Phase 3)

- The Context tab relocates from studio-extension registration to a **core sidebar tab**
  via the Tool Surfaces registry (`sidebar-tab` surface), alongside backlinks/outline/tags.
- **One control: the mode selector** — `Disabled / Reference / Standard / Enhanced`, plus
  the inherited state rendered as "Inherited → Standard (from Career Portfolio)". Selecting
  a mode shows the context that mode produces for the current node; no per-feature toggles.
- Enhanced view renders signals; reference view renders the index; disabled explains the
  subtree shield. `ai-proposed` role-strategy diffs (write-back, D15) surface here for
  confirmation.
- File-tree context-menu quick-set: backlog.

---

## Phases

Each phase is a shippable PR with gates (`pnpm typecheck` → `lint` → `build` + browser
smoke; sprint-format PR body with checkable preflight).

- **Phase 0 — Graduation + route fix.** File moves per the map; import updates; D14
  default fix. Gate: all green, zero behavioral diff, studio surfaces still work.
- **Phase 1 — Context mode ladder.** Migration (enum + backfill + handoff script;
  **expand/contract per B4** — `contextOptOut` survives this release, drops in a later
  cleanup migration); `mode-resolve.ts` (ancestor walk, OPT_OUT absoluteness); engine
  honors modes (reference = leaf-lite, no roll-up; opt-out excluded); mode-change side
  effects (dirty-on-upgrade, prune-on-downgrade) **in one `$transaction` per B3**.
  Gate: migration drift green; existing behavior unchanged for untouched nodes.
- **Phase 2 — Capsule + signals + routes + write hardening.** `oneLiner` in generation
  schema; `capsule.ts` (hybrid projection); `signals` section (enhanced-only) with
  directive-steered generation (misalignment: directives vs role-strategy vs contents);
  `ai-context-enhanced` route + settings cross-link with **fallback-to-standard per B6**.
  **Write hardening: conditional dirty-clear (B1), refresh mutex (B2), write-time mode
  re-check (B8).** Gate: capsule renders correctly for a seeded tree in all four modes;
  a concurrent-refresh test exercises B1/B2.
- **Phase 3 — AI Context rail.** Core sidebar tab; mode selector + per-mode views;
  role-strategy proposal confirmation. Gate: browser smoke — set modes across the smoke
  tree from the rail alone. (Before Phase 4 so the smoke scenario can be configured.)
- **Phase 4 — Mention gate + chat.** Folder mention in ChatInput; **two-stage gate per
  B5** (client pre-flight on mention insert drives the chip; server enforcement re-check
  at send is authoritative); failure ladder; chip state machine + durable trace; capsule
  injection into prompt assembly (with the D17 frugality line). Gate: chips & traceability
  behave per spec, including forced-failure paths and the send-before-preflight-finishes
  race.
- **Phase 5 — `read_folder_context` + playbooks.** Tool registration; per-descent gating;
  playbook mention support. Gate: the acceptance smoke below.

---

## Acceptance smoke test (the portfolio scenario)

Seed: `Career Portfolio` (**enhanced**) → `Experience` (8 job notes), `Certifications`,
`Projects`, `References`, `Banks` (**reference**) → `Bullet Bank`, `Completed Resumes`;
plus a `Private Notes` (**disabled**) folder. Directive on the root: *"Canonical record of
my professional history. Every claim should link to evidence. Flag gaps."*

Assert:

1. **First mention** (never indexed): chip walks `checking → updating (n/m · model) →
   fresh`; bounded wait; answer cites actual contents. Durable trace line present.
2. **Context-lean navigation**: "Draft a resume for {job} using @Career Portfolio" reads
   ≤ ~3 primary files out of the tree; walks into Experience/Projects; skips References.
3. **Signals**: the capsule surfaces a seeded evidence gap (e.g. a claim with no artifact)
   and it appears in the deliverable.
4. **Reference policy**: bullets are drawn from Bullet Bank but never cited as evidence;
   Banks cost no roll-up generation (verify via spend ledger).
5. **Privacy**: nothing from `Private Notes` appears in any capsule, index, or answer.
6. **Failure ladder**: with the provider forced to fail — warm folder serves stale with
   `◍ ⚠` chip + trace line; cold folder hard-fails with retry.
7. **SWR/double-call**: a playbook mentioning the folder twice spends LLM tokens on the
   first gate only (ledger delta ≈ 0 on the second).
8. **Write-back**: a resolved ambiguity produces an `ai-proposed` role-strategy diff
   visible in the rail.

---

## Pre-build bug sweep (2026-08-06)

Findings from a code-grounded pass over the seams before build; each carries its
prescription and owning phase. The unifying rule for B1/B3/B8: **revalidate preconditions
at write time, not read time** — same discipline as the save-conflict `bodyHash` and
wiki-link id-first resolution.

| # | Seam | Bug class | Prescription | Phase |
|---|------|-----------|--------------|-------|
| B1 | `applyGeneratedSections` writes `contextDirty: false` unconditionally (metadata.ts ~L515) | Lost update: edit lands during the LLM call; clear erases its dirty signal → stale context unnoticed until the *next* edit | Capture `ContentNode.updatedAt` at read; final write sets `contextDirty: liveUpdatedAt > readUpdatedAt` (sections still write) | 2 |
| B2 | No cross-instance refresh mutex (gen-lock is the anti-feedback-loop rule, not a lock; an in-process `inFlight` set covers same-instance overlap) | Concurrent gates (two tabs; mention + on-access + cron) double-spend on the same scope | **Claim-stamp CAS**: `AgenticMetadata.refreshClaimedAt` on the scope root — conditional `updateMany` claims it (null or expired), cleared on completion. (Session advisory locks are unsafe through connection pooling — `$queryRaw` calls may run on different pooled connections, leaking the lock.) Loser polls coverage until budget expiry | 1 (column) / 2 (logic) |
| B3 | `setOptOut` upsert-then-update is two statements (metadata.ts ~L291-302) | Concurrent dirty-mark between statements sees default flags | Mode writes + side effects (dirty-on-upgrade, prune) in one `$transaction` | 1 |
| B4 | Migration drops `contextOptOut` in the same release that adds `contextMode` | Prod deploy-order break: `migrate deploy` is manual, Vercel deploy separate; old code crashes on missing column | Expand/contract: add + backfill now (read new, write both); drop the column in a later cleanup migration | 1 |
| B5 | Gate inside the chat POST has no channel to animate the chip | Frozen send; also adds dead-time ahead of the 3.3 resumable-stream start | Two-stage gate: client pre-flight on mention *insert* (chip animates pre-send; settle-then-associate precedent), server re-check at send (authoritative, idempotent) | 4 |
| B6 | `resolvePrimaryRoute(ai-context-enhanced)` returns null when unconfigured | Enhanced folders silently never get signals | Fall back to the standard route's model + surface "configure enhanced route" in the rail; never silently skip | 2 |
| B7 | Spend-ceiling check is TOCTOU across concurrent gates | Bounded overshoot (one capped batch each) | Accept & document; B2 covers the same-folder case, per-invocation caps bound the rest | — |
| B8 | Downgrade prunes signals while an enhanced generation is in flight | Late write re-adds pruned signals | Write-time resolved-mode re-check before writing the signals section (same rule as B1) | 2 |

## Risks

- **Cheap-model signal quality** — the one genuinely hard task (negative space) is
  isolated behind `ENHANCED` + its own route; escalation = route to a stronger model.
  Smoke assertion 3 is the eval.
- **Graduation regression** — mitigated by pure-move discipline + zero-behavior-diff gate.
- **Migration** — full checklist + owner handoff script; enum backfill is mechanical.
- **Gate latency tail** — bounded budget + stale-serve ladder; slow models degrade, never hang.
- **Settings wrinkle** — domain reads `autoContextMode` from studio's settings key (D2);
  acceptable short-term coupling, relocation backlogged.

## Backlog (deliberate deferrals)

- **Recent-activity projection** — free (from `updatedAt`); valuable "what the user is up
  to" context. Deferred by owner decision.
- **Glossary section** — promote when the AI demonstrably fumbles folder-local vocabulary.
- **Conventions/patterns section** — promote when creation-tasks need it; interim home is
  `directives` prose.
- **`search_folder`** (scoped probe tool).
- **Latency-class warning** in Feature Routing settings UI (reasoning model selected for a
  background-frequency route).
- **Settings relocation** (`autoContextMode` → core AI settings) + spend table/route-id
  renames, if ever worth a migration.
- **File-tree context-menu quick-set** for modes; cross-folder `relations` section.
