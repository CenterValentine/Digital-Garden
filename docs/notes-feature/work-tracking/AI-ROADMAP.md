# AI 3.x Roadmap

Version-parity convention: each significant AI feature ships as its own point
release; docs/polish ride along as chores. This is the successor to the
pre-parity milestone sets (v3.1 "R1–R6", v3.2 "Six Unbuilt T1–T6"), rescoped by
the owner 2026-07-25 after AI 3.4 merged.

## Shipped

| Release | What | PR |
|---|---|---|
| 3.1 | R1–R6: mid-run review, stream-time freshness, model stickiness, Kimi/DeepSeek, context-discipline, regen sweep | — |
| 3.2 | T1 markdown-seam hardening · T2 source-view toggle | #125 |
| 3.2 | T3 playbooks (progressive disclosure) | #126 |
| 3.2 | T5 chat-title fallback | #127 |
| 3.2.2 | Prompt-cache foundation | #129 |
| 3.3 | T4 resumable streams (live re-attach) | #130 |
| 3.4 | Playbook-orchestrated model routing + catalog-drift safety net | #132 |
| 3.5 | Registry-authoritative model population (auto-fetch on install) | #133 |

**3.5 deferral (owner: "we can back log that"):** the **monthly model-category
cron** (realtime / audio / image / reasoning / …). Categories are inferred at
runtime today via `inferCapabilities` (id patterns); a periodically-refreshed
authoritative category map is an enhancement, not a blocker.

## Planned (owner-ordered 2026-07-25)

### 3.6 — Playbook completeness  ← SHIPPED (verified on main 2026-09-04: `charters/render.ts` carries the v3.6 lossless upgrade, DELETE unmark route live; the pre-PR branch was folded in and no longer exists)
Scope correction from the original T3-deferral list: the **SKILL.md import
adapter already shipped with T3** (`playbooks/import/skill-md.ts` +
`ImportSkillDialog`) and is **already lossless on the way in** — `markdownToTiptap`
was rewired to `markdownToTiptapRich` in T2. So 3.6 reduced to two real items:

- **Lossless phase rendering (headline).** `playbooks/render.ts` no longer
  hand-rolls plain text (which garbled tables into a cell-dump, dropped link
  URLs, and dropped callout framing). `renderPlaybookSection(nodes, extensions)`
  now runs the section through the **T2 self-verifying serializer**
  (`markdown-serialize.ts`), so tables, callouts (`> [!note]`), links, and nested
  marks reach the model intact. `[[wiki-links]]` are preserved via a ⟦⟧ sentinel
  pre-pass (they'd otherwise serialize as raw `<span>` HTML). The old plain
  renderer is kept as `renderPlaybookSectionPlain` for directive-scanning
  (`output-directives.ts`) and as the serializer-failure fallback. Extensions are
  injected (module stays `extensions-server`-free / tsx-safe); the chat route
  passes `getServerExtensions()` into all 5 call sites.
- **Playbook lifecycle moved to the file tree.** Mark / Edit-description /
  Unmark now live in the **file-tree context menu** (removed from the editor
  menu). It's **state-aware** — the tree API already ships `notePayload.metadata`
  on each node, so the menu shows "Mark as Playbook…" vs "Edit Playbook
  Description…" + "Unmark Playbook" per the node's real state. Available for any
  note-bearing content (note or folder with a Notes payload). A **playbook badge**
  (a `BookMarked` corner glyph, same formatting as the referenced-content link
  badge) marks playbook files in the tree at a glance. The description is edited
  in a **centered modal** (`PlaybookDescriptionDialog`) — the playbook name is the
  file name; only the one-line description is editable — replacing the old inline
  menu input that grew the context menu past the viewport. Server: `DELETE
  /api/content/playbooks/mark?contentId=…` + `stripPlaybookMetadata` (idempotent,
  preserves other metadata); mark/edit reuse the idempotent POST upsert.

### 3.7 — Resource governance  ← LARGELY SUPERSEDED BY JUDGMENT (2026-09-04)
**The enforcement centerpiece (token/step caps, decrement + stop) was
deliberately NOT built** — owner + judgment recorded in
EXTRACTION-TO-DATABASE-PLAN §9.2: the existing item caps / batch checkpoints /
step caps ARE the graceful budgets, and §9.1's production measurements show
them working. Remaining rows re-scoped: sub-agent isolation → rides the P6
deferred-batch runner (structurally free there); loop guards + effort
allocation → revisit only if real usage produces the failure mode. Build
token caps only if a runaway appears that the existing caps miss.
The **enforcement** half of agentic discipline (we shipped the observability —
token meter, Run Ledger, `phase_checkpoint` — not the enforcement). From
[AGENTIC-RESOURCE-DISCIPLINE.md](../guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md)
§4, the ⏳-marked rows: enforced token/step budgets (decrement + **stop**),
self-critique / no-progress loop guards, sub-agent isolation for sub-playbooks,
difficulty-based effort allocation. **Naming note:** this is the "T4 resource
governance" from the resource-discipline doc — NOT the v3.2 "T4" (resumable
streams, shipped as 3.3). Its per-run compaction sub-item stays backlogged with
R5b (same machinery).

### ~3.8 — Chat control panel + chat-surface fixes  ← BUILT (2026-09-04, branch `feat/ai-v38-control-panel`: ChatControlPanel hosts file-target/output-target/model-pin/context with labels, Feather context icon, rail condensed to the model picker; deriveTargetSeed single-sources the inherited-target chip across ChatPanel/ChatViewer so expand is loss-less)
Two sprints, one milestone:
- **Control panel** — one panel hosting the file-target, output-target, and
  pin-model affordances **with real labels** (the footer rail has no room
  today), plus a home for future chat-specific calibrations. Move the context
  affordance into the panel and give context a new **writing-themed icon**.
  Style around the existing chat/app design system. Supersedes the
  "condense the rail" backlog item.
- **Fix sprint** — expand-to-full-view drops inherited target/context chips
  (`ChatPanel` derives an inherited target; `ChatViewer` re-fetches and never
  re-derives). Single-source the two chips across both surfaces so expand is
  loss-less.

### T6 — Acquisition explainer  (LAST)
Architecture walkthrough doc of the Acquisition Service (envelope, policy
engine, native search, server-fetch/read_page, garden hydration, app-executed
BYOK search). A doc + walkthrough, not a versioned build.

## Out of the 3.x line

- **R5b — validated compaction** → **permanent backlog.** History compaction
  with a validation gate; folds into V4 (same generational machinery).
- **V4 — next-gen.** Conversation memory bank + JIT retrieval; the garden as a
  demand-paged long-term store. See `AI-V3.1-PLAN.md` "Deferred to AI V4".
