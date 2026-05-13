/**
 * Embed iframe blank route — dark mode visual regression.
 *
 * /embed/blank is the no-content iframe shell. Verifies the embed layout
 * renders correctly without needing authenticated content.
 */

import { test, expect } from "../_fixtures/theme";

test.describe("embed blank route", () => {
  test("renders correctly in both themes", async ({ page, themedGoto }) => {
    await themedGoto("/embed/blank");

    await expect(page).toHaveScreenshot("embed-blank.png");
  });
});
