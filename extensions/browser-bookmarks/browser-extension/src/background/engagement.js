/**
 * Engagement for the service worker — the counterpart to lib/core/engagement.
 *
 * Same three states, same policy vocabulary, DIFFERENT SENSORS. A background
 * service worker has no DOM, so `document.visibilityState` and pointer/keyboard
 * listeners are simply unavailable here. Chrome's equivalents:
 *
 *   app (DOM)                        extension (chrome.*)
 *   ───────────────────────────────  ────────────────────────────────────────
 *   visibilityState === "hidden"     no focused Chrome window, or screen locked
 *   input events → lastInputAt       chrome.idle.queryState(60)
 *   subscribeEngagement()            idle.onStateChanged + windows.onFocusChanged
 *
 * `chrome.idle` is in one respect a BETTER sensor than the DOM heuristic: it
 * reads OS-level input, so it sees the user typing in another application. The
 * app's version can only observe its own window and has to infer the rest.
 *
 * Why this exists: three persistent alarms were reaching the database on a
 * 1/5/20-minute cadence with no gating at all — including with every tab closed,
 * the side panel shut, and the browser minimized overnight. Neon needs five
 * CONTIGUOUS query-free minutes to autosuspend, so the 1-minute alarm alone held
 * the database awake for every hour the browser was running, re-creating the
 * whole compute bill the app-side work had just eliminated.
 *
 * Full cost model and decision history:
 * docs/notes-feature/work-tracking/POLLING-DISCIPLINE-PLAN.md
 *
 * ── One rule that differs from the DOM version ───────────────────────────────
 * The app attaches its listeners lazily, on the first subscriber, and detaches
 * on the last. A service worker CANNOT do that. Chrome evicts an idle worker
 * after ~30 seconds and restarts it on the next event, and a listener registered
 * inside a function only exists if something calls that function during startup.
 * MV3's rule is that event listeners must be registered SYNCHRONOUSLY at the top
 * level of the worker script, so that is what happens below — unconditionally,
 * at import. The subscriber set is pure fan-out and owns no lifecycle.
 */

/**
 * Seconds without OS-level input before the user is considered idle.
 * Deliberately identical to IDLE_AFTER_MS (60_000) in lib/core/engagement so the
 * two halves of the system agree on what "idle" means.
 */
export const IDLE_AFTER_S = 60;

/** @typedef {"active" | "idle" | "hidden"} Engagement */

const subscribers = new Set();
/** Last state broadcast, so repeated focus events don't re-notify. */
let lastNotified = null;

/**
 * Is any Chrome window focused right now?
 *
 * `getLastFocused()` returns the most recently focused window even when Chrome
 * as a whole has lost focus — the `focused` flag is what distinguishes them.
 * It rejects when no windows exist at all (every window closed, worker alive),
 * which is as unfocused as it gets.
 */
async function anyWindowFocused() {
  try {
    const win = await chrome.windows.getLastFocused();
    return win?.focused === true;
  } catch {
    return false;
  }
}

/**
 * Current engagement. Async — unlike the DOM version, every sensor here is an
 * async extension API, so callers must await. Cheap enough to call per alarm.
 */
export async function getEngagement() {
  let idleState = "active";
  try {
    idleState = await chrome.idle.queryState(IDLE_AFTER_S);
  } catch {
    // The "idle" permission is missing, or the API is unavailable in this
    // browser. Fall back to "active" and let the window-focus check below do
    // the gating on its own: it still removes the overnight and other-app
    // cases, which is the bulk of the cost. Failing the other way would
    // silently disable the badge entirely, which looks like a broken feature
    // rather than a thrifty one.
    idleState = "active";
  }

  // Locked screen is authoritative and needs no focus check — nobody is looking
  // at a toolbar badge behind a lock screen.
  if (idleState === "locked") return "hidden";

  // No focused Chrome window: the user is in another application or the browser
  // is minimized. The badge this gates is browser chrome, so it is literally
  // not on screen. Authoritative, exactly like visibilityState === "hidden".
  if (!(await anyWindowFocused())) return "hidden";

  return idleState === "idle" ? "idle" : "active";
}

/** True only in the "active" state — the common gate for network work. */
export async function isEngaged() {
  return (await getEngagement()) === "active";
}

async function notify() {
  const state = await getEngagement();
  if (state === lastNotified) return;
  const previous = lastNotified;
  lastNotified = state;
  for (const callback of subscribers) {
    try {
      callback(state, previous);
    } catch {
      // One bad subscriber must not stop the others from hearing about a
      // transition — a missed "returned to active" means a permanently stale
      // badge, which reads as a broken feature.
    }
  }
}

// ── Top-level listener registration (see the MV3 note in the header) ──────────
// These fire on every worker startup, including after an eviction. `notify`
// dedupes on state, so the frequent windows.onFocusChanged traffic (every window
// switch) collapses to real transitions.
chrome.idle.onStateChanged.addListener(() => void notify());
chrome.windows.onFocusChanged.addListener(() => void notify());

try {
  // Aligns onStateChanged with what queryState(IDLE_AFTER_S) reports. Without
  // it Chrome uses its own default interval and the push and pull answers can
  // disagree near the boundary.
  chrome.idle.setDetectionInterval(IDLE_AFTER_S);
} catch {
  // Permission missing — queryState's own catch already handles the fallback.
}

/**
 * Subscribe to engagement transitions. Returns an unsubscribe function.
 *
 * The callback receives `(state, previousState)`. `previousState` is null on the
 * first transition after a worker startup, because the worker has no memory of
 * what came before its eviction — treat a null previous as "just woke up".
 */
export function subscribeEngagement(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/** Test seam — clears fan-out state. The chrome listeners are permanent. */
export function __resetEngagementForTests() {
  subscribers.clear();
  lastNotified = null;
}
