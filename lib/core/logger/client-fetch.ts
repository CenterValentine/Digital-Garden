// Trace-aware fetch wrapper for client modules. Every call:
//   1. Attaches the current client trace_id as `x-trace-id` so the server's
//      withRouteTrace adopts it — click → API → DB share one trace.
//   2. Emits a paired `fetch:requested` / `fetch:completed` (or `fetch:failed`)
//      event so the client side of every round trip is measurable. Per the
//      FRONTEND-LOG-CHARTER, attrs are pathname only — query strings and
//      bodies never reach the log stream.
//
// Usage:
//   import { tracedFetch } from "@/lib/core/logger/client-fetch";
//   const res = await tracedFetch("/api/content/content/" + id);
//
// Drop-in replacement for `fetch`. Same signature, same return type.

import { clientLogger, getClientTraceId } from "./client";

function extractPath(input: RequestInfo | URL): string {
  try {
    if (typeof input === "string") {
      // Bare path or full URL; strip query + hash before logging.
      const url = new URL(input, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      return url.pathname;
    }
    if (input instanceof URL) {
      return input.pathname;
    }
    // Request object
    const url = new URL((input as Request).url);
    return url.pathname;
  } catch {
    // Unparseable — return a stable placeholder rather than the raw input.
    return "<unparseable>";
  }
}

function extractMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input && typeof input === "object" && "method" in input && typeof input.method === "string") {
    return input.method.toUpperCase();
  }
  return "GET";
}

// Parse `Server-Timing: total;dur=12.3` to surface server wall-clock alongside
// network+parse time. Not all responses will have it; missing is fine.
function parseServerTotal(header: string | null): number | undefined {
  if (!header) return undefined;
  const match = header.match(/(?:^|,\s*)total;dur=([\d.]+)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export async function tracedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const traceId = getClientTraceId();
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("x-trace-id")) {
    headers.set("x-trace-id", traceId);
  }

  const path = extractPath(input);
  const method = extractMethod(input, init);
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  clientLogger.debug({
    layer: "fetch",
    event: "fetch:requested",
    summary: `${method} ${path}`,
    attrs: { method, path },
  });

  try {
    const response = await fetch(input, { ...init, headers });
    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
    );
    const serverTotal = parseServerTotal(response.headers.get("Server-Timing"));
    const attrs: Record<string, string | number | boolean> = {
      method,
      path,
      status: response.status,
      ok: response.ok,
    };
    if (serverTotal !== undefined) attrs.server_dur_ms = serverTotal;

    clientLogger[response.ok ? "info" : "warn"]({
      layer: "fetch",
      event: response.ok ? "fetch:completed" : "fetch:failed",
      summary: `${method} ${path} ${response.status}`,
      duration_ms: durationMs,
      attrs,
    });

    return response;
  } catch (err) {
    const durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
    );
    // AbortError is the expected outcome when an in-flight request is cancelled
    // (e.g., user switched tabs before previous load resolved). Emit it as
    // info, not warn — it's an intentional outcome, not a failure mode.
    const name = err instanceof Error ? err.name : "Unknown";
    const level = name === "AbortError" ? "info" : "error";
    clientLogger[level]({
      layer: "fetch",
      event: name === "AbortError" ? "fetch:aborted" : "fetch:failed",
      summary: `${method} ${path} ${name}`,
      duration_ms: durationMs,
      attrs: { method, path },
      error: err,
    });
    throw err;
  }
}
