/**
 * Session persistence — cookie survives reloads, sign-out clears it.
 *
 * Runs under `auth-light` / `auth-dark` (see playwright.config.ts) so each
 * test starts already signed in via the seeded admin storageState.
 *
 * Still stubbed: the expired-session redirect, which requires forging a
 * past `expiresAt` on the Session row in Postgres. A DB-access fixture
 * would unlock this and several other negative-path session tests.
 */

import { test, expect } from "../_fixtures/auth";

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
    await page.goto("/content", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Files" })).toBeVisible();

    // Verify the cookie is present before sign-out.
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

  test.skip("expired session redirects to /sign-in", async ({ page }) => {
    // TODO(db-fixture): needs to backdate the Session row's expiresAt
    // via a Prisma client fixture. Validates the validateSession()
    // expiry path in lib/infrastructure/auth/session.ts.
    void page;
  });
});
