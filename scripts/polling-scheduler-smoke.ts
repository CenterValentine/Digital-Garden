/**
 * Smoke test for the engagement core and polling scheduler.
 *
 * These two modules decide whether every network poll in the app runs. Getting a
 * branch wrong costs money in one direction (a task that never pauses) or breaks
 * a feature in the other (a task that never resumes), and neither failure is
 * visible in normal use — which is exactly why they are worth testing.
 *
 * Run: pnpm polling:smoke
 */

// ── Minimal DOM stubs, installed before the modules are imported ─────────────
// The modules read `typeof document` at call time rather than import time, so
// stubbing here is sufficient and no jsdom dependency is needed.

type Listener = (...args: unknown[]) => void;

const store = new Map<string, string>();
let visibility: "visible" | "hidden" = "visible";
const listeners = new Map<string, Set<Listener>>();

function addListener(type: string, fn: Listener) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(fn);
}
function removeListener(type: string, fn: Listener) {
  listeners.get(type)?.delete(fn);
}

(globalThis as Record<string, unknown>).document = {
  get visibilityState() {
    return visibility;
  },
  addEventListener: addListener,
  removeEventListener: removeListener,
  documentElement: {
    addEventListener: addListener,
    removeEventListener: removeListener,
  },
};

const localStorageStub = {
  getItem: (k: string): string | null => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

(globalThis as Record<string, unknown>).window = {
  addEventListener: addListener,
  removeEventListener: removeListener,
  localStorage: localStorageStub,
};

async function main() {
  const { getEngagement, IDLE_AFTER_MS, __resetEngagementForTests } = await import("@/lib/core/engagement");
  const {
    registerPollingTask,
    inspectPollingTasks,
    __holdsLeaseForTests,
    __resetSchedulerForTests,
  } = await import("@/lib/core/polling/scheduler");

  // ── Harness ──────────────────────────────────────────────────────────────────

  let failures = 0;
  function check(label: string, actual: unknown, expected: unknown) {
    const ok = actual === expected;
    if (!ok) failures += 1;
    console.log(`${ok ? "  ✓" : "  ✗"} ${label}${ok ? "" : `  (got ${actual}, want ${expected})`}`);
  }

  function reset() {
    __resetSchedulerForTests();
    __resetEngagementForTests();
    store.clear();
    visibility = "visible";
  }

  /** Advance perceived time by moving Date.now forward. */
  const realNow = Date.now;
  function withClockOffset<T>(offsetMs: number, fn: () => T): T {
    Date.now = () => realNow() + offsetMs;
    try {
      return fn();
    } finally {
      Date.now = realNow;
    }
  }

  // ── Engagement ───────────────────────────────────────────────────────────────

  console.log("\nengagement");
  reset();
  check("visible + recent input → active", getEngagement(), "active");

  visibility = "hidden";
  check("hidden wins over recent input", getEngagement(), "hidden");

  visibility = "visible";
  withClockOffset(IDLE_AFTER_MS + 1_000, () => {
    check("visible + no input past threshold → idle", getEngagement(), "idle");
  });

  visibility = "hidden";
  withClockOffset(IDLE_AFTER_MS + 1_000, () => {
    check("hidden takes precedence over idle", getEngagement(), "hidden");
  });

  // pointermove is dwell-gated: a crossing must not count, a hover must.
  reset();
  const { subscribeEngagement, POINTER_DWELL_MS } = await import("@/lib/core/engagement");
  const fire = (type: string) => {
    for (const fn of listeners.get(type) ?? []) fn();
  };
  const unsub = subscribeEngagement(() => {});

  // TRANSIT: cursor crosses, moves briefly, leaves. Never reaches the dwell bar.
  withClockOffset(IDLE_AFTER_MS + 1_000, () => {
    fire("pointermove");                       // starts the dwell clock
    fire("pointermove");                       // same instant — still under 3s
    check("crossing does NOT count as engagement", getEngagement(), "idle");
  });
  fire("pointerleave");

  // HOVERING: cursor enters and stays past the dwell bar, then moves.
  reset();
  const unsub2 = subscribeEngagement(() => {});
  withClockOffset(IDLE_AFTER_MS + 1_000, () => {
    fire("pointermove");                       // enters, clock starts
  });
  withClockOffset(IDLE_AFTER_MS + 1_000 + POINTER_DWELL_MS + 500, () => {
    fire("pointermove");                       // still here, past the bar
    check("hover past dwell DOES count", getEngagement(), "active");
  });

  // Leaving voids accumulated dwell.
  //
  // Sequenced carefully. NO reset() mid-test — a reset clears pointerEnteredAt
  // itself, so the assertion would pass even with handlePointerLeave broken
  // (an earlier version of this test did exactly that and mutation testing
  // caught it). Instead the dwell clock is aged deliberately, so the ONLY thing
  // that can keep the final move from counting is pointerleave doing its job.
  reset();
  const unsub3 = subscribeEngagement(() => {});
  const enterAt = IDLE_AFTER_MS + 1_000;
  const laterAt = enterAt + POINTER_DWELL_MS + IDLE_AFTER_MS + 2_000;

  withClockOffset(enterAt, () => {
    fire("pointermove");          // cursor enters; dwell clock starts
  });
  withClockOffset(laterAt, () => {
    fire("pointerleave");         // must void the (now long) accumulated dwell
    fire("pointermove");          // re-entry: restarts the clock, stamps nothing
    // Without the void, this move would sit far past the dwell bar and stamp
    // activity, reading "active".
    check("pointerleave voids accumulated dwell", getEngagement(), "idle");
  });
  unsub(); unsub2(); unsub3();

  // ── Scheduler gating ─────────────────────────────────────────────────────────

  console.log("\nscheduler gating");
  reset();

  function wouldRun(id: string): boolean {
    return inspectPollingTasks().find((t) => t.id === id)?.wouldRun ?? false;
  }

  registerPollingTask({ id: "default", intervalMs: 1_000, run: () => {} });
  check("active → runs", wouldRun("default"), true);

  visibility = "hidden";
  check("hidden → paused by default", wouldRun("default"), false);

  visibility = "visible";
  withClockOffset(IDLE_AFTER_MS + 1_000, () => {
    check("idle → paused by default", wouldRun("default"), false);
  });

  reset();
  registerPollingTask({
    id: "watched",
    intervalMs: 1_000,
    keepAliveWhile: () => true,
    run: () => {},
  });
  withClockOffset(IDLE_AFTER_MS + 1_000, () => {
    check("keepAliveWhile overrides idle", wouldRun("watched"), true);
  });
  visibility = "hidden";
  withClockOffset(IDLE_AFTER_MS + 1_000, () => {
    check("keepAliveWhile does NOT override hidden", wouldRun("watched"), false);
  });

  reset();
  registerPollingTask({
    id: "background",
    intervalMs: 1_000,
    whenHidden: "run",
    run: () => {},
  });
  visibility = "hidden";
  check('whenHidden："run" keeps running hidden', wouldRun("background"), true);

  // ── Leader lease ─────────────────────────────────────────────────────────────

  console.log("\nleader lease");
  reset();
  check("unclaimed lease → this tab acquires it", __holdsLeaseForTests("leased"), true);
  check("holder re-checking → still holds it", __holdsLeaseForTests("leased"), true);

  // Another tab holds a FRESH lease — we must stand down.
  store.set(
    "dg-poll-leader:leased",
    JSON.stringify({ tabId: "some-other-tab", renewedAt: Date.now() }),
  );
  check("another tab holds a fresh lease → we stand down", __holdsLeaseForTests("leased"), false);

  // That tab goes away; its lease ages past the TTL and we take over.
  store.set(
    "dg-poll-leader:leased",
    JSON.stringify({ tabId: "some-other-tab", renewedAt: Date.now() - 60_000 }),
  );
  check("stale lease past TTL → we take over", __holdsLeaseForTests("leased"), true);

  // Storage throwing (private mode, blocked cookies) must FAIL OPEN — every tab
  // polling is today's behaviour; nobody polling would silently break features.
  const realGet = localStorageStub.getItem;
  localStorageStub.getItem = () => {
    throw new Error("storage blocked");
  };
  check("storage unavailable → fails OPEN", __holdsLeaseForTests("leased"), true);
  localStorageStub.getItem = realGet;

  // ── Unregister ───────────────────────────────────────────────────────────────

  console.log("\nlifecycle");
  reset();
  const unregister = registerPollingTask({ id: "temp", intervalMs: 1_000, run: () => {} });
  check("registered", inspectPollingTasks().length, 1);
  unregister();
  check("unregistered", inspectPollingTasks().length, 0);

  reset();
  console.log(
    failures === 0
      ? "\n✓ polling scheduler smoke passed\n"
      : `\n✖ ${failures} assertion(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
