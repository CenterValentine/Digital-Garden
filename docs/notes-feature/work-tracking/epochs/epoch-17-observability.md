---
epoch: 17
title: Observability Cleanup — Logs, Traces, Payload Sidecars
status: shipped_in_branch
started: 2026-05-15
completed: 2026-05-17
last_updated: 2026-05-17
worktree: /Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/observability-cleanup
branch: worktree-observability-cleanup
integration_branch: feature/observability-and-publishing
detailed_plan: ../OBSERVABILITY-CLEANUP-PLAN.md
charter: ../FRONTEND-LOG-CHARTER.md
audit: ../PII-AUDIT-2026-05.md
---

# Epoch 17: Observability Cleanup

## Objective

Replace ~600+ ad-hoc `console.*` call sites with a structured logger built around closed-set `Layer`/`Marker` enums, scalar-only `Attrs` (PII firewall by type), and per-request span traces via `AsyncLocalStorage`. Produce three coordinated layers — logs, traces, payload sidecars — and lock the gains in with `no-console=error` ESLint enforcement.

This epoch is the prerequisite for the [Epoch 15](epoch-15-publishing.md) publishing system being brought up to the same standard before its PR lands. See [`epoch-15-17-integration.md`](epoch-15-17-integration.md) for the merge + harmonization plan.

## Architecture

Three layers, all coordinated by a single `trace_id`:

| Layer | Where | Format |
|---|---|---|
| **Logs** | `process.stdout` (pretty in dev, JSON in prod) | One line per event, `<layer>:<noun>:<state>` event names, scalar-only `attrs` |
| **Traces** | `AsyncLocalStorage`-backed span stack, root span per route via `withRouteTrace` | Indented in dev; end-of-trace summary block flushes when root span closes |
| **Payload sidecars** | `.local/debug-payloads/<trace_id>.jsonl` (dev only) | One JSONL line per `spanPayload(span, label, value)` call; bulk data lives off the log stream |

**Closed enums (the logger's vocabulary):**
- `Level = "debug" | "info" | "warn" | "error" | "fatal"`
- `ServerLayer` — 13 values: `route | auth | tree | content | editor | collab | storage | ai | export | external | browser_ext | periodic | admin`
- `FrontendLayer` — 7 values: `page | route | ui | editor | store | fetch | error`
- `Marker = "requested" | "resolved" | "started" | "completed" | "failed" | "skipped" | "retried" | "promoted" | "demoted"`
- `AttrValue = string | number | boolean` (PII firewall: non-scalars must use `spanPayload()` instead)

## Phases (all complete)

### Phase 0 — Plan + charter + audit
[`OBSERVABILITY-CLEANUP-PLAN.md`](../OBSERVABILITY-CLEANUP-PLAN.md) (master), [`FRONTEND-LOG-CHARTER.md`](../FRONTEND-LOG-CHARTER.md) (client-side beacon design), [`PII-AUDIT-2026-05.md`](../PII-AUDIT-2026-05.md) (1 sev-2 + 4 sev-3, all resolved).

### Phase 1 — `lib/core/logger` core module
`types.ts` (closed enums), `context.ts` (`AsyncLocalStorage<TraceContext>`, `withTrace`), `span.ts` (`startSpan`/`withSpan`/`SpanHandle` with leak-proof try/finally + trace_id plumbed through methods for post-ALS emission), `emit.ts` (`emitEvent` + `logger.{debug,info,warn,error,fatal}`), encoders (`pretty.ts` for dev terminal, `json.ts` for prod stdout, `payload-sidecar.ts` with LRU rotation policy 5MB/file, 1000 files, 500MB total).

### Phase 2 — `instrumentation.ts` + vertical slice
Startup marker; full `withRouteTrace` migration on `GET /api/content/content/[id]` including 3 `spanPayload` calls (`content_response`, `incoming_body`, `existing_content`) to validate the API surface end-to-end before fanning out.

### Phase 3 — Server-side console.* retirement (3.1–3.10)
~80+ API routes migrated across all 13 server layers. Sub-phases by domain: PII priority pass → collab → AI (incl. streaming chat span) → storage + external → core content CRUD → uploads + tags + storage + categories → library routes → export + import → auth + periodic + admin → export + media + visualization. Plus **3.8 Prisma log bridge** (`emit: 'event'` → structured `content:db:query` events with SQL summaries), **3.9 payload sidecar wiring** (Approach A: explicit `spanPayload` calls + rotation policy), **3.10 trace polish** (dim ANSI for `:started`, bold for `:completed`, `LOG_LEVEL`/`LOG_TRACE` filters, debug-hide-by-default).

### Phase 4 — Lint gating + ratchet lock
Promote `no-console` from `warn` to `error`. Lock the ratchet at `--max-warnings 159` in `package.json`. ESLint deferral list in `eslint.config.mjs` documents which directories are still allowed `console.*` (each glob is also a work-tracker for future sweeps).

### Orphan sweep
Wrap the last three unwrapped routes (`workspaces`, `collaboration/presence`, `presence/heartbeat`). Eliminates `[trace:no-trace]` lines from the dev stream.

### Phase 5 — Frontend coverage
- **5 foundation:** `lib/core/logger/client.ts` (client-safe, no `node:async_hooks`), `app/api/logs/client/route.ts` beacon endpoint (auth-gated, 100/min rate limit, error/fatal only), `lib/core/logger/client-fetch.ts` `tracedFetch` wrapper, `Layer` split into `ServerLayer | FrontendLayer` closed unions.
- **5.4 a–f:** ~60 client files / ~300 sites migrated. Pattern: delete debug breadcrumbs covered by the trace, escalate state corrections to `clientLogger.warn`, real failures to `clientLogger.error` with scalar attrs. Final tightening removes `components/**`, `state/**`, `hooks/**` from the deferral list — the rule is now `error` in those directories.

### Phase 6 — Trace replay HTML viewer
`lib/core/logger/event-recorder.ts` writes every LogEvent to `<trace>.events.jsonl` (sibling to payload sidecar). `scripts/render-trace.ts` reads both files, builds a span tree from `parent_span_id` chains, emits a self-contained HTML page (inline CSS + JS + payload data; no external deps). CLI: `pnpm trace:view [id]`, `pnpm trace:list`.

**Cache hygiene:** `pnpm dev` is wired through a `predev` lifecycle hook (`pnpm clean:traces` → `rm -rf .local/debug-payloads`) so each dev session starts with a fresh trace cache. The event-recorder's `ensureDir()` recreates the directory on the first emit. Each dev session's `pnpm trace:list` shows only that session's traces — no stale cross-session noise. The `enable-pre-post-scripts=true` setting in `.npmrc` (pre-existing for native-module installs) is what lets the `predev` hook fire under pnpm.

## Gate state at branch tip

- **`pnpm typecheck`** — clean
- **`pnpm lint`** — 159/159 at ratchet (0 errors, 159 warnings); `no-console=error` enforced everywhere except documented file-glob deferrals
- **`pnpm build`** — 132 pages succeed; pipeline runs `prisma generate → build:tokens → tsc → collab:schema:check → lint → next build`
- **CI gates** (`.github/workflows/quality.yml`) — match the local pipeline

## What's still deferred (file globs in `eslint.config.mjs`)

These directories still allow `console.*`; each is a follow-on sweep target:
- `app/**/page.tsx`, `app/**/layout.tsx`, `app/**/*Client.tsx`, etc. (authenticated pages)
- `lib/domain/editor/extensions/**/*.ts` (TipTap nodes)
- `lib/domain/visualization/**/use-collaboration.ts`
- `lib/design/**`
- `extensions/**` (calendar, daily-notes, workplaces, people, browser-bookmarks — including the in-tree browser extension JS)
- `lib/domain/collaboration/runtime.ts`
- `scripts/**`, `prisma/seed.ts`, `server/hocuspocus/**`

Plus a short list of specific files transitively reachable from `"use client"` boundaries that need the client-safe logger before they can be swept: `tag-sync.ts`, `image-refs.ts`, `markdown.ts`, `person-mention-sync.ts`, `metadata-validation.ts`, `edit-orchestrator.ts`, `blocks/registry.ts`, `round-trip-verify.ts`.

## Branch state at integration time

- Branch: `worktree-observability-cleanup`
- Tip: `c4bf675` — `docs(status): record observability cleanup completion`
- Divergence vs `origin/main`: **28 ahead, 0 behind** (clean fast-forward)
- 28 commits comprising the 7 phases + orphan sweep + STATUS update
- Working tree clean

## Integration with Epoch 15 (Publishing)

The merge is the subject of [`epoch-15-17-integration.md`](epoch-15-17-integration.md). The harmonization work brings Epoch 15's 12 publishing API routes + 1 media route + a cron handler under the same `withRouteTrace` + structured-logger discipline as the rest of the app, with aggressive use of spans + `spanPayload` for the publish / sync / validate flows.

## Reference docs

- [`OBSERVABILITY-CLEANUP-PLAN.md`](../OBSERVABILITY-CLEANUP-PLAN.md) — master phase-by-phase plan with decision log
- [`FRONTEND-LOG-CHARTER.md`](../FRONTEND-LOG-CHARTER.md) — errors-only beacon design + 7 frontend layers
- [`PII-AUDIT-2026-05.md`](../PII-AUDIT-2026-05.md) — sev-2 + sev-3 findings, all resolved
- `lib/core/logger/types.ts` — closed enums + LogEvent shape
- `lib/core/logger/route-trace.ts` — `withRouteTrace` route handler wrapper
- `scripts/render-trace.ts` — Phase 6 CLI renderer
