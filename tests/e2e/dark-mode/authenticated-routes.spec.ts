/**
 * Authenticated dark-mode routes — STUB.
 *
 * The operational dark-mode coverage in this directory currently covers only
 * signed-out routes (home, sign-in, sign-up, /embed/blank) because those are
 * the surfaces that work without auth setup.
 *
 * To enable these tests:
 *   1. Implement the auth fixture at tests/e2e/_fixtures/auth.ts
 *      — should sign in a test user via /api/auth/sign-in and persist the
 *        session cookie for the test context. See Playwright's storageState.
 *   2. Seed a known test user via `pnpm db:seed` or a dedicated fixture.
 *   3. Remove the test.skip below.
 *
 * Routes intended for coverage once auth is wired:
 *   - /content (note tree + empty editor canvas)
 *   - /content with a selected note (editor with content)
 *   - /content with a daily note open
 *   - /settings/preferences (theme toggle UI itself)
 *   - /content with embedded Excalidraw + Mermaid blocks
 *   - /content with an open dialog (page template editor)
 *   - /content right-sidebar tabs (backlinks, outline, tags, AI chat)
 */

import { test, expect } from "../_fixtures/theme";

test.describe("authenticated dark-mode routes", () => {
  test("notes home renders correctly", async ({ page, themedGoto }) => {
    test.skip(true, "TODO(sprint-c-followup): wire auth fixture");
    await themedGoto("/content");
    await expect(page).toHaveScreenshot("content-home.png");
  });

  test("settings preferences renders correctly", async ({ page, themedGoto }) => {
    test.skip(true, "TODO(sprint-c-followup): wire auth fixture");
    await themedGoto("/settings/preferences");
    await expect(page).toHaveScreenshot("settings-preferences.png");
  });

  test("note editor with content renders correctly", async ({ themedGoto }) => {
    test.skip(true, "TODO(sprint-c-followup): wire auth fixture and seed test note");
    await themedGoto("/content");
  });

  test("embedded excalidraw block renders correctly", async ({ themedGoto }) => {
    test.skip(true, "TODO(sprint-c-followup): wire auth fixture and seed note with excalidraw block");
    await themedGoto("/content");
  });

  test("embedded mermaid block renders correctly", async ({ themedGoto }) => {
    test.skip(true, "TODO(sprint-c-followup): wire auth fixture and seed note with mermaid block");
    await themedGoto("/content");
  });
});
