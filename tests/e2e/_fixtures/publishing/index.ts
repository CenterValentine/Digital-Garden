/**
 * Publishing block fixture roster.
 *
 * Each entry is a publishing block whose render parity we want to lock in
 * with a Playwright visual snapshot. The fixture JSON lives at
 * `./<block>.json` and matches the TipTap doc shape consumed by
 * `<TipTapContent>` in the synthetic fixture route at
 * `/test/publishing-fixtures/[block]`.
 *
 * To add a new fixture:
 *   1. Drop a `<block>.json` next to this file.
 *   2. Add its kebab-case name to PUBLISHING_FIXTURE_BLOCKS below.
 *   3. Run `pnpm test:e2e:update` to capture light + dark baselines.
 *   4. Commit the JSON + the new PNG(s).
 */

export const PUBLISHING_FIXTURE_BLOCKS = [
  // Publishing blocks (in extensions/publishing/blocks/)
  "bookmark-card",
  "cta-banner",
  "faq-accordion",
  "feature-list",
  "gallery",
  "hero-image",
  "logo-strip",
  "metrics-strip",
  "newsletter-signup",
  "person-card",
  "post-card",
  "pricing-card",
  "process-steps",
  "project-card",
  "recent-posts",
  "skill-badges",
  "social-links",
  "spacer",
  "stat-block",
  "tag-cloud",
  "testimonial-card",
  "timeline",
  "video-embed",
  // Layout blocks (in lib/domain/editor/extensions/blocks/) — added 2026-05-20
  // to bring them under the same snapshot/CI coverage as publishing blocks
  // ahead of the R5 (editor uses publisher markup) work.
  "accordion",
  "block-columns",
  "card-panel",
  "columns",
  "section-header",
  "tabs",
] as const;

export type PublishingFixtureBlock = (typeof PUBLISHING_FIXTURE_BLOCKS)[number];

export function isPublishingFixtureBlock(value: string): value is PublishingFixtureBlock {
  return (PUBLISHING_FIXTURE_BLOCKS as readonly string[]).includes(value);
}
