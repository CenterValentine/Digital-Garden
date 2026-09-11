/**
 * Presence heartbeat cadence — the decision, separated from the runtime.
 *
 * Extracted so it can be tested. The collaboration runtime is a stateful
 * singleton wired to the DOM, IndexedDB and Y.js, which makes its branches
 * effectively unreachable from a test; this decision is pure, and it is the one
 * that decides whether a database ever gets to sleep. `polling:check` can only
 * verify that a gate EXISTS — proving the mapping is right takes execution.
 *
 * Cadence tiers, and what binds each:
 *
 *   active    20s  — bounded by STALE_AFTER_MS (45s) in presence-server.ts. Two
 *                    beats land at 40s, so one dropped beat is survivable. 30s
 *                    would not be: two misses reach 60s and the server prunes a
 *                    tab that is very much alive.
 *   idle      30s  — visible but untouched. Still inside the 45s window.
 *   hidden    30s  — backgrounded but not yet deep-dormant.
 *   offline   30s  — retry cadence; the write will fail anyway.
 *   dormant   STOP — see below.
 *
 * The dormant tier returns null rather than a long interval. It used to be five
 * minutes, which sits exactly on Neon's five-minute autosuspend threshold — so
 * one note left open in a background tab kept the database awake indefinitely.
 * Stopping is safe because the primary reader already discards these records:
 * ACTIVE_TRANSPORT_STATES in presence-poll.ts deliberately excludes dormant
 * sessions from the Note Window edit gate, so the writes were feeding a filter.
 *
 * Full rationale: POLLING-DISCIPLINE-PLAN.md D26.
 */

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000;
export const PRESENCE_HEARTBEAT_IDLE_INTERVAL_MS = 30_000;
export const PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS = 30_000;
export const PRESENCE_IDLE_AFTER_MS = 60_000;

export interface PresenceCadenceInput {
  networkState: "online" | "offline";
  /** True when a live provider object exists, however it is currently faring. */
  hasProvider: boolean;
  connectionState: string;
  reconnectIntent: boolean;
  /** Set once the tab has been hidden past the visibility-sleep countdown. */
  presenceSuspended: boolean;
  /** Milliseconds since the last local edit or consumer change. */
  msSinceActivity: number;
  /** Milliseconds of inactivity after which a sleeping transport is dormant. */
  inactivitySleepDelayMs: number;
  documentHidden: boolean;
}

/**
 * Milliseconds until the next heartbeat, or **null to stop beating entirely**.
 *
 * A null return is not "pause and we will pick it up next tick" — there is no
 * next tick. The caller must release the presence record and arrange its own
 * resume on activity.
 */
export function resolvePresenceHeartbeatDelay(
  input: PresenceCadenceInput,
): number | null {
  if (input.networkState === "offline") return PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS;

  // Deep-dormant requires the transport to be deliberately asleep — sleep mode
  // completed, no provider, no reconnect intent. Requiring !hasProvider keeps a
  // session that stayed connected (dirty edits can block the sleep) on the fast
  // cadence, so its "synced" record is not pruned under the 45s active window.
  const transportDormant =
    !input.hasProvider &&
    input.connectionState === "localOnly" &&
    !input.reconnectIntent;

  if (
    transportDormant &&
    (input.presenceSuspended || input.msSinceActivity >= input.inactivitySleepDelayMs)
  ) {
    return null;
  }

  if (input.documentHidden) return PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS;
  if (input.msSinceActivity > PRESENCE_IDLE_AFTER_MS) {
    return PRESENCE_HEARTBEAT_IDLE_INTERVAL_MS;
  }
  return PRESENCE_HEARTBEAT_INTERVAL_MS;
}
