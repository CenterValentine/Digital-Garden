import type { LogEvent } from "../types";
import { recordEvent } from "../event-recorder";
import { encodeJson } from "./json";
import { encodePretty, shouldRenderEvent } from "./pretty";

// The logger module is the only place in the codebase that writes directly
// to process.stdout / process.stderr. The no-console ESLint rule allowlists
// lib/core/logger/. Bypassing the rule here is intentional and audited.

export function writeEvent(ev: LogEvent, depth: number): void {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    // Production: always emit one structured JSON line. No filtering — the
    // log drain decides what to ingest.
    const stream =
      ev.level === "error" || ev.level === "fatal"
        ? process.stderr
        : process.stdout;
    stream.write(encodeJson(ev) + "\n");
    return;
  }

  // Dev: also persist to disk for Phase 6 trace replay. Records ALL events
  // (independent of LOG_LEVEL/LOG_TRACE filters) so the HTML viewer can show
  // the complete trace even when the terminal is filtered to a subset.
  // Fire-and-forget — never blocks the request.
  void recordEvent(ev);

  // Dev: respect LOG_LEVEL / LOG_TRACE filters. Filtered events are still
  // buffered for end-of-trace summary, just not rendered to the live tail.
  if (!shouldRenderEvent(ev)) return;

  const stream =
    ev.level === "error" || ev.level === "fatal"
      ? process.stderr
      : process.stdout;
  stream.write(encodePretty(ev, depth) + "\n");
}
