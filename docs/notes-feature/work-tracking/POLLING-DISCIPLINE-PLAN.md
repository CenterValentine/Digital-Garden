# Polling Discipline — decisions, shipped work, and what remains

**Last updated:** 2026-09-09
**Status:** Phase 0 shipped (PR #213). Phases 1–4 not started.
**Invariant:** *the page goes cold when nobody is actively using it.*

---

## Why

September 2026's infrastructure bill carried two line items driven by one behaviour:

| Line | Amount | Cause |
|---|---|---|
| Vercel Fluid Provisioned Memory | **$15.96** | SSE streams held open for the life of a tab; memory bills for a request's entire lifetime including I/O wait |
| Neon compute | **$16.39** | 10 s polls meant the database never accumulated the 5 min of idle it needs to autosuspend |

Storage was **$0.02**. The database is 61 MB. Neither number was about data — both were about *never being allowed to go quiet*.

On a fixed-price server a query every 10 s is free and invisible. On metered infrastructure the same loop is billed twice: once for the function that serves it, once for the database that stays awake. See [PLATFORM-PORTABILITY.md](../infrastructure/PLATFORM-PORTABILITY.md).

---

## Decisions of record

Numbered so later work can cite them. Each records the reasoning, not just the outcome.

### D1 — Presence fallback policy: **awareness-only**

When Hocuspocus is disconnected (sleep mode is a deliberate cost feature, PR #101), presence shows **nothing**. We do not fall back to Postgres for the disconnected case.

*Rationale:* if the collaboration server is out, we genuinely don't know who else is there. Showing stale Postgres data is worse than showing none — the grey badge already tells the user they're disconnected.

*Rejected:* (b) awareness-when-connected / Postgres-when-asleep — retains the whole cost path for a case with little value. (c) wake Hocuspocus on presence request — trades Cloud Run time for Neon time at `min-instances=0`; a bad trade.

### D2 — "Awareness-only" is narrower than it sounds

Consumer audit:

| Endpoint | Consumers |
|---|---|
| `/api/collaboration/presence/stream` (SSE) | **1** — `runtime.ts:1327` |
| `/api/collaboration/presence` (batch) | **3** — `presence-poll.ts`, `MainPanelHeader.tsx`, `SharedContentViewer.tsx` |

**In scope to delete:** the SSE route, its 10 s server-side Postgres poll, and the `presenceStreamSuspended` machinery.

**Must stay:** the `CollaborationPresence` table, the heartbeat writes, and the batch route. The other three consumers ask a question awareness structurally cannot answer:

- `MainPanelHeader` needs presence for **many contentIds at once** (the tab strip); awareness is per-document and only the *active* document has a provider.
- `presence-poll.ts` powers the Note Window **edit gate** — asked about documents you are explicitly not editing.
- `SharedContentViewer` is a public page with **no Hocuspocus connection at all**.

### D3 — `AuthSessionSync`: 10 s → 60 s

*Rationale:* drives **proactive UI sign-out only**. Authorization happens server-side on every real API call, so a slower poll means a stale UI, never an unauthorized action. It mounts app-wide, so its interval multiplied by every open tab — the largest single source of idle DB load. Paired with an immediate re-check on tab-visible.

### D4 — `SharedContentViewer`: split the write from the read

Was one `tick` at 10 s doing both. Now:

```
heartbeat      30s   — MUST stay under STALE_AFTER_MS (45_000)
presence read  60s   — pure display, no correctness constraint
```

*Rationale:* a flat 60 s would have pushed the heartbeat past the 45 s staleness window, ageing the viewer out of their own presence record and flickering them in and out for everyone else. Bundling the two is what forced the read to run at the write's cadence. 30 s leaves a 15 s margin, so one dropped beat is survivable.

### D5 — Presence intervals stay at 10 s

`MainPanelHeader` and `presence-poll` remain at 10 s because that cadence is **coupled to `STALE_AFTER_MS = 45_000`** in `presence-server.ts`. Changing it means changing both, which belongs with the presence work (Phase 1), not with gating.

### D6 — Runs: 3 s → 5 s

`RunsPanel` and `RunDetail`. Step transitions are seconds-scale, so the extra 2 s is imperceptible to a watcher while cutting request volume 40%. Both effects are already double-gated (`anyRunning` / non-terminal), so an idle panel costs nothing at all — which is what makes the live cadence affordable.

### D7 — Runs are exempt from **idle** gating

They remain **visibility**-gated. *Rationale:* someone who starts a job and watches the progress bar without touching the mouse is at their most attentive; a 60 s idle pause would freeze the display exactly then. Bounded anyway, since the effect only arms during an active run.

### D8 — A unified scheduler is a **hardened requirement**, not a nice-to-have

All client polling must go through one designated heartbeat. *Rationale:* the CI gate enforces a **convention**; the scheduler enforces a **structure**. It also delivers the two properties static analysis can never retrofit — idle gating and leader election.

### D9 — Idle threshold: **60 seconds**

Long enough that reading a note without touching anything doesn't trip it; short enough that a forgotten PWA goes quiet fast.

### D10 — Manual activity listeners, **not** `IdleDetector`

| Event | Covers |
|---|---|
| `pointerdown` | click, tap, pen — unified, no separate `mousedown`/`touchstart` |
| `pointermove` | mouse move, touch drag |
| `keydown` | typing |
| `wheel` | scroll wheel — `{ passive: true }` |
| `scroll` | any scrolling — `{ passive: true }` |

Plus `visibilitychange` and window `focus` to resume instantly.

**Pattern: stamp a timestamp, don't reset a timer.** `pointermove` fires 60–120×/s; resetting a `setTimeout` on each would thrash. Instead `lastActivityAt = Date.now()` in the handler, and compare at tick time.

*Rejected:* Chrome's `IdleDetector` — requires an `idle-detection` **permission prompt** and is Chromium-only. Its one real advantage (screen-lock detection) comes free anyway, since a locked screen emits no pointer or key events.

### D11 — Auth leader election is **safe**, with one caveat

`client-session-events.ts` already broadcasts sign-out cross-tab via **BroadcastChannel with a localStorage fallback**, and `AuthSessionSync` already subscribes. So one leader detecting 401×3 signs out every tab; followers need not poll at all.

**Caveat — do not copy `syncPresenceTransport`'s election rule directly.** It elects a leader and then suspends it. For auth that is a bug: a hidden leader pauses and nobody polls, leaving a *visible* tab running against a dead session. **Elect among visible, non-idle tabs only**; a leader that hides or goes idle must relinquish. If every tab is hidden or idle, nobody polls — which is the desired end state.

### D12 — OPEN: `use-conversation-binding.ts` visibility policy

**The single highest-cost item in the app.** An ungated `EventSource` on `/api/conversations/events`, held open for the life of the tab, closing only on unmount. At the default 2 GB function memory that is ~**1,460 GB-hrs/month**, roughly **97% of the observed Fluid Provisioned Memory line** — from one forgotten tab.

Not fixed, because gating it is a **UX decision, not a mechanical one**:

- **(a)** close immediately on hidden — cheapest; a background tab misses a rename until refocus
- **(b)** grace period (~60 s) before closing — survives tab-flicking
- **(c)** close on hidden + refetch on visible — cheapest *and* correct, if the focus-refetch path the route's own docstring mentions actually exists (**verify this first**)

Recommendation: **(c)** if the refetch path is real, else (a). Registered `unreviewed` in the gate so it is named on every run.

---

## Phase 0 — SHIPPED (PR #213)

Seven pollers gated; `workspace-sync.ts` was already correct and is now cited as the reference implementation (visibility check *inside* the interval callback, not a teardown/rebuild).

| File | Change |
|---|---|
| `AuthSessionSync.tsx` | 10s → **60s**, gated, re-checks on visible |
| `presence-poll.ts` | gated; `onFocus` guarded against the hidden transition |
| `MainPanelHeader.tsx` | gated |
| `SharedContentViewer.tsx` | split 30s write / 60s read, gated |
| `notifications/transport.ts` | badge + threads gated |
| `RunsPanel.tsx` | 3s → **5s**, gated |
| `RunDetail.tsx` | 3s → **5s**, gated, named `RUN_POLL_MS` |

**New gate:** `pnpm polling:check` (`scripts/validate-polling.ts`), wired into `build` after `extensions:check`. Every client timer must be declared with a policy — `pause-when-hidden` / `ui-only` / `server` / `unreviewed`. Undeclared timers are a hard failure; so are stale registry entries, so the registry cannot drift into fiction.

**Mutation-tested both directions:** an unregistered poller produced `UNREGISTERED`; stripping a visibility guard produced `NOT GATED`; restoring gave `✓ 20 timer files: 8 gated, 6 ui-only, 2 server, 4 awaiting audit`.

---

## Phase 1 — Hocuspocus awareness delegation (forked)

Per D1 and D2. Being developed on a separate branch.

- [ ] Extend awareness payload beyond `activeSurfaceCount` (`runtime.ts:1648`) to carry the presence fields the UI needs
- [ ] Subscribe to `awareness.on("change")` in place of the SSE
- [ ] Delete `app/api/collaboration/presence/stream/route.ts`
- [ ] Delete the `presenceEventSource` path and `presenceStreamSuspended` machinery
- [ ] Verify the batch route's three consumers are untouched (D2)
- [ ] Re-examine the 10 s / `STALE_AFTER_MS = 45_000` coupling (D5) now that it can move
- [ ] Update the `polling:check` registry: `runtime.ts` should leave `unreviewed`

---

## Phase 2 — Unified scheduler + activity monitor

Per D8–D11. The single largest remaining win, because it delivers idle gating and leader election together.

```ts
registerPollingTask({
  id: "auth-session",
  intervalMs: 60_000,
  whenHidden: "pause",
  whenIdle: "pause",     // "run" for RunsPanel / RunDetail — D7
  scope: "leader",       // or "per-tab"
  run: async () => { ... },
});
```

- [ ] `lib/core/polling/activity.ts` — one module-level monitor, `lastActivityAt` stamp (D10)
- [ ] `lib/core/polling/scheduler.ts` — one `setInterval`, tasks fire when due
- [ ] Visibility gate lives in the scheduler, once
- [ ] Idle gate at 60 s (D9), per-task opt-out (D7)
- [ ] BroadcastChannel leader election among **visible, non-idle** tabs (D11)
- [ ] Jitter so N tabs don't align their ticks

**Why it matters, in one table:**

| Mechanism | Solves | Can CI enforce it? |
|---|---|---|
| Visibility gate | background tabs | yes — shipped |
| **Idle gate** | **always-open PWA** | no |
| **Leader election** | **N visible tabs → 1 poller** | no |

Today five *visible* tabs run five independent `AuthSessionSync` intervals for one human.

---

## Phase 3 — Migrate call sites

- [ ] Move all eight gated pollers onto `registerPollingTask`
- [ ] Generalise `presence-poll.ts`'s subscriber batching (`ceil(N/16)` per tick) into the scheduler — it is already the right pattern, applied in exactly one place
- [ ] Resolve D12 and migrate `use-conversation-binding.ts`
- [ ] Audit and reclassify the remaining `unreviewed` entries: `MarkdownEditor.tsx`, `ChatMessage.tsx`

---

## Phase 4 — Harden the gate

- [ ] `polling:check` tightens to: **no raw `setInterval` alongside `fetch`/`EventSource` in client code** — everything must route through the scheduler
- [ ] Registry moves from file-level to task-level (the scheduler makes tasks addressable by id)
- [ ] Mutation-test again after each rule change — a first-run PASS proves nothing

---

## Measured facts (2026-09-09)

| | |
|---|---|
| `STALE_AFTER_MS` | 45 000 ms (`presence-server.ts:38`) |
| `DORMANT_STALE_AFTER_MS` | 8 min |
| Presence SSE consumers | 1 |
| Presence batch-route consumers | 3 |
| Timer files scanned | 20 — 8 gated, 6 ui-only, 2 server, 4 unreviewed |
| Conversations SSE cost | ~1 460 GB-hrs/month per always-open tab (~97% of the memory line) |
| Neon Free plan ceiling | 100 CU-hours/project — the pre-fix workload used ~154 |

**Neon free-tier warning:** at pre-fix cadence the workload exceeded the Free plan's compute allowance in roughly three weeks, and Neon restricts rather than bills overage. Phase 0 should bring this inside the ceiling; Phase 2 should make it comfortable.

---

## Existing patterns worth reusing

Both already exist in this codebase, each applied in exactly one place, neither propagated. The scheduler is essentially the job of generalising them.

- **`extensions/workplaces/state/workspace-sync.ts`** — correct visibility gating: the check lives inside the interval callback
- **`lib/domain/collaboration/presence-poll.ts`** — correct subscriber batching: N subscribers collapse to `ceil(N/16)` requests per tick
