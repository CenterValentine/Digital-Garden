/**
 * STUB — sign-in OAuth + email/password flows.
 *
 * Scope:
 *   - Email/password sign-in with valid credentials → redirect to /content
 *   - Email/password sign-in with invalid credentials → error message displayed
 *   - Sign-in form preserves redirect query param across submit
 *   - Google OAuth button initiates correct redirect URL
 *
 * Blocked on: a test fixture that provisions a known test user, or mocks
 * /api/auth/sign-in so credentials don't have to be real.
 */

import { test } from "@playwright/test";

test.describe("auth: sign-in flow", () => {
  test.skip("signs in with valid email/password", async ({ page }) => {
    void page;
  });

  test.skip("shows error for invalid credentials", async ({ page }) => {
    void page;
  });

  test.skip("preserves redirect query param", async ({ page }) => {
    void page;
  });

  test.skip("Google OAuth button starts correct flow", async ({ page }) => {
    void page;
  });
});
