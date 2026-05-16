import { promises as fs } from "node:fs";
import { resolve } from "node:path";

// Per-trace JSONL sidecar in .local/debug-payloads/. Best-effort and
// dev-only — production short-circuits to undefined so no payload writes
// happen on Vercel Functions (which have read-only filesystems anyway).

const SIDECAR_DIR = resolve(process.cwd(), ".local/debug-payloads");
let dirEnsured = false;

async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  await fs.mkdir(SIDECAR_DIR, { recursive: true });
  dirEnsured = true;
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
    const line =
      JSON.stringify({ label, ts: new Date().toISOString(), payload }) + "\n";
    await fs.appendFile(filePath, line, "utf8");
    return `.local/debug-payloads/${trace_id}.jsonl#${label}`;
  } catch {
    // Sidecar is best-effort; failure must never break the request.
    return undefined;
  }
}
