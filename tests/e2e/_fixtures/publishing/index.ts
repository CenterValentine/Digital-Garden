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
] as const;

export type PublishingFixtureBlock = (typeof PUBLISHING_FIXTURE_BLOCKS)[number];

export function isPublishingFixtureBlock(value: string): value is PublishingFixtureBlock {
  return (PUBLISHING_FIXTURE_BLOCKS as readonly string[]).includes(value);
}
