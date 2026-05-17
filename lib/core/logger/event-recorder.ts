import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import type { LogEvent } from "./types";

// Per-trace JSONL of every LogEvent — input for Phase 6's HTML trace viewer.
//
// Lives in the same directory as payload sidecars so the rotation policy in
// payload-sidecar.ts naturally sweeps both file types via LRU mtime ordering.
// File naming: <trace_id>.events.jsonl (siblings to <trace_id>.jsonl payloads).
//
// Dev-only — production short-circuits to no-op (use the log drain instead).
// Opt-out: set LOG_RECORD=0 to suppress recording when debugging the recorder
// itself or when disk pressure is a concern.

const RECORDER_DIR = resolve(process.cwd(), ".local/debug-payloads");
let dirEnsured = false;

function isEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.LOG_RECORD === "0") return false;
  return true;
}

async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  await fs.mkdir(RECORDER_DIR, { recursive: true });
  dirEnsured = true;
}

export async function recordEvent(ev: LogEvent): Promise<void> {
  if (!isEnabled()) return;
  // Skip orphan events that have no trace context — they'd produce a
  // `no-trace.events.jsonl` file with mixed unrelated streams.
  if (ev.trace_id === "no-trace") return;

  try {
    await ensureDir();
    const filePath = resolve(RECORDER_DIR, `${ev.trace_id}.events.jsonl`);
    await fs.appendFile(filePath, JSON.stringify(ev) + "\n", "utf8");
  } catch {
    // Recorder is best-effort; failure must never break the request.
  }
}
