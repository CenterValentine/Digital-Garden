# Observability Cleanup Plan

**Status:** Approved — Phase 0 in progress (2026-05-15)
**Created:** 2026-05-15
**Worktree branch:** `worktree-observability-cleanup`
**Base ref:** `7ef9d51` (origin/main, PR #37 dark-mode merge)
**Owner:** centervalentine

## Goal

**Build a first-class, three-layer server-side observability system for the Digital Garden Next.js app.** This is a new capability, not a refactor — today the app has no structured logging, no traces, and no payload inspection mechanism. We are *implementing* those three layers from scratch.

### The three layers we are building

1. **Logs** — a readable, narrative timeline of important events. Every emit carries `trace_id`, `layer`, a closed-set event name, lifecycle marker, optional duration, and scalar-only attributes. Two renderings: structured JSON for production stdout, column-aligned pretty-printer with end-of-trace summary for dev.

2. **Traces / Spans** — an ordered, causal lifecycle view of a single request chain. Spans are explicit (`withSpan` wrapper API), nested via AsyncLocalStorage, automatically paired (`:started` / `:completed` or `:failed` with measured duration), and shaped to match OpenTelemetry's `Tracer.startActiveSpan` so a future `@vercel/otel` exit ramp is free.

3. **Payload / Data inspection** — bulk data (full request bodies, document JSON, large arrays) lives in `.local/debug-payloads/<trace>.jsonl` sidecar files. Logs reference payloads by path (`payload_ref`), never inline them. This is the firewall that lets logs stay readable *and* makes deep debugging possible when needed.

### Cross-cutting properties

- **PII firewall by type.** Attributes are typed `Record<string, string | number | boolean>` — non-scalar values are a compile error, so no one can accidentally log a user record, a Y.js document, or a full header bag.
- **Duplicate-request detection is first-class.** The `_requested` marker hashes its target; repeated hashes inside a trace warn-log automatically.
- **Trace context survives Fluid Compute.** AsyncLocalStorage scopes the active span to the request's async chain, not the function instance — required for correctness now that Vercel reuses instances across concurrent requests.
- **Lint-enforced discipline.** ESLint rule (introduced in Phase 1 as `warn`, promoted to `error` in Phase 4) forbids `console.*` outside `lib/core/logger/`. The existing `--max-warnings 175` ratchet is the migration's enforcement mechanism.

### Scope of this worktree

This plan covers the **server side of the Next.js app only** — every route handler under `app/api/`, every server-callable module under `lib/`. As a *consequence* of building the system, the ~307 ad-hoc `console.*` call sites across `app/` and `lib/` get retired or migrated. The migration is the proof that the new system covers every existing log surface; it is not itself the goal.

Out of scope: the Hocuspocus collaboration server (separate Cloud Run repo, parallel migration), and frontend / client-side logging (addressed in a parallel worktree under Phase 5's charter).

## Background

### What exists today

- **307 `console.{log,error,warn,info}` calls** across ~60 files in `app/` and `lib/`.
- **~40 distinct bracket-prefix tags** (`[AuditLog]`, `[BrowserBookmarks Bootstrap]`, `[Move API]`, …). 17 of those tags are one feature area (`BrowserBookmarks` + `BrowserExtension`).
- **No structured logger.** No `pino`, `winston`, `bunyan`, `@vercel/otel`, `@opentelemetry/*`, `@sentry/*`, `axiom`, or `datadog` in `package.json`.
- **No `instrumentation.ts` / `instrumentation-client.ts`** at the project root or under `src/`.
- **No `experimental.instrumentationHook`** in [next.config.ts](next.config.ts).
- **AuditLog table** ([prisma/schema.prisma](prisma/schema.prisma)) records admin actions — business state, not application telemetry. Out of scope for this work except for replacing its `console.error` fallback in [lib/domain/admin/audit.ts](lib/domain/admin/audit.ts#L48).

### What this leans on

- **Lint ratchet** ([package.json](package.json) `lint` script): `--max-warnings 175`. Wired into the build pipeline and CI ([.github/workflows/quality.yml](.github/workflows/quality.yml)) by commit `d080dad`. We use this as the migration discipline mechanism.
- **No `any` types** rule from [CLAUDE.md](CLAUDE.md) — the logger's scalar-only `attrs` type fits the codebase's existing culture (cf. the recent 326-error `any` cleanup epic).
- **Schema-version CI gate** pattern (`pnpm collab:schema:check`) — we mirror it conceptually for the "no `console.*` outside logger" check in Phase 4.

## Decisions (locked in during discovery)

| Topic | Decision |
|---|---|
| Event naming shape | **B** — `<layer>:<noun>:<state>` (e.g., `content:payload:resolved`) |
| Layer set | **13 layers** (see Layer Inventory) — search collapses into `content:search:*` |
| Lifecycle markers | Closed set of 8: `_requested`, `_resolved`, `_started`, `_completed`, `_failed`, `_skipped`, `_retried`, `_promoted`/`_demoted` |
| Span model | **Explicit spans + AsyncLocalStorage**, wrapper-first API (`withSpan`) |
| Indentation source | **Span depth**, not layer (layer is in the event name already) |
| Dev terminal rendering | **Rendering 4** — flat live tail + end-of-trace summary block |
| Prod stdout rendering | Structured JSON, one event per line |
| Scope | **Next.js app only.** Hocuspocus server (Cloud Run, separate repo) is a parallel migration, not this worktree. |
| Phase 2 vertical slice | `GET /api/content/content/[id]` (touches route → auth → content → storage; 7 console sites) |
| Frontend coverage | Parallel worktree (Phase 5), starts after Phase 2 lands |

## Layer Inventory

| Layer | What lives here |
|---|---|
| `route` | Next.js route handler entry/exit, status, latency |
| `auth` | Session lookup, role gate, OAuth callback |
| `tree` | ContentNode tree fetch, parent resolution, displayOrder moves |
| `content` | Payload resolution (Note/File/Html/Code/External); includes `content:search:*` and `content:tags:*` and `content:backlinks:*` |
| `editor` | TipTap server-side rendering for export, schema version checks |
| `collab` | Hocuspocus client topology, ydoc bootstrap, awareness |
| `storage` | Presigned URL flow, R2/S3/Vercel Blob calls |
| `ai` | Chat stream, tool call, model routing |
| `export` | Markdown/HTML/JSON conversion, vault ZIP |
| `external` | Google Drive proxy, OnlyOffice callback, OG fetch |
| `browser_ext` | Bookmarks bootstrap, push/pull, queue |
| `periodic` | Daily/weekly note resolve, summary |
| `admin` | AuditLog write, admin API errors |

## Event & Log Shape

```ts
// lib/core/logger/types.ts (Phase 1)

export type Layer =
  | "route" | "auth" | "tree" | "content" | "editor" | "collab"
  | "storage" | "ai" | "export" | "external" | "browser_ext"
  | "periodic" | "admin";

export type Marker =
  | "requested" | "resolved" | "started" | "completed"
  | "failed" | "skipped" | "retried" | "promoted" | "demoted";

export type LogEvent = {
  trace_id: string;
  span_id?: string;
  parent_span_id?: string;
  ts: string;                                     // ISO-8601
  level: "debug" | "info" | "warn" | "error" | "fatal";
  layer: Layer;
  event: string;                                  // e.g. "session:resolved"
  duration_ms?: number;
  status?: "ok" | "error" | "skipped";
  summary?: string;                               // free-form, ≤80 chars, NO objects
  attrs?: Record<string, string | number | boolean>;  // scalar-only — PII firewall by type
  payload_ref?: string;                           // pointer into .local/debug-payloads/
  error?: { name: string; message: string; code?: string };  // no stack in prod
};
```

### Pretty-print column rules (dev terminal)

```
[trace:abc] route:request:started        GET /content/123
[trace:abc]   auth:session:resolved      user_123                       24ms
[trace:abc]   content:payload:requested  node_987
[trace:abc]     storage:fetch:resolved   r2://bucket/...                  8ms  payload: .local/debug/...
[trace:abc]   content:payload:resolved   38 blocks                       91ms
[trace:abc]   editor:tiptap:initialized                                 132ms
[trace:abc] route:request:completed                                    612ms
─── trace:abc summary ───────────────────────────────────────────────────
  auth          1 event   24ms  (4%)
  content       2 events  91ms  (15%)
  storage       1 event    8ms  (1%)
  editor        1 event  132ms  (22%)
  route         1 event  612ms  (total)
─────────────────────────────────────────────────────────────────────────
```

| Column | Content | Width / format |
|---|---|---|
| 1 | `[trace:<id>]` | fixed |
| 2 | event name (indented 2 spaces per span depth) | left-padded to ~38 chars |
| 3 | summary (free-form, short) | left-padded to ~32 chars |
| 4 | duration | right-aligned, `Nms` |
| 5 | payload pointer | optional, `payload: <path>` |

## Target Architecture

```
lib/core/logger/
├── types.ts            # LogEvent, Layer, Marker, SpanContext (closed types)
├── context.ts          # AsyncLocalStorage<SpanContext>; getActiveSpan(); withTrace()
├── span.ts             # startSpan, endSpan, withSpan (wrapper); auto-emit started/completed
├── emit.ts             # info/warn/error/debug/fatal; inherits active span from ALS
├── encoders/
│   ├── json.ts         # one-line JSON for prod stdout
│   └── pretty.ts       # column-aligned dev tail + end-of-trace summary
├── payload-sidecar.ts  # writes payloads to .local/debug-payloads/<trace>.jsonl
├── redaction.ts        # belt-and-suspenders runtime guard (the type system is the primary firewall)
└── index.ts            # public API barrel: logger, withSpan, withTrace

instrumentation.ts                            # NEW at project root — registers ALS per request,
                                              # derives or generates trace_id, binds for request lifetime

.local/debug-payloads/                        # gitignored; per-trace JSONL payload sidecars
.gitignore                                    # add the directory
```

### Public API (target)

```ts
import { logger, withSpan, startSpan } from "@/lib/core/logger";

// 1. Wrapped span (preferred, 95% of sites)
const node = await withSpan(
  { layer: "content", name: "payload" },
  { attrs: { content_id }, summary: `node_${content_id}` },
  async (span) => {
    span.attr("payload_kind", "note");
    const result = await prisma.contentNode.findUnique(/*…*/);
    span.attr("block_count", result.payload.blocks.length).summary("38 blocks");
    return result;
  }
);

// 2. Leaf log inside an active span (inherits trace_id + parent_span_id from ALS)
logger.info({ event: "tags:resolved", summary: "12 tags", attrs: { count: 12 } });

// 3. Cross-layer leaf (explicit layer overrides the active span's layer)
logger.info({ layer: "editor", event: "tiptap:initialized", summary: "tab_notes" });

// 4. Manual span (escape hatch for streaming / long-lived work)
const span = startSpan({ layer: "ai", name: "chat_stream" }, { attrs: { model } });
try { /* ... */ span.end("ok"); } catch (e) { span.fail(e); }
```

## Phases

### Phase 0 — Charter + Audit (1–2 hours, paperwork only)

**Deliverables:**

1. **Frontend log charter** at `docs/notes-feature/work-tracking/FRONTEND-LOG-CHARTER.md`. One paragraph each on:
   - What frontend logs are *for* (debugging in dev; what makes it to prod?).
   - What frontend logs are *not* for (no telemetry beacons without opt-in; no PII; no analytics).
   - Transport: drop in prod / sample to endpoint / buffered to dev console only? *(Decision deferred to charter.)*
   - Relationship to server traces: does a frontend log carry the same `trace_id` as the server request that produced its page? *(Decision deferred to charter.)*

2. **Server-side PII audit** at `docs/notes-feature/work-tracking/PII-AUDIT-2026-05.md`. Grep for known offenders; rank the worst 20 sites. Specific patterns to find:
   - `console.log(user)` / `JSON.stringify(user)` / `JSON.stringify(session)`
   - `console.log(request.headers)` / logging the full `cookie` header
   - `console.log(content.payload)` for note payloads (full TipTap JSON)
   - Logging raw OAuth tokens / refresh tokens
   - Logging full Y.js doc state from collab

   Each offender gets a row: `file:line | severity (1=must-fix-now, 2=must-fix-in-3.1, 3=fix-in-normal-sweep)`.

**Verification gate:** charter and audit committed to the worktree; no code changes yet.

---

### Phase 1 — Logger Core (4–6 hours)

**Deliverables:**

1. `lib/core/logger/types.ts` — `LogEvent`, `Layer`, `Marker`, `SpanContext` (all closed types).
2. `lib/core/logger/context.ts` — `AsyncLocalStorage<SpanContext>`, `withTrace(trace_id, fn)`, `getActiveSpan()`.
3. `lib/core/logger/span.ts` — `startSpan`, `withSpan` (auto-emits `:started` and `:completed`/`:failed`). `withSpan`'s `finally` block is the leak-proof guarantee.
4. `lib/core/logger/emit.ts` — `logger.info/warn/error/debug/fatal` reading ALS context.
5. `lib/core/logger/encoders/json.ts` — production stdout encoder.
6. `lib/core/logger/encoders/pretty.ts` — dev tail renderer (Rendering 1) + end-of-trace summary reducer (Rendering 4 summary block).
7. `lib/core/logger/payload-sidecar.ts` — appends to `.local/debug-payloads/<trace>.jsonl` and returns the path for `payload_ref`.
8. `lib/core/logger/redaction.ts` — runtime belt-and-suspenders (the type system is the primary firewall).
9. `.gitignore` entry for `.local/debug-payloads/`.
10. ~~Unit tests~~ **Deferred** — this repo has no unit test runner (only Playwright e2e per CLAUDE.md). Adding `vitest`/`jest` is out-of-scope for Phase 1. Substituted with:
    - **`scripts/smoke-logger.ts`** — runnable smoke test covering happy path, fail path, leaf-guard, payload sidecar, and end-of-trace summary. Run with `pnpm tsx scripts/smoke-logger.ts`.
    - **Type-level firewall is enforced by the TS compiler.** `Attrs = Record<string, string | number | boolean>` makes non-scalar attrs a compile error — `pnpm typecheck` is the test.
    - Unit-runner adoption tracked as a follow-up in BACKLOG.md if dedicated tests become valuable later.

**Verification gate:** `pnpm typecheck && pnpm lint && pnpm build` clean; `pnpm tsx scripts/smoke-logger.ts` produces a column-aligned trace + summary block. Zero call sites migrated yet.

---

### Phase 2 — Instrumentation + Vertical Slice (4–6 hours)

**Deliverables:**

1. `instrumentation.ts` at project root — startup marker for the logger. Runs once per Node runtime. This file is the OTel installation point for future use; per-request trace context is established by `withRouteTrace` (next bullet), not by Next.js's instrumentation hook (which has no per-request callback).
2. `lib/core/logger/route-trace.ts` — `withRouteTrace(req, options, fn)` wrapper that every route handler invokes.
   - **Reads `x-trace-id` header if present and well-formed** (per [FRONTEND-LOG-CHARTER.md](./FRONTEND-LOG-CHARTER.md) — frontend is the trace originator), else generates a fresh UUID server-side.
   - Wraps the handler body in `withTrace(id, ...)` AND opens the root `route:request` span with method/path/status attrs.
   - Note: Fluid Compute (Vercel default now) reuses function instances; ALS is mandatory for correctness here — module-level state would cross-contaminate concurrent requests.
3. Migrate **[app/api/content/content/[id]/route.ts](app/api/content/content/[id]/route.ts)** end-to-end. All three handlers (GET, PATCH, DELETE) wrap their bodies in `withRouteTrace(...)` and use nested `withSpan` calls for sub-work:
   - **GET:** `auth:session` → `content:payload` → `content:access`
   - **PATCH:** `auth:session` → `content:payload` → `content:access` → `content:write` (multi-table upsert) → conditional `external:google_drive_rename`
   - **DELETE:** `auth:session` → `content:payload` → `content:soft_delete`
   - All 7 existing `console.*` calls retired. Three error catches now use `logger.error({ event: "request:caught", error, ... })`; two Google Drive notice logs use `logger.warn({ event: "rename:failed" / "rename:exception" })`.
   - Storage span (mentioned in Phase 2 sketch) does **not** appear in this route — the GET only returns file payload *metadata*, not the file contents. Storage spans land in Phase 3.4 when actual fetches happen.
4. Live smoke: when next running `pnpm dev`, GET `/api/content/content/<some-id>` and confirm a trace block appears in the terminal with the column-aligned shape from Phase 1's smoke. Capture a snapshot in this plan as evidence.

**Verification gate:**
- `pnpm typecheck && pnpm lint && pnpm build` clean. ✅ (typecheck silent, lint at 175/175, build ✓ Compiled 51s with 131/131 pages)
- Manual smoke (deferred to next `pnpm dev` session): `curl http://localhost:3015/api/content/content/<some-id>`, confirm pretty-printed trace appears with correct span nesting and a summary block.
- Confirm `.local/debug-payloads/<trace>.jsonl` is created if any payload reference fires.
- Confirm ratchet (`--max-warnings 175`) did not grow. ✅

---

### Phase 3 — Layer Coverage Rollout, Risk-Ordered

Each sub-step extends the new system to cover one layer of the codebase. Sub-step is its own commit on this worktree branch. Sub-step is "done" when:
- All `console.*` in the named layer's files are removed.
- `pnpm typecheck && pnpm lint && pnpm build` clean.
- Lint ratchet did not grow.
- The migrated routes still pass manual smoke (where applicable).

#### 3.1 — PII Offender Priority Pass (~2-4 hours)
- **Scope:** any site flagged severity-1 or severity-2 in the Phase 0 audit, regardless of layer.
- **Why first:** these are the only correctness issues; everything else is style.
- **Approach:** for each offender, either (a) strip the dangerous field immediately even if the surrounding code still uses `console.*`, or (b) bring the whole site under the logger if cheap.

#### 3.2 — `collab` layer (~6-8 hours)
- **Files:** [lib/domain/collaboration/](lib/domain/collaboration/), [components/content/editor/CollaborationProvider.tsx](components/content/editor/CollaborationProvider.tsx), Hocuspocus client glue.
- **Why this slot:** most chaotic state machine in the app (`localOnly → promoting → connecting → synced → disconnectedButDirty → coolingDown`). Span structure + `_promoted`/`_demoted` markers earn their keep here.
- **Special event names:** `collab:provider:promoted`, `collab:awareness:joined`, `collab:ydoc:bootstrapped`.

#### 3.3 — `ai` layer (~4-6 hours)
- **Files:** [lib/domain/ai/](lib/domain/ai/), [app/api/ai/](app/api/ai), AI chat route handlers.
- **Why this slot:** streams and tool calls nest deeply (`route → ai:chat → ai:tool_call → content:payload`). Explicit spans pay off.
- **Special handling:** manual `startSpan` for chat streams (lifetime exceeds the function call). Each token emit is `ai:chat:token` at `debug` level — never `info` (volume).

#### 3.4 — `storage` + `external` (~4-6 hours)
- **Files:** [lib/infrastructure/storage/](lib/infrastructure/storage/), [app/api/google-drive/](app/api/google-drive/), [app/api/onlyoffice/](app/api/onlyoffice/), [app/api/content/external/preview/route.ts](app/api/content/external/preview/route.ts).
- **Why this slot:** multi-step async flows (presigned URL → upload → finalize). Span pairing is the whole point.
- **Duplicate-request detection:** wire it here for the first time — hash `(layer, url, content-hash)` for OG previews, warn-log on repeats.

#### 3.5 — `content` + `tree` (~6-8 hours)
- **Files:** [app/api/content/content/](app/api/content/content/) (excluding the slice already done in Phase 2), [app/api/content/folder/](app/api/content/folder), search/tags/backlinks routes, move/duplicate routes.
- **Why this slot:** highest request volume; main thing dogfooded daily; the migration's largest single sub-step.

#### 3.6 — `auth` + `periodic` + `admin` (~3-5 hours)
- **Files:** [app/api/auth/](app/api/auth/), [lib/infrastructure/auth/](lib/infrastructure/auth/), [app/api/periodic-notes/](app/api/periodic-notes/), [lib/domain/admin/audit.ts](lib/domain/admin/audit.ts), [app/api/admin/](app/api/admin/).
- **Special handling:** `lib/domain/admin/audit.ts` has a `console.error` fallback ([line 48](lib/domain/admin/audit.ts#L48)) that fires when the AuditLog DB write itself fails — replace with `logger.fatal({ layer: "admin", event: "audit_write_failed" })`.

#### 3.7 — `editor` + `export` + `browser_ext` (~3-5 hours)
- **Files:** [lib/domain/editor/](lib/domain/editor/), [lib/domain/export/](lib/domain/export/), browser extension routes and bootstrap.
- **Special handling:** the 17 `[BrowserBookmarks *]` + `[BrowserExtension *]` tags collapse into `browser_ext:<sub>:<state>` — biggest tag-reduction win in the sweep.

---

### Phase 4 — Gating (2–3 hours)

**Deliverables:**

1. ESLint rule in `.eslintrc.*` or eslint flat config: `no-restricted-syntax` for `console.*`, with allowlist for `lib/core/logger/`. Initially set to `warn`. If migration completed cleanly, count should already be ~0.
2. Promote rule to `error` and verify `pnpm lint` clean.
3. Update [CLAUDE.md](CLAUDE.md) "Code Standards" section: "No `console.*` in app code — use the logger from `@/lib/core/logger`."
4. Optional: a CI script (`pnpm logs:no-console-check`) that fails on any new `console.*` introduced outside the logger module. Mirrors the existing `pnpm collab:schema:check` pattern.

**Verification gate:** `pnpm lint` clean with rule at `error`; CI passes; ratchet may be reduced from 175 by however many warnings were retired during the migration.

---

### Phase 5 — Frontend Coverage (parallel worktree, ~10-15 hours)

**Purpose:** extend the observability system to client-side code under the rules defined by the Phase 0 frontend charter. Frontend has different transport, retention, and privacy semantics than server, so it gets its own worktree to keep PRs reviewable.

**When to start:** after Phase 2 lands (the logger core exists). Runs in parallel with Phases 3.5–3.7.

**Worktree:** `frontend-log-cleanup` (separate, branched off this one's last merged-to-main commit).

**Deliverables (per ratified [FRONTEND-LOG-CHARTER.md](./FRONTEND-LOG-CHARTER.md)):**
- `lib/core/logger/client.ts` — client-safe logger with `console.*` transport in dev, errors-only beacon in prod.
- `lib/core/logger/client-fetch.ts` — `fetch` wrapper that auto-attaches `x-trace-id` header on every outgoing API call.
- Frontend trace origination: page-load generates `trace_id`; soft navigations generate new ones; module-level state or small Zustand slice holds the active value.
- **New API route: `POST /api/logs/client`** — accepts batched `LogEvent[]`, level-gates to `error`/`fatal` only, rate-limits to 100/session/minute, requires session cookie, re-emits through the server logger pipeline with `attrs: { source: "client" }`.
- Frontend layer enum: `page` / `route` / `ui` / `editor` / `store` / `fetch` / `error`.
- Bring `components/` and client-side modules under the logger.
- Same ESLint gate extended to client modules.

---

### Phase 6 — Trace Replay Viewer (optional, deferred, ~6-8 hours)

**Deliverables:**
- Static HTML viewer reading `.local/debug-payloads/<trace>.jsonl`.
- Renders Rendering 3 (span tree) with collapsible nodes, durations, payload links.
- Lives at `tools/trace-viewer/` or similar; not part of the Next.js build.

**Skip criteria:** if Phase 4 lands and dev experience feels sufficient, this can be backlogged indefinitely.

## Effort & Calendar Shape

| Phase | Estimate | Parallelizable with |
|---|---|---|
| 0 | 1-2h | — |
| 1 | 4-6h | — |
| 2 | 4-6h | — |
| 3.1 | 2-4h | — |
| 3.2 | 6-8h | — |
| 3.3 | 4-6h | 3.4 (2nd contributor) |
| 3.4 | 4-6h | 3.3 |
| 3.5 | 6-8h | 3.6, 5 |
| 3.6 | 3-5h | 3.5, 5 |
| 3.7 | 3-5h | 5 |
| 4 | 2-3h | — |
| 5 | 10-15h | 3.5-3.7 |
| 6 | 6-8h | anything |

**Total:** ~60-90 hours. Three sprints if focused; spread thinner if interleaved with feature work.

## Lint Ratchet Strategy

- **Do not** bump the 175 warning ratchet to absorb temporary noise. The whole discipline mechanism depends on it not moving the wrong direction.
- **Do** add the no-console rule as `warn` from Phase 1; each migrated site removes any `eslint-disable-next-line` it carried.
- **Do** verify on every commit that warning count is monotonically non-increasing during Phase 3. If it grows, the sub-step isn't done.
- **Promote to `error`** at end of Phase 4.
- **Reduce the ratchet** at end of Phase 4 to reflect retired warnings (e.g., 175 → whatever the real count is).

## Open Follow-ups (decided during execution, not now)

1. **Trace-ID propagation from client to server** — should a fetched API request carry an `x-trace-id` from the originating page-load trace? Decided in Phase 0 frontend charter.
2. **Sampling in production** — full logs or sampled? At what rate? Decided after Phase 4 once we have real volume data.
3. **OTel export** — `@vercel/otel` is plug-compatible with the `withSpan` API. Decision deferred until Phase 6 or after, on demand.
4. **PII redaction rules for `summary`** — `attrs` is type-firewalled; `summary` is free-form text. Add lint-warn for `summary` containing patterns like `@*.com` or UUIDs? Decision deferred to Phase 4.

## Out of Scope (this worktree)

- **Hocuspocus server (Cloud Run repo).** Same problem, same answer, separate migration.
- **AuditLog domain logic.** The Prisma `AuditLog` table is a business record; the logger does not replace it. We only replace the `console.error` fallback when the audit write itself fails.
- **Database query logging.** Prisma has its own `log` config; we don't tee that into the new logger in this pass.
- **APM/datadog/sentry integration.** The architecture supports it; we don't ship it.
- **Replay viewer (Phase 6) is optional**, listed but not committed.

## References

- [CLAUDE.md](../../CLAUDE.md) — Quality Gates, Code Standards, lint ratchet
- [next.config.ts](../../next.config.ts) — no `experimental.instrumentationHook` today
- [prisma/schema.prisma](../../prisma/schema.prisma) — `AuditLog` model (out of scope)
- [lib/domain/admin/audit.ts](../../lib/domain/admin/audit.ts) — only legitimate use of `console.error` after this work; replace fallback at line 48
- [app/api/content/content/[id]/route.ts](../../app/api/content/content/[id]/route.ts) — Phase 2 vertical slice
- Discovery transcript: this chat (Topics 1–3, 2026-05-15)
