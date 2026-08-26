/**
 * _terms-sync-env.ts — side-effect-only env preamble for the terms-sync scripts.
 *
 * Import this FIRST, before `@/lib/database/client`, which reads DATABASE_URL
 * synchronously at module load. ESM evaluates imports depth-first in declaration
 * order, so listing this import first guarantees the swap below has already run.
 *
 * Why a dedicated DATABASE_URL rather than reusing the ambient one:
 * this repo's `.env.local` deliberately points DATABASE_URL at local Docker
 * Postgres while the production garden lives on Neon. Terms sync writes to
 * PRODUCTION, so it must name its target explicitly — an implicit fallback to
 * whatever DATABASE_URL happens to hold is exactly the accident that makes a
 * "dev" script write to prod (or vice versa) without anyone noticing.
 *
 * Required (put these in .env.terms-sync.local, which `.gitignore`'s `.env*`
 * rule already excludes):
 *   TERMS_SYNC_DATABASE_URL   — the garden database to write to
 *   TERMS_SYNC_TOKEN          — a ServiceToken with the garden:terms-sync scope
 *   TERMS_SYNC_ACCOUNT_EMAIL  — the DG account the token must resolve to
 */

import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.terms-sync.local" });
loadDotenv({ path: ".env.local" });
loadDotenv(); // fallback to .env

const target = process.env.TERMS_SYNC_DATABASE_URL;

if (!target) {
  console.error(
    "\n  ✗ TERMS_SYNC_DATABASE_URL is not set.\n\n" +
      "  Terms sync refuses to fall back to DATABASE_URL — the target garden\n" +
      "  must be named explicitly. Add it to .env.terms-sync.local:\n\n" +
      "      TERMS_SYNC_DATABASE_URL=postgresql://...\n" +
      "      TERMS_SYNC_TOKEN=dggl_...\n" +
      "      TERMS_SYNC_ACCOUNT_EMAIL=you@example.com\n",
  );
  process.exit(1);
}

// dotenv never overrides an already-set variable, so assign after loading.
process.env.DATABASE_URL = target;

/** Host of the resolved target, for banners. Never returns credentials. */
export function describeTermsSyncTarget(): { host: string; database: string } {
  try {
    const parsed = new URL(target);
    return {
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, "") || "(none)",
    };
  } catch {
    return { host: "(unparseable)", database: "(unknown)" };
  }
}
