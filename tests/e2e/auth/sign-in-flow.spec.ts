/**
 * Sign-in flow — email/password.
 *
 * Runs under signed-out projects (`light` / `dark`) because every test
 * starts unauthenticated and exercises the form itself. Each Playwright
 * test gets a fresh browser context, so a successful sign-in in one test
 * does not leak to the next.
 *
 * Credentials match the seeded admin user (prisma/seed.ts) — override via
 * PLAYWRIGHT_ADMIN_EMAIL / PLAYWRIGHT_ADMIN_PASSWORD env vars.
 *
 * Still stubbed: redirect query-param preservation (needs a protected route
 * to redirect from) and the Google OAuth handoff (needs request mocking).
 */

import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? "changeme123";

test.describe("auth: sign-in flow", () => {
  test("signs in with valid email/password and redirects to /content", async ({ page }) => {
    await page.goto("/sign-in");

    await page.getByPlaceholder("Email address").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // The sign-in handler returns a SessionData payload; the form's submit
    // handler then performs a client-side navigation to /content. Wait for
    // the URL to settle rather than racing the redirect. `/content` keeps
    // persistent connections open so wait on `commit` rather than `load`.
    await page.waitForURL("**/content", { waitUntil: "commit" });
    expect(page.url()).toContain("/content");
  });

  test("shows error message for invalid credentials", async ({ page }) => {
    await page.goto("/sign-in");

    await page.getByPlaceholder("Email address").fill(ADMIN_EMAIL);
    await page.getByPlaceholder("Password").fill("definitely-not-the-right-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // The route returns { error: { message: "Invalid email or password" } }
    // on 401 and the form renders that message in a red banner.
    await expect(page.getByText("Invalid email or password")).toBeVisible();
    expect(page.url()).toContain("/sign-in");
  });

  test.skip("preserves redirect query param", async ({ page }) => {
    // TODO(auth-followup): navigating to a protected route while signed out
    // should land on /sign-in?redirect=<original>. Needs the middleware
    // path verified — currently unclear whether /sign-in reads the param.
    void page;
  });

  test.skip("Google OAuth button starts correct flow", async ({ page }) => {
    // TODO(auth-followup): would need to intercept the redirect to
    // accounts.google.com and assert query params (client_id, scope,
    // redirect_uri). Worth doing once OAuth changes start landing.
    void page;
  });
});
