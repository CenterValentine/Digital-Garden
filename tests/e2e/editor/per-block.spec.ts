/**
 * Editor per-block visual regression coverage.
 *
 * Sister spec to tests/e2e/publishing/per-block.spec.ts. Iterates the
 * same PUBLISHING_FIXTURE_BLOCKS list but visits the EDITOR fixture
 * route — /test/editor-fixtures/[block] — so snapshots capture each
 * block as it appears INSIDE the editor (NodeView chrome included).
 *
 * Why a separate spec from the publishing one:
 *   - Editor view includes chrome (drag handle, hover badges, "+"
 *     insert buttons, block-content min-height padding) that the
 *     publisher never renders. They're testable here but noise on
 *     the publisher surface.
 *   - Form-input blocks render their EDITABLE controls (full input
 *     elements, value field) on the editor; the publisher may omit
 *     them entirely when empty. The contracts differ.
 *   - Empty-state renders (calendar, omitted forms) ARE visible in
 *     the editor — the spec can verify they show up correctly even
 *     when the publisher strips them.
 *
 * Status: visual coverage today, no hard CI gate yet (failures
 * surface in the PR but don't block merge). Once the false-positive
 * rate from editor chrome is settled, this can join the
 * publishing-visual.yml gate.
 */

import { test, expect } from "../_fixtures/theme";
import { PUBLISHING_FIXTURE_BLOCKS } from "../_fixtures/publishing";

const REVEAL_OVERRIDE_CSS = `
  .public-prose [data-block-type],
  .public-prose [data-block-type].block-revealed {
    opacity: 1 !important;
    animation: none !important;
    transform: none !important;
  }
`;

for (const block of PUBLISHING_FIXTURE_BLOCKS) {
  test(`editor block: ${block} renders consistently`, async ({
    page,
    themedGoto,
  }) => {
    await themedGoto(`/test/editor-fixtures/${block}`);
    await page.addStyleTag({ content: REVEAL_OVERRIDE_CSS });

    const wrapper = page.locator(`[data-editor-fixture="${block}"]`);
    await expect(wrapper).toBeVisible();

    // Wait for the EditorFixtureMount client component to swap from
    // "loading" → "ready" before snapshotting. The editor mounts in
    // an effect (immediatelyRender:false) so a tiny gap exists between
    // SSR HTML and hydrated NodeView output.
    await expect(
      wrapper.locator('[data-editor-fixture-state="ready"]'),
    ).toBeVisible({ timeout: 5000 });

    await wrapper.scrollIntoViewIfNeeded();

    // Force any lazy images to decode before the snapshot.
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images, (img) => img.decode().catch(() => undefined)),
      ),
    );

    await expect(wrapper).toHaveScreenshot(`editor-${block}.png`);
  });
}
