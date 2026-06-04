/**
 * db-local-bootstrap.ts
 *
 * One-command first-time setup for local Postgres dev. Orchestrates:
 *   1. Safety check (must be in LOCAL_POSTGRES=1 mode with localhost URL)
 *   2. Start container (delegates to scripts/predev.ts)
 *   3. prisma migrate deploy (apply all migrations)
 *   4. prisma db push (catch up un-migrated schema drift)
 *   5. pnpm db:seed (seed test data)
 *
 * Refuses to run if pointing at Neon — protects against accidentally
 * applying the seed against the real dev/prod DB.
 */

import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

if (process.env.LOCAL_POSTGRES !== "1") {
  console.error("");
  console.error("  ❌ db:local:bootstrap requires LOCAL_POSTGRES=1.");
  console.error("     Add the following to your .env.local first:");
  console.error("");
  console.error("       LOCAL_POSTGRES=1");
  console.error('       DATABASE_URL="postgresql://postgres:postgres@localhost:5432/digital_garden_dev?schema=public"');
  console.error("");
  console.error("     See docs/notes-feature/guides/database/LOCAL-POSTGRES.md");
  console.error("");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL ?? "";
let host = "";
try {
  host = new URL(dbUrl).hostname;
} catch {
  // fall through
}

const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
if (!isLocal) {
  console.error("");
  console.error("  ❌ db:local:bootstrap refuses to run with a non-local DATABASE_URL.");
  console.error(`     Got host: ${host || "(invalid URL)"}`);
  console.error("     Bootstrap is destructive (re-runs seed) — only safe locally.");
  console.error("");
  process.exit(1);
}

function step(label: string, cmd: string, args: string[]): void {
  console.log(`\n→ ${label}`);
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\n❌ Failed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

step("Starting Postgres container (if not running)", "tsx", ["scripts/predev.ts"]);
step("Applying migrations", "npx", ["prisma", "migrate", "deploy"]);
step("Syncing schema for un-migrated tables", "npx", ["prisma", "db", "push"]);
step("Seeding", "pnpm", ["db:seed"]);

console.log("\n✅ Local DB bootstrapped. `pnpm dev` will now use the local container.\n");
