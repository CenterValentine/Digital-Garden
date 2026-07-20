# AI v3.1 — Chat UX Polish + Vendor Catch-up + Context Discipline (R1–R6)

Successor round to AI v3 core (shipped, PR #114 / merge `9f15281`;
plan: `AI-V3-CORE-PLAN.md`). Scope set by the owner 2026-07-18:
**mid-run review + freshness now**, plus the cost-effective vendor
catch-up (R4, owner addition); markdown source-view toggle excluded;
the conversation memory bank deferred to **AI V4** (see final section —
the design discussion is captured there so V4 starts warm).

Branch: continues on `worktree-ai-v3-core` (rides ahead with the backlog
consolidation commit `4461200` into the next PR).

## R1 — Mid-run review without leaving the run

The owner's "biggest disruption": reviewing a created artifact
mid-playbook navigates the main panel away and backtracks the chat.

- **Pane-primary review**: artifact cards (note/docx/workflow payload
  cards) gain right-click → "Open in pane" everywhere, using the existing
  workspace multi-pane infrastructure (`paneState`, `tabs_top_left`).
- **Non-displacing default during active runs**: while the conversation
  is streaming or parked on an approval, card default-click opens in the
  secondary pane (main-panel/full-page surfaces) or a peek overlay
  (sidebar surface, where panes don't fit; Esc returns). Outside active
  runs, default click keeps today's navigation behavior.
- Approval cards' preview (486544c) already covers pre-approval review;
  this session covers post-creation review.
- **Gate:** run a playbook phase, open the produced note mid-run, verify
  the chat never loses position/draft; approve the next checkpoint
  without re-scrolling.
- **BUILT (d84b710, 2026-07-18)** — `artifact-open.tsx` (split-pane open
  targeting the non-active pane, single→dual-vertical upgrade, pinned
  tab; portaled right-click menu) + NotePayloadCard wiring +
  ChatViewer's active-or-parked-on-approval detection. Peek overlay
  DESCOPED from v1: the sidebar chat already survives main-panel
  navigation, so pane-open covers both surfaces; revisit only if the
  sidebar smoke shows a need. **Gate pending owner smoke.**

## R2 — Freshness: stream-time refresh (file tree + canvas)

Root cause shared by both staleness reports: `dg:tree-refresh` /
`dg:notes-refresh` dispatch from the engine's `onFinish` — end of TURN.
A playbook turn runs minutes; mid-run artifacts stay invisible.

- Dispatch on **tool-output part arrival in the stream** (client-side, no
  polling): when a `__notePayload`-family output lands, fire
  `dg:tree-refresh` + `dg:content-updated` with the contentId then, not
  at turn end. Keep `onFinish` dispatch as the backstop; dedupe by
  toolCallId so a turn's refresh count stays bounded.
- **Canvas listener**: workflow builder subscribes to `dg:content-updated`
  for its own contentId → reload the graph. Guard unsaved local edits
  (dirty canvas → non-destructive banner "AI updated this workflow —
  reload / keep editing" instead of silent reload). This also closes the
  stale-canvas-overwrite hazard noted in the S6 `update_workflow` result.
- **Gate:** during a single multi-tool turn, created files appear in the
  tree as they're created; an AI `update_workflow` on an open canvas
  surfaces the banner and reloads cleanly when accepted.
- **BUILT (2026-07-18)** — engine stream-time effect (status-gated,
  module-level toolCallId dedupe shared with the onFinish backstop) +
  `dg:workflow-refresh` event + WorkflowBuilder listener with dirty-
  canvas banner. **Gate pending owner smoke** (batched with R1's).

## R3 — Model-selection stickiness (review-first, then fix)

Owner-reported flips: blank chats and delete-connection-without-
replacement lose the active selection. Review hypotheses before coding:
new conversations carry no provider/model stamp → picker falls back to
default-connection ordering; deleted connection leaves a dangling id that
resolves to the feature-route default.

- Direction (pending review confirming): **global last-explicit-pick
  seeds new chats; the per-conversation stamp wins on existing chats;
  an unservable pick renders an explicit unavailable state** — never
  silent substitution (straight-faced routing, v3 law).
- **Gate:** new chat opens on the last explicitly picked model; deleting
  its connection shows unavailable + remedies instead of flipping.
- **BUILT (6cd7d2d, 2026-07-18) — review confirmed the hypotheses plus a
  fossil**: explicit picks lived only in the non-persisted session store;
  the binding's no-stamp fallback flipped blank chats to the SETTINGS
  default; the hardcoded last-resort was the dead `claude-sonnet-3-5`
  (the v3 smokes' "sonnet 3.x" mystery — now `claude-sonnet-5`). No code
  ever auto-flipped on delete; that report was the same fallback after a
  reload. Fix: persisted `lastExplicit*` slice (partialized; survives
  reset), `{ explicit }` flag so only user picks write it, chain =
  stamp > last-explicit > settings. Unservable picks stay selected →
  MODEL_UNAVAILABLE remedies. **Gate pending batched owner smoke.**

## R4 — Cost-effective vendor catch-up: Moonshot (Kimi) + DeepSeek

Owner addition 2026-07-18: both vendors are renowned price-performers;
bring them to first-class status alongside the big four. Pulls the
"Kimi/Moonshot catch-up" backlog item into 3.1 and extends it to
DeepSeek.

- **BYOK connections**: direct-key adapters for Moonshot and DeepSeek.
  Both expose OpenAI-compatible APIs — prefer the official `@ai-sdk/deepseek`
  provider; Moonshot via the OpenAI-compatible adapter with a base-URL
  preset (verify whether an official provider package exists at build
  time). Connection editor presets so the owner isn't hand-typing base
  URLs.
- **Gateway parity**: `moonshotai/*` and `deepseek/*` ids already flow
  through the AI Gateway; verify executed-provider derivation (vendor
  prefix mapping) and Suggested-sort priors cover both (Moonshot priors
  exist; add DeepSeek family boosts).
- **Native search, straight-faced**: Kimi — wire Moonshot's builtin
  web-search tool into the `search_web` executed-provider switch (verify
  current API shape at build time). DeepSeek — NO native search exists:
  `search_web` must NOT attach (the prompt's search-awareness section
  gates off with it), and the model states the limitation plainly rather
  than silently borrowing another vendor's search. `read_page` works for
  both regardless.
- **Lessons-ledger pre-flight**: run the jobhunt-mini flagship on each
  (the 12-law ledger in `AI-V3-CORE-PLAN.md` is the checklist — expect
  vendor-specific quirks in tool_call strictness and retry-after
  headers, as with the big four).
- **Gate:** a playbook smoke passes on Kimi with cited native search;
  DeepSeek completes the same run with `read_page`-grounded research and
  an honest no-native-search notice; both selectable via BYOK connection
  AND gateway, with correct Suggested-sort placement.
- **BUILT (1241291, 2026-07-18) — with one verified scope change**: Kimi
  native search is NOT wirable through the current AI SDK path
  (Moonshot's `$web_search` is a `builtin_function` the OpenAI-compat
  adapter can't serialize; no official Moonshot provider package exists)
  — so BOTH vendors ship with straight-faced search_web non-attachment;
  Kimi's gate criterion downgrades to the DeepSeek criterion
  (read_page-grounded + honest notice). Follow-up if Kimi search
  matters: raw request-body injection. DeepSeek adapter pinned to
  @ai-sdk/deepseek ^2.0.50 (provider-spec-3 generation; ALL 3.x builds
  are spec-4 and reject this ai install — version majors are NOT aligned
  across the @ai-sdk family). Suggested-sort priors + family boosts for
  both already existed from v3. **Gate pending owner smoke** (BYOK keys
  needed for both vendors).

## R5 — Context-discipline near-term set (owner addition, minus JIT; re-cut 2026-07-19)

The "near" commitments approved with the v3 plan, now scheduled — EXCEPT
JIT retrieval (carved out to the V4 memory investigation) AND validated
compaction (carved out to R5b below — the build recon showed NO history
compaction exists to validate; that item is really "build compaction
with validation", a hot-path project that belongs beside V4's
artifact-compaction design, not under this gate). Build order is
measurement first:

- **Tokens-per-phase eval**: extend the S5 token meter into per-phase
  accounting (checkpoint boundaries delimit phases) — a small table per
  run in the debug panel + a line per phase in the Run Ledger. This is
  the yardstick the rest of the set is judged by.
- **Extraction subagents**: for oversized tool results (read_page near
  the 16k cap), a cheap-model sub-call extracts task-relevant facts
  before the result enters context; raw text never rides the main
  thread. Provider-agnostic via feature routing; falls back to today's
  truncation when no cheap route exists.
- **Cache-aware layout upgrades**: extend the byte-stable-prompt work
  (date-only stability shipped in v3) — audit section ordering, tool
  definition stability, and pruning placement so provider prompt caches
  hit across a session; verify with provider cache-hit metrics where
  exposed.
- **Gate:** a jobhunt-mini run shows per-phase token numbers; an
  oversized page read enters context as an extract; the system prompt's
  stable prefix survives a date rollover mid-session.

## R5b — Validated compaction (DEFERRED toward V4; split from R5 2026-07-19)

Recon finding: `compactToolOutputs` only strips provider-executed search
ciphertext — no message-history summarization exists. This item is
therefore net-new hot-path work: build history compaction WITH a
claim-check validation pass (failed validation keeps the originals).
Deliberately deferred beside the V4 memory investigation: message-layer
and artifact-layer compaction are the same generational machinery
applied to two layers — designing them together avoids building it
twice.

## R6 — Regen sweep: pre-fix degraded notes (owner addition)

Notes generated before the @tiptap/html server twins (4247ca9) hold
literal `##`/`**` markdown as plain paragraphs. Content is intact — the
degraded text IS the source markdown — so regeneration is lossless.

- One-off script in `scripts/` (not an auto-migration): conservative
  detection (AI-created NotePayloads whose tiptapJson is paragraph-only
  AND whose text matches markdown structure markers), **dry-run listing
  first**, then rewrite via the now-server-safe `markdownToTiptap` +
  refreshed `searchText`/metadata. Run Ledger notes regen perfectly from
  their stored `ledgerMarkdown` metadata regardless of heuristics.
- Collaboration caution: notes with live Y.js state must go through the
  content-safety path (or be skipped and reported) — never rewrite
  NotePayload under an active collab doc silently.
- **Gate:** dry-run report reviewed by owner; post-run, previously
  degraded notes render structured; a spot-checked unaffected note is
  byte-identical.

## Verification conventions

Per repo standard: `pnpm typecheck → lint → build`, plus in-app browser
smoke per session gate. Same-bundler local/CI parity rules apply.

## Deferred to AI V4 — conversation memory bank (owner decision 2026-07-18)

The v3.1 discussion, captured so V4 starts warm:

- **Owner idea**: persist AI outputs (search digests, cleaned verbatims)
  as referenced content UNDER the chat (`ownedByNoteId` children display,
  shipped with #114-era main) — a legible memory bank + paper trail the
  AI reads on demand instead of carrying in context.
- **Assessment**: converts compaction's pruning-LOSS into demand-paging
  ("the tree is the memory; context is a cache"); ~60% substrate exists
  (page-node hydration, Run Ledger note, abstracts-first, chunked reads,
  16k caps). Absorbs the "JIT retrieval" item from the near-term
  context-discipline set.
- **Settled design points** (from discussion): hybrid granularity (per-
  conversation append-only Findings note for search digests; standalone
  referenced nodes only above a verbatim size threshold; page reads keep
  existing page nodes). Scope boundary: chat-scoped memory nests under
  the chat; **Run Ledger stays folder-level** (A8 resumability — a fresh
  chat targeted at the folder must find it). Playbook run snapshots =
  good referenced artifacts. Provider citation blobs can't be
  reconstructed from cleaned copies — later turns cite by URL. Deleting
  a chat must soft-delete its owned artifacts (today's SetNull would
  orphan them into the folder).
- **Compression / scale (the deferral reason)**: nesting bounds
  visibility, not storage. Storage is manageable with generational
  compaction (raw findings → phase digests → run abstract; TTL/archival
  per artifact class; dedup). Per-turn cost scales with what is READ,
  not stored (abstracts-first + JIT). The true limiting factor at
  library scale is **retrieval precision** — lexical FTS (`searchText`)
  first, then embeddings or extraction-consolidation (mem0-class) —
  which deserves the full V4 investigation the owner wants: a scalable,
  time-resistant memory strategy.
- **V4 frame worth testing**: the garden IS the long-term store; the
  memory system is a consolidation policy — episodic chat-scoped
  artifacts (decay) periodically distilled into durable folder-level
  knowledge notes (persist). Consolidation could itself run as a Trellis
  workflow.
