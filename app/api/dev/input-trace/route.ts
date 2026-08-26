/**
 * Input Trace Save Endpoint (Development Only)
 *
 * Writes a captured keystroke/transaction trace to `.local/input-trace/` so an
 * AI assistant can read it off disk instead of the developer pasting a large
 * report into chat. `.local/` is already gitignored as the home for dev-only
 * logger sidecars.
 *
 * There is deliberately no auth check: the editor also runs on unauthenticated
 * dev surfaces (`/editor/playground`, `/embed/content/[id]`), and the route
 * hard-404s outside `next dev`, so it does not exist in any deployed
 * environment. The client never chooses the filename — path traversal is not
 * reachable.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const OUTPUT_DIR = path.join(".local", "input-trace");
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function sanitizeLabel(label: unknown): string {
  if (typeof label !== "string" || label.length === 0) return "session";
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned.length > 0 ? cleaned : "session";
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Trace too large" }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { markdown, json, label } = (body ?? {}) as {
    markdown?: unknown;
    json?: unknown;
    label?: unknown;
  };

  if (typeof markdown !== "string" || typeof json !== "string") {
    return NextResponse.json(
      { error: "Expected `markdown` and `json` string fields" },
      { status: 400 }
    );
  }

  // Filename is derived entirely server-side.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${stamp}-${sanitizeLabel(label)}`;
  const absoluteDir = path.join(process.cwd(), OUTPUT_DIR);

  try {
    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, `${base}.md`), markdown, "utf8");
    await writeFile(path.join(absoluteDir, `${base}.json`), json, "utf8");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to write trace" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    markdownPath: path.join(OUTPUT_DIR, `${base}.md`),
    jsonPath: path.join(OUTPUT_DIR, `${base}.json`),
  });
}
