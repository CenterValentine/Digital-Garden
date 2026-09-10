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

#### D3a — What the poll does and does not detect

The original D3 wording was imprecise. There are two different "signed out elsewhere", and only one of them involves this poll at all:

| Scenario | Detection | Mechanism |
|---|---|---|
| Sign out in **another tab, same browser** | **Instant** | `publishSignedOut()` → BroadcastChannel (localStorage fallback) → every tab's `subscribeAuthSessionEvents` fires. **No polling involved.** |
| Sign out on **another device**, or a server-side revocation | Up to **3 × interval** | The tab has no way to know until it asks. `CONSECUTIVE_FAILURES_REQUIRED = 3`, so at 60 s that is **up to ~3 minutes** (it was ~30 s at 10 s). |

**The 3-minute figure is a stale-UI window, not a security window.** A revoked session cannot do anything — every real API call validates server-side and returns 401. The worst case is that a user clicks something, it fails, and the poll catches up shortly after. The immediate re-check on tab-visible also collapses this to near-zero whenever someone actually returns to the tab.

The 3-failure threshold exists to survive transient Neon hiccups, not to harden security. If ~3 minutes ever feels too long, the lever is `CONSECUTIVE_FAILURES_REQUIRED`, or treating the first 401 after a visibility transition as authoritative — **not** shortening the interval back down.

### D3b — What `MainPanelHeader` and `presence-poll` actually do

Both answer "is someone else in this content?", for different surfaces:

- **`MainPanelHeader`** — the **tab strip** at the top of the main panel. Shows, per open tab, whether another session is currently viewing or editing that content, so you can see a collaborator is in a document without opening it. Polls **all open tabs' contentIds in one batched request**.
- **`presence-poll.ts`** — the **Note Window block's edit gate**. A Note Window embeds another note inside a note; before allowing edits it checks whether that content is actively open elsewhere, to avoid conflicting edits. Module-level and shared, so N embedded windows collapse to `ceil(N/16)` requests rather than N.

Neither owns a collaboration runtime, which is why neither can be served by awareness (see D2).

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

### D7a — REFINEMENT: exempt by **predicate**, not by blanket flag

D7's flat "runs are exempt from idle" is too coarse — it would poll through idle
forever whenever the panel is open, including long after the job finished.

Use a predicate instead:

```ts
registerPollingTask({
  id: "studio-runs",
  intervalMs: 5_000,
  whenHidden: "pause",
  whenIdle: "pause",
  keepAliveWhile: () => anyRunning,   // overrides idle ONLY while true
});
```

Polls through idle *only while work is genuinely in flight*, and goes quiet the
moment it completes even if the user is still sitting there.

**The principle: "no input" ≠ "not watching."** Hidden and idle are two different
gates with two different rules:

| Gate | Rule |
|---|---|
| **Hidden** | pause almost everything — the user demonstrably is not looking |
| **Idle** | pause polls **unless the app knows work is in flight** — the user may well be looking |

A 60 s idle pause while a job is running is precisely the moment it would annoy
someone most.

### D7b — Passive-watch inventory

Surfaces where a user sits and watches with **zero input**, and whether idle
gating endangers them:

| Surface | Watching | Safe? | Why |
|---|---|---|---|
| AI chat streaming | tokens arriving | ✅ | Active HTTP response stream, not a poll |
| ChatMessage typing effect | text revealing | ✅ | UI-only timer (`typingActive = typingEffect && isStreaming`) |
| Speed reader (RSVP) | words flashing | ✅ | **0 fetches** — verified pure UI |
| Live collaboration | co-editor typing | ✅ | Y.js push over WebSocket |
| TTS read-aloud | listening | ✅ | audio element |
| MediaLightbox slideshow | images advancing | ✅ | UI-only |
| **RunsPanel / RunDetail** | job progress | ⚠️ | **network poll — needs D7a predicate** |
| Co-browse / agentic browsing | agent driving the browser | ⚠️ | `CoBrowseIndicator` is UI-only, but run-status polling **not yet traced** |
| Extraction / quest sittings | generation progress | ⚠️ | **not yet traced** |

**Why most of these are structurally safe:** idle gating applies only to *network
polls*. Push transports (SSE, WebSocket, streaming HTTP) and UI-only timers are
untouched by design. That is the payoff of keeping the distinction sharp.

**TODO before Phase 2 ships:** trace co-browse and extraction/quest status polling
and classify them. Both are long-running surfaces a user plausibly watches without
touching anything.

### D2a — Could `MainPanelHeader` / `presence-poll` move to Hocuspocus after all?

**Architecturally yes — but not for free, and the naive version is *more* expensive than what it replaces.**

D2 said awareness cannot serve them because it is per-document and only the active document has a provider. That is true of the *current* wiring, but not a hard limit. The idiomatic Y.js answer is a **shared presence document**: one Y.Doc whose awareness map carries "which contentIds is each session currently in." One connection then answers for every open tab, read straight from Hocuspocus's in-memory awareness with **zero database access**. `presence-poll` maps onto it especially cleanly, since it is already a shared module-level singleton.

**The trap is Cloud Run billing.** From `cloudbuild.hocuspocus.yaml`: `--cpu=1 --memory=512Mi --min-instances=0`. A held WebSocket keeps that instance alive, and an always-on instance costs roughly:

| | |
|---|---|
| vCPU | 2,628,000 s/mo × ~$0.000024 ≈ **$63** |
| Memory | 0.5 GiB × 2,628,000 s × ~$0.0000025 ≈ **$3** |
| **Always-on total** | **≈ $66/month** |

Cloud Run's free tier (~180,000 vCPU-seconds) covers about **7%** of a month. So keeping Hocuspocus awake around the clock would cost roughly **double** the ~$32/month of Vercel memory + Neon compute it would be replacing.

**This is why `min-instances=0` and sleep mode (PR #101) are load-bearing rather than incidental.**

**Conclusion:** the move is worth making, but only if the presence connection is itself governed by the same engagement core (D13) — closed when hidden, released when idle. Otherwise it is not a saving, it is a relocation of the bill to a more expensive meter.

### D0 — Terminology: what "gated" means here

**Gated** = the timer or stream consults engagement state and **suppresses its work** — skips the tick, or closes the connection — when nobody is engaged.
**Ungated** = it runs at full cadence regardless of whether anyone is looking.

Gating is about **conditional suppression, not interval length.** A 60 s ungated poll and a 10 s gated poll can easily cost the opposite of what their intervals suggest, because what matters is *how many contiguous minutes of quiet* the backend gets (D14).

### D2b — CORRECTION to D2a: sleep mode already bounds the connection

D2a priced an *always-on* Cloud Run instance at ~$66/month. **That is not the real baseline**, because the collaboration runtime already implements exactly the gating this document is proposing everywhere else:

```
runtime.ts:363   VISIBILITY_SLEEP_DELAY_MS  = 3 min hidden  → disconnect
runtime.ts:364   INACTIVITY_SLEEP_DELAY_MS  = 10 min idle   → disconnect
```

with the comment *"disconnect Cloud Run WebSocket when no real editing is happening."*

So using **the existence of a live collaboration WebSocket as the presence signal** — rather than moving polling onto Hocuspocus — is cheap, because that connection's lifetime is already governed by visibility **and** inactivity. Presence read from awareness while connected costs nothing extra: the socket is already open, awareness is already in memory, and no database is touched.

**What Hocuspocus does when a user is idle:** the socket stays open and the server sends a Y.js stateless keepalive every **25 s** (`server.ts:461`), because `HocuspocusProvider` closes idle connections after 30 s of no *data* frames — WebSocket pings are control frames and don't count. That keepalive keeps the Cloud Run instance billing. Sleep mode is what stops it, after 3 min hidden or 10 min idle.

**Architectural consequence for D13:** the engagement core must be **extracted from the collaboration runtime, not built alongside it.** That runtime already owns a visibility threshold, an inactivity threshold, and a notion of "real editing." Building a second, parallel definition of idle in the scheduler would guarantee the two drift apart. Reuse or lift; do not duplicate.

### D14a — "Zero background pinging" is per-meter, not global

Continuity constraints only work with genuinely zero background traffic — but **different traffic breaks different meters**, and conflating them leads to fixing the wrong thing:

| Background activity | Breaks Neon sleep (5 min)? | Breaks Cloud Run sleep? |
|---|---|---|
| WebSocket ping / Y.js keepalive | **No** — never touches Postgres | **Yes** |
| Awareness broadcast | **No** — in-memory only | **Yes** |
| Presence heartbeat `POST` | **Yes** | No |
| Session check | **Yes** | No |
| Held SSE polling the DB every 10 s | **Yes** | No — bills Vercel memory instead |
| Held SSE with no queries | No | No — bills Vercel memory |

So the requirement is **not** "zero pings." It is:

- **For Neon to sleep:** zero *database-touching requests* for 5+ contiguous minutes.
- **For Cloud Run to sleep:** zero *open WebSockets* — keepalives count, and they are the point of sleep mode.
- **For Vercel memory:** zero *held-open requests*, regardless of whether they query anything.

Three meters, three different definitions of quiet. A change can improve one and worsen another — which is precisely the trap in D2a's naive version, where moving presence to Hocuspocus would have quieted Neon while waking Cloud Run.

### D14 — POLICY: any new poller or heartbeat must carry a cost estimate

Before adding a recurring timer, heartbeat, or held stream, state its estimated monthly cost in the PR description **and** in its `polling:check` registry entry.

#### The cost model

Three meters, and they are **not** equally important:

| Meter | Rate | Usually |
|---|---|---|
| Vercel Function Invocations | $0.60 / million | negligible |
| Vercel Provisioned Memory | $0.0106 / GB-hr (default 2 GB) | negligible for short polls, **dominant for held streams** |
| Neon compute | $0.106 / CU-hour | **dominant for anything that runs continuously** |

#### The counter-intuitive part: continuity beats frequency

Neon autosuspends after **5 minutes of inactivity**. So a poll every 10 s and a poll every 4 minutes cost *almost the same* — both keep the database permanently awake. Even a 6-minute poll leaves it awake ~83% of the time (wake, serve, idle 5 min, suspend, wake again a minute later).

**A database only sleeps given long contiguous quiet — hours, not minutes.** That is something no choice of interval can buy you and only gating can. It is the entire justification for this document.

#### Reference figures — per always-open tab, ~730 hr/month

Estimates. Assume 0.25 CU Neon and Vercel's default 2 GB function memory; "gated" assumes ~3 hours/day of genuine active use.

| Shape | Neon | Vercel | **Total** |
|---|---|---|---|
| Poll < 5 min, **ungated** | ~$19.35 | ~$0.50 | **≈ $20/mo** |
| Poll < 5 min, **gated** | ~$2.40 | ~$0.06 | **≈ $2.50/mo** |
| Held SSE stream, **ungated** | ~$19.35 | ~$15.50 | **≈ $35/mo** |
| Held SSE stream, **gated** | ~$2.40 | ~$1.90 | **≈ $4.30/mo** |
| Held WebSocket → Cloud Run, **ungated** | — | ~$66 | **≈ $66/mo** |

Multiply by the number of simultaneously open tabs unless the poller is leader-elected (D11).

#### Disclosure template

```
Poller: <id>
Interval: <N>s   Gating: hidden=<pause|run> idle=<pause|run>
Estimated: ~$X/month per always-open tab
Basis: <which meter dominates and why>
```

#### Enforcement

`polling:check` **requires** an `estimatedMonthlyCostUsd` on any entry claiming background rights (`background-allowed`). Gated pollers inherit the reference figures above and need only a note. The expensive case is the one that must justify itself in writing.

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

### D13 — Idle and hidden share **one core**, with different policies

They are two readings of the same question — *is this tab worth spending money on right now?* — so they must not be two independent implementations that drift.

One module computes a single engagement state:

```ts
type Engagement = "active" | "idle" | "hidden";
getEngagement(): Engagement
subscribeEngagement(cb: (e: Engagement) => void): () => void
```

Per-task policy layers on top, because the *rules* genuinely differ (D7a):

```ts
{ whenHidden: "pause", whenIdle: "pause" | "run", keepAliveWhile?: () => boolean }
```

*Rationale:* shared observation, differentiated policy. `hidden` is authoritative — the user demonstrably is not looking. `idle` is a heuristic that a surface can legitimately override. Splitting the observation would mean two sets of listeners, two sources of truth, and inevitable divergence.

### D13a — Surface activity as an engagement signal

Passive-watch surfaces (D7b) can assert engagement for as long as they are genuinely doing something, rather than being blanket-exempted:

| Surface | Asserts engagement while | Releases when |
|---|---|---|
| TTS read-aloud | audio is playing | playback ends |
| Speed reader | RSVP is running | session ends or pauses |
| Runs / quests | work is in flight | run reaches a terminal state |
| Live collaboration | — | **5 min hard cap** of absolute zero input |

Push form (`assertEngaged("tts-playback")` returning a release fn) and pull form (`keepAliveWhile: () => anyRunning`) are the same mechanism from either side; the scheduler should accept both.

**`MediaLightbox` is excluded entirely** — a UI-only slideshow with no bearing on whether polling should run.

### D13b — Engagement assertions matter for **visible+idle**, not hidden

`hidden` overrides everything: a hidden tab pauses its polls regardless of what any surface asserts. So surface-activity signals only change behaviour in the **visible-but-idle** case — a PWA sitting open with TTS playing and nobody touching the mouse. That is exactly the case that motivated idle gating, so it is the right place for them.

**Media keeps playing in hidden tabs regardless**, and needs no polling to do so: `<audio>`/`<video>` playback is browser-native. Chrome additionally throttles background timers (~1/min after a few minutes) but relaxes that for tabs playing audio — so the browser already does much of this work. The only thing that would need `keepAliveWhile` in a hidden tab is a job whose *completion* must be observed while hidden.

### D12 — RESOLVED: `use-conversation-binding.ts` → option (c)

**Decision: close on hidden, refetch on visible.** Verified implementable — `state/conversation-cache-store.ts:293` already binds `refetchAllCached` to window focus, so nothing missed while hidden is lost.

**Both** streams are now gated. There were two, not one:

| Stream | Scope |
|---|---|
| `lib/domain/ai/use-conversation-binding.ts` | per chat viewer |
| `state/conversation-cache-store.ts` | **refcounted, shared across surfaces** |

The second was missed by the first version of the gate because **`state/` was not in `SCAN_ROOTS`** — a genuine hole in the gate, now fixed. Any directory that can hold client code belongs in that list.

Both now also bind `visibilitychange` alongside `focus`, because the two cover different transitions: `focus` fires when a browser *window* regains focus; `visibilitychange` covers switching to a tab inside a window that already had it.

#### Superseded — the original open question

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

### How pausing and resuming actually work

Worth stating explicitly, because "pause" could mean several things:

**The timer is never torn down.** Each interval keeps running; its callback returns early while hidden. So resumption needs no re-arming — the next tick simply does its work. Worst case on return is one interval of staleness, and that only where there is no catch-up.

**Catch-up on return** — every gated poller except none now fires immediately on `visibilitychange`:

| Poller | Catch-up |
|---|---|
| `AuthSessionSync` | ✓ |
| `MainPanelHeader` | ✓ (added after audit — it was the one gap) |
| `SharedContentViewer` | ✓ |
| `notifications/transport` | ✓ (pre-existing `handleFocus`) |
| `presence-poll` | ✓ (via guarded `onFocus`) |
| `RunsPanel` / `RunDetail` | ✓ |
| conversations SSE (both) | ✓ reopen **+ refetch** |

**Streams are different from polls.** An SSE stream is closed and reopened, not paused — so it must be paired with a refetch, which is exactly why D12 chose option (c) rather than (a).

**Idle resumption (Phase 2)** will follow the same shape: any of the D10 activity events stamps `lastActivityAt`, engagement flips back to `active`, and the next tick proceeds. Surfaces that need instant resumption rather than next-tick get an explicit catch-up, same as visibility.

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
  whenIdle: "pause",
  keepAliveWhile: () => anyRunning,  // predicate overrides idle — D7a
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
