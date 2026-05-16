import type { LogEvent } from "../types";
import { encodeJson } from "./json";
import { encodePretty } from "./pretty";

// The logger module is the only place in the codebase that writes directly
// to process.stdout / process.stderr. The no-console ESLint rule allowlists
// lib/core/logger/. Bypassing the rule here is intentional and audited.

export function writeEvent(ev: LogEvent, depth: number): void {
  const isProd = process.env.NODE_ENV === "production";
  const line = isProd ? encodeJson(ev) : encodePretty(ev, depth);
  const stream =
    ev.level === "error" || ev.level === "fatal" ? process.stderr : process.stdout;
  stream.write(line + "\n");
}
