// Client-safe logger. Mirrors the server's `logger` API surface but runs in
// the browser — no node:async_hooks, no fs, no process.stdout. Safe to import
// from any "use client" module.
//
// Per FRONTEND-LOG-CHARTER.md:
//   • Dev: every emit also prints to `console.*` for visibility in DevTools.
//   • Prod: `error` and `fatal` are queued for the beacon endpoint
//     (`POST /api/logs/client`); lower levels stay client-side only.
//   • A frontend-originated `trace_id` lives at module scope for the page's
//     lifetime and gets attached to outbound fetches via the wrapper in
//     `client-fetch.ts`.

import { sanitizeAttrs, sanitizeSummary } from "./redaction";
import type {
  AttrValue,
  FrontendLayer,
  Level,
  LogError,
  LogEvent,
} from "./types";

// ── trace_id lifecycle ──
//
// Generated lazily on first access (covers SSR import → hydrate → first event
// without firing on every module load on the server). Soft-nav route changes
// must call `resetClientTraceId()` to mint a new one — see Phase 5.3 wiring
// into Next.js's `useRouter` events.

let _clientTraceId: string | null = null;

function makeTraceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers; not cryptographically strong, but trace_ids
  // don't need to be — uniqueness within a session is enough.
  return `t_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getClientTraceId(): string {
  if (!_clientTraceId) _clientTraceId = makeTraceId();
  return _clientTraceId;
}

export function resetClientTraceId(): string {
  _clientTraceId = makeTraceId();
  return _clientTraceId;
}

// ── beacon queue ──

const BEACON_PATH = "/api/logs/client";
const MAX_BATCH = 25;
const FLUSH_INTERVAL_MS = 5_000;

let _queue: LogEvent[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _flushHandlersBound = false;

function ensureFlushHandlers() {
  if (_flushHandlersBound) return;
  if (typeof window === "undefined") return;
  _flushHandlersBound = true;

  // Flush on tab hide/close. `sendBeacon` is the right primitive here — it
  // continues in the background even after the page unloads. `fetch` with
  // `keepalive` is the fallback if sendBeacon is unavailable.
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });
  window.addEventListener("pagehide", () => flushBeacon());
  window.addEventListener("beforeunload", () => flushBeacon());
}

function flushBeacon(): void {
  if (_queue.length === 0) return;
  const batch = _queue;
  _queue = [];
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }

  const body = JSON.stringify({ events: batch });

  // Prefer sendBeacon — it survives navigation. Falls back to fetch+keepalive.
  try {
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(BEACON_PATH, blob);
      if (ok) return;
    }
  } catch {
    // sendBeacon can throw if Content-Type isn't acceptable in some browsers;
    // fall through to fetch.
  }

  // Fire-and-forget fetch. `keepalive: true` lets it survive page unload.
  if (typeof fetch !== "undefined") {
    fetch(BEACON_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-trace-id": getClientTraceId(),
      },
      body,
      keepalive: true,
      credentials: "include",
    }).catch(() => {
      // Logging failures must never throw upstream. Drop silently.
    });
  }
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flushBeacon();
  }, FLUSH_INTERVAL_MS);
}

function enqueueForBeacon(ev: LogEvent) {
  ensureFlushHandlers();
  _queue.push(ev);
  if (_queue.length >= MAX_BATCH) {
    flushBeacon();
  } else {
    scheduleFlush();
  }
}

// ── console mirror (dev visibility) ──

const CONSOLE_BY_LEVEL: Record<Level, "debug" | "info" | "warn" | "error"> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "error",
};

function consoleMirror(ev: LogEvent) {
  if (typeof console === "undefined") return;
  // Single-line tag + structured detail. Devs can drill into the second arg in
  // DevTools without reading a long inline string.
  const tag = `[${ev.layer}:${ev.event}]`;
  const detail = ev.summary ?? "";
  const method = CONSOLE_BY_LEVEL[ev.level];
  // This file is the console boundary — the lib/core/logger/** glob in
  // eslint.config.mjs disables `no-console` here intentionally.
  console[method](`${tag} ${detail}`, {
    trace_id: ev.trace_id,
    attrs: ev.attrs,
    error: ev.error,
  });
}

// ── emit ──

function coerceError(err: unknown): LogError | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code;
    return { name: err.name, message: err.message, code };
  }
  if (typeof err === "object" && err !== null && "name" in err && "message" in err) {
    return err as LogError;
  }
  return { name: "Unknown", message: String(err) };
}

type ClientLeafInput = {
  layer: FrontendLayer;
  event: string;
  summary?: string;
  duration_ms?: number;
  attrs?: Record<string, AttrValue>;
  error?: unknown;
};

function emitClient(level: Level, input: ClientLeafInput): void {
  const ev: LogEvent = {
    trace_id: getClientTraceId(),
    ts: new Date().toISOString(),
    level,
    layer: input.layer,
    event: input.event,
    duration_ms: input.duration_ms,
    summary: sanitizeSummary(input.summary),
    attrs: sanitizeAttrs(input.attrs),
    error: coerceError(input.error),
  };

  consoleMirror(ev);

  // Beacon gate: only `error` and `fatal` cross the network. Mirrors the
  // server-side gate in the beacon endpoint so the rule lives in both places.
  if (level === "error" || level === "fatal") {
    enqueueForBeacon(ev);
  }
}

export const clientLogger = {
  debug: (input: ClientLeafInput) => emitClient("debug", input),
  info: (input: ClientLeafInput) => emitClient("info", input),
  warn: (input: ClientLeafInput) => emitClient("warn", input),
  error: (input: ClientLeafInput) => emitClient("error", input),
  fatal: (input: ClientLeafInput) => emitClient("fatal", input),
};

// Exposed for tests + the `client-fetch.ts` wrapper that needs to flush before
// navigation. Not for general application use.
export const __internal = {
  flushBeacon,
  getQueueLength: () => _queue.length,
};
