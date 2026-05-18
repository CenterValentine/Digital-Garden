import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";

// Per-trace JSONL sidecar in .local/debug-payloads/.
//
// Rotation policy (dev-only — production short-circuits to no-op):
//   - 5 MB per trace file       — refuse further appends, emit warn once
//   - 1000 trace files total    — LRU-evict oldest 100 when over count cap
//   - 500 MB directory total    — LRU-evict oldest files until under size cap
//
// Rotation check fires every CHECK_EVERY_WRITES writes (amortized O(N) cost
// across many writes). All rotation work is fire-and-forget — never blocks
// the calling request.

const SIDECAR_DIR = resolve(process.cwd(), ".local/debug-payloads");
const MAX_FILE_SIZE = 5 * 1024 * 1024;        // 5 MB per trace
const MAX_FILE_COUNT = 1000;                   // total trace files
const MAX_TOTAL_SIZE = 500 * 1024 * 1024;     // 500 MB total
const CHECK_EVERY_WRITES = 100;                // rotation check cadence

let dirEnsured = false;
let writesSinceCheck = 0;
const fullTraces = new Set<string>(); // traces that hit MAX_FILE_SIZE — silenced once

async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  await fs.mkdir(SIDECAR_DIR, { recursive: true });
  dirEnsured = true;
}

async function enforceRotation(): Promise<void> {
  try {
    const entries = await fs.readdir(SIDECAR_DIR);
    if (entries.length === 0) return;

    const stats = await Promise.all(
      entries.map(async (name) => {
        const path = join(SIDECAR_DIR, name);
        try {
          const stat = await fs.stat(path);
          return { name, path, mtimeMs: stat.mtimeMs, size: stat.size };
        } catch {
          return null;
        }
      }),
    );

    const valid = stats.filter((s): s is NonNullable<typeof s> => s !== null);

    // Oldest first
    valid.sort((a, b) => a.mtimeMs - b.mtimeMs);

    // Count-based eviction
    if (valid.length > MAX_FILE_COUNT) {
      const toEvict = valid.slice(0, valid.length - MAX_FILE_COUNT);
      await Promise.all(toEvict.map((f) => fs.unlink(f.path).catch(() => {})));
    }

    // Size-based eviction
    const totalSize = valid.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      let remaining = totalSize;
      for (const f of valid) {
        if (remaining <= MAX_TOTAL_SIZE) break;
        await fs.unlink(f.path).catch(() => {});
        remaining -= f.size;
      }
    }
  } catch {
    // Rotation is best-effort.
  }
}

export async function writePayload(
  trace_id: string,
  label: string,
  payload: unknown,
): Promise<string | undefined> {
  if (process.env.NODE_ENV === "production") return undefined;

  try {
    await ensureDir();
    const filePath = resolve(SIDECAR_DIR, `${trace_id}.jsonl`);

    // Per-file size cap — refuse further appends once exceeded.
    if (fullTraces.has(trace_id)) return undefined;
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_SIZE) {
        fullTraces.add(trace_id);
        return undefined;
      }
    } catch {
      // File doesn't exist yet — that's fine.
    }

    const line =
      JSON.stringify({ label, ts: new Date().toISOString(), payload }) + "\n";
    await fs.appendFile(filePath, line, "utf8");

    // Amortized rotation check.
    writesSinceCheck++;
    if (writesSinceCheck >= CHECK_EVERY_WRITES) {
      writesSinceCheck = 0;
      void enforceRotation();
    }

    return `.local/debug-payloads/${trace_id}.jsonl#${label}`;
  } catch {
    // Sidecar is best-effort; failure must never break the request.
    return undefined;
  }
}
