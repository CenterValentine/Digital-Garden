/**
 * Synthetic publishing-block fixture route.
 *
 * Renders a single publishing block from a checked-in TipTap JSON fixture,
 * using the *same* server-render pipeline (`TipTapContent` →
 * `getServerExtensions()` → DOMSerializer) that powers public pages at
 * `/(public)/[...path]/page.tsx`. This is the surface Playwright snapshots
 * for per-block visual-regression coverage.
 *
 * Gated to non-production environments. To exercise on a Vercel preview
 * (e.g. running Playwright against a preview deploy), set
 * `PLAYWRIGHT_FIXTURES_ENABLED=1` in that preview's env.
 */

import { notFound } from "next/navigation";
import { promises as fs } from "node:fs";
import path from "node:path";
import { TipTapContent } from "@/components/public/TipTapContent";
import { MermaidHydrate } from "@/components/public/MermaidHydrate";
import { PublicThemeToggle } from "@/components/public/PublicThemeToggle";
import type { JSONContent } from "@tiptap/core";

const FIXTURES_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.PLAYWRIGHT_FIXTURES_ENABLED === "1";

// Kebab-case slugs only — blocks path traversal (`..`, `/`) and other
// shenanigans on the filesystem read below.
const VALID_BLOCK_SLUG = /^[a-z][a-z0-9-]*$/;

export const dynamic = "force-dynamic";

type RouteParams = { block: string };

async function loadFixture(block: string): Promise<JSONContent | null> {
  const fixturePath = path.join(
    process.cwd(),
    "tests",
    "e2e",
    "_fixtures",
    "publishing",
    `${block}.json`,
  );
  try {
    const raw = await fs.readFile(fixturePath, "utf-8");
    return JSON.parse(raw) as JSONContent;
  } catch {
    return null;
  }
}

export default async function PublishingFixturePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  if (!FIXTURES_ENABLED) notFound();

  const { block } = await params;
  if (!VALID_BLOCK_SLUG.test(block)) notFound();

  const bodyJson = await loadFixture(block);
  if (!bodyJson) notFound();

  // Match the actual public layout's surface context. Publisher is
  // theme-aware: light mode = white surface, dark mode = near-black.
  // Driven by the root layout's pre-hydration theme script which sets
  // .dark on <html>. Previously the fixture inherited the root layout's
  // default slate background, which meant snapshots were captured on
  // a surface that didn't match real published pages.
  return (
    <div
      className="public-route min-h-screen bg-white text-gray-900 dark:bg-[#0a0a0a] dark:text-white"
      data-publishing-fixture-context="public"
    >
      <main
        data-publishing-fixture={block}
        data-publishing-fixture-ready="true"
        className="public-prose"
        style={{
          padding: "24px",
          maxWidth: "960px",
          margin: "100px auto 0",
        }}
      >
        <TipTapContent bodyJson={bodyJson} />
        <MermaidHydrate />
      </main>
      <PublicThemeToggle />
    </div>
  );
}
