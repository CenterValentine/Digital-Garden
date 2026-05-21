import {
  default_request_retention,
  default_maximum_interval,
  default_w,
  generatorParameters,
  type FSRSParameters,
} from "ts-fsrs";

// What the route handler reads off the User row before scheduling.
// Decoupled from the Prisma type so this module stays import-light.
export interface FsrsUserSettings {
  fsrsParameters: unknown;
  desiredRetention: number;
  fsrsMaxInterval: number;
}

// Resolve the effective FSRS parameters for a user. Order of precedence:
//   1. Stored per-user weights (if present and well-formed).
//   2. Library defaults (`default_w`) — what every user starts with.
// `desiredRetention` and `fsrsMaxInterval` always come from the User row,
// even when weights fall back to defaults — the user controls those two
// directly via the settings UI; the 19-weight `w` array is what the
// optimizer retunes.
export function getEffectiveParameters(settings: FsrsUserSettings): FSRSParameters {
  const userWeights = parseStoredWeights(settings.fsrsParameters);
  return generatorParameters({
    request_retention: clampRetention(settings.desiredRetention),
    maximum_interval: clampMaxInterval(settings.fsrsMaxInterval),
    ...(userWeights ? { w: userWeights } : {}),
  });
}

// Default params with no per-user customization. Used by tests, the
// optimizer's "starting point" baseline, and routes that need to render
// a schedule preview before the user has any history.
export function getDefaultParameters(): FSRSParameters {
  return generatorParameters({
    request_retention: default_request_retention,
    maximum_interval: default_maximum_interval,
  });
}

// JSON shape we store in User.fsrsParameters. Versioned so a future
// optimizer revision can refuse to read incompatible blobs.
export interface StoredFsrsParameters {
  version: 1;
  w: number[];
  optimizedAt: string; // ISO timestamp; informational only
  reviewsUsed: number;
}

// Validate that a Json blob from the DB conforms to StoredFsrsParameters.
// Returns the unwrapped `w` array on success, null on any shape problem.
// We're conservative: if anything looks wrong, fall back to defaults
// rather than fail closed and refuse to schedule.
function parseStoredWeights(raw: unknown): number[] | null {
  if (raw === null || typeof raw !== "object") return null;
  const blob = raw as Record<string, unknown>;
  if (blob.version !== 1) return null;
  if (!Array.isArray(blob.w)) return null;
  if (blob.w.length !== default_w.length) return null;
  if (!blob.w.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return blob.w as number[];
}

function clampRetention(value: number): number {
  if (!Number.isFinite(value)) return default_request_retention;
  // FSRS is well-behaved between 0.70 and 0.97. Clamping anywhere outside
  // that range prevents the algorithm from producing nonsensical
  // schedules (e.g. negative intervals at retention ~= 1).
  return Math.min(0.97, Math.max(0.7, value));
}

function clampMaxInterval(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return default_maximum_interval;
  // 100 years is more than enough; longer values overflow date math in
  // some clients. Floor + cap.
  return Math.min(36500, Math.max(1, Math.floor(value)));
}
