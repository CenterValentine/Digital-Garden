"use client";

/**
 * The polling scheduler — one timer for the whole app.
 *
 * Every client-side recurring network call should register here rather than
 * calling `setInterval` directly. That buys three things, only the first of
 * which a CI gate could ever enforce:
 *
 *   1. Visibility gating   — background tabs go quiet
 *   2. Idle gating         — an always-open PWA goes quiet (the dominant case)
 *   3. Leader election     — N open tabs make ONE request, not N
 *
 * Rationale, cost model and decision history:
 * docs/notes-feature/work-tracking/POLLING-DISCIPLINE-PLAN.md
 *
 * ── Design notes ─────────────────────────────────────────────────────────────
 * One base tick drives everything. Tasks declare their own interval and are run
 * when due, so adding a task adds no timers. Engagement is *pulled* at tick time
 * (`getEngagement()`) rather than subscribed to, which means the scheduler costs
 * exactly one timer no matter how many tasks it carries.
 *
 * Leadership uses a **localStorage lease** rather than a consensus protocol.
 * Elections are genuinely hard; a lease is not. The failure mode of a lease race
 * is that two tabs briefly poll at once, which is precisely the situation we are
 * in today with no election at all — so a race degrades to the status quo rather
 * than to something broken.
 */

import { getEngagement } from "@/lib/core/engagement";
import { clientLogger } from "@/lib/core/logger/client";

export type WhenPolicy = "pause" | "run";

export interface PollingTask {
  /** Stable identifier. Also the leadership lease key for `scope: "leader"`. */
  id: string;
  intervalMs: number;
  /**
   * What to do while the tab is hidden. Defaults to "pause".
   * "run" means this task keeps polling in a backgrounded tab and must carry an
   * `estimatedMonthlyCostUsd` justification in scripts/validate-polling.ts.
   */
  whenHidden?: WhenPolicy;
  /** What to do while the tab is visible but idle. Defaults to "pause". */
  whenIdle?: WhenPolicy;
  /**
   * Overrides `whenIdle: "pause"` while it returns true — for work the user is
   * plausibly *watching* without touching anything, such as a job in flight.
   *
   * Deliberately a predicate rather than a static flag: a blanket exemption
   * would keep polling long after the work finished, whereas this goes quiet the
   * moment the predicate flips even if the user is still sitting there.
   *
   * Note it does NOT override `whenHidden` — hidden is authoritative.
   */
  keepAliveWhile?: () => boolean;
  /**
   * "leader" — only one tab in this browser runs it.
   * "per-tab" (default) — every tab runs its own.
   *
   * ⚠ **"leader" is only safe when the RESULT propagates cross-tab.** The elected
   * tab performs the fetch; every other tab performs nothing. If the result
   * lands only in the leader's own store, every follower silently starves —
   * a frozen bell, a stale list — and it looks like a caching bug, not a
   * scheduling one.
   *
   * The bar is a real cross-tab channel carrying the *answer*, not merely a
   * "something changed, go refetch" nudge — a nudge just restores per-tab
   * polling by another name.
   *
   * Today only `auth-session-check` qualifies, because `publishSignedOut()`
   * broadcasts over BroadcastChannel with a localStorage fallback. Notification
   * badges and workspace-sync were both tried as "leader" and reverted for
   * exactly this reason.
   */
  scope?: "leader" | "per-tab";
  run: () => void | Promise<void>;
}

interface Registered extends PollingTask {
  nextDueAt: number;
  inFlight: boolean;
}

/**
 * Base tick. Fast enough that a 3–5s task is not meaningfully delayed, slow
 * enough to be free. This is the app's only unconditional client timer.
 */
const BASE_TICK_MS = 1_000;

const LEASE_KEY_PREFIX = "dg-poll-leader:";
/** A lease is considered dead this long after its last renewal. */
const LEASE_TTL_MS = 6_000;

const tasks = new Map<string, Registered>();
let baseTimer: ReturnType<typeof setInterval> | null = null;

/** Identifies this tab for the lifetime of the page. */
const tabId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

interface Lease {
  tabId: string;
  renewedAt: number;
}

/**
 * Claim or renew leadership for a task. Returns true if this tab holds it.
 *
 * Storage access is wrapped because private-browsing modes and blocked-cookie
 * settings can throw on access. Failing open (assuming leadership) is the right
 * default — it degrades to every tab polling, which is today's behaviour, rather
 * than to nobody polling, which would silently break the feature.
 */
function holdsLease(taskId: string): boolean {
  if (typeof window === "undefined") return true;
  const key = LEASE_KEY_PREFIX + taskId;
  const now = Date.now();
  try {
    const raw = window.localStorage.getItem(key);
    const lease = raw ? (JSON.parse(raw) as Lease) : null;

    if (!lease || now - lease.renewedAt > LEASE_TTL_MS) {
      window.localStorage.setItem(key, JSON.stringify({ tabId, renewedAt: now }));
      return true;
    }
    if (lease.tabId === tabId) {
      window.localStorage.setItem(key, JSON.stringify({ tabId, renewedAt: now }));
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Release leadership on unload so another tab picks it up immediately rather
 * than waiting out the TTL.
 */
function releaseLease(taskId: string) {
  if (typeof window === "undefined") return;
  try {
    const key = LEASE_KEY_PREFIX + taskId;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    if ((JSON.parse(raw) as Lease).tabId === tabId) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable — the TTL will expire it */
  }
}

/** Whether a task is allowed to run right now. */
function shouldRun(task: Registered): boolean {
  const engagement = getEngagement();

  // Hidden is authoritative: keepAliveWhile does NOT override it. A tab nobody
  // can see has no claim on a meter, whatever it thinks it is doing.
  if (engagement === "hidden") return (task.whenHidden ?? "pause") === "run";

  if (engagement === "idle") {
    if (task.keepAliveWhile?.()) return true;
    return (task.whenIdle ?? "pause") === "run";
  }

  return true;
}

function tick() {
  const now = Date.now();
  for (const task of tasks.values()) {
    if (task.inFlight || now < task.nextDueAt) continue;
    if (!shouldRun(task)) {
      // Push the due time forward so a task returning from a long pause fires
      // once, immediately — rather than firing repeatedly to "catch up" on
      // every tick it missed.
      task.nextDueAt = now + task.intervalMs;
      continue;
    }
    if ((task.scope ?? "per-tab") === "leader" && !holdsLease(task.id)) {
      task.nextDueAt = now + task.intervalMs;
      continue;
    }

    task.nextDueAt = now + task.intervalMs;
    task.inFlight = true;
    void Promise.resolve()
      .then(task.run)
      .catch(() => {
        // A failing task must not stop the wheel for every other task.
      })
      .finally(() => {
        task.inFlight = false;
      });
  }
}

function ensureTimer() {
  if (baseTimer !== null || typeof window === "undefined") return;
  baseTimer = setInterval(tick, BASE_TICK_MS);
}

function stopTimerIfIdle() {
  if (tasks.size > 0 || baseTimer === null) return;
  clearInterval(baseTimer);
  baseTimer = null;
}

/**
 * Register a recurring task. Returns an unregister function.
 *
 * The first run happens on the next base tick rather than immediately, so a
 * component mounting does not fire a request synchronously during render.
 * Callers that genuinely need an immediate first fetch should do it themselves
 * on mount — that is a load, not a poll.
 */
export function registerPollingTask(task: PollingTask): () => void {
  if (tasks.has(task.id)) {
    // Overwriting silently would make double-registration invisible, and in dev
    // React StrictMode double-mounts make it a realistic mistake.
    clientLogger.warn({
      layer: "ui",
      event: "polling:duplicate_task",
      summary: `Polling task "${task.id}" registered twice; replacing the previous registration.`,
      attrs: { taskId: task.id },
    });
  }
  tasks.set(task.id, { ...task, nextDueAt: Date.now() + task.intervalMs, inFlight: false });
  ensureTimer();

  return () => {
    tasks.delete(task.id);
    if ((task.scope ?? "per-tab") === "leader") releaseLease(task.id);
    stopTimerIfIdle();
  };
}

/** Run a task now, ignoring its schedule but not its gating. Used for catch-up. */
export function runPollingTaskNow(id: string) {
  const task = tasks.get(id);
  if (!task || task.inFlight || !shouldRun(task)) return;
  task.nextDueAt = Date.now() + task.intervalMs;
  task.inFlight = true;
  void Promise.resolve()
    .then(task.run)
    .catch(() => undefined)
    .finally(() => {
      task.inFlight = false;
    });
}

/** Diagnostics: what the scheduler currently carries and whether it would run. */
export function inspectPollingTasks() {
  return Array.from(tasks.values()).map((t) => ({
    id: t.id,
    intervalMs: t.intervalMs,
    scope: t.scope ?? "per-tab",
    dueInMs: t.nextDueAt - Date.now(),
    wouldRun: shouldRun(t),
  }));
}

/**
 * Test seam for the lease. Exported because leadership is the fiddliest logic
 * here and is consulted at tick time, so it is unreachable through
 * `inspectPollingTasks` — which reports engagement eligibility only.
 */
export function __holdsLeaseForTests(taskId: string): boolean {
  return holdsLease(taskId);
}

/** Test seam. */
export function __resetSchedulerForTests() {
  for (const id of tasks.keys()) releaseLease(id);
  tasks.clear();
  if (baseTimer !== null) {
    clearInterval(baseTimer);
    baseTimer = null;
  }
}
