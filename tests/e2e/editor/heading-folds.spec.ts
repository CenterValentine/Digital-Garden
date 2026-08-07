/**
 * Heading folds + in-document heading links — behavioral coverage.
 *
 * Drives the real editor (full getEditorExtensions()) on the auth-free
 * fixture route /test/editor-fixtures/heading-folds and asserts BEHAVIOR
 * (visibility, attributes, healing) rather than screenshots — the fold
 * engine is interaction logic, and assertions don't rot with theme or
 * font changes.
 *
 * Fixture shape (tests/e2e/_fixtures/publishing/heading-folds.json):
 *   H1 Alpha / p alpha intro
 *   H2 Beta  / p beta body one / p (empty) / H3 Gamma / p gamma body
 *   H2 Delta / p with a [[#beta]] wikiLink
 *   H2 (blank) / p after blank
 *
 * Covered here:
 *   - derived slug ids stamped on heading DOM (decoration, not doc attr)
 *   - collapsing Beta hides its whole section incl. the inferior H3 and
 *     the empty paragraph, while same-rank Delta stays visible
 *   - expand restores everything
 *   - Enter at the end of a collapsed heading expands it (unfold-on-edit)
 *   - renaming a heading heals inbound [[#...]] links (slug + label)
 *
 * NOT covered (needs auth fixture / collab fixture): autosave persistence
 * of fold state, two-client collaboration convergence, source-view
 * {.collapsed} round-trip (covered by pnpm markdown:blocks:check).
 */

import { test, expect } from "../_fixtures/theme";
import type { Page } from "@playwright/test";

async function gotoFoldFixture(
  page: Page,
  themedGoto: (path: string) => Promise<void>,
) {
  // Dev-server cold compile of the fixture route can exceed the default
  // 30s test timeout on the first navigation of a session.
  test.setTimeout(120_000);
  await themedGoto("/test/editor-fixtures/heading-folds");
  await expect(
    page.locator('[data-editor-fixture-state="ready"]'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".ProseMirror h2#beta")).toBeVisible();
}

/** The fold gutter widget rendered inside a heading. */
function gutterOf(page: Page, headingSelector: string) {
  return page.locator(`${headingSelector} .dg-fold-gutter`);
}

test("headings carry derived slug ids; collapse hides exactly the subject range", async ({
  page,
  themedGoto,
}) => {
  await gotoFoldFixture(page, themedGoto);

  // Derived ids stamped by decoration — including dedup-free simple slugs.
  await expect(page.locator(".ProseMirror h1#alpha")).toBeVisible();
  await expect(page.locator(".ProseMirror h3#gamma")).toBeVisible();
  await expect(page.locator(".ProseMirror h2#delta")).toBeVisible();

  // Collapse Beta via its gutter affordance (generous hit area — click the
  // container, not the glyph).
  await gutterOf(page, "h2#beta").click({ force: true });

  // The stored fact lands on the heading node's DOM…
  await expect(page.locator('.ProseMirror h2[data-collapsed="true"]#beta')).toBeVisible();

  // …and the derived subject range is hidden: body, empty paragraph, the
  // inferior H3 and its body.
  await expect(page.getByText("beta body one")).toBeHidden();
  await expect(page.locator(".ProseMirror h3#gamma")).toBeHidden();
  await expect(page.getByText("gamma body")).toBeHidden();

  // Same-rank Delta terminates the fold; everything outside is untouched.
  await expect(page.locator(".ProseMirror h2#delta")).toBeVisible();
  await expect(page.getByText("alpha intro")).toBeVisible();
  await expect(page.getByText("after blank")).toBeVisible();

  // Expand restores the section.
  await gutterOf(page, "h2#beta").click({ force: true });
  await expect(page.getByText("beta body one")).toBeVisible();
  await expect(page.locator(".ProseMirror h3#gamma")).toBeVisible();
});

test("Enter at the end of a collapsed heading expands the fold (unfold-on-edit)", async ({
  page,
  themedGoto,
}) => {
  await gotoFoldFixture(page, themedGoto);

  await gutterOf(page, "h2#beta").click({ force: true });
  await expect(page.getByText("beta body one")).toBeHidden();

  // Put the caret at the end of the collapsed heading and press Enter. The
  // new paragraph necessarily lands inside the DERIVED hidden range (there
  // is no position "below the fold but above the next same-rank heading"),
  // so the guard expands the fold — the cursor is visibly where typing goes.
  await page.locator(".ProseMirror h2#beta").click();
  // The caret must be a TEXT caret inside Beta before pressing keys —
  // clicking right after the collapse can race the decoration redraw (the
  // heading element is replaced when its decoration attrs change), leaving
  // the DOM selection anchored elsewhere.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const anchor = document.getSelection()?.anchorNode;
        if (!anchor || anchor.nodeType !== Node.TEXT_NODE) return "no-text-anchor";
        const heading = anchor.parentElement?.closest("h2");
        return heading?.id === "beta" ? "in-beta" : `in:${heading?.id ?? "?"}`;
      }),
    )
    .toBe("in-beta");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("typed after fold");

  await expect(page.getByText("typed after fold")).toBeVisible();
  await expect(page.getByText("beta body one")).toBeVisible();
  await expect(
    page.locator('.ProseMirror h2[data-collapsed="true"]#beta'),
  ).toHaveCount(0);
});

test("renaming a heading heals inbound [[#...]] links in the same edit", async ({
  page,
  themedGoto,
}) => {
  await gotoFoldFixture(page, themedGoto);

  const link = page.locator('.ProseMirror [data-type="wiki-link"]');
  await expect(link).toHaveAttribute("data-heading-slug", "beta");
  await expect(link).toHaveText("Beta");

  // Rename "Beta" → "Betax" by typing at the end of the heading.
  await page.locator(".ProseMirror h2#beta").click();
  await page.keyboard.press("End");
  await page.keyboard.type("x");

  // The link's slug AND label follow the rename, live.
  await expect(link).toHaveAttribute("data-heading-slug", "betax");
  await expect(link).toHaveText("Betax");
  await expect(page.locator(".ProseMirror h2#betax")).toBeVisible();

  // Rename back — the link heals back too.
  await page.keyboard.press("Backspace");
  await expect(link).toHaveAttribute("data-heading-slug", "beta");
});

test("deleting a link's target heading breaks the link live; undo un-breaks it", async ({
  page,
  themedGoto,
}) => {
  await gotoFoldFixture(page, themedGoto);

  const link = page.locator('.ProseMirror [data-type="wiki-link"]');
  await expect(link).not.toHaveClass(/wiki-link-heading-broken/);

  // Select the whole Beta heading text and delete it, then remove the empty
  // heading — the slug "beta" disappears from the document.
  await page.locator(".ProseMirror h2#beta").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("Backspace"); // empties the heading
  await page.keyboard.press("Backspace"); // heading → paragraph (# chain)
  await expect(page.locator(".ProseMirror h2#beta")).toHaveCount(0);

  // The inbound link is decorated broken — non-destructively.
  await expect(link).toHaveClass(/wiki-link-heading-broken/);
  await expect(link).toHaveAttribute("data-heading-slug", "beta");

  // Undo restores the heading; the link un-breaks by itself.
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".ProseMirror h2#beta")).toBeVisible();
  await expect(link).not.toHaveClass(/wiki-link-heading-broken/);
});
