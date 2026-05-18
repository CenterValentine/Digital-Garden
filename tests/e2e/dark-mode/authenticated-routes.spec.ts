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

import { test, expect } from "../_fixtures/content";

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

  test("note editor with content renders correctly", async ({
    page,
    themedGoto,
    seed,
  }) => {
    // Seed a note with deterministic content (so the screenshot is
    // stable across runs) and navigate via the ?content= query param
    // that the workspace store reads to select a node.
    const note = await seed.note({
      title: "Dark Mode Visual Anchor",
      tiptapJson: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Editor Visual Baseline" }],
          },
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "This paragraph anchors the dark-mode visual regression for the editor surface.",
              },
            ],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "List item one" }],
                  },
                ],
              },
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "List item two" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    await themedGoto(`/content?content=${note.id}`);

    // Wait for the editor to mount with the seeded heading visible.
    await expect(
      page.getByRole("heading", { name: "Editor Visual Baseline", level: 1 }),
    ).toBeVisible();

    await expect(page).toHaveScreenshot("note-with-content.png");
  });

  test.skip(
    "embedded excalidraw block renders correctly",
    async ({ themedGoto }) => {
      // TODO(hocuspocus-fixture): the seed fixture can now create the
      // host note + linked Visualization ContentNode, but the Excalidraw
      // block reads its scene from a Y.js sub-map keyed by block id.
      // Without a Hocuspocus connection (or a way to seed the Y.js
      // doc directly via Prisma's CollaborationDocument model), the
      // block renders empty. See lib/domain/editor/extensions/blocks/
      // excalidraw-block.ts and lib/domain/collaboration/.
      await themedGoto("/content");
    },
  );

  test.skip(
    "embedded mermaid block renders correctly",
    async ({ themedGoto }) => {
      // TODO(hocuspocus-fixture or yjs-seed): same shape as the
      // Excalidraw stub above — the Mermaid block's source lives in a
      // Y.js sub-map (`blockMermaid:{blockId}`), not in the linked
      // Visualization ContentNode's chartConfig. Static rendering
      // without a Y.js doc isn't supported by the current block
      // implementation.
      await themedGoto("/content");
    },
  );
});
