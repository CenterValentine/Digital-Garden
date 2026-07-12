# Workflows Foundation Plan

**Created:** 2026-07-11
**Branch:** `feature/workflows-foundation`
**Status:** Plan 1 🟡 In progress (S1 ✅ S2 ✅) · Plan 2 SKETCH · Plan 3 STUB
**Planning model:** Rolling wave — Plan 1 at full detail, Plan 2 as a sketch to be promoted after Plan 1's soak, Plan 3 as a trigger-conditioned stub.

---

## Vision

A hub-and-spoke workflow subsystem. Digital Garden is the **hub**: it owns the workflow data model, the dispatch/read/resume API, the run UI, and the inbox-gated human-in-the-loop experience. Durable execution **engines** are swappable **spokes** behind a small adapter interface. Users may eventually choose their engine per workflow; the product experience is identical regardless of which engine executed a run.

**v1 engine:** Vercel Workflow DevKit (WDK) — zero new infrastructure, in-process with the app.
**Planned second spoke:** n8n (visual canvas, external-integration long tail) — Plan 2.
**Contingency spokes:** Hatchet / Temporal (MIT durable engines) — Plan 3, trigger-conditioned.

**Proving use case (the journey):** browser extension captures a job listing → dispatch → AI researches the company + matches against resume → inbox notification (gate) → user supervises / doctors the result in AI chat → approve → DOCX resume exported into a designated folder → completion notification → run review.

## The four-verb engine contract

Any engine qualifies as a spoke if its adapter can:

1. **Start** — accept a start signal carrying `runId` + input (in-process call, webhook, SDK trigger)
2. **Effect** — call back into the app's writer surface (events, artifacts, gates) with auth
3. **Suspend/Resume** — pause on a resumable handle the adapter can store and later invoke
   (engines without a native primitive can *simulate* via flow-splitting: pre-gate and post-gate workflows, with the app dispatching the second on resume)
4. **Finish** — report terminal state

## Architecture invariants (the seam)

- **The product UI reads ONLY the app's tables.** Engine dashboards (WDK observability, n8n executions, Temporal Web) are operator/debug tools, never linked in user-facing flows.
- **All run-state mutation goes through one writer module** (`extensions/workflows/server/runs.ts`). WDK steps call it in-process; external engines will call PAT-authed HTTP routes exposing the same writers (Plan 2).
- **Statuses, tokens, and events use OUR vocabulary.** Adapters map engine-native states into `WorkflowRunStatus`; they never leak outward.
- **AI steps route through `resolveFeatureRoute()`** (BYOK, fallback chains, rate limits). In-process WDK satisfies proxy-not-share trivially; external engines must use the AI proxy endpoint (Plan 2).

## Data model (4 tables)

```prisma
enum WorkflowRunStatus {
  QUEUED
  RUNNING
  WAITING
  SUCCEEDED
  FAILED
  CANCELED
}

model WorkflowDefinition {
  id          String   @id @default(cuid())
  ownerId     String
  slug        String   // "job-application-research" — version by slug (see design rules)
  name        String
  engine      String   // adapter key: "wdk" (later: "n8n", "hatchet", ...)
  engineRef   String   // engine-side identity — WDK: manifest key; n8n: webhook id
  inputSchema Json?    // JSON Schema for dispatch validation (and future form UI)
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  runs        WorkflowRun[]
  @@unique([ownerId, slug])
}

model WorkflowRun {
  id             String            @id @default(cuid())
  definitionId   String
  ownerId        String
  status         WorkflowRunStatus
  engine         String            // denormalized at dispatch — historical truth if definition migrates engines
  engineRunId    String?           // engine handle, debugging only — UI never reads through it
  engineGateRef  String?           // engine-native resume handle (n8n resume URL etc.); unused by WDK
  input          Json
  output         Json?
  error          Json?
  gateToken      String?           // non-null ⟺ status WAITING; what inbox actions resume
  conversationId String?           // linked "doctor it with AI" chat
  startedAt      DateTime?
  finishedAt     DateTime?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  events         WorkflowRunEvent[]
  artifacts      WorkflowRunArtifact[]
  @@index([ownerId, status])
}

model WorkflowRunEvent {
  id        String   @id @default(cuid())
  runId     String
  seq       Int      // monotonic per run — timeline order without clock trust
  type      String   // "step.started" | "step.completed" | "gate.opened" | "gate.resumed" | "log" | "artifact.created"
  stepName  String?
  payload   Json?
  createdAt DateTime @default(now())
  @@unique([runId, seq])
}

model WorkflowRunArtifact {
  id            String @id @default(cuid())
  runId         String
  contentNodeId String
  kind          String // "document" | "note" | "file"
  label         String
  @@index([runId])
}
```

## Design rules (day-one disciplines)

1. **Pass IDs, not blobs.** Step inputs/outputs are persisted+replayed state. Big content (captured page, research dossier, DOCX bytes) goes into ContentNode/blob storage immediately; steps pass references. (Temporal hard-caps payloads; adopting the rule now keeps every future spoke viable.)
2. **Curate events.** ~10–15 Postgres rows per run: step boundaries, gates, artifacts, errors. Verbose agent output stays in WDK namespaced streams (engine-side), never mirrored into Neon row-by-row.
3. **Idempotent writers.** Engines retry steps — writers must tolerate double-fire. Deterministic event keys + upserts, not blind inserts.
4. **Append-only definitions.** Runs sleep at gates for days and will straddle deploys. Ship behavior changes as a new slug version (`job-application@2`); let in-flight runs finish on old code. Never edit a definition with live runs.
5. **Gate tokens are deterministic:** `gate:{runId}:{gateName}` — derivable by the inbox action without storage lookups beyond the run.

## Prerequisites

- **HARD: connections/inbox feature merged** (`feature/connections-inbox`) — gate notifications have nowhere to land without it. Blocks Session 3+.
- ~~PAT/service-token auth~~ — NOT needed for Plan 1 (WDK is in-process; extension dispatch rides the existing session bridge). Moves to Plan 2.
- DOCX exporter does not exist (export system stub) — built in Session 5 as a domain function + route.

---

# Plan 1 — Foundation + WDK (FULL)

Six sessions. Quality gate per repo convention: `pnpm typecheck` → `pnpm lint` (warning ratchet) → `pnpm build` → browser smoke.

## Session 1 — Schema, writer module, API surface ✅ (2026-07-12)

- [x] Prisma schema: 4 tables + enum (above). `npx prisma db push` + `generate`. Follow `docs/notes-feature/guides/database/DATABASE-CHANGE-CHECKLIST.md`.
- [x] `extensions/workflows/server/runs.ts` — writer module: `createRun`, `recordEvent` (idempotent, deterministic keys), `openGate`, `closeGate`, `attachArtifact`, `finishRun`, `markRunning`.
- [x] `extensions/workflows/server/engines/types.ts` — `WorkflowEngineAdapter` (`start`, `cancel`, `resumeGate`) + `registry.ts` (server-only, mirrors AI tools registry split).
- [x] API routes:
  - `POST /api/workflows/dispatch` — `{ slug, input }` → validate against `inputSchema` → create QUEUED run → adapter `start()` → `{ runId }`
  - `GET  /api/workflows/runs` (filter by status) · `GET /api/workflows/runs/[id]` (run + events + artifacts)
  - `POST /api/workflows/runs/[id]/resume` — `{ token, payload }` → adapter `resumeGate`
  - `POST /api/workflows/runs/[id]/cancel`
- [x] Extension scaffolding: `extensions/workflows/manifest.ts`, register in `lib/extensions/installed.ts` (`enabledByDefault: false` until Session 4 ships UI).
- **Gate:** ✅ typecheck + lint (0 new warnings) + build green; smoke script (`scripts/workflows-smoke.ts`) proves dispatch → queued run + `run.dispatched` event, input validation rejection, unknown-slug rejection, list/detail reads.

### Session 1 log — amendments discovered in execution

- **Repo ID convention is `gen_random_uuid()` + `@db.Uuid`, not cuid**; enum values lowercase (`queued`…). The schema sketch above is illustrative — `prisma/schema.prisma` is authoritative.
- **`WorkflowRunEvent` gained a `key` column** (`@@unique([runId, key])`) — the deterministic idempotency handle; `seq` is assigned transactionally with P2002 retry.
- **Event vocabulary extended**: `run.dispatched` and `run.finished` bracket every run.
- **tsconfig has `strict: false`** — discriminated-union narrowing via `.ok` does NOT work; use type predicates (`isDispatchFailure`). This will recur in UI code.
- **Logger emits are closed-shape** (`LeafInput`): `layer` must be from the closed `Layer` union (used `"route"`), custom fields go in `attrs`.
- **Notifications infra partially on main already** (`lib/features/notifications/` transport + kind registry, `ActivityEvent`/`NotificationRecipient` models, `ExtensionRuntime.notificationKindRenderers`) — Session 3's inbox blocker is likely smaller than planned; assess emission API before waiting on the connections-inbox merge.
- **Pre-existing `WorkflowPayload` model** (ContentNode payload stub from an earlier epoch, execution deliberately blocked) — different concept, left untouched; noted in the schema section comment.
- WDK adapter is a **queued-run placeholder** this session (Session 2 wires the real engine); `superviseGate` not yet written.

## Session 2 — WDK install, adapter, gate helper ✅ (2026-07-12)

- [x] `pnpm add workflow` (v4.6.0) + `withWorkflow` in `next.config` — Turbopack compat verified in dev AND production build; heap unchanged.
- [x] `server/engines/wdk.ts` — adapter: `start` via `start(fn, [input])` from `workflow/api` resolved through `server/wdk/manifest.ts` (`WDK_WORKFLOWS`); `resumeGate` via `resumeHook(token, payload)`; `cancel` via `getRun(engineRunId).cancel()`.
- [x] `superviseGate(runId, gateName, summary)` in `server/wdk/gate.ts` — workflow-level `createHook({ token })` with openGate/closeGate steps around the suspension point.
- [x] WDK constraints honored: orchestration bodies thin; Prisma access only in `"use step"` functions; serializable payloads.
- **Gate:** ✅ `gate-probe` workflow: dispatch → steps execute → suspends `waiting` with deterministic `gate:{runId}:probe` token → resume via API → `succeeded` with output `{approved: true}`. Event trail: run.dispatched → step.completed → gate.opened → gate.resumed → run.finished. Cancel verb also verified (mid-gate cancel → `canceled`, engine-side cancel best-effort).

### Session 2 log — amendments discovered in execution

- **`withWorkflow` must wrap the export, not just be imported** — a missed wrapper produces `'start' received an invalid workflow function` at dispatch time (the directive never compiles). The failure surfaced as a visible failed run — the dispatch-owns-run-creation design working as intended.
- **proxy.ts bypass added**: `/.well-known/workflow/` joins the early-return skip list. WDK docs warn Next 16 proxies that intercept its internal queue transport break execution with detached-ArrayBuffer errors; worked without the bypass here, but now it's explicit and future-proof.
- **WDK generates `app/.well-known/workflow/v1/*` route files** at dev/build time — added to `.gitignore` and eslint `globalIgnores` (one generated file had a bare `console` that broke the lint gate). WDK itself appended `/.swc` to .gitignore.
- **No workflow-level try/catch around gates** — suspension may be control-flow; failure marking lives in steps and dispatch. Revisit error semantics deliberately in S3 for the job workflow.
- **Dev-loop notes**: this worktree's server runs on **port 3021** (3015/3020 = main checkout, 3017 = multi-tenancy worktree). Authed curl testing via a locally-minted session row (`scripts/dev-mint-session.ts`, deliberately uncommitted). WDK engine run ids look like `wrun_01KX…`.
- Generated Prisma client (tracked in repo) committed alongside — it reflects the S1 schema.

## Session 3 — Job-application workflow (stubbed AI), inbox wiring, end-to-end proof ⚪

**Blocked on: inbox merge.**

- [ ] `server/workflows/job-application.ts` — full journey shape with STUBBED research/match steps (canned output): capture ref in → research → match → `superviseGate("review-match")` → export (stub) → notify → finish.
- [ ] Inbox integration: `gate.opened` event → inbox notification carrying runId + token; notification actions **Approve** / **Open in chat** / (post-doctoring) **Use this version** → `POST /runs/[id]/resume`.
- [ ] Conversation linkage: "Open in chat" creates a conversation seeded from run output; store `conversationId` on the run (reuse ConversationAssociation patterns).
- [ ] Manual dispatch affordance for testing (debug page or simple form posting to dispatch) — extension capture comes in Session 6.
- **Gate:** full loop in the browser with stub AI — dispatch → gate lands in inbox → approve → run completes. This is the moment the seam is proven.

## Session 4 — Extension UI ⚪

- [ ] `client.tsx` + `components/`: **RunList** (status-filtered), **RunDetail** with timeline rendered from `WorkflowRunEvent` (seq-ordered), **GateCard** (summary + actions), **ArtifactPanel** (links to ContentNodes).
- [ ] `state/workflow-runs-store.ts` (Zustand, repo pattern). Polling only while a run detail is open (cheap indexed query, few-second interval); no realtime infra in v1.
- [ ] Nav/surface registration through the extension manifest; flip `enabledByDefault` as appropriate. Disabled extension = no shell contributions (registry filters, no conditionals in shared UI).
- [ ] Liquid Glass tokens, dark-mode verified; consider Playwright dark-mode spec (stub if auth fixture still pending).
- **Gate:** the Session 3 journey is fully drivable from real UI — no debug pages, no JSON reading.

## Session 5 — Real AI research + DOCX exporter ⚪

- [ ] Research step: `DurableAgent` (`@workflow/ai`) wired through `resolveFeatureRoute()` — BYOK, fallback chains, existing AI rate limits. Bound turns (`maxSteps`). Verbose output → namespaced streams; curated summary events → Postgres.
- [ ] Match step: fetch resume note by ContentNode ID; produce structured match report (score, strengths, concerns) persisted as run output.
- [ ] **DOCX exporter as a domain function** (`lib/domain/export/`) using the `docx` package, exposed BOTH as an export-system converter (replacing the stub) and callable from the workflow step. Any future engine gets it via route for free.
- [ ] Export step: approved draft from linked conversation → DOCX → two-phase storage upload → FilePayload ContentNode in the designated folder → `attachArtifact`.
- **Gate:** real job listing (pasted) produces a real research dossier, real match report, and a real .docx in the target folder.

## Session 6 — Browser-extension capture, soak, polish, docs ⚪

- [ ] Extension action "Run workflow → Job application research": readable-text extraction client-side (trimmed — keep dispatch payloads small), POST via existing session bridge. `pnpm extension:build` + chrome://extensions reload.
- [ ] Captured page stored as content at dispatch; workflow receives the reference (design rule 1).
- [ ] Error UX: FAILED runs surface in inbox + run detail with error payload; `RetryableError` for provider 429s.
- [ ] Tracking docs: STATUS.md (frontmatter + Recent Completions), BACKLOG.md (deferred items), this doc (⚪→✅ per session).
- **Gate:** the complete journey from a real job page in the browser, end to end. Then **SOAK**: run it on real listings for several days before promoting Plan 2 — the inbox-gate UX lessons are Plan 2's input.

### Plan 1 completion checklist

- [ ] All six session gates passed; `pnpm build` green
- [ ] Soak period observed; UX lessons written into Plan 2 sketch below
- [ ] STATUS.md / BACKLOG.md updated
- [ ] PR in sprint format with preflight checklist

---

# Plan 2 — External-engine machinery + n8n (SKETCH — promote after Plan 1 soak)

**Goal:** everything any external engine will ever need, proven via n8n as the visual canvas spoke.

**Scope sketch:**
- PAT/service-token auth — hashed at rest, scoped, revocable; first machine-to-machine auth story in the app
- PAT-authed callback routes — HTTP transport over the SAME `runs.ts` writers (events, artifacts, gates) + AI proxy endpoint (proxy-not-share now does real work: n8n never holds provider keys)
- `n8n-nodes-digital-garden` community node package: credentials (base URL + PAT); nodes — Get Content, AI Complete, Record Event, Drop File, Notify Inbox, Open Gate, Run Succeeded/Failed
- n8n adapter: `start` → webhook POST; `resumeGate` → POST to stored `engineGateRef` (Wait-node resume URL captured at gate-open)
- n8n deployment: first tenant of the Coolify/Dokploy VPS (with its own Postgres DB on a shared server) — or Cloud Run beside Hocuspocus; decide at promotion
- Engines settings panel: registered adapters, health ping, admin-gated console deep links (`engine` + `engineRunId` + console base URL), default engine
- Security: n8n console NEVER bare on the internet (its credential store holds the DG PAT + third-party keys)

**Open questions to harvest from Plan 1:**
- Exact callback route shapes (mirror whatever `runs.ts` settled into)
- Event granularity expectations for engines that can't batch like in-process code
- Gate-summary payload shape the inbox UX actually wants (soak finding)
- PAT scope model (per-definition? per-engine? global machine token?)

# Plan 3 — MIT engine spoke: Hatchet first, Temporal with cause (STUB)

**Activate only if:** WDK's youth bites in practice (API churn, ops gaps) · OR engine-level queue control over AI concurrency is wanted · OR execution must move off Vercel entirely.

**Shape when activated:** one adapter (four verbs) + one worker. Worker = long-lived Node process, same repo (`workers/` entry importing `lib/domain` + Prisma), own Cloud Run service or VPS container — Hocuspocus deployment pattern, including migration-sync discipline (deploy worker after schema migrations; stale worker = old code executing steps). Engines share the VPS as containers; Hatchet shares the Postgres server (own database). Temporal only if in-flight versioning or its scale properties become genuinely necessary; its cluster is the heaviest ops bill in the lineup. Gate resume: Hatchet wait-for-event (verify maturity) with **flow-splitting as the universal fallback** (pre-gate + post-gate workflows; gate becomes pure app state).

**Inherits from Plans 1–2:** writer surface + idempotency, gate vocabulary, PAT + callback routes, the box, the settings panel. Remaining work is genuinely just the adapter + worker.
