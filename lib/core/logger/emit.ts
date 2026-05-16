import { getActiveSpan, getActiveTrace } from "./context";
import { writeEvent } from "./encoders";
import { sanitizeAttrs, sanitizeSummary } from "./redaction";
import type {
  AttrValue,
  Layer,
  Level,
  LogError,
  LogEvent,
} from "./types";

// Internal emit used by span.ts and the public logger.* leaf calls.
// Reads the active trace + span from ALS so callers don't thread IDs manually.

type EmitInput = {
  level: Level;
  layer: Layer;
  event: string;
  /**
   * Override trace_id from ALS. Required for spans whose terminal events
   * (like a streamText onFinish callback) fire after the ALS scope has
   * exited — the span object holds its own trace_id from creation time.
   */
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
  duration_ms?: number;
  status?: "ok" | "error" | "skipped";
  summary?: string;
  attrs?: Record<string, AttrValue>;
  payload_ref?: string;
  error?: LogError;
};

export function emitEvent(input: EmitInput): void {
  const ctx = getActiveTrace();
  const activeSpan = getActiveSpan();

  const ev: LogEvent = {
    trace_id: input.trace_id ?? ctx?.trace_id ?? "no-trace",
    span_id: input.span_id ?? activeSpan?.span_id,
    parent_span_id: input.parent_span_id ?? activeSpan?.parent_span_id,
    ts: new Date().toISOString(),
    level: input.level,
    layer: input.layer,
    event: input.event,
    duration_ms: input.duration_ms,
    status: input.status,
    summary: sanitizeSummary(input.summary),
    attrs: sanitizeAttrs(input.attrs),
    payload_ref: input.payload_ref,
    error: input.error,
  };

  writeEvent(ev, activeSpan?.depth ?? 0);
}

// Public leaf-emit API. Used for log lines that are not span boundaries
// (e.g., a single ":retried" notice, a cache-hit short-circuit).
//
// `layer` is optional ONLY when there is an active span — it falls back to
// the span's layer. Calling outside a span without a layer is a programming
// error and throws.

type LeafInput = {
  layer?: Layer;
  event: string;
  summary?: string;
  duration_ms?: number;
  attrs?: Record<string, AttrValue>;
  payload_ref?: string;
  error?: LogError | Error | unknown;
};

function coerceError(err: LeafInput["error"]): LogError | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    const code = (err as Error & { code?: string }).code;
    return { name: err.name, message: err.message, code };
  }
  if (typeof err === "object" && "name" in err && "message" in err) {
    return err as LogError;
  }
  return { name: "Unknown", message: String(err) };
}

function makeLeaf(level: Level) {
  return (input: LeafInput): void => {
    const activeSpan = getActiveSpan();
    const layer = input.layer ?? activeSpan?.layer;
    if (!layer) {
      throw new Error(
        `[logger] ${level}() called without 'layer' field and no active span context — ` +
          `pass { layer: "<name>", event: "..." } or call inside withSpan/startSpan`,
      );
    }
    emitEvent({
      level,
      layer,
      event: input.event,
      summary: input.summary,
      duration_ms: input.duration_ms,
      attrs: input.attrs,
      payload_ref: input.payload_ref,
      error: coerceError(input.error),
    });
  };
}

export const logger = {
  debug: makeLeaf("debug"),
  info: makeLeaf("info"),
  warn: makeLeaf("warn"),
  error: makeLeaf("error"),
  fatal: makeLeaf("fatal"),
};
