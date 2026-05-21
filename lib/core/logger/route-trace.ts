import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { withTrace } from "./context";
import { withSpan } from "./span";

// Per-request wrapper used by every API route handler. Establishes the trace
// context, generates or honors x-trace-id from the request, and opens the
// root `route:request` span around the handler's body.
//
// Why this exists instead of instrumentation.ts: Next.js's instrumentation
// hook is one-shot (register() runs once at server start) and there is no
// built-in per-request hook that works in the Node runtime with
// AsyncLocalStorage. Wrapping each handler explicitly is the cleanest pattern
// until @vercel/otel is wired in (a future deliberate choice, not this phase).

const TRACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type HasHeadersAndMethod = {
  readonly headers: Headers;
  readonly method?: string;
};

export type RouteTraceOptions = {
  /** Logical route name, e.g. "/api/content/content/[id]" */
  route: string;
  /** Override HTTP method if the request shape doesn't expose one. */
  method?: string;
};

function deriveTraceId(req: HasHeadersAndMethod): string {
  const headerVal = req.headers.get("x-trace-id");
  if (headerVal && TRACE_ID_PATTERN.test(headerVal)) {
    return headerVal;
  }
  return randomUUID();
}

/**
 * Wrap a route handler body so every emit inside it inherits a trace_id
 * and the root `route:request` span. The span's `attrs.status` field is
 * populated from the returned Response's status; `summary` includes the
 * method, path, and status for at-a-glance reading.
 *
 * Thrown errors are auto-emitted as `:failed` by withSpan; HTTP 5xx returned
 * normally is a `:completed` event with attrs.status >= 500 — matches
 * OpenTelemetry convention.
 */
export async function withRouteTrace(
  req: HasHeadersAndMethod,
  options: RouteTraceOptions,
  fn: () => Promise<Response>,
): Promise<Response> {
  const traceId = deriveTraceId(req);
  const method = options.method ?? req.method ?? "GET";

  return withTrace(traceId, () =>
    withSpan(
      { layer: "route", name: "request" },
      {
        summary: `${method} ${options.route}`,
        attrs: { method, route: options.route },
      },
      async (span) => {
        const startedAt = performance.now();
        const response = await fn();
        const durationMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
        span
          .attr("status", response.status)
          .summary(`${method} ${options.route} ${response.status}`);
        // Surface the trace id and total wall-clock time into the response so
        // the browser's network panel can correlate against client-side spans
        // without round-tripping to the trace replay viewer. Server-Timing is
        // the W3C primitive Chrome / Firefox / Safari devtools already render.
        try {
          response.headers.set("x-trace-id", traceId);
          const prior = response.headers.get("Server-Timing");
          const next = `trace;desc="${traceId}", total;dur=${durationMs}`;
          response.headers.set("Server-Timing", prior ? `${prior}, ${next}` : next);
        } catch {
          // Some responses (notably from external proxies) ship immutable
          // headers. Silently skip — the span still emits via the logger.
        }
        return response;
      },
    ),
  ) as Promise<Response>;
}
