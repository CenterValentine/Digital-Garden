"use client";

/**
 * Engagement — the single source of truth for "is anyone actually using this tab
 * right now?", shared by every poller and stream in the app.
 *
 * Three states, deliberately ordered by how much we trust them:
 *
 *   hidden  The tab is backgrounded. AUTHORITATIVE — the user demonstrably is
 *           not looking, so anything may be paused or closed.
 *   idle    Visible, but no user input for IDLE_AFTER_MS. A HEURISTIC — the user
 *           may well be watching something (a job running, audio playing), so a
 *           task may legitimately override this. See `keepAliveWhile`.
 *   active  Visible and recently interacted with.
 *
 * Why this exists at all: on metered infrastructure a background poll is billed
 * twice — once for the function that serves it, once for the database that never
 * reaches its autosuspend threshold. And the meters have *different* definitions
 * of quiet (Neon needs 5 contiguous query-free minutes; Cloud Run needs zero open
 * WebSockets; Vercel memory needs zero held-open requests). One shared engagement
 * signal with per-task policy is how those get satisfied without eight
 * independent implementations drifting apart.
 *
 * Full rationale and decision history:
 * docs/notes-feature/work-tracking/POLLING-DISCIPLINE-PLAN.md
 *
 * ── Relationship to the collaboration runtime ────────────────────────────────
 * lib/domain/collaboration/runtime.ts has its own `lastActivityAt`, but it is
 * reset on every local **Y.js edit** — that is EDIT activity, not INPUT activity.
 * Someone reading a note without typing is correctly "inactive" to the runtime
 * (nothing to sync) and correctly "active" here (they are using the app). The
 * two signals are genuinely different and both are right for their purpose, so
 * this module aligns with the runtime's thresholds rather than replacing them.
 */

export type Engagement = "active" | "idle" | "hidden";

/**
 * How long without input before a visible tab is considered idle.
 *
 * 60s is long enough that reading a paragraph without touching anything does not
 * trip it, and short enough that a forgotten PWA goes quiet fast. It also sits
 * comfortably inside Neon's 5-minute autosuspend window, so a tab that goes idle
 * still leaves roughly four minutes of contiguous quiet for the database to
 * actually suspend in.
 */
export const IDLE_AFTER_MS = 60_000;

/**
 * How often the transition from active → idle is noticed.
 *
 * This is the only timer this module owns. It is UI-only — it never touches the
 * network — and it exists solely so that *streams* can be told to close when the
 * user goes idle. Pull-based consumers (anything that already ticks) should call
 * `getEngagement()` at their own tick instead and cost nothing at all.
 *
 * It runs only while there is at least one subscriber.
 */
const TRANSITION_CHECK_MS = 5_000;

/**
 * Input signals, chosen for Chromium (Vivaldi/Chrome) but standard everywhere.
 *
 * `pointer*` is the unified input API — it covers mouse, touch and pen in one,
 * so no separate mousedown/touchstart pairs are needed. Scroll and wheel are
 * registered passive so they never block the compositor.
 */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "scroll"] as const;

/**
 * How long the cursor must remain over the page before `pointermove` counts as
 * engagement. Comfortably longer than any crossing, far shorter than any real
 * hover.
 */
export const POINTER_DWELL_MS = 3_000;

let lastInputAt = Date.now();
/** When the cursor most recently entered the page; null while outside. */
let pointerEnteredAt: number | null = null;
let current: Engagement = "active";
let listenersAttached = false;
let transitionTimer: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<(state: Engagement) => void>();

/**
 * Stamp a timestamp rather than resetting a timer.
 *
 * `pointermove` fires 60–120 times a second; resetting a `setTimeout` on each
 * would thrash. An assignment is effectively free, and it moves all the actual
 * decision-making to the moment someone asks — which is where it is needed.
 */
/**
 * Deliberate input. Any of these is unambiguous engagement, so they stamp
 * immediately — nobody presses a key or scrolls a window by accident.
 */
function markInput() {
  lastInputAt = Date.now();
  if (current !== "active") recompute();
}

/**
 * `pointermove` is the one AMBIGUOUS signal, so it is gated on dwell.
 *
 * It fires only while the cursor is physically over this window — but that
 * covers two very different things:
 *
 *   TRANSIT   the cursor crossing this window on its way to another monitor,
 *             the dock, or an adjacent app. Sub-second, and not engagement.
 *   HOVERING  reading a visible-but-unfocused window on a second monitor.
 *             Minutes, and absolutely engagement.
 *
 * Requiring the cursor to have been present for POINTER_DWELL_MS separates them
 * cleanly, because no crossing lasts three seconds and no reading session is
 * shorter.
 *
 * This distinction is not cosmetic. Neon needs five CONTIGUOUS query-free
 * minutes to autosuspend, so a single incidental crossing every four minutes
 * resets the idle countdown often enough that the database never sleeps — the
 * full cost of polling nonstop, for a window nobody looked at. The meter does
 * not reward mostly-quiet, only contiguously-quiet.
 *
 * Note this deliberately does NOT require focus. An unfocused window being read
 * on a second monitor is real engagement, and an earlier version of this guard
 * got that wrong.
 */
function markPointerMove() {
  if (pointerEnteredAt === null) {
    // First move since entering (or since page load with the cursor already
    // inside, where no enter event fires) — start the dwell clock.
    pointerEnteredAt = Date.now();
    return;
  }
  if (Date.now() - pointerEnteredAt < POINTER_DWELL_MS) return;
  markInput();
}

/** Cursor left the page: any accumulated dwell is void. */
function handlePointerLeave() {
  pointerEnteredAt = null;
}

function computeEngagement(): Engagement {
  if (typeof document === "undefined") return "active";
  if (document.visibilityState === "hidden") return "hidden";
  return Date.now() - lastInputAt >= IDLE_AFTER_MS ? "idle" : "active";
}

function recompute() {
  const next = computeEngagement();
  if (next === current) return;
  current = next;
  for (const cb of subscribers) {
    try {
      cb(next);
    } catch {
      // A misbehaving subscriber must not take down the others, or one bad
      // consumer silently freezes engagement for the whole app.
    }
  }
}

function handleFocusOrVisibility() {
  // Bound to BOTH `focus` and `visibilitychange`, which cover different
  // transitions: `focus` fires when an unfocused window is clicked into,
  // `visibilitychange` when a backgrounded tab is switched to.
  //
  // Returning to a tab counts as engagement in itself — otherwise a tab that was
  // hidden for an hour would come back already idle and stay paused until the
  // user happened to move the mouse.
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    lastInputAt = Date.now();
  }
  recompute();
}

function attach() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, markInput, { passive: true });
  }
  window.addEventListener("pointermove", markPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", handlePointerLeave, {
    passive: true,
  });
  window.addEventListener("focus", handleFocusOrVisibility);
  document.addEventListener("visibilitychange", handleFocusOrVisibility);
  transitionTimer = setInterval(recompute, TRANSITION_CHECK_MS);
}

function detach() {
  if (!listenersAttached || typeof window === "undefined") return;
  listenersAttached = false;
  for (const event of ACTIVITY_EVENTS) {
    window.removeEventListener(event, markInput);
  }
  window.removeEventListener("pointermove", markPointerMove);
  document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
  window.removeEventListener("focus", handleFocusOrVisibility);
  document.removeEventListener("visibilitychange", handleFocusOrVisibility);
  if (transitionTimer !== null) {
    clearInterval(transitionTimer);
    transitionTimer = null;
  }
}

/**
 * Current engagement. Cheap and synchronous — call it at tick time from anything
 * that already has a timer, rather than subscribing.
 */
export function getEngagement(): Engagement {
  // Recompute rather than trusting `current`, which is only refreshed on input,
  // visibility change, or the 5s transition check. A puller asking at second 3
  // of that window deserves a truthful answer.
  return computeEngagement();
}

/** True when the tab is visible and recently interacted with. */
export function isEngaged(): boolean {
  return getEngagement() === "active";
}

/**
 * Subscribe to engagement transitions. Returns an unsubscribe function.
 *
 * Use this for **streams**, which have no tick of their own and need telling
 * when to close. Anything that already polls should use `getEngagement()` at its
 * own tick instead — no subscription, no extra timer.
 *
 * Listeners attach on the first subscriber and detach on the last, so a page
 * with no consumers pays nothing.
 */
export function subscribeEngagement(
  callback: (state: Engagement) => void,
): () => void {
  subscribers.add(callback);
  if (subscribers.size === 1) {
    lastInputAt = Date.now();
    current = computeEngagement();
    attach();
  }
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) detach();
  };
}

/** Milliseconds since the last user input. Exposed for diagnostics and tests. */
export function msSinceLastInput(): number {
  return Date.now() - lastInputAt;
}

/** Test seam — resets module state between cases. */
export function __resetEngagementForTests() {
  detach();
  subscribers.clear();
  lastInputAt = Date.now();
  pointerEnteredAt = null;
  current = "active";
}
