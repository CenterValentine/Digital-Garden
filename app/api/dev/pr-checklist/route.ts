/**
 * PR checklist for the checkout this dev server is serving (DEVELOPMENT ONLY).
 *
 *   GET   → the open PR for this branch + every checkbox in its description
 *   POST  { number, text, occurrence, checked } → tick/untick one box on GitHub
 *
 * Nothing is cached or seeded: every GET and every toggle reads the description
 * fresh from GitHub, so edits made on github.com show up on the next refresh and
 * a toggle always lands on the current description. Backs the floating
 * `DevPrChecklist` widget mounted by the dev worktree banner.
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import {
  findCurrentPullRequest,
  getPullRequest,
  updatePullRequestBody,
  type PullRequestRef,
} from "@/lib/features/dev-banner/github";
import { parseChecklist, setChecked } from "@/lib/features/dev-banner/pr-checklist";

const devOnly = () =>
  process.env.NODE_ENV === "development"
    ? null
    : NextResponse.json({ error: "development only" }, { status: 404 });

function snapshot(branch: string | null, pr: PullRequestRef | null) {
  return {
    branch,
    pr: pr ? { number: pr.number, title: pr.title, url: pr.url } : null,
    items: pr ? parseChecklist(pr.body) : [],
    fetchedAt: new Date().toISOString(),
  };
}

const fail = (err: unknown) =>
  NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  try {
    const { branch, pr } = await findCurrentPullRequest();
    return NextResponse.json(snapshot(branch, pr));
  } catch (err) {
    return fail(err);
  }
}

const ToggleBody = z.object({
  number: z.number().int().positive(),
  text: z.string().min(1),
  occurrence: z.number().int().min(0),
  checked: z.boolean(),
});

export async function POST(request: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const parsed = ToggleBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { number, text, occurrence, checked } = parsed.data;

  try {
    const { branch } = await findCurrentPullRequest();
    const current = await getPullRequest(number);
    const next = setChecked(current.body, { text, occurrence }, checked);
    if (next === null) {
      // The line changed on GitHub since the widget loaded — hand back the fresh list.
      return NextResponse.json(
        { ...snapshot(branch, current), error: "That item changed on GitHub — list refreshed." },
        { status: 409 },
      );
    }
    const saved = next === current.body ? current : await updatePullRequestBody(number, next);
    return NextResponse.json(snapshot(branch, saved));
  } catch (err) {
    return fail(err);
  }
}
