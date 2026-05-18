import type { Layer, Level, LogEvent } from "../types";

// Dev-terminal renderer. Three layered concerns:
//   1. Per-event line (live tail) — column-aligned, Rendering 1 shape
//   2. End-of-trace summary block — flushes when root span ends
//   3. Visual hierarchy — `:started` events dimmed, `:completed`/`:failed`
//      in normal/bright color so the eye lands on completion lines with
//      durations
//
// Environment knobs:
//   NO_COLOR             — disable ANSI codes entirely
//   LOG_LEVEL            — "debug" (default) shows all, "info" hides debug
//   LOG_TRACE            — when set, only events whose trace_id starts with
//                          this value are rendered (filters in one trace)

const EVENT_COL_WIDTH = 38;
const SUMMARY_COL_WIDTH = 32;
const DURATION_COL_WIDTH = 7;
const SUMMARY_BLOCK_WIDTH = 73;
const MAX_BUFFER_PER_TRACE = 1000;

const ANSI_DIM = "\x1b[2m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_RESET = "\x1b[0m";
const ANSI_GRAY = "\x1b[90m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_RED = "\x1b[31m";
const ANSI_BOLD_RED = "\x1b[1;31m";

const traceBuffers = new Map<string, LogEvent[]>();

// ----------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------

/**
 * Decide whether a log event should be rendered to dev terminal. Used by
 * encoders/index.ts to short-circuit writes for filtered-out events. The
 * event is still buffered for the trace-end summary so counts stay accurate.
 */
export function shouldRenderEvent(ev: LogEvent): boolean {
  // LOG_TRACE filter — single-trace mode
  const traceFilter = process.env.LOG_TRACE;
  if (traceFilter && !ev.trace_id.startsWith(traceFilter)) {
    bufferEvent(ev);
    return false;
  }

  // LOG_LEVEL filter — drop debug events when not in debug mode
  const minLevel = process.env.LOG_LEVEL ?? "debug";
  if (minLevel !== "debug" && ev.level === "debug") {
    bufferEvent(ev);
    return false;
  }

  return true;
}

export function encodePretty(ev: LogEvent, depth: number): string {
  bufferEvent(ev);

  const tracePrefix = `[trace:${shortId(ev.trace_id)}]`;
  const indent = "  ".repeat(depth);
  const isStarted = ev.event.endsWith(":started");
  const isTerminal = isTerminalEvent(ev.event);

  // `⋯` marker for in-flight; `✓` for success; `✗` for failure.
  let marker = " ";
  if (isStarted) marker = "⋯";
  else if (ev.event.endsWith(":failed")) marker = "✗";
  else if (ev.event.endsWith(":completed")) marker = "✓";

  const eventName = `${ev.layer}:${ev.event}`;
  const eventCol = padRight(`${indent}${marker} ${eventName}`, EVENT_COL_WIDTH);
  const summaryCol = padRight(ev.summary ?? "", SUMMARY_COL_WIDTH);
  const durationCol =
    ev.duration_ms != null
      ? padLeft(`${ev.duration_ms}ms`, DURATION_COL_WIDTH)
      : padLeft("", DURATION_COL_WIDTH);

  // payload_ref may be set as a top-level field (legacy API) or via attrs
  // (spanPayload helper). The pretty encoder renders both consistently.
  const payloadRefFromAttrs =
    typeof ev.attrs?.payload_ref === "string" ? ev.attrs.payload_ref : undefined;
  const payloadRef = ev.payload_ref ?? payloadRefFromAttrs;
  const payloadCol = payloadRef ? `  payload: ${payloadRef}` : "";

  const errorSuffix = ev.error
    ? `  error: ${ev.error.name}: ${ev.error.message}`
    : "";

  let line = `${tracePrefix} ${eventCol} ${summaryCol} ${durationCol}${payloadCol}${errorSuffix}`;
  line = stylize(line, ev.level, isStarted, isTerminal);

  // Root span termination → flush summary block.
  if (depth === 0 && isTerminal) {
    const summary = renderSummaryBlock(ev.trace_id);
    traceBuffers.delete(ev.trace_id);
    return `${line}\n${summary}`;
  }

  return line;
}

// ----------------------------------------------------------------------
// Internals
// ----------------------------------------------------------------------

function bufferEvent(ev: LogEvent): void {
  let buf = traceBuffers.get(ev.trace_id);
  if (!buf) {
    buf = [];
    traceBuffers.set(ev.trace_id, buf);
  }
  if (buf.length < MAX_BUFFER_PER_TRACE) buf.push(ev);
}

function isTerminalEvent(event: string): boolean {
  return event.endsWith(":completed") || event.endsWith(":failed");
}

function renderSummaryBlock(trace_id: string): string {
  const events = traceBuffers.get(trace_id) ?? [];

  const byLayer = new Map<Layer, { count: number; duration_ms: number }>();
  let total_ms = 0;
  for (const ev of events) {
    const entry = byLayer.get(ev.layer) ?? { count: 0, duration_ms: 0 };
    entry.count++;
    if (ev.duration_ms) entry.duration_ms += ev.duration_ms;
    byLayer.set(ev.layer, entry);
    if (isTerminalEvent(ev.event) && ev.duration_ms && ev.duration_ms > total_ms) {
      total_ms = ev.duration_ms;
    }
  }

  const header = `─── trace:${shortId(trace_id)} summary `;
  const headerLine =
    header + "─".repeat(Math.max(0, SUMMARY_BLOCK_WIDTH - header.length));
  const footerLine = "─".repeat(SUMMARY_BLOCK_WIDTH);

  const sortedLayers = Array.from(byLayer.entries()).sort(
    (a, b) => b[1].duration_ms - a[1].duration_ms,
  );
  const rows = sortedLayers.map(([layer, stats]) => {
    const pct = total_ms > 0 ? Math.round((stats.duration_ms / total_ms) * 100) : 0;
    const eventsLabel =
      stats.count === 1 ? "1 event " : `${stats.count} events`;
    return `  ${padRight(layer, 14)} ${padLeft(eventsLabel, 8)}  ${padLeft(
      `${stats.duration_ms}ms`,
      7,
    )}  (${pct}%)`;
  });

  const block = [headerLine, ...rows, footerLine].join("\n");
  // Summary block uses bold to mark "this trace just finished".
  return stylizeBlock(block, ANSI_BOLD);
}

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function stylize(
  line: string,
  level: Level,
  isStarted: boolean,
  isTerminal: boolean,
): string {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return line;

  // Layered styling:
  //   1. :started events → dimmed (any level)
  //   2. error/fatal level → red regardless of started/terminal
  //   3. warn level → yellow
  //   4. debug level → gray
  //   5. completed/failed terminal events at info → bold (when not error)
  //   6. info level otherwise → plain

  if (level === "fatal") return `${ANSI_BOLD_RED}${line}${ANSI_RESET}`;
  if (level === "error") return `${ANSI_RED}${line}${ANSI_RESET}`;
  if (level === "warn") return `${ANSI_YELLOW}${line}${ANSI_RESET}`;

  if (isStarted) return `${ANSI_DIM}${line}${ANSI_RESET}`;
  if (level === "debug") return `${ANSI_GRAY}${line}${ANSI_RESET}`;
  if (isTerminal && level === "info") return `${ANSI_BOLD}${line}${ANSI_RESET}`;

  return line;
}

function stylizeBlock(text: string, ansi: string): string {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return text;
  return `${ansi}${text}${ANSI_RESET}`;
}
