/**
 * Auth setup — runs once before authenticated projects.
 *
 * Signs in as the seeded admin user (`admin@example.com`, see prisma/seed.ts)
 * via POST /api/auth/sign-in. The sign-in handler issues an httpOnly
 * `session_token` cookie; we persist the Playwright request context's
 * storageState to `playwright/.auth/admin.json`. Authenticated projects
 * (`auth-light`, `auth-dark`) load that file via their `use.storageState`
 * config and start every test already signed in — no per-test sign-in cost.
 *
 * Override credentials via env vars when running against a non-default seed:
 *   PLAYWRIGHT_ADMIN_EMAIL=test@... PLAYWRIGHT_ADMIN_PASSWORD=... pnpm test:e2e
 */

import { test as setup, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { ADMIN_STORAGE_STATE } from "./paths";

const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "changeme123";

setup("authenticate as admin", async ({ request }) => {
  const response = await request.post("/api/auth/sign-in", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  // Loud failure mode: if the seed user doesn't exist or creds are stale,
  // the body usually has a useful error code. Surface it so debugging
  // doesn't require re-running with --debug.
  if (!response.ok()) {
    const body = await response.text().catch(() => "<no body>");
    throw new Error(
      `auth.setup: sign-in failed (${response.status()}). ` +
        `Verify the seed has run and credentials match. Body: ${body}`,
    );
  }

  await mkdir(dirname(ADMIN_STORAGE_STATE), { recursive: true });
  await request.storageState({ path: ADMIN_STORAGE_STATE });

  // Sanity check — the seed user must exist and the session cookie must
  // have been issued. If this fails, downstream tests will fail in confusing
  // ways, so catch it here.
  const stored = await request.storageState();
  const sessionCookie = stored.cookies.find((c) => c.name === "session_token");
  expect(
    sessionCookie,
    "auth.setup: sign-in succeeded but no session_token cookie present",
  ).toBeDefined();
});
