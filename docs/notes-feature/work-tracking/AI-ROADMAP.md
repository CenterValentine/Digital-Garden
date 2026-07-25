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

## Planned (owner-ordered 2026-07-25)

### 3.5 — Registry-authoritative models  ← NEXT
Stop pre-installing model lists. On connection install (with a valid key),
auto-fetch the model list from the provider registry; templates carry only
provider metadata (endpoint, adapter, key hint). Plus a **monthly
model-category cron** (realtime / audio / image / reasoning / …) — the one
locally-maintained piece of model metadata the provider `/models` payload
doesn't reliably give us. Extends 3.4's catalog-drift safety net
([MODEL-CATALOG-FRESHNESS.md](../guides/ai/MODEL-CATALOG-FRESHNESS.md)).

### 3.6 — Playbook completeness
The T3 deferrals as one release: SKILL.md import adapter · "unmark playbook"
affordance · upgrade the playbook renderer (`playbooks/render.ts`) from its
scoped temporary renderer to the **lossless T2 serializer** (the "revisit once
T2 lands" note — T2 has landed).

### 3.7 — Resource governance
The **enforcement** half of agentic discipline (we shipped the observability —
token meter, Run Ledger, `phase_checkpoint` — not the enforcement). From
[AGENTIC-RESOURCE-DISCIPLINE.md](../guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md)
§4, the ⏳-marked rows: enforced token/step budgets (decrement + **stop**),
self-critique / no-progress loop guards, sub-agent isolation for sub-playbooks,
difficulty-based effort allocation. **Naming note:** this is the "T4 resource
governance" from the resource-discipline doc — NOT the v3.2 "T4" (resumable
streams, shipped as 3.3). Its per-run compaction sub-item stays backlogged with
R5b (same machinery).

### ~3.8 — Chat control panel + chat-surface fixes  (right before T6)
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
