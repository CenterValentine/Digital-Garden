/**
 * Smoke test for the browser extension's engagement core.
 *
 * The companion to polling-scheduler-smoke.ts, for the half of the system that
 * runs in a service worker. It matters for the same reason: this module decides
 * whether three persistent chrome.alarms reach the database, and both failure
 * directions are invisible in normal use — too permissive and Neon never
 * autosuspends, too strict and the toolbar badge silently stops updating.
 *
 * It also covers the case the static gate provably cannot. `pnpm polling:check`
 * verifies that an engagement check EXISTS in a file; only executing the branches
 * shows whether the mapping is right.
 *
 * Run: pnpm polling:smoke (runs this after the scheduler suite)
 */

// Marks this file a MODULE. Both smoke scripts import their subjects
// dynamically (the stubs must exist before the module under test evaluates), so
// without this they are both global scripts and their identically-named helpers
// collide at typecheck.
export {};

type Listener = (...args: unknown[]) => void;

let idleState: "active" | "idle" | "locked" = "active";
let windowFocused = true;
let windowsExist = true;
let idleThrows = false;

const idleListeners = new Set<Listener>();
const focusListeners = new Set<Listener>();
let detectionIntervalSet: number | null = null;

(globalThis as Record<string, unknown>).chrome = {
  idle: {
    queryState: async () => {
      if (idleThrows) throw new Error("permission missing");
      return idleState;
    },
    setDetectionInterval: (seconds: number) => {
      detectionIntervalSet = seconds;
    },
    onStateChanged: { addListener: (fn: Listener) => void idleListeners.add(fn) },
  },
  windows: {
    getLastFocused: async () => {
      if (!windowsExist) throw new Error("no windows");
      return { focused: windowFocused };
    },
    onFocusChanged: { addListener: (fn: Listener) => void focusListeners.add(fn) },
  },
};

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "✓" : "✖"} ${label}${ok ? "" : `  (got ${String(actual)}, want ${String(expected)})`}`,
  );
}

/** Let the module's async listener chain settle after firing a stub event. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function main() {
  const mod = await import(
    "../extensions/browser-bookmarks/browser-extension/src/background/engagement.js"
  );
  const { getEngagement, isEngaged, subscribeEngagement, IDLE_AFTER_S, __resetEngagementForTests } =
    mod as {
      getEngagement: () => Promise<string>;
      isEngaged: () => Promise<boolean>;
      subscribeEngagement: (cb: (s: string, p: string | null) => void) => () => void;
      IDLE_AFTER_S: number;
      __resetEngagementForTests: () => void;
    };

  console.log("\nstate mapping");

  // The detection interval must match what queryState is asked for, or push and
  // pull answers disagree near the boundary.
  check("detection interval aligned with IDLE_AFTER_S", detectionIntervalSet, IDLE_AFTER_S);
  check("IDLE_AFTER_S matches the app's 60s IDLE_AFTER_MS", IDLE_AFTER_S, 60);

  idleState = "active";
  windowFocused = true;
  windowsExist = true;
  check("focused + OS active → active", await getEngagement(), "active");
  check("isEngaged agrees", await isEngaged(), true);

  idleState = "idle";
  check("focused + OS idle → idle", await getEngagement(), "idle");
  check("isEngaged false while idle", await isEngaged(), false);

  // Hidden is authoritative and must not be rescued by an active idle state:
  // a badge in an unfocused window is not on screen.
  idleState = "active";
  windowFocused = false;
  check("unfocused window → hidden even when OS-active", await getEngagement(), "hidden");

  // Locked must short-circuit BEFORE the focus check — a locked screen can still
  // report a focused window.
  idleState = "locked";
  windowFocused = true;
  check("locked screen → hidden despite a focused window", await getEngagement(), "hidden");

  idleState = "active";
  windowsExist = false;
  check("no windows at all → hidden", await getEngagement(), "hidden");
  windowsExist = true;

  console.log("\ndegraded sensors");

  // Missing "idle" permission must fall back to focus-only gating rather than
  // failing shut (which would look like a broken badge) or open (which would
  // restore the cost this module exists to remove).
  idleThrows = true;
  windowFocused = true;
  check("idle API unavailable + focused → active", await getEngagement(), "active");
  windowFocused = false;
  check("idle API unavailable + unfocused → still hidden", await getEngagement(), "hidden");
  idleThrows = false;
  windowFocused = true;

  console.log("\ntransitions");

  __resetEngagementForTests();
  const seen: Array<[string, string | null]> = [];
  const unsubscribe = subscribeEngagement((state, previous) => seen.push([state, previous]));

  // First observed transition after a worker start carries a null previous.
  idleState = "active";
  focusListeners.forEach((fn) => fn());
  await settle();
  check("first transition delivered", seen.length, 1);
  check("  state", seen[0]?.[0], "active");
  check("  previous is null after worker start", seen[0]?.[1], null);

  // windows.onFocusChanged fires on every window switch; identical states must
  // collapse or an alt-tab becomes a notification storm.
  focusListeners.forEach((fn) => fn());
  focusListeners.forEach((fn) => fn());
  await settle();
  check("repeat events at the same state are deduped", seen.length, 1);

  idleState = "idle";
  idleListeners.forEach((fn) => fn());
  await settle();
  check("active → idle delivered", seen[1]?.[0], "idle");
  check("  carries the previous state", seen[1]?.[1], "active");

  windowFocused = false;
  focusListeners.forEach((fn) => fn());
  await settle();
  check("idle → hidden delivered", seen[2]?.[0], "hidden");

  // The return-to-active edge is the one that restores the badge. If this stops
  // firing, the feature dies quietly.
  windowFocused = true;
  idleState = "active";
  idleListeners.forEach((fn) => fn());
  await settle();
  check("hidden → active delivered (the refresh trigger)", seen[3]?.[0], "active");

  unsubscribe();
  idleState = "idle";
  idleListeners.forEach((fn) => fn());
  await settle();
  check("unsubscribed listener stops receiving", seen.length, 4);

  console.log("\nsubscriber isolation");

  __resetEngagementForTests();
  const survivors: string[] = [];
  subscribeEngagement(() => {
    throw new Error("bad subscriber");
  });
  subscribeEngagement((state) => survivors.push(state));
  idleState = "active";
  windowFocused = true;
  focusListeners.forEach((fn) => fn());
  await settle();
  // A missed transition here means a permanently stale badge, so one bad
  // subscriber must not be able to starve the others.
  check("a throwing subscriber does not block the next", survivors.length, 1);

  __resetEngagementForTests();
  console.log(
    failures === 0
      ? "\n✓ extension engagement smoke passed\n"
      : `\n✖ ${failures} assertion(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
