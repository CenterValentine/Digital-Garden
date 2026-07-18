# AI v3.1 — Chat UX Polish (mid-run review, freshness, stickiness)

Successor round to AI v3 core (shipped, PR #114 / merge `9f15281`;
plan: `AI-V3-CORE-PLAN.md`). Scope set by the owner 2026-07-18:
**mid-run review + freshness now**; markdown source-view toggle excluded;
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
