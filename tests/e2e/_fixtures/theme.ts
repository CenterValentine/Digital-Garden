/**
 * Theme fixture — sets the user's theme preference in localStorage before
 * page navigation so the FOUC-prevention script (lib/features/theme/script.ts)
 * applies the correct .dark class on initial paint.
 *
 * Use the project name (`light` / `dark`) as the source of truth.
 *
 * Example:
 *   import { test, expect } from "../_fixtures/theme";
 *   test("home page", async ({ page, themedGoto }) => {
 *     await themedGoto("/");
 *     await expect(page).toHaveScreenshot("home.png");
 *   });
 */

import { test as base, expect } from "@playwright/test";

type ThemeFixtures = {
  /**
   * Resolved theme for the current Playwright project — derived from the
   * project name ("light" or "dark"). Defaults to "light" if the name
   * doesn't match.
   */
  resolvedTheme: "light" | "dark";

  /**
   * Navigate to a route with the theme preference set in localStorage first.
   * The pre-hydration script reads localStorage["notes:settings"] and applies
   * .dark before React hydrates.
   */
  themedGoto: (path: string) => Promise<void>;
};

export const test = base.extend<ThemeFixtures>({
  resolvedTheme: async ({}, use, testInfo) => {
    const theme = testInfo.project.name === "dark" ? "dark" : "light";
    await use(theme);
  },

  themedGoto: async ({ page, resolvedTheme, baseURL }, use) => {
    const navigate = async (path: string) => {
      // First navigate to a placeholder so localStorage is writable on the
      // app's origin; Playwright pages start at about:blank where storage
      // is per-origin and won't apply.
      await page.goto(baseURL ? `${baseURL}/` : path);
      await page.evaluate((theme) => {
        try {
          const existing = window.localStorage.getItem("notes:settings");
          const parsed = existing ? JSON.parse(existing) : { state: {}, version: 1 };
          parsed.state = parsed.state ?? {};
          parsed.state.ui = { ...(parsed.state.ui ?? {}), theme };
          window.localStorage.setItem("notes:settings", JSON.stringify(parsed));
        } catch {
          // localStorage may be blocked in some test contexts; tests will
          // still run but theme will fall back to system preference.
        }
      }, resolvedTheme);
      // Now navigate to the actual target with the theme cached.
      await page.goto(path);
    };
    await use(navigate);
  },
});

export { expect };
