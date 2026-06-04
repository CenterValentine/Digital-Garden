/**
 * predev.ts
 *
 * Pre-flight check that runs before `next dev`. Auto-starts the local
 * Postgres container if LOCAL_POSTGRES=1 is set and the container isn't
 * already healthy. No-op in Neon mode.
 *
 * Exit codes:
 *   0 — Neon mode, OR local container already healthy, OR just started it
 *   1 — LOCAL_POSTGRES=1 but Docker daemon unreachable, or container failed to come up
 *
 * Wired in via package.json:
 *   "dev": "tsx scripts/predev.ts && next dev --port 3015"
 */

import { execSync, spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local" });
config(); // fallback to .env

function containerHealthy(): boolean {
  try {
    const out = execSync("docker compose ps --format json postgres", {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    return out.includes('"Health":"healthy"');
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  if (process.env.LOCAL_POSTGRES !== "1") {
    // Neon mode — nothing to do
    return 0;
  }

  // Is Docker daemon reachable?
  try {
    execSync("docker info", { stdio: "ignore", timeout: 3000 });
  } catch {
    console.error("");
    console.error("  🐳 LOCAL_POSTGRES=1 but the Docker daemon is not reachable.");
    console.error("     Start Docker Desktop (or your docker runtime) and retry,");
    console.error("     or unset LOCAL_POSTGRES in .env.local to use Neon.");
    console.error("");
    return 1;
  }

  if (containerHealthy()) {
    // Already up — exit silently to keep dev start clean
    return 0;
  }

  console.log("🐳 Starting local Postgres container...");
  const up = spawnSync("docker", ["compose", "up", "-d", "postgres"], {
    stdio: "inherit",
  });
  if (up.status !== 0) {
    return up.status ?? 1;
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (containerHealthy()) {
      console.log("🐳 Local Postgres healthy.");
      return 0;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.error("🐳 Postgres container did not become healthy within 30s.");
  console.error("    Check logs: docker compose logs postgres");
  return 1;
}

main().then((code) => process.exit(code));
