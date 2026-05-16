import { randomUUID } from "node:crypto";
import {
  getActiveSpan,
  getActiveTrace,
  popSpan,
  pushSpan,
} from "./context";
import { emitEvent } from "./emit";
import type { ActiveSpan, AttrValue, LogError, SpanName } from "./types";

// Span lifecycle. Two public APIs:
//   1. withSpan(name, options, fn) — wrapped, leak-proof. The try/finally
//      guarantees the span emits :completed or :failed even if `fn` throws.
//   2. startSpan(name, options) — manual handle. For streams or long-lived
//      work that outlives the function call. Caller is responsible for
//      end() / fail(). Leaking a startSpan handle means the span never
//      gets a terminal event.

export type SpanOptions = {
  attrs?: Record<string, AttrValue>;
  summary?: string;
};

export type SpanHandle = {
  trace_id: string;
  span_id: string;
  attr(key: string, value: AttrValue): SpanHandle;
  attrs(values: Record<string, AttrValue>): SpanHandle;
  summary(text: string): SpanHandle;
  event(
    name: string,
    details?: { summary?: string; attrs?: Record<string, AttrValue> },
  ): void;
  end(status?: "ok" | "skipped"): void;
  fail(err: unknown): void;
};

function shortId(): string {
  // 8 chars of a UUID is enough disambiguation inside a trace.
  return randomUUID().slice(0, 8);
}

function coerceError(err: unknown): LogError {
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code;
    return { name: err.name, message: err.message, code };
  }
  return { name: "Unknown", message: String(err) };
}

export function startSpan(
  spanName: SpanName,
  options?: SpanOptions,
): SpanHandle {
  const ctx = getActiveTrace();
  if (!ctx) {
    throw new Error(
      "[logger] startSpan called outside withTrace — instrumentation.ts must wrap the request",
    );
  }

  const parent = getActiveSpan();
  const span: ActiveSpan = {
    trace_id: ctx.trace_id,
    span_id: shortId(),
    parent_span_id: parent?.span_id,
    layer: spanName.layer,
    name: spanName.name,
    depth: parent ? parent.depth + 1 : 0,
    startedAt: performance.now(),
    attrs: new Map(),
  };
  if (options?.attrs) {
    for (const [k, v] of Object.entries(options.attrs)) span.attrs.set(k, v);
  }
  let currentSummary = options?.summary;
  pushSpan(span);

  emitEvent({
    level: "info",
    layer: span.layer,
    event: `${span.name}:started`,
    span_id: span.span_id,
    parent_span_id: span.parent_span_id,
    summary: currentSummary,
  });

  let ended = false;

  const handle: SpanHandle = {
    trace_id: span.trace_id,
    span_id: span.span_id,
    attr(key, value) {
      span.attrs.set(key, value);
      return handle;
    },
    attrs(values) {
      for (const [k, v] of Object.entries(values)) span.attrs.set(k, v);
      return handle;
    },
    summary(text) {
      currentSummary = text;
      return handle;
    },
    event(name, details) {
      emitEvent({
        level: "info",
        layer: span.layer,
        event: name,
        span_id: span.span_id,
        parent_span_id: span.parent_span_id,
        summary: details?.summary,
        attrs: details?.attrs,
      });
    },
    end(status = "ok") {
      if (ended) return;
      ended = true;
      const duration_ms = Math.round(performance.now() - span.startedAt);
      const attrsObj = span.attrs.size > 0
        ? Object.fromEntries(span.attrs)
        : undefined;
      emitEvent({
        level: "info",
        layer: span.layer,
        event: `${span.name}:${status === "skipped" ? "skipped" : "completed"}`,
        span_id: span.span_id,
        parent_span_id: span.parent_span_id,
        duration_ms,
        status,
        summary: currentSummary,
        attrs: attrsObj,
      });
      popSpan();
    },
    fail(err) {
      if (ended) return;
      ended = true;
      const duration_ms = Math.round(performance.now() - span.startedAt);
      const attrsObj = span.attrs.size > 0
        ? Object.fromEntries(span.attrs)
        : undefined;
      emitEvent({
        level: "error",
        layer: span.layer,
        event: `${span.name}:failed`,
        span_id: span.span_id,
        parent_span_id: span.parent_span_id,
        duration_ms,
        status: "error",
        summary: currentSummary,
        attrs: attrsObj,
        error: coerceError(err),
      });
      popSpan();
    },
  };

  return handle;
}

export async function withSpan<T>(
  spanName: SpanName,
  options: SpanOptions | undefined,
  fn: (span: SpanHandle) => T | Promise<T>,
): Promise<T> {
  const span = startSpan(spanName, options);
  try {
    const result = await fn(span);
    span.end("ok");
    return result;
  } catch (err) {
    span.fail(err);
    throw err;
  }
}
