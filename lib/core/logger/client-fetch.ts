// Trace-aware fetch wrapper for client modules. Every call attaches the
// current client trace_id as `x-trace-id`; the server's withRouteTrace reads
// it and uses it as the route span's trace_id, so the click → API → DB chain
// shares one trace_id end-to-end.
//
// Usage:
//   import { tracedFetch } from "@/lib/core/logger/client-fetch";
//   const res = await tracedFetch("/api/content/content/" + id);
//
// Drop-in replacement for `fetch`. Same signature, same return type.

import { getClientTraceId } from "./client";

export async function tracedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const traceId = getClientTraceId();
  const headers = new Headers(init?.headers ?? {});
  // Don't overwrite if the caller already set one (e.g., explicit propagation
  // from a worker or a test fixture). The server will accept the existing ID
  // because withRouteTrace honors `x-trace-id` from the request as-is.
  if (!headers.has("x-trace-id")) {
    headers.set("x-trace-id", traceId);
  }
  return fetch(input, { ...init, headers });
}
