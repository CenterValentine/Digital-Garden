# Extension Workflows Plan — Capture → Supervise → Tweak in the Browser

**Created:** 2026-07-13
**Branch:** `feature/workflows-extension` (worktree, stacked on `feature/workflows-foundation` @ `fda5868`)
**Status:** Phase 0 ✅ COMPLETE (2026-07-13, gates green) · Phases 1–4 pending. UI design aligned 2026-07-13.
**Depends on:** `feature/workflows-foundation` (WDK interpreter, the one dispatch door, runs API, `WorkflowsPanel`/`RunDetail`, `/embed/content/[id]` route). This plan **completes the "extension capture" edge** the foundation plan sketched as "Session 6" — the server auto-route path exists; the extension chrome and the chooser/supervise surfaces do not.

---

## Vision — the journey, completed at the edge

The workflows epic's proving journey (job listing → dispatch → AI research → gate → approve → DOCX → done) currently starts *inside the app*. This plan moves the **start and the supervision to where the user actually is**: their browser, on the page. The browser extension becomes a **first-class workflow surface at parity with notes** — you already "Launch Note" into the in-page overlay; now you *run a workflow on this page*, watch it, and doctor it without leaving the tab.

> **Soak lesson carried in (2026-07-12):** URL-only dispatch against JS-rendered job boards yields empty research ("0% fit" + a model apology). The extension is the reliable capture path precisely because it can send the **rendered page text**, not just a URL. Sending `pageText` is therefore a hard requirement of every dispatch path below, not a nicety.

---

## Design decisions — locked 2026-07-13

Chosen in a pre-planning UI review with the user:

| # | Decision | Choice | Consequence |
|---|---|---|---|
| 1 | Deep "supervise / tweak / fix in page" surface | **Reuse the app embed iframe** (`/embed/content/{id}`) | Full-fidelity real `WorkflowBuilder` + `RunDetail`; auto-parity with the app. **But** the embed route currently falls through to `EmbedFallback` for `workflow` type → a **workflow embed viewer is new work** (Phase 0). |
| 2 | How the target workflow is chosen at initiation | **Explicit chooser** (pick from your workflows) | Needs a bearer-authed **workflows-list** endpoint + a **target-specific dispatch** (store page → `dispatchWorkflowFromContent`), beyond the existing auto-route door. |
| 3 | Ambient status channels | **Toolbar badge dot + in-page dispatch toast + popup Runs list** | Needs bearer-authed **runs-read** endpoints. |
| 4 | Where the code lives | **Worktree stacked on `feature/workflows-foundation`** | This branch. Server + extension build as one unit; ships when foundation merges. |

**Explicitly dropped:** system notifications → **no new manifest permission**, smaller footprint. Gate approve/decline happens inside the embedded real app (session-authed), so we never duplicate gate resolution in a bearer route.

---

## The organizing principle: the auth seam = the iframe boundary

Everything **shallow** (badge, toast, popup list, dispatch) runs in extension contexts (background / popup / content-script) and authenticates with the **trusted-install bearer token** → so those reads/writes need **new `/api/integrations/browser-extension/…` routes**. Everything **deep** runs **inside the embed iframe**, which authenticates as a first-party **app session** (`?_t=` token → cookie) → so it **reuses the existing session-authed** `WorkflowsPanel`/`RunDetail`/resume/cancel with **zero new server code**.

| Concern | Auth | Route | New? |
|---|---|---|---|
| List workflows for the chooser | bearer | `GET /integrations/browser-extension/workflows` | ✅ new |
| Dispatch a chosen workflow on a page | bearer | `POST /integrations/browser-extension/workflow-dispatch` (extend) | ✏️ extend |
| Poll runs (badge + popup list) | bearer | `GET /integrations/browser-extension/workflows/runs` | ✅ new |
| Run detail for popup expand | bearer | `GET /integrations/browser-extension/workflows/runs/[id]` | ✅ new |
| Supervise / gate / cancel / edit graph | **session (in iframe)** | existing `/api/workflows/*` + `/embed/content/[id]` | reuse |
| Render workflow in the embed | session | `app/embed/content/[id]/page.tsx` (add `workflow` branch) | ✅ new viewer |

---

## Frozen contracts

Extension-facing DTOs are a **compact subset** of the app's `WorkflowRunDto` (`extensions/workflows/shared.ts`) — the extension must never depend on Prisma types.

```ts
// Chooser
interface ExtensionWorkflowListItem {
  id: string;            // workflow ContentNode id
  title: string;
  enabled: boolean;
  engine: string | null;          // "wdk" (Trellis) | "n8n" | … — for the engine chip
  triggerType: string | null;     // e.g. "trigger-page-capture"
  urlPattern: string | null;      // page-capture glob, if any
  matchesPage: boolean;           // computed server-side from ?pageUrl=
}

// Badge + popup list
interface ExtensionRunListItem {
  id: string;
  status: WorkflowRunStatusValue; // reuse the shared union
  workflowName: string;
  engine: string;                 // denormalized run engine ("wdk" | "n8n" | …)
  needsReview: boolean;           // status === "waiting" && gateToken != null
  createdAt: string;              // ISO
  finishedAt: string | null;
}

// Dispatch response (unchanged from existing route)
interface ExtensionDispatchResult { runId: string; status: WorkflowRunStatusValue; }
```

**Deep-open URL contract:** overlay opens `\/embed/content/{workflowId}?run={runId}&_t={sessionToken}`. The embed workflow viewer opens that run's detail when `?run=` is present, else lands on the Runs tab.

**Badge state precedence** (most-urgent wins across all active runs): `failed` (red) → `waiting` (amber) → `running` (blue) → recently `succeeded` (green, decays after ~10s) → none (clear).

---

## Phases (rolling wave — each independently shippable behind extension presence)

### Phase 0 — Seam + contracts (server, this branch) ✅ COMPLETE 2026-07-13
The foundation the extension consumes. Build and freeze first.
- [x] Extract the URL-glob matcher out of `dispatch.ts` → `extensions/workflows/graph/url-match.ts` (`parseUrlPatterns`, `globToRegExp`, `urlMatchesPatterns`, `readEntryTrigger`). Shared by the list endpoint and `pickCaptureTarget`.
- [x] `GET /integrations/browser-extension/workflows` (bearer) — enabled workflow content nodes → `ExtensionWorkflowListItem[]`; `?pageUrl=` computes `matchesPage` (specific pattern only, not catch-all), matches sort first.
- [x] Extend `POST /integrations/browser-extension/workflow-dispatch` — optional `workflowId`. Present → `dispatchCaptureToWorkflowContent` (new; stores page + `dispatchWorkflowFromContent`); absent → `dispatchCaptureToUserWorkflow` auto-route. Shared `buildCaptureRunData` makes **both** persist the capture note.
- [x] `GET /integrations/browser-extension/workflows/runs?status=&limit=` (bearer) → `ExtensionRunListItem[]` (compact; `needsReview` pre-computed).
- [x] `GET /integrations/browser-extension/workflows/runs/[id]` (bearer) → full `WorkflowRunDto`.
- [x] Extract `RunDetail` (+ `GateCard`, `RunTimeline`, `RunGraphSteps`, `StatusPill`, `readError`) from `WorkflowsPanel.tsx` → exported `RunDetail.tsx`; `WorkflowsPanel` re-imports, behavior unchanged.
- [x] **Workflow embed viewer**: `if (contentType === "workflow")` in `app/embed/content/[id]/page.tsx` → `EmbedWorkflowClient` in `EmbedViewerShell`, two tabs — **Runs** (`RunDetail`, `?run=` deep-link) and **Edit** (`WorkflowBuilder`). Width-fluid.
- [x] ~~Verify embed API auth~~ **verified 2026-07-13**: `app/embed/layout.tsx` wraps `window.fetch` to inject `x-embed-session`; iframe fetches to `/api/workflows/*` authenticate despite the `/embed`-scoped cookie.

**Gate:** ✅ typecheck clean · lint 0 errors (151/175 warnings) · build compiled all 3 bearer routes + embed route. **Still owed** (needs a running dev server + trusted-install token — do at Phase 1 smoke): curl each bearer route; open a `workflow` id at `/embed/content/{id}` in a browser and confirm builder + runs render, not the fallback.

### Phase 1 — Initiate + immediate acknowledgement (extension) ✅ CODE COMPLETE 2026-07-13 (smoke pending)
- [x] Background: `list-workflows` (bearer GET `/workflows?pageUrl=`); `dispatch-workflow` — extracts rendered **pageText** via `dg-extract-page-text` content-script message (100k cap, degrades to URL-only on restricted pages), bearer POST with `workflowId`, returns `{runId}`, then best-effort mounts the pill; `get-workflow-run` poll target.
- [x] Popup: **"Run Workflow ▾" chooser** — engine chip (Trellis / n8n), `matchesPage` rows first with "matches page" chip, disabled rows greyed; dispatch feedback via the existing status row.
- [x] Overlay: **dispatch status pill** (standalone, bottom-right) — polls through the background every 3s (10-min cap), queued→running→needs-review→done/failed with engine chip for non-wdk; succeeded lingers 6s, failed stays until dismissed. `[View]` deliberately deferred to Phase 3.

**Gate:** ✅ **SMOKE PASSED 2026-07-16** (user-verified from portal.telnyx.com): chooser listed all 9 workflows, dispatch acknowledged in popup, pill tracked *Workflow II* → green **Completed**. P0's owed embed check ALSO passed — the overlay opened the workflow as a content panel rendering `EmbedWorkflowClient` (Runs/Edit tabs + real builder), not the fallback. Setup lessons recorded: Chrome loads the unpacked extension per-absolute-path (worktree ≠ main checkout → re-pair under new extension ID); Chrome 150 local-network-access prompt must be **Allowed** for https-page → localhost embeds. Remaining nit: verify the "Capture — …" note carries pageText (user to eyeball).

### Phase 2 — Ambient status (background + popup)
- [ ] Background: `dg-workflow-poll` alarm (~60s baseline; tighter on-demand cadence while a dispatch from this browser is active) → bearer runs list → compute most-urgent state → `setBadgeText`/`setBadgeBackgroundColor`; cache runs in `chrome.storage`.
- [ ] Popup: **Runs section** below the chooser — recent runs, status pills (reuse the app's `STATUS_STYLES` palette for consistency), `needsReview` flag pinned to top, tap → open deep. Empty/error/no-connection states.

**Gate:** Badge reflects the run lifecycle across tab switches and after popup close; popup list matches the app's `WorkflowsPanel` for the same account.

### Phase 3 — Deep supervise / tweak (overlay embed)
- [ ] Overlay: open a workflow/run via the **existing embed-iframe floating panel** pointed at `/embed/content/{workflowId}?run={runId}`. Reuse `attachEmbedForPanel`/session-token flow verbatim — no new iframe machinery.
- [ ] Wire `[View]` / "Open in page" from the toast (Phase 1) and the popup list (Phase 2) into this panel.
- [ ] **Retry** = re-dispatch reusing the failed run's `input.data` (including `captureNodeId`) via `dispatchWorkflowFromContent` — NOT a fresh capture; the user may have navigated away from the page, so the original stored capture is the only faithful input. Surfaced in the embed viewer + popup. **Gate approve/decline + cancel** happen inside the embedded real app (session-authed) — verify end-to-end. **Edit flow** = the embed viewer's Edit tab (`WorkflowBuilder`) → re-run.

**Gate:** toast → open deep → steps/timeline/gate visible → approve in-page → run resumes → completes; edit the graph in the Edit tab → re-run picks up the change.

### Phase 4 — Secondary surfaces + polish + ship gates
- [ ] Context-menu item "Run Digital Garden workflow on this page" (+ a selection variant where `pageText` = the selection). Reuses the Phase 1 dispatch path.
- [ ] Disabled/empty parity: account with the Workflows extension disabled → chooser shows a graceful empty state, no dead surfaces.
- [ ] Mobile alignment: adaptive chooser (popup dropdown on desktop, bottom-sheet <768px), ≥44px touch targets, width-fluid embed panel.
- [ ] Full `typecheck → lint → build`; browser smoke on 2–3 real sites; update `STATUS.md` + `BACKLOG.md`; PR in **sprint format** with a grouped preflight checklist.

**Gate:** all quality gates green; smoke passed on real pages; tracking docs updated.

---

## Footguns & open questions (surface before they bite)

- **Send `pageText`, always.** The whole reason the extension beats in-app URL dispatch. Capture the *rendered* DOM text at dispatch time (content script), never a server-side URL fetch. The chosen-workflow path must call `storeCapturedPage` too, or the run gets a URL with no body (the exact soak failure).
- **Gate resolution is deferred to the embed** in v1 — the popup's "needs review" only deep-links; there is **no bearer resume route**. If inline popup approve is wanted later, add a bearer `POST /workflows/runs/[id]/resume` guarded by the gate token. (Open question — recommend deferring.)
- **Embed viewer must not assume desktop widths.** It renders in a resizable floating panel and on mobile drawers; enforce width-fluid + 44px targets from the first stub (intersects the `feat/mobile-compat` worktree).
- **`pnpm extension:build` after every `src/` edit**, then remind the user to reload in `chrome://extensions` — the manifest loads from `dist/`, not `src/`.
- **Rebase discipline:** this branch stacks on `feature/workflows-foundation`; when the foundation moves, rebase this worktree before continuing. Confirm the `pnpm` path banner points at `.claude/worktrees/workflows-extension` when running gates.
- **Dev server port:** start this worktree's dev server with an explicit free port (`next dev --port 3022`) to avoid the silent-port-migration trap with other running worktrees.
- **No new manifest permissions** (notifications dropped) — if that changes, it's a manifest bump + re-review.

---

## Two-engine architecture — P3 (n8n) reconciliation (assessed 2026-07-13)

P3 (`feature/workflows-n8n`, PR #107, **complete; parity soak deferred**) is a
sibling branch, NOT in this base. Its architecture changes what "run a workflow
in the browser" means, and this plan must complement it. Findings:

- **One workflow type, many engines.** There is no separate "n8n workflow." A
  Trellis Flow (`contentType: "workflow"`) carries a `workflowPayload.engine`
  column (`"wdk"` | `"n8n"` | …). Authoring is always the Trellis builder; the
  engine is a property, chosen/pushed there. "Any desired workflow type in the
  browser" = **any engine**, not a second content type.
- **Browser dispatch is already engine-agnostic BY DELEGATION.** Our
  `dispatchCaptureToWorkflowContent` → `dispatchWorkflowFromContent`, and P3
  taught *that one function* to branch on engine (`n8n` → poke the pushed
  webhook; `wdk` → interpreter). Our wrapper adds zero engine logic, so once P3
  merges, **browser capture runs n8n workflows for free.** Do NOT re-add an
  engine guard in the wrapper — the single trigger door owns routing.
- **Schema needs nothing new.** `WorkflowPayload.engine`/`.metadata` and
  `WorkflowRun.engine` already exist in this base — P3 added no columns. So the
  extension DTOs carry `engine` **now** (done in Phase 0), and Phases 1–3 are
  built engine-aware from the start, not retrofitted.
- **RunDetail degrades gracefully for n8n.** P3's n8n run input is `data` only
  (no `graph`), so `RunGraphSteps` safe-parses undefined → renders nothing;
  timeline, status, gates, artifacts still render. A richer n8n step view is a
  **deferred enhancement**, not a P0 blocker.
- **"Not pushed yet" is communicated by error, not pre-flight.** Dispatching an
  n8n workflow with no `webhookPath` returns a clean `ENGINE_ERROR` ("hasn't
  been pushed to n8n yet — save it to push"), which the dispatch toast surfaces.
  A chooser pre-flight badge (read `metadata.webhookPath`) is a nicety for after
  the merge, when P3's `readN8nMetadata` shape is in-tree.

### What each extension surface does with `engine` (Phases 1–3)
- **Popup chooser** — show an engine chip (Trellis / n8n) per workflow; the pick
  still just sends `workflowId`. Un-pushed n8n → dispatch error in the toast.
- **Dispatch toast / popup runs list / badge** — carry the run's `engine` so the
  user sees *where* it runs; status semantics are identical across engines.
- **Embed deep surface** — Runs tab reuses `RunDetail` (graceful n8n degrade);
  Edit tab reuses `WorkflowBuilder`, inheriting P3's engine selector + push-on-
  save. Editing an n8n workflow in-page then re-running Just Works via the door.

### Merge reconciliation with P3
Both branches edited `extensions/workflows/server/dispatch.ts`. Expect a textual
conflict; the resolution is **semantically clean**: keep P3's engine branching
inside `dispatchWorkflowFromContent`; keep our `url-match.ts` extraction,
`buildCaptureRunData`, and `dispatchCaptureToWorkflowContent` wrapper. The
wrapper is engine-neutral, so no logic merges — only imports + adjacent hunks.
Land order is arbitrary; whoever rebases second resolves the import block.

## Cross-branch coordination
- `feature/workflows-foundation` — parent; **PR #103 → main is OPEN (2026-07-13)**. This plan cannot ship before it. If #103 takes review changes, rebase this worktree; once it merges, retarget this branch onto main. Foundation still needs a real prisma migration (was `db push`) — that lands there, not here.
- `feature/workflows-n8n` — sibling (PR #107, complete). Shares `dispatch.ts`; see reconciliation above. Both should converge on foundation/main; neither blocks the other's build.
- `feat/mobile-compat` — width-fluid embed + touch targets align here; land Phase 3's embed viewer mindful of ResizablePanels/right-sidebar conflicts (the embed viewer is a new route, so conflict surface is low).
- `feat/settings-reorg` (unmerged) — if the extension exposes a settings toggle (e.g. default workflow), mount under `/settings/extensions/browser-bookmarks`.
