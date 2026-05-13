/**
 * Sign-in page — dark mode visual regression.
 *
 * Covers the form, Google OAuth button, and divider — three of the more
 * visually complex auth surfaces. Both themes captured.
 */

import { test, expect } from "../_fixtures/theme";

test.describe("sign-in page", () => {
  test("renders correctly in both themes", async ({ page, themedGoto }) => {
    await themedGoto("/sign-in");

    await expect(
      page.getByRole("heading", { name: /sign in to your account/i })
    ).toBeVisible();

    await expect(page).toHaveScreenshot("sign-in.png");
  });

  test("shows error state when validation fails", async ({ page, themedGoto }) => {
    // Stubbed: real flow needs to mock the /api/auth/sign-in response or
    // submit invalid creds against a test fixture user. Skipped until the
    // auth test fixture lands (see tests/e2e/auth/*).
    test.skip(true, "TODO(sprint-c-followup): wire test auth fixture");
    await themedGoto("/sign-in");
  });
});
