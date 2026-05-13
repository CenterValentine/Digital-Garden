/**
 * Home page (signed-out) — dark mode visual regression.
 *
 * Runs against both projects (light + dark). Snapshots are stored under
 * tests/e2e/__snapshots__/dark-mode/home.spec.ts/ — one per theme.
 *
 * To regenerate: pnpm test:e2e:update-snapshots
 */

import { test, expect } from "../_fixtures/theme";

test.describe("home page (signed-out)", () => {
  test("renders correctly in both themes", async ({ page, themedGoto }) => {
    await themedGoto("/");

    // Wait for the main CTA to render before snapshotting — avoids flaky
    // diffs from font loading or hydration timing.
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();

    await expect(page).toHaveScreenshot("home.png");
  });
});
