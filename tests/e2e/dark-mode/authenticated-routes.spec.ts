/**
 * Authenticated dark-mode routes.
 *
 * Operational: routes that need an authenticated session but no seeded
 * note content. Auth is wired at the project level — these tests run
 * under `auth-light` / `auth-dark` (see playwright.config.ts), which
 * depend on the `setup` project that signs in as the seeded admin user
 * via tests/e2e/setup/auth.setup.ts.
 *
 * Still stubbed: scenarios that need specific seeded content (notes
 * with payload, daily notes, embedded Excalidraw / Mermaid blocks).
 * Activating those requires a content-seeding fixture — see Known gaps
 * in tests/e2e/README.md.
 */

import { test, expect } from "../_fixtures/auth";

test.describe("authenticated dark-mode routes", () => {
  test("content workspace renders correctly", async ({ page, themedGoto }) => {
    await themedGoto("/content");

    // Wait for a stable DOM anchor rather than network idle — /content
    // holds persistent connections that prevent network idle. The left
    // sidebar's "Files" button is one of the first hydrated elements
    // and signals the workspace shell has mounted.
    await expect(page.getByRole("button", { name: "Files" })).toBeVisible();

    await expect(page).toHaveScreenshot("content-home.png");
  });

  test("settings preferences renders correctly", async ({ page, themedGoto }) => {
    await themedGoto("/settings/preferences");

    // The "Preferences" h1 is a stable anchor that means client
    // hydration has completed and the theme options are mounted.
    await expect(
      page.getByRole("heading", { name: "Preferences", level: 1 }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("settings-preferences.png");
  });

  test.skip(
    "note editor with content renders correctly",
    async ({ themedGoto }) => {
      // TODO(content-seed-fixture): needs a seeded note with TipTap
      // payload and a stable navigable slug. See "Known gaps" in
      // tests/e2e/README.md.
      await themedGoto("/content");
    },
  );

  test.skip(
    "embedded excalidraw block renders correctly",
    async ({ themedGoto }) => {
      // TODO(content-seed-fixture + hocuspocus-fixture): needs a seeded
      // note containing an Excalidraw block AND a Hocuspocus connection
      // (the Excalidraw block relies on a Y.js sub-map keyed by block id).
      await themedGoto("/content");
    },
  );

  test.skip(
    "embedded mermaid block renders correctly",
    async ({ themedGoto }) => {
      // TODO(content-seed-fixture): seeded note containing a Mermaid block.
      // Mermaid renders client-side from a string — no collab dependency
      // for the static read path, so this is less blocked than Excalidraw.
      await themedGoto("/content");
    },
  );
});
