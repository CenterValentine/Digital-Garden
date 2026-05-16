import type { LogEvent } from "../types";
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

  // Dev: respect LOG_LEVEL / LOG_TRACE filters. Filtered events are still
  // buffered for end-of-trace summary, just not rendered to the live tail.
  if (!shouldRenderEvent(ev)) return;

  const stream =
    ev.level === "error" || ev.level === "fatal"
      ? process.stderr
      : process.stdout;
  stream.write(encodePretty(ev, depth) + "\n");
}
