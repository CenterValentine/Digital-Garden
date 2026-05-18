/**
 * Test-time Prisma client.
 *
 * Used by the content seed fixture to hard-delete test data after each
 * test (the API's DELETE endpoint is a soft-delete that creates a
 * 30-day TrashBin entry — fine for users, terrible for tests where it
 * accumulates rapidly). Also used by negative-path session tests that
 * need to forge expired `Session.expiresAt` rows that the API can't
 * produce.
 *
 * Mirrors the Prisma instantiation in prisma/seed.ts: `Pool` + `PrismaPg`
 * adapter + `PrismaClient`. Reads DATABASE_URL from .env.local first
 * (matching how `pnpm dev` resolves it), falling back to .env.
 *
 * Workers each get their own client — Playwright fork-isolates worker
 * processes, so module-level state isn't shared. Keep this module
 * side-effect free until first call.
 */

import { config } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../lib/database/generated/prisma";

config({ path: ".env.local" });
config(); // fallback to .env

let cached: PrismaClient | null = null;

/**
 * Lazily-initialized Prisma client for the test process.
 *
 * Lazy because the test setup file may load this module on import for
 * type definitions even when no test in the worker uses DB access.
 */
export function testPrisma(): PrismaClient {
  if (cached) return cached;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "tests/e2e/_fixtures/db.ts: DATABASE_URL is not set. " +
        "Tests that use seed.* helpers or db.* helpers need DB access. " +
        "Add it to .env.local or export it before running pnpm test:e2e.",
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  cached = new PrismaClient({ adapter });
  return cached;
}

/**
 * Resolve the seeded admin user's UUID from the email used by the auth
 * setup. The auth setup signs in with `admin@example.com` (or whatever
 * `PLAYWRIGHT_ADMIN_EMAIL` overrides), but doesn't expose the user ID
 * — fetch it here so seed helpers can stamp `ownerId` correctly.
 */
export async function getTestUserId(): Promise<string> {
  const email = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? "admin@example.com";
  const user = await testPrisma().user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      `tests/e2e/_fixtures/db.ts: test user '${email}' not found. ` +
        "Run `pnpm db:seed` to create the seeded admin.",
    );
  }
  return user.id;
}
