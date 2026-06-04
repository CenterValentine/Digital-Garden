/**
 * check-db-target.ts
 *
 * Prints which database the current shell environment points at, and fails
 * if the LOCAL_POSTGRES marker disagrees with the DATABASE_URL host.
 *
 * Intended use:
 *   pnpm db:target                                   # introspect
 *   pnpm db:target && npx prisma migrate deploy      # gate a migration
 *
 * Exit codes:
 *   0 — DATABASE_URL parsed cleanly and LOCAL_POSTGRES marker matches
 *   1 — DATABASE_URL missing/malformed, or LOCAL_POSTGRES=1 but host is remote
 *
 * Matches the seed's env-loading order (.env.local first, then .env) so what
 * this script sees is what Prisma will see.
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config(); // fallback to .env

const databaseUrl = process.env.DATABASE_URL ?? "";
const localMarker = process.env.LOCAL_POSTGRES === "1";

type Target = "local" | "neon" | "other" | "invalid";

function classify(url: string): { target: Target; host: string; database: string } {
  if (!url) return { target: "invalid", host: "", database: "" };

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const database = parsed.pathname.replace(/^\//, "") || "(none)";

    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return { target: "local", host, database };
    }
    if (host.endsWith("neon.tech")) {
      return { target: "neon", host, database };
    }
    return { target: "other", host, database };
  } catch {
    return { target: "invalid", host: "", database: "" };
  }
}

const { target, host, database } = classify(databaseUrl);

const banners: Record<Target, string> = {
  local: "🐳 LOCAL POSTGRES",
  neon: "☁️  NEON",
  other: "🌐 REMOTE (non-Neon)",
  invalid: "❌ INVALID / MISSING",
};

console.log("");
console.log(`  ${banners[target]}`);
console.log(`  host:     ${host || "(none)"}`);
console.log(`  database: ${database}`);
console.log(`  marker:   LOCAL_POSTGRES=${localMarker ? "1" : "(unset)"}`);
console.log("");

if (target === "invalid") {
  console.error("DATABASE_URL is missing or malformed. Check your .env.local.");
  process.exit(1);
}

if (localMarker && target !== "local") {
  console.error(
    "LOCAL_POSTGRES=1 but DATABASE_URL is not local. Refusing to proceed —",
    "this combination usually means the env swap is half-applied.",
  );
  process.exit(1);
}

if (target === "local" && !localMarker) {
  console.warn(
    "Note: DATABASE_URL is local but LOCAL_POSTGRES marker is unset.",
    "Recommend setting LOCAL_POSTGRES=1 in .env.local for safety checks.",
  );
}

process.exit(0);
