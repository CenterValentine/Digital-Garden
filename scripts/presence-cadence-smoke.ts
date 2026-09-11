/**
 * Smoke test for the presence heartbeat cadence.
 *
 * This decision governs whether a note left open in a background tab lets the
 * database sleep. Both failure directions are invisible in normal use: too
 * permissive and Neon never autosuspends, too strict and a live user's presence
 * record is pruned and they vanish for their collaborators.
 *
 * It also covers what `pnpm polling:check` structurally cannot. The gate
 * verifies an engagement check EXISTS in a file; only executing the branches
 * shows whether the mapping is right.
 *
 * Run: pnpm polling:smoke (runs after the scheduler and extension suites)
 */

export {};

const INACTIVITY_SLEEP_DELAY_MS = 120_000;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "✓" : "✖"} ${label}${ok ? "" : `  (got ${String(actual)}, want ${String(expected)})`}`,
  );
}

async function main() {
  const {
    resolvePresenceHeartbeatDelay,
    PRESENCE_HEARTBEAT_INTERVAL_MS,
    PRESENCE_HEARTBEAT_IDLE_INTERVAL_MS,
    PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS,
    PRESENCE_IDLE_AFTER_MS,
  } = await import("@/lib/domain/collaboration/presence-cadence");

  /** A live, connected, actively-edited session. */
  const base = {
    networkState: "online" as const,
    hasProvider: true,
    connectionState: "synced",
    reconnectIntent: false,
    presenceSuspended: false,
    msSinceActivity: 0,
    inactivitySleepDelayMs: INACTIVITY_SLEEP_DELAY_MS,
    documentHidden: false,
  };

  console.log("\nstaleness contract");

  // The binding constraint: STALE_AFTER_MS is 45s in presence-server.ts, and
  // what matters is surviving ONE dropped beat. If this ever fails, the active
  // cadence was raised without moving the server's prune window with it.
  const STALE_AFTER_MS = 45_000;
  check(
    "two active beats land inside the 45s prune window",
    PRESENCE_HEARTBEAT_INTERVAL_MS * 2 < STALE_AFTER_MS,
    true,
  );
  // Every tier must beat faster than the prune window, or a live session is
  // pruned in STEADY STATE, not merely after a dropped beat.
  check(
    "idle tier still beats inside the prune window",
    PRESENCE_HEARTBEAT_IDLE_INTERVAL_MS < STALE_AFTER_MS,
    true,
  );
  check(
    "hidden tier still beats inside the prune window",
    PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS < STALE_AFTER_MS,
    true,
  );
  // NOTE: only the active tier has room for a dropped beat. At 30s, two misses
  // reach 60s and prune a live session — pre-existing, and the reason raising
  // the idle/hidden tiers requires moving STALE_AFTER_MS too.

  console.log("\ntiers");

  check("active + connected", resolvePresenceHeartbeatDelay(base), PRESENCE_HEARTBEAT_INTERVAL_MS);
  check(
    "visible but idle past the threshold",
    resolvePresenceHeartbeatDelay({ ...base, msSinceActivity: PRESENCE_IDLE_AFTER_MS + 1 }),
    PRESENCE_HEARTBEAT_IDLE_INTERVAL_MS,
  );
  check(
    "hidden",
    resolvePresenceHeartbeatDelay({ ...base, documentHidden: true }),
    PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS,
  );
  check(
    "offline short-circuits before anything else",
    resolvePresenceHeartbeatDelay({
      ...base,
      networkState: "offline",
      connectionState: "localOnly",
      hasProvider: false,
      presenceSuspended: true,
    }),
    PRESENCE_HEARTBEAT_HIDDEN_INTERVAL_MS,
  );

  console.log("\ndormant → STOP (D26)");

  /** Sleep mode completed: no provider, localOnly, no reconnect intent. */
  const asleep = {
    ...base,
    hasProvider: false,
    connectionState: "localOnly",
    reconnectIntent: false,
  };

  check(
    "asleep + suspended-hidden → stop entirely",
    resolvePresenceHeartbeatDelay({ ...asleep, presenceSuspended: true }),
    null,
  );
  check(
    "asleep + idle past the sleep delay → stop entirely",
    resolvePresenceHeartbeatDelay({
      ...asleep,
      msSinceActivity: INACTIVITY_SLEEP_DELAY_MS,
    }),
    null,
  );

  // Every one of these keeps a session OUT of the dormant tier. Each guards a
  // distinct way a live user could otherwise be silently dropped.
  const stillBeats = (patch: Record<string, unknown>) =>
    resolvePresenceHeartbeatDelay({ ...asleep, presenceSuspended: true, ...patch }) !== null;

  check(
    "a live provider is never dormant (dirty edits can block the sleep)",
    stillBeats({ hasProvider: true }),
    true,
  );
  check("reconnect intent is never dormant", stillBeats({ reconnectIntent: true }), true);
  check(
    "a connected transport is never dormant",
    stillBeats({ connectionState: "connected" }),
    true,
  );
  check(
    "asleep but recently active and still visible → keeps beating",
    resolvePresenceHeartbeatDelay({ ...asleep, msSinceActivity: 1_000 }),
    PRESENCE_HEARTBEAT_INTERVAL_MS,
  );

  console.log("\nresume");

  // The silent-failure case. Stopping is only safe if activity brings it back:
  // the runtime has no timer left to re-evaluate the tier, so a user who
  // returned and started typing would stay invisible to their collaborators.
  // This asserts the resolver agrees the moment activity is stamped.
  const wasDormant = { ...asleep, msSinceActivity: INACTIVITY_SLEEP_DELAY_MS };
  check("dormant before activity", resolvePresenceHeartbeatDelay(wasDormant), null);
  check(
    "typing resets msSinceActivity → beats again immediately",
    resolvePresenceHeartbeatDelay({ ...wasDormant, msSinceActivity: 0 }),
    PRESENCE_HEARTBEAT_INTERVAL_MS,
  );
  check(
    "returning to visible lifts the suspension → beats again",
    resolvePresenceHeartbeatDelay({
      ...asleep,
      presenceSuspended: false,
      documentHidden: false,
      msSinceActivity: 0,
    }),
    PRESENCE_HEARTBEAT_INTERVAL_MS,
  );

  console.log(
    failures === 0
      ? "\n✓ presence cadence smoke passed\n"
      : `\n✖ ${failures} assertion(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
