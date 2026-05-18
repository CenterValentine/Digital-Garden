import type { LogEvent } from "../types";

// Production stdout encoder. One event = one JSON line.
// Designed for ingestion by Vercel log drains, datadog, axiom, etc.
export function encodeJson(ev: LogEvent): string {
  return JSON.stringify(ev);
}
