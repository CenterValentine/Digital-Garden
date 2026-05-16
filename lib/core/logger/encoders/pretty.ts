import type { Layer, Level, LogEvent } from "../types";

// Dev-terminal renderer. Two outputs combined into one Rendering 4 stream:
//   1. Live tail — one column-aligned line per event (Rendering 1 shape).
//   2. End-of-trace summary block — emitted once when the root span ends.
//
// Buffering is per-trace, capped at MAX_BUFFER_PER_TRACE so a runaway or
// never-closed trace can't leak memory. In a dev session this is sufficient;
// production uses the JSON encoder and skips this entirely.

const EVENT_COL_WIDTH = 38;
const SUMMARY_COL_WIDTH = 32;
const DURATION_COL_WIDTH = 7;
const SUMMARY_BLOCK_WIDTH = 73;
const MAX_BUFFER_PER_TRACE = 1000;

const traceBuffers = new Map<string, LogEvent[]>();

export function encodePretty(ev: LogEvent, depth: number): string {
  bufferEvent(ev);

  const tracePrefix = `[trace:${shortId(ev.trace_id)}]`;
  const indent = "  ".repeat(depth);
  const eventName = `${ev.layer}:${ev.event}`;
  const eventCol = padRight(indent + eventName, EVENT_COL_WIDTH);
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
  line = colorize(line, ev.level);

  // Root span termination → flush summary block.
  if (depth === 0 && isTerminalEvent(ev.event)) {
    const summary = renderSummaryBlock(ev.trace_id);
    traceBuffers.delete(ev.trace_id);
    return `${line}\n${summary}`;
  }

  return line;
}

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

  return [headerLine, ...rows, footerLine].join("\n");
}

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function shortId(id: string): string {
  // First 8 chars is enough for human disambiguation in a session.
  return id.length > 8 ? id.slice(0, 8) : id;
}

function colorize(line: string, level: Level): string {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return line;
  const codes: Record<Level, string> = {
    debug: "\x1b[90m",
    info: "",
    warn: "\x1b[33m",
    error: "\x1b[31m",
    fatal: "\x1b[1;31m",
  };
  const reset = "\x1b[0m";
  const code = codes[level];
  return code ? `${code}${line}${reset}` : line;
}
