/**
 * Settings routes dark-mode coverage — STUB.
 *
 * Scope: per-route light/dark screenshots for the reorganized settings
 * surface (feat/settings-reorg): grouped sidebar, Appearance, Editor &
 * Files, AI, Storage tabs, Export & Backup, Trash, Sites & Domains,
 * Templates & Snippets, Extensions overview, and each
 * /settings/extensions/[id] page in both enabled and disabled states.
 *
 * Blocked on: the auth fixture at tests/e2e/_fixtures/auth.ts (settings
 * routes are authenticated). Once it lands:
 *   1. Remove the test.skip calls below.
 *   2. Run `pnpm test:e2e:update` to capture baselines.
 *   3. Commit the generated PNGs.
 */

import { test, expect } from "../_fixtures/theme";

const SETTINGS_ROUTES: Array<{ slug: string; path: string }> = [
  { slug: "appearance", path: "/settings/appearance" },
  { slug: "files", path: "/settings/files" },
  { slug: "templates", path: "/settings/templates" },
  { slug: "ai", path: "/settings/ai" },
  { slug: "mcp", path: "/settings/mcp" },
  { slug: "storage", path: "/settings/storage" },
  { slug: "export", path: "/settings/export" },
  { slug: "trash", path: "/settings/trash" },
  { slug: "sites", path: "/settings/sites" },
  { slug: "extensions-overview", path: "/settings/extensions" },
  { slug: "ext-calendar", path: "/settings/extensions/calendar" },
  { slug: "ext-daily-notes", path: "/settings/extensions/daily-notes" },
  { slug: "ext-flashcards", path: "/settings/extensions/flashcards" },
  { slug: "ext-browser-bookmarks", path: "/settings/extensions/browser-bookmarks" },
  { slug: "ext-speed-reader", path: "/settings/extensions/speed-reader" },
  { slug: "ext-people", path: "/settings/extensions/people" },
  { slug: "ext-workplaces", path: "/settings/extensions/workplaces" },
  { slug: "ext-publishing", path: "/settings/extensions/publishing" },
];

test.describe("settings routes render correctly in both themes", () => {
  for (const route of SETTINGS_ROUTES) {
    test(`${route.slug} renders correctly`, async ({ page, themedGoto }) => {
      test.skip(true, "TODO(settings-reorg-followup): wire auth fixture");
      await themedGoto(route.path);
      await expect(page).toHaveScreenshot(`settings-${route.slug}.png`);
    });
  }

  test("legacy settings routes redirect", async ({ page, themedGoto }) => {
    test.skip(true, "TODO(settings-reorg-followup): wire auth fixture");
    await themedGoto("/settings/preferences");
    await expect(page).toHaveURL(/\/settings\/appearance/);
  });
});
