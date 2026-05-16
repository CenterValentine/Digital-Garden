import { randomUUID } from "node:crypto";
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
        const response = await fn();
        span
          .attr("status", response.status)
          .summary(`${method} ${options.route} ${response.status}`);
        return response;
      },
    ),
  ) as Promise<Response>;
}
