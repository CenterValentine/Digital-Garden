# Workflows Foundation Plan

**Created:** 2026-07-11
**Branch:** `feature/workflows-foundation`
**Status:** Plan 1 ✅ COMPLETE (S1–S6, 2026-07-12) · Plan 2 (Builder + Interpreter) FULL, not started · Plan 3 (n8n spoke) SKETCH, demoted · Plan 4 (MIT engine) STUB
Soak 2026-07-12: user verified real BYOK AI + DOCX artifact live ("Unknown application dossier.docx"). Soak lesson: URL-only dispatch against JS-rendered job boards yields empty research ("0% fit" + model apology) — extension capture is the reliable path; gate framing must adapt to empty research (Plan 2 S5).

## Direction pivot (2026-07-12, post-soak)

User decision after testing Plan 1: **no hardened code recipes — in-app authoring is the product.** Users build their own automations in a builder; the `WorkflowPayload` ContentNode stub (previously thought legacy) was stubbed for exactly this. Consequences:
- **Plan 2 is now Builder + Interpreter** (below): one generic WDK workflow executes user-authored graphs as data; workflows become garden content.
- **n8n machinery demoted to Plan 3** (optional external-integration spoke); Activepieces contingency is moot — we build our own composition surface.
- **Per-engine workflow types**: `WorkflowPayload.engine` tags each workflow; the builder renders that engine's node palette. Launch engine: `wdk-interpreter@1`.
- Builder UI: **linear step-list first** (user-approved), graph model canvas-ready from day one; **React Flow** (`@xyflow/react`, MIT — the Flowise/Langflow/Dify canvas; n8n's is sibling Vue Flow) is the named canvas library for the stretch/followup.
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

## Session 3 — Job-application workflow (stubbed AI), inbox wiring, end-to-end proof ✅ (2026-07-12)

**Blocker dissolved:** the notifications event-log core (publishEvent, NOTIFICATION_KINDS, ActivityEvent/NotificationRecipient, /api/notifications) is already on main — no wait on the connections-inbox merge was needed for emission.

- [x] `server/wdk/workflows.ts` — jobApplicationWorkflow: research (STUB) → match (STUB) → `superviseGate("review-match")` → export (STUB) → finish. Real AI + DOCX land in Session 5.
- [x] Inbox integration: `openGate`/`finishRun` in the WRITER emit `workflow.gate` / `workflow.finished` via `publishEvent` — every engine gets notifications for free. Two new kinds registered in `lib/domain/notifications/kinds.ts` with Zod payload schemas.
- [x] Conversation linkage: `closeGate` persists `resumePayload.conversationId` onto the run (FK to Conversation, SetNull).
- [x] Manual dispatch affordance: curl + smoke script (S4's UI supersedes; notification ACTION buttons — Approve / Open in chat — are S4 client work).
- **Gate:** ✅ live end-to-end: dispatch → gate notification "Job match ready — 82% fit" in /api/notifications inbox → resume with `{approved, conversationId}` → conversation linked → succeeded → "Job Application Research finished" notification. Full event trail (7 events).

### Session 3 log — amendments discovered in execution

- **publishEvent contract**: throws on unknown kinds (closed registry — kinds MUST be added to `NOTIFICATION_KINDS`); filters recipients equal to `actorUserId`. Workflow emissions use `actorType: "extension"`, label "Workflows", NO actorUserId — otherwise the owner would never be notified of their own workflow's gates.
- **Notification emission is best-effort** in the writer (try/catch + warn) — a publish failure must never fail a run transition.
- **kinds.ts is shared with the connections-inbox worktree** — additive entries; expect a trivial merge when that branch lands.
- **zsh footgun in manual testing**: `$RUN:review-match` in a curl body triggers zsh's `:r` history modifier and corrupts the token → spurious GATE_MISMATCH. Build JSON with python/jq, not shell interpolation.

## Session 4 — Extension UI ✅ (2026-07-12)

- [x] `client.tsx` + `components/WorkflowsPanel.tsx`: RunList (status filter dropdown), RunDetail with seq-ordered timeline, GateCard (title/body from gate.opened payload + Approve/Decline), artifact list section, Cancel button, dispatch Run menu (URL prompt for job-application).
- [x] `state/workflow-runs-store.ts` (Zustand). Detail polls every 3s only while open AND run non-terminal; list is manual-refresh + refetch after actions.
- [x] Manifest: nav view item (`WORKFLOWS_VIEW_KEY`), `surfaces: ["left-sidebar"]`, `enabledByDefault: true`. Notification kind renderers (`workflow.gate` with inline Approve action, `workflow.finished`) registered via `ExtensionRuntime.notificationKindRenderers`.
- [x] Dark-variant classes throughout; Playwright dark-mode spec deferred to the authenticated-routes stub (auth fixture still pending repo-wide).
- **Gate:** ✅ full journey driven by scripted real-browser clicks (Playwright ad-hoc, chromium): nav → panel → Run menu dispatch with URL prompt → run detail → amber GateCard "Job match ready — 82% fit" → Approve → succeeded pill + 7-event timeline. Screenshots verified visually.

### Session 4 log — amendments discovered in execution

- **Client-safe types** live in `extensions/workflows/shared.ts` (no Prisma imports); list/detail endpoints now include `definition {slug,name}` for display.
- **Dispatch menu width**: `w-56` overflowed the ~200px sidebar (clipped left) — `w-44` fits. If the menu grows, portal it to document.body per the fixed-menus lesson.
- **"Open in chat" gate action deferred**: conversation seeding from run output needs deliberate chat-engine integration (conversation create + seeded context per AI-chat conventions); the server side (resume payload `conversationId` → run link) already works. Follow-up recorded for the backlog — the inbox card and GateCard ship with Approve/Decline only for now.
- **Inbox UI already on main** (NotificationBell/NotificationListItem) — workflow notifications render there today; bell badge verified showing workflow notifications in the browser smoke.

## Session 5 — Real AI research + DOCX exporter ✅* (2026-07-12)

- [x] Research + match steps via `resolveFeatureRoute(ownerId, "chat")` + `executeWithFallback` + `resolveChatModelFromConnection` + `generateText` — BYOK and fallback chains preserved. **Amendment: plain feature-routed steps instead of DurableAgent** — model instances aren't serializable into the workflow sandbox, and step-level generateText keeps BYOK routing without gateway keys. DurableAgent revisit-worthy when streaming agent thoughts matters.
- [x] Match step reads the resume note's `NotePayload.searchText` by ContentNode id (`resumeNoteId` input, optional).
- [x] **DOCXConverter implemented** (`lib/domain/export/converters/docx.ts`, `docx` pkg): paragraphs, headings 1–6, lists (as bullets), blockquotes, code blocks, bold/italic/underline/strike/code; unknown nodes degrade to text. Valid Word file proven (PK container, opens as zip).
- [x] Export step: dossier TipTap (research + match + source) → DOCX → user storage upload → FilePayload ContentNode in root "Job Applications" folder → `attachArtifact`. Mirrors the TTS generate-and-store pattern.
- **Gate (env-limited):** declined path proven live end-to-end; research/match execute the real code path and degrade to `stubbed: true`-flagged results when no AI route exists (this local Docker dev DB has no AIConnection rows). Approve-path artifact creation blocked HERE by an environmental R2 SSL handshake failure (local `StorageProviderConfig` r2 row + copied env creds don't work from this worktree env). **Soak item for the user's normal env: one approved run with real keys + storage → verify dossier lands in the folder.**

### Session 5 log — amendments discovered in execution

- **Error-semantics gap found and fixed (the big one):** a step that exhausts WDK retries bubbles a FatalError; without workflow-level handling, the workflow dies but `finishRun` never fires — the run row sticks at `running` forever while the engine knows it failed. Fix: try/catch around STEP SECTIONS (research/match, export+succeed) that `failRunStep` + re-throw; the GATE stays outside any try (suspension-as-control-flow hazard). Pattern is now documented in the workflow body comment; any future WDK workflow must follow it.
- **No AI route → flagged stubs, not failures** (`stubbed: true` in event payloads + results) — keyless dev environments stay usable and honest.
- **URL-only dispatches fetch the page server-side** (bounded: http/https, 15s timeout, tag-strip, 16k cap) until S6's extension capture provides pageText.
- **Step payload discipline**: only a 6k listing excerpt crosses step boundaries.
- Stuck run from the pre-fix failure canceled via API; lint improved to 151 warnings (implementing DOCX removed 2 stub warnings).

## Session 6 — Browser-extension capture, polish, docs ✅ (2026-07-12)

- [x] Extension context menu "Research job posting in Digital Garden" (page + action contexts): `chrome.scripting.executeScript` extracts `document.body.innerText` (60k cap; new `scripting` permission — **reload in chrome://extensions**), POSTs to the new Bearer-authed `/api/integrations/browser-extension/workflow-dispatch` route (trusted-browser token, proxy-not-share), badge feedback. `pnpm extension:build` run.
- [x] Capture stored as content at dispatch via new `WorkflowDefinitionSpec.prepareInput` hook: pageText → "Capture — {title}" note in the Job Applications folder; stored run input carries `captureNodeId` only (verified live: pageText dropped, note created). Research step reads the capture note.
- [x] Error UX: failed runs emit `workflow.finished` (status failed) inbox notifications + run detail error panel (S4/S5 work); restricted pages (chrome://, PDFs) fall back to URL-only dispatch with server-side fetch.
- [x] Tracking docs: STATUS.md Recent Completions entry, BACKLOG.md "Workflows Foundation Followups" section, this doc.
- **Gate:** capture-shaped dispatch verified live end-to-end (capture note + reference-only input + gate). **SOAK deferred to the user** — real listings, real keys, real storage in the primary env; harvest into the Plan 2 sketch before promotion.

### Plan 1 completion checklist

- [ ] All six session gates passed; `pnpm build` green
- [ ] Soak period observed; UX lessons written into Plan 2 sketch below
- [ ] STATUS.md / BACKLOG.md updated
- [ ] PR in sprint format with preflight checklist

---

# Plan 2 — Builder + Interpreter (FULL)

**Goal:** user-authored workflows as garden content, executed durably on WDK. No hardened recipes.

## Architecture

- **Workflow = content**: `ContentNode(contentType: "workflow")` + `WorkflowPayload { engine, definition: WorkflowGraph, enabled }`. Created from the + menu (un-gray the existing "Workflow (Automation)" item). Slugs, tree placement, trash — garden semantics free.
- **Builder = the content viewer** for the workflow type, owned by the workflows extension (`client.tsx` matcher per extension conventions).
- **Interpreter = one generic WDK workflow** that walks a graph snapshot. To the Plan 1 hub it's just another engineRef — run tables, gates, inbox, panel UI all unchanged.
- **Graph snapshotted into run input at dispatch** — satisfies WDK replay determinism AND makes in-flight runs immune to live edits (append-only versioning becomes automatic, not a convention).

```ts
interface WorkflowGraph {
  version: 1;
  engine: "wdk-interpreter@1";     // per-engine workflow types: palette + executor keyed by this
  entryNodeId: string;
  nodes: Array<{
    id: string;
    type: string;                   // node-type registry key
    label?: string;
    config: Record<string, unknown>; // validated by the node type's Zod schema
    position?: { x: number; y: number }; // unused by the list renderer; reserved for the canvas
  }>;
  edges: Array<{ id: string; from: string; to: string; condition?: { path: string; equals: unknown } }>;
}
```

## Session 1 — Graph schema + node-type registry ✅ (2026-07-13)

- [x] Zod `WorkflowGraph` schema (`graph/schema.ts`) + structural validation (`graph/validate.ts`: entry/edge integrity, branch true/false edge rules, cycle rejection, reachability) — both CLIENT-SAFE so the builder validates with the exact server rules
- [x] Client/server split per AI-tools convention: `nodes/metadata.ts` (palette + config FIELD SPECS + output hints) / `nodes/registry.ts` (server executors). `buildConfigSchema(fields)` derives Zod from the field specs — forms and enforcement cannot drift
- [x] All ten launch nodes: step executors for `ai-complete` (via `generateViaChatRoute`, throws on no-route — user-authored nodes fail honestly, no silent stubs), `fetch-url`, `http-request` (http/https, 15s, 1MB cap, status returned for branching), `get-content`, `store-content`, `export-docx` (text→TipTap: #headings/- bullets/paragraphs), `notify` (new `workflow.notify` kind); `gate`/`delay`/`branch` are `execution: "control"` — interpreter-level (S2)
- [x] `graph/interpolate.ts` — `{{input.path}}` / `{{nodeId.path}}` template resolution (pure, missing-path warnings), needed for the fixture's dynamic gate title parity
- **Gate:** ✅ `scripts/workflows-graph-check.ts` — job-application-as-graph fixture: schema parse + JSON round-trip, structural validation, palette coverage, all templates resolve, cycle detection rejects a looped variant (11/11). typecheck/lint (151w/0e baseline)/build green.

### P2 Session 1 log — amendments

- **Interpolation pulled forward from S2**: the fixture's parity gate title ("Job match ready — {{match.json.score}}% fit") needs it; it's pure and client-safe, so the builder gets live template preview for free.
- **Edge `condition` replaced by branch-node + labeled edges** (`branch: "true" | "false"`, false edge optional = run ends) — one routing mechanism, not two; fits the list UI's if/else block.
- **`ai-complete` throws on missing AI route** (unlike Plan 1's flagged stubs) — a user-authored node silently stubbing a generic prompt would be a lie; the run fails visibly instead.
- **Gate script can't import the server registry** (`server-only` marker in the AI features barrel breaks standalone tsx) — script checks the client-safe layers; executor coverage will be asserted at interpreter module boot (S2).
- Numbers are deliberately non-interpolatable (strict Zod validation); `position` field reserved for the React Flow canvas is in the schema from day one.

## Session 2 — Interpreter workflow ⚪

- [ ] `interpreterWorkflow` ("use workflow"): walk the snapshot, execute each node as a retryable step; node outputs into a serializable ctx keyed by node id (IDs-not-blobs budget: cap ctx entries, big things become content references)
- [ ] `gate` nodes → `superviseGate(runId, node.id, …)` (deterministic tokens per node); `delay` → `sleep()`; `branch` = pure edge selection on ctx
- [ ] Plan 1 error semantics: step sections try/catch → failRunStep + rethrow; gates never wrapped
- [ ] Per-node timeline events (`step.completed` key `node:{id}`); register `interpreter` in `WDK_WORKFLOWS`; definition spec whose `prepareInput` snapshots the graph from a workflow content node
- **Gate:** the job-application graph fixture dispatches through the interpreter end-to-end — gate suspends, resume completes, dossier artifact attaches (parity with Plan 1 S5).

## Session 3 — Workflow as content ⚪

- [ ] Wire the + menu "Workflow (Automation)" item: creates node + payload (`engine: "wdk-interpreter@1"`, starter graph, `enabled: true` — retire the hard-coded false)
- [ ] Owner-scoped payload CRUD (graph read/save with schema validation) + dispatch-from-content endpoint (content → snapshot → run)
- [ ] Reconcile `WorkflowDefinition` ↔ content node (definition row per workflow node; decide engineRef encoding vs. new column — log the decision)
- **Gate:** create → edit graph via API → dispatch → run appears in the panel with per-node timeline.

## Session 4 — Builder UI v1: linear step list ⚪

- [ ] Content-viewer registration for `contentType: "workflow"` (builder renders in the main pane)
- [ ] Step-list editor: add/remove/reorder nodes from the client-safe palette, per-node config forms generated from config schemas, minimal branch (if/else) support, inline validation, save, Run button
- [ ] Dark mode + design tokens; disabled-extension behavior via registry filters
- **Gate:** author the job-application workflow from scratch in the browser, dispatch it, approve at the gate, dossier lands — no code touched.

## Session 5 — Parity, polish, retirement ⚪

- [ ] Gate-framing fix (soak lesson): empty/failed research must not render as a scored match — gate summary adapts to data quality
- [ ] Run detail renders the executed graph snapshot with per-node status (list form)
- [ ] Job-application ships as a **starter template graph**; retire the hardened `jobApplicationWorkflow` code path (keep `gate-probe` as engine plumbing test); extension capture dispatches the user's graph
- [ ] Tracking docs (STATUS/BACKLOG/this doc) + soak handoff
- **Gate:** full authored-workflow journey in the browser; zero first-party recipe code remains in the dispatch menu.

## Session 6 — React Flow canvas (STRETCH) ⚪

- [ ] `@xyflow/react` (MIT; keep the default attribution) rendering the same nodes/edges; custom node components on design tokens; the list stays as the fallback editor
- [ ] Honest scope line: canvas *mechanics* (pan/zoom/drag/minimap) come free from the library; the cost is editor chrome (undo/redo, copy/paste, keyboard) — ship at feature parity with the list, no more
- **Gate:** the same graph edits round-trip between list and canvas.

---

# Plan 3 — External-engine machinery + n8n (SKETCH — demoted 2026-07-12, optional)

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

# Plan 4 — MIT engine spoke: Hatchet first, Temporal with cause (STUB)

**Activate only if:** WDK's youth bites in practice (API churn, ops gaps) · OR engine-level queue control over AI concurrency is wanted · OR execution must move off Vercel entirely.

**Shape when activated:** one adapter (four verbs) + one worker. Worker = long-lived Node process, same repo (`workers/` entry importing `lib/domain` + Prisma), own Cloud Run service or VPS container — Hocuspocus deployment pattern, including migration-sync discipline (deploy worker after schema migrations; stale worker = old code executing steps). Engines share the VPS as containers; Hatchet shares the Postgres server (own database). Temporal only if in-flight versioning or its scale properties become genuinely necessary; its cluster is the heaviest ops bill in the lineup. Gate resume: Hatchet wait-for-event (verify maturity) with **flow-splitting as the universal fallback** (pre-gate + post-gate workflows; gate becomes pure app state).

**Inherits from Plans 1–3:** writer surface + idempotency, gate vocabulary, PAT + callback routes, the box, the settings panel. Remaining work is genuinely just the adapter + worker.

---

# Licensing appendix (verified 2026-07-12)

Current posture: private test instance, personal use — **nothing in the stack requires any action today.** Trigger points are all at "offer to the public / charge money."

| Component | License (source) | Personal/test | If public + paid |
|---|---|---|---|
| Workflow DevKit (`workflow`, `@workflow/*`) | **Apache-2.0** (verified in node_modules LICENSE.md) | ✅ nothing | ✅ SaaS use has no obligations; keep LICENSE/NOTICE only if *distributing* code. Patent grant included. |
| `docx` | **MIT** (verified) | ✅ | ✅ notice preservation in distributed source only |
| React Flow `@xyflow/react` (Plan 2 S6) | **MIT** — verify at install | ✅ | ✅ legally. Nuance: default canvas shows a small "React Flow" attribution; maintainers ask you keep it or subscribe to Pro (paid examples/support, not a license). **Policy: keep the attribution.** |
| n8n (Plan 3, optional) | **Sustainable Use License** (fair-code, NOT open source) | ✅ self-host for personal/internal use | ⚠️ **Tripwire:** offering n8n functionality *to your users* (embed, white-label, hosted access) requires a paid n8n embed license. Personal companion use stays fine even if the app is commercial. Community nodes we publish must be MIT for n8n's verified registry. |
| Hatchet / Temporal (Plan 4) | **MIT** — verify at adoption | ✅ | ✅ |
| Activepieces | moot (own builder) — MIT core, paid EE embed SDK, Angular frontend (iframe-only embedding) | — | — |
| AI providers | BYOK: each key's owner bound by their own provider ToS | ✅ | ⚠️ house keys for other users → commercial API terms + usage-policy pass at pricing time |
| Chrome extension | unpacked personal install | ✅ | ⚠️ Web Store publishing → developer account, permission justifications (incl. new `scripting`), privacy policy |

**Homework checklist (all deferred until "go public" is real):**
- [ ] Add a license inventory to CI (`pnpm licenses list` is built in) and snapshot THIRD-PARTY-NOTICES.md before launch
- [ ] Re-verify licenses on major version bumps — relicensing happens (Terraform→BSL, Redis precedents)
- [ ] React Flow attribution/Pro decision if the canvas becomes core to a paid product
- [ ] n8n embed license ONLY if n8n features become user-facing (Plan 3 gate)
- [ ] Provider ToS + data-processing pass if house-key multi-user
- [ ] Chrome Web Store compliance pass if the extension ships publicly
