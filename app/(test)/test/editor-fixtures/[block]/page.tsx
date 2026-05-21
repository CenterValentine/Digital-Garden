/**
 * Synthetic editor-block fixture route.
 *
 * Sister surface to /test/publishing-fixtures/[block]. Both routes
 * load the SAME fixture JSON (tests/e2e/_fixtures/publishing/*.json),
 * but this one mounts the live TipTap editor instead of TipTapContent.
 * Gives testers + Playwright a per-block surface for editor QA:
 *
 *   - Drag handles, hover chrome, block badges, insert buttons all
 *     visible (NodeView output).
 *   - Editable affordances active (inline editing, contenteditable
 *     contentDOM where applicable).
 *   - No persistence — edits live in memory only.
 *
 * Gated to non-production environments. To exercise on a Vercel
 * preview, set `PLAYWRIGHT_FIXTURES_ENABLED=1` in the preview's env.
 */

import { notFound } from "next/navigation";
import { promises as fs } from "node:fs";
import path from "node:path";
import { EditorFixtureMount } from "@/components/test/EditorFixtureMount";
import type { JSONContent } from "@tiptap/core";

const FIXTURES_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.PLAYWRIGHT_FIXTURES_ENABLED === "1";

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

export default async function EditorFixturePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  if (!FIXTURES_ENABLED) notFound();

  const { block } = await params;
  if (!VALID_BLOCK_SLUG.test(block)) notFound();

  const bodyJson = await loadFixture(block);
  if (!bodyJson) notFound();

  return (
    <main
      data-editor-fixture={block}
      style={{
        padding: "24px",
        maxWidth: "960px",
        margin: "100px auto 0",
      }}
    >
      <EditorFixtureMount bodyJson={bodyJson} />
    </main>
  );
}
