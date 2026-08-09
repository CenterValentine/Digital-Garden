# AI Run Inspector — Plan

**Branch:** `AI-sys-improve/inspector`, **stacked on `feat/ai-harness-reliability`** (owner decision 2026-08-08; same base as `AI-sys-improve/self-describing-turns`). Merge order: reliability first, then this branch and self-describing-turns in either order.
**Worktree:** `.claude/worktrees/ai-sys-inspector`

## Goal

One admin surface that turns "what happened in this AI run?" from production-DB archaeology into a click. Read-only. Motivating case: the DeepSeek "Scraping and Processing Job Listings" failure took an hour of psql + scripts to diagnose — two silent output-cap deaths, metadata frozen at request #1 (`"tool-calls"`, 659 tokens) while the terminal request died at `length`, and (in the gpt-4o sibling run) fabricated sequential URLs recorded as 10 garbage verdicts. Every piece of evidence was already in `ConversationMessage.parts`; nothing surfaced it.

## What the reliability base already provides (and this plan builds on)

- **Terminal-turn metadata** — `mergeTurnUsageMetadata` in `lib/domain/ai/use-conversation-binding.ts` now persists usage summed across every HTTP request of a turn (`inputTokens`, `outputTokens`, `totalTokens`, `reasoningTokens`, `cachedInputTokens`), summed `durationMs`, `requestCount`, and the TERMINAL `finishReason`. **Historical rows keep the old first-request-frozen shape** — `requestCount` absent is the discriminator.
- **Anomaly chips** — `components/content/ai/AnomalyChips.tsx` ships `deriveMessageAnomalies(parts, metadata, hasVisibleText)` with kinds `output-limit | tool-error | tool-failure | captcha`. Derivation over durable data, by design.
- **Batch iteration** — `record_batch_checkpoint` tool parts now appear in iteration runs; the step timeline should render them as checkpoint markers.

## Architecture principle: read-side only, derivation-first

- The inspector **derives** diagnostics from `ConversationMessage.parts` + `metadata`. It works retroactively on every historical conversation and handles **both metadata generations** (legacy first-request-frozen vs. new summed/terminal).
- **One anomaly taxonomy, not two.** `deriveMessageAnomalies` is extracted out of the `"use client"` chips file into a pure shared module — `lib/domain/ai/anomalies.ts` — that `AnomalyChips.tsx` re-imports and the inspector's analyzer extends with inspector-only detectors. Chips stay the compact end-user view; the inspector is the deep view over the same catalog. (This is the taxonomy-sharing goal from the original plan, inverted: chips landed first, so the inspector adopts their vocabulary.)
- **Zero writes.** No changes to the chat route, conversation persistence, engine, or binding — `use-conversation-binding.ts` is the self-describing-turns branch's declared seam and is strictly hands-off here.

## Components

### 1. Analyzer — `lib/domain/ai/run-inspector/` (pure domain logic, no Prisma)

- `types.ts` — `ConversationDiagnostics`, `TurnDiagnostics`, `StepDiagnostics`; findings reuse the shared anomaly types from `lib/domain/ai/anomalies.ts`, adding `source: "derived" | "recorded"` and `evidence` (part index / metadata key).
- `analyze.ts` — `analyzeTurn(message)`, `analyzeConversation(conversation, messages)`. Splits parts on `step-start`; aggregates per-step reasoning/text sizes, tool calls with states; reads usage per the metadata generation (real `reasoningTokens` on new rows, estimated from part sizes on legacy rows).
- `segments.ts` — infers HTTP request boundaries (a step ending in client-executed tool calls ends a server request). Labeled inferred; when self-describing-turns lands recorded segment records on the accumulator seam, a post-merge follow-up prefers them.
- `anomalies.ts` (inspector-side detectors, extending the shared base catalog):

| Code | Signal |
|---|---|
| *(shared)* `output-limit`, `tool-error`, `tool-failure`, `captcha` | as derived by the shared module today |
| `silent-turn` | assistant turn with zero visible text parts |
| `unexecuted-tool-call` | tool part still `input-available` at turn end |
| `approval-denied` | `output-denied` state |
| `step-cap-suspect` | step count hits a known cap (7 / 8 / research- or iteration-budget formula) — "suspected" until caps are recorded |
| `stalled-auto-continue` | terminal step is all settled client browser-read tools yet the turn ended (resume predicate should have fired) |
| `legacy-metadata` | `requestCount` absent — pre-reliability row; usage/finishReason unreliable (first-request-frozen). Downgrades confidence of metadata-based findings on that turn |
| `metadata-mismatch` | on NEW-format rows: recorded usage inconsistent with parts volume — validates the accumulator (and later the self-describing recorder) |

### 2. Admin API — `app/api/admin/ai-runs/`

- `route.ts` — GET list. Pagination (25/page), filters: provider, model, since, has-anomaly. Summary rows: id, title, updatedAt, turn count, models used, token totals (marking legacy-metadata turns), anomaly counts by severity. Analysis computed on demand for the fetched page only; no precompute/caching in MVP.
- `[conversationId]/route.ts` — GET detail: analyzed turns + raw parts passthrough for the JSON viewer.
- Conventions per existing admin routes: `requireRole("owner")`, `logAuditAction`, `handleApiError`, `{ success, data }` envelope. Types in `lib/domain/ai/run-inspector/api-types.ts` (not in `lib/domain/admin/api-types.ts` — keeps shared-file footprint minimal).

### 3. UI — `app/(authenticated)/admin/ai-runs/`

- `page.tsx` — list: table with health badges + filters, click-through. Client component fetching the admin API (audit-logs page is the template); Glass tokens; light + dark.
- `[conversationId]/page.tsx` — detail:
  - Header: title, owner, model route (+ resolution source), turn/request/token totals (with `reasoningTokens` where recorded), association links (e.g. the rooted playbook note).
  - Per-turn cards: user text preview; assistant turns render a **step timeline** — reasoning-size bar, text preview, tool chips colored by state, `record_batch_checkpoint` markers, inferred request-segment boundaries, per-turn usage.
  - Anomaly banners (shared chip styling vocabulary, expanded detail) with evidence pointer to the exact part.
  - Collapsible **raw parts JSON** per part + copy-id buttons — the feature that replaces psql.
- Shared components in `components/admin/ai-runs/`.
- Nav: one entry appended in `components/admin/AdminSidebar.tsx`.

### 4. Verification — house-style check script (no new deps; repo has no unit-test runner)

- `scripts/validate-run-inspector.ts` + `pnpm inspector:check`: runs the analyzer over committed fixtures, asserts expected findings.
- Fixtures distilled from the two real production failure transcripts already pulled (trim page-content bodies, keep structure): length-death turn, legacy-metadata turn, denied-approval turn, fabricated-URL iteration turn, plus a synthesized new-format healthy turn and a new-format truncated turn.
- The extraction of `deriveMessageAnomalies` must keep `AnomalyChips.tsx` behavior identical — covered by the same fixtures.

## Files touched that pre-exist on the base (conflict surface)

1. `components/admin/AdminSidebar.tsx` — one nav item.
2. `components/content/ai/AnomalyChips.tsx` — extraction refactor: derivation function + types move to `lib/domain/ai/anomalies.ts`, component re-imports. Coordinate if the reliability thread keeps iterating on chips.

Everything else is new files. Strictly untouched: `app/api/ai/chat/route.ts`, `lib/features/conversations/service.ts`, `lib/domain/ai/use-conversation-engine.ts`, `lib/domain/ai/use-conversation-binding.ts` (self-describing-turns' seam).

## Out of scope

- Dollar costs — item 4 (cost metering) owns price tables; inspector shows tokens now, gains a $ column after.
- Changes to chip UX or new chip kinds in the chat surface (this branch only relocates the derivation function verbatim).
- Recorded segment-records reader — post-merge follow-up once self-describing-turns lands its metadata shape.
- Any mutation of conversations; any schema change (none → no migration).

## Implementation slices

1. **S1 — Shared-module extraction + analyzer + fixtures + `inspector:check`** (pure logic)
2. **S2 — Admin API** (list + detail)
3. **S3 — Detail page** (the core surface)
4. **S4 — List page + filters + sidebar nav entry**
5. **S5 — Polish**: audit logging, raw-JSON viewer ergonomics, STATUS.md/BACKLOG.md updates in the PR

Gates: `pnpm typecheck` → `pnpm lint` (ratchet, zero new warnings) → `pnpm build` → browser smoke of both pages in light + dark. PR must note its base is `feat/ai-harness-reliability`, not main.
