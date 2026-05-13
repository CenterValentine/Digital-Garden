/**
 * STUB — Daily Notes extension.
 *
 * Scope:
 *   - "Today's note" resolves to the correct date and creates one if missing
 *   - Daily summary block renders activity from /api/periodic-notes/summary
 *   - Weekly summary aggregates correctly across a 7-day span
 *   - Disabling the daily-notes extension removes its nav items and shell controls
 */

import { test } from "@playwright/test";

test.describe("extensions: daily notes", () => {
  test.skip("today's note resolves and creates on demand", async ({ page }) => {
    void page;
  });

  test.skip("daily summary block renders activity", async ({ page }) => {
    void page;
  });

  test.skip("weekly summary aggregates 7-day span", async ({ page }) => {
    void page;
  });

  test.skip("disabling extension removes nav items", async ({ page }) => {
    void page;
  });
});
