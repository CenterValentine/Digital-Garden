#!/usr/bin/env tsx
/**
 * Archive prior session traces, keeping the most recent N session archives
 * under `.local/debug-payloads/.archive/<ISO timestamp>/`. Runs as the
 * `predev` hook so each new dev session starts with a clean `pnpm trace:list`
 * BUT prior sessions are still recoverable for forensic analysis.
 *
 * History: an earlier version of the predev hook called `rm -rf
 * .local/debug-payloads`. That wiped the forensic evidence from a
 * destructive PATCH incident on 2026-05-17 before it could be inspected.
 * This script replaces that destructive behavior with archival.
 *
 * Bounded by an LRU sweep — keeps the most recent MAX_ARCHIVED_SESSIONS
 * folders and deletes older ones so disk doesn't grow forever.
 */

import { promises as fs } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(process.cwd(), ".local/debug-payloads");
const ARCHIVE_DIR = resolve(DIR, ".archive");
const MAX_ARCHIVED_SESSIONS = 5;

function timestamp(): string {
  // ISO-ish but filesystem-safe (no colons / dots)
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function main(): Promise<void> {
  // Ensure base + archive dirs exist so the recorder can start fresh.
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });

  // Collect prior-session artifacts to archive. We move JSONL trace files and
  // the rendered HTML viewers; ignore the `.archive` subdir itself.
  const entries = await fs.readdir(DIR, { withFileTypes: true });
  const toArchive = entries.filter(
    (e) =>
      e.isFile() &&
      !e.name.startsWith(".") &&
      (e.name.endsWith(".jsonl") || e.name.endsWith(".html")),
  );

  if (toArchive.length > 0) {
    const sessionDir = resolve(ARCHIVE_DIR, timestamp());
    await fs.mkdir(sessionDir, { recursive: true });
    await Promise.all(
      toArchive.map((entry) =>
        fs.rename(resolve(DIR, entry.name), resolve(sessionDir, entry.name)),
      ),
    );
    process.stdout.write(
      `[archive-traces] archived ${toArchive.length} file(s) to .local/debug-payloads/.archive/${sessionDir.split("/").pop()}/\n`,
    );
  }

  // LRU: keep newest MAX_ARCHIVED_SESSIONS, evict older ones.
  const archived = (await fs.readdir(ARCHIVE_DIR)).filter((n) => !n.startsWith("."));
  if (archived.length > MAX_ARCHIVED_SESSIONS) {
    const sorted = archived.sort(); // ISO timestamps sort chronologically
    const toEvict = sorted.slice(0, sorted.length - MAX_ARCHIVED_SESSIONS);
    await Promise.all(
      toEvict.map((name) =>
        fs.rm(resolve(ARCHIVE_DIR, name), { recursive: true, force: true }),
      ),
    );
    process.stdout.write(
      `[archive-traces] evicted ${toEvict.length} old archive(s) (kept newest ${MAX_ARCHIVED_SESSIONS})\n`,
    );
  }
}

main().catch((err) => {
  // Best-effort. Never block dev start; just note the failure on stderr.
  process.stderr.write(
    `[archive-traces] warning: ${err instanceof Error ? err.message : String(err)}\n`,
  );
});
