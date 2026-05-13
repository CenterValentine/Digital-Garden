/**
 * STUB — session persistence across page reloads and tab switches.
 *
 * Scope:
 *   - After sign-in, refreshing /content keeps user authenticated
 *   - Closing & reopening browser within session TTL keeps user authenticated
 *   - Expired session redirects to /sign-in with redirect query param set
 *   - Sign out clears the session cookie and redirects to /
 */

import { test } from "@playwright/test";

test.describe("auth: session persistence", () => {
  test.skip("session survives page reload", async ({ page }) => {
    void page;
  });

  test.skip("expired session redirects to sign-in with redirect param", async ({ page }) => {
    void page;
  });

  test.skip("sign-out clears session cookie", async ({ page }) => {
    void page;
  });
});
