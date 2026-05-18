/**
 * Session persistence — cookie survives reloads, sign-out clears it,
 * expired sessions get bounced to /sign-in.
 *
 * Runs under `auth-light` / `auth-dark` (see playwright.config.ts) so each
 * test starts already signed in via the seeded admin storageState.
 *
 * The expired-session test creates its own short-lived session via
 * /api/auth/sign-in rather than backdating the shared `admin.json`
 * session, so it doesn't break concurrent tests in other workers.
 */

import { test, expect } from "../_fixtures/auth";
import { testPrisma } from "../_fixtures/db";

const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "changeme123";

test.describe("auth: session persistence", () => {
  test("session survives page reload", async ({ page }) => {
    // `/content` keeps persistent connections open in dev (HMR) and prod
    // (collab WebSocket), so the default `load` event never fires.
    // `domcontentloaded` + a DOM anchor is the correct gate.
    await page.goto("/content", { waitUntil: "domcontentloaded" });

    // First load — confirm we're authenticated (no bounce to /sign-in).
    await expect(page.getByRole("button", { name: "Files" })).toBeVisible();
    expect(page.url()).toContain("/content");

    await page.reload({ waitUntil: "domcontentloaded" });

    // After reload, the cookie should still be valid and we should
    // remain on /content, not be redirected anywhere.
    await expect(page.getByRole("button", { name: "Files" })).toBeVisible();
    expect(page.url()).toContain("/content");
  });

  test("sign-out clears session_token cookie", async ({ page, context }) => {
    // Sign in fresh via page.request so this test owns a session
    // separate from the shared admin.json storageState. Signing out
    // the shared session would delete its DB row and break
    // concurrent workers (the cookie they loaded from storageState
    // would no longer match any valid session, surfacing only when
    // they later make an authenticated API call).
    const signInResponse = await page.request.post("/api/auth/sign-in", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(signInResponse.ok()).toBeTruthy();

    await page.goto("/content", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Files" })).toBeVisible();

    // Verify the test-owned cookie is present before sign-out.
    const cookiesBefore = await context.cookies();
    const sessionBefore = cookiesBefore.find((c) => c.name === "session_token");
    expect(sessionBefore, "session_token cookie must exist before sign-out").toBeDefined();

    // Hit the sign-out endpoint directly rather than driving the
    // ProfileMenu UI — the endpoint clears the cookie at the response
    // layer, which is what we're actually verifying.
    const response = await page.request.post("/api/auth/sign-out");
    expect(response.ok()).toBeTruthy();

    const cookiesAfter = await context.cookies();
    const sessionAfter = cookiesAfter.find((c) => c.name === "session_token");
    // The cookie is deleted via Set-Cookie with an expired date, which
    // Playwright surfaces as the cookie being absent from context.cookies().
    expect(sessionAfter, "session_token cookie must be cleared after sign-out").toBeUndefined();
  });

  test("expired session redirects to /sign-in", async ({ page, context }) => {
    // Sign in fresh via `page.request` (NOT the test-level `request`
    // fixture) so the response Set-Cookie lands in the SAME cookie
    // jar that `page` and `context.cookies()` read from. The
    // test-level request fixture has its own isolated jar — using
    // it here would mutate a session row OTHER than the one this
    // page is actually using, which both fails the test AND poisons
    // the shared admin.json storageState for concurrent workers.
    const signInResponse = await page.request.post("/api/auth/sign-in", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(signInResponse.ok()).toBeTruthy();

    await page.goto("/content", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Files" })).toBeVisible();

    // Capture this test's session token, then backdate its DB row.
    const cookies = await context.cookies();
    const sessionToken = cookies.find((c) => c.name === "session_token")?.value;
    expect(sessionToken, "test must have a session_token cookie").toBeDefined();

    await testPrisma().session.update({
      where: { token: sessionToken! },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    // AuthSessionSync (components/content/AuthSessionSync.tsx) polls
    // /api/auth/session every 10s — once the next poll lands the 401,
    // it pushes /sign-in. The window has to allow for: the 10s poll
    // interval, a slow dev-server response under concurrent load, and
    // the client-side router.replace to settle. 25s is conservative
    // but well under the 30s test default.
    await page.waitForURL(/\/sign-in/, {
      timeout: 25_000,
      waitUntil: "commit",
    });
    expect(page.url()).toMatch(/\/sign-in/);

    // Best-effort cleanup. validateSession also deletes expired rows
    // on access, so this is belt-and-suspenders.
    await testPrisma()
      .session.deleteMany({ where: { token: sessionToken! } })
      .catch(() => {});
  });
});
