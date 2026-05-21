import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { withTrace } from "./context";
import { startSpan } from "./span";

// Detect Next.js navigation "errors" (notFound, redirect) by their digest
// prefix. These are not real failures — they're the framework's way of
// interrupting render to perform navigation. The digests are part of Next's
// stable public contract (see src/client/components/redirect-error.ts and
// src/client/components/http-access-fallback/http-access-fallback.ts).
function isNextNavigationSignal(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest.startsWith("NEXT_REDIRECT") ||
    digest === "NEXT_HTTP_ERROR_FALLBACK;404" ||
    digest === "NEXT_NOT_FOUND" // legacy Next < 15 value, kept for safety
  );
}

// Server-component wrapper, sibling of withRouteTrace.
//
// withRouteTrace is shaped for API route handlers returning Response — its
// span auto-records the HTTP status from the returned object. Server-component
// pages don't return Response; they return JSX (or anything). withPageTrace
// keeps the same trace-id semantics (x-trace-id header → trace, else random)
// and opens a root `page:render` span, but the inner function can return
// whatever the page wants.
//
// Why: TipTapContent's visualization fetch wants withSpan, but withSpan
// throws without a trace context, and no upstream code on the public page
// route was opening one. This is the smallest reusable primitive that closes
// the gap without forcing every page in the app to know about route-trace
// internals.

const TRACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type PageTraceOptions = {
  /** Logical route name shown in the trace summary, e.g. "/(public)/[...path]" */
  route: string;
  /** Optional extra scalar attrs to attach to the root span at open time. */
  attrs?: Record<string, string | number | boolean>;
};

async function derivePageTraceId(): Promise<string> {
  try {
    const hdrs = await headers();
    const headerVal = hdrs.get("x-trace-id");
    if (headerVal && TRACE_ID_PATTERN.test(headerVal)) return headerVal;
  } catch {
    // headers() not callable in this context (build-time prerender, etc.)
    // — fall through to a fresh ID.
  }
  return randomUUID();
}

/**
 * Wrap a server-component page body so every emit inside inherits a trace
 * and the root `page:render` span. The inner function can return anything
 * (JSX, redirect via Next's notFound/redirect helpers, raw data) — the trace
 * context is independent of the return shape.
 *
 * Span outcome rules:
 *   - Normal return → `page_render:completed`
 *   - notFound() / redirect() throws → `page_render:completed` with
 *     `attrs.signal = "not_found" | "redirect"`. These are not real
 *     failures, they're the framework's render-interrupt mechanism.
 *   - Any other throw → `page_render:failed` with the error.
 */
export async function withPageTrace<T>(
  options: PageTraceOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const trace_id = await derivePageTraceId();
  return withTrace(trace_id, async () => {
    const span = startSpan(
      { layer: "route", name: "page_render" },
      {
        summary: `page ${options.route}`,
        attrs: { route: options.route, ...(options.attrs ?? {}) },
      },
    );
    try {
      const result = await fn();
      span.end("ok");
      return result;
    } catch (err) {
      if (isNextNavigationSignal(err)) {
        const digest = (err as { digest?: string }).digest ?? "";
        const signal = digest.startsWith("NEXT_REDIRECT") ? "redirect" : "not_found";
        span.attr("signal", signal).end("ok");
      } else {
        span.fail(err);
      }
      throw err;
    }
  });
}
