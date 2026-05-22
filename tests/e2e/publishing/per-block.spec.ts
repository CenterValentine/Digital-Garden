/**
 * Publishing per-block visual regression coverage.
 *
 * Iterates `PUBLISHING_FIXTURE_BLOCKS` and snapshots each block via the
 * synthetic fixture route at `/test/publishing-fixtures/<block>`. The route
 * mounts `<TipTapContent>` directly so the rendered markup matches what a
 * real published page at `/(public)/[...path]` would produce for that block.
 *
 * Status: hard-gate target. Failures here should block merge — see CI
 * workflow `publishing-visual.yml` (TODO: add).
 *
 * To add a new block: see `tests/e2e/_fixtures/publishing/index.ts`.
 */

import { test, expect } from "../_fixtures/theme";
import { PUBLISHING_FIXTURE_BLOCKS } from "../_fixtures/publishing";

// AUDIT FINDING: `.public-prose [data-block-type]` starts at opacity:0 on
// the published surface, and client-side JS toggles `.block-revealed` to
// trigger a fade-in animation. With Playwright's animations disabled (the
// right default for snapshot stability), blocks stay invisible. We override
// the reveal pattern here so snapshots capture the *intended* steady state.
// Flagged separately as a finding for the audit's horizontal-consistency pass.
const REVEAL_OVERRIDE_CSS = `
  .public-prose [data-block-type],
  .public-prose [data-block-type].block-revealed {
    opacity: 1 !important;
    animation: none !important;
    transform: none !important;
  }
`;

for (const block of PUBLISHING_FIXTURE_BLOCKS) {
  test(`publishing block: ${block} renders consistently`, async ({
    page,
    themedGoto,
  }) => {
    await themedGoto(`/test/publishing-fixtures/${block}`);
    await page.addStyleTag({ content: REVEAL_OVERRIDE_CSS });

    // The root layout adds a NavBar, so a page-level screenshot would
    // capture the nav and the block could end up below the viewport.
    // Snapshot the block wrapper directly — same content, smaller PNG,
    // and immune to nav-chrome diffs from unrelated work.
    const wrapper = page.locator(`[data-publishing-fixture="${block}"]`);
    await expect(wrapper).toBeVisible();
    await wrapper.scrollIntoViewIfNeeded();

    // Several publishing blocks emit <img loading="lazy"> in their server
    // render. IntersectionObserver can defer those past the snapshot
    // moment, leaving the bounding box correct but the pixels empty.
    // decode() forces rasterization; catch() swallows broken-image errors
    // so a single bad src doesn't fail the wait.
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images, (img) => img.decode().catch(() => undefined)),
      ),
    );

    await expect(wrapper).toHaveScreenshot(`${block}.png`);
  });
}
