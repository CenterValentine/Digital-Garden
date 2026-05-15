/**
 * Sign-up page — dark mode visual regression.
 */

import { test, expect } from "../_fixtures/theme";

test.describe("sign-up page", () => {
  test("renders correctly in both themes", async ({ page, themedGoto }) => {
    await themedGoto("/sign-up");

    await expect(
      page.getByRole("heading", { name: /create your account/i })
    ).toBeVisible();

    await expect(page).toHaveScreenshot("sign-up.png");
  });
});
