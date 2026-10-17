/**
 * Server-only GitHub access for the dev PR-checklist widget.
 *
 * Auth borrows the developer's existing `gh` CLI login (`gh auth token`), so
 * there is nothing to configure; `GITHUB_TOKEN` in `.env.local` overrides it.
 * The token never leaves the server.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getWorktreeIdentity } from "./identity";

const run = promisify(execFile);
const API = "https://api.github.com";

export interface PullRequestRef {
  number: number;
  title: string;
  url: string;
  body: string;
}

let cachedToken: string | null = null;

async function token(): Promise<string> {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (!cachedToken) {
    try {
      cachedToken = (await run("gh", ["auth", "token"])).stdout.trim();
    } catch {
      throw new Error("No GitHub auth — run `gh auth login` (or set GITHUB_TOKEN in .env.local).");
    }
  }
  return cachedToken;
}

/** `owner/repo` from the checkout's `origin` remote (https or ssh form). */
async function repoSlug(): Promise<string> {
  const url = (await run("git", ["remote", "get-url", "origin"], { cwd: process.cwd() })).stdout.trim();
  const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  if (!m) throw new Error(`origin is not a GitHub remote: ${url}`);
  return m[1];
}

async function github<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${await token()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (res.status === 401) cachedToken = null; // token rotated — re-read next time
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

interface ApiPull {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
}

const toRef = (p: ApiPull): PullRequestRef => ({
  number: p.number,
  title: p.title,
  url: p.html_url,
  body: p.body ?? "",
});

/** The open PR whose head is the branch this dev server is serving, if any. */
export async function findCurrentPullRequest(): Promise<{ branch: string | null; pr: PullRequestRef | null }> {
  const identity = await getWorktreeIdentity();
  const branch = identity?.branch ?? null;
  if (!branch || branch.startsWith("detached@")) return { branch, pr: null };
  const slug = await repoSlug();
  const owner = slug.split("/")[0];
  const pulls = await github<ApiPull[]>(
    `/repos/${slug}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
  );
  return { branch, pr: pulls[0] ? toRef(pulls[0]) : null };
}

/** Always a fresh read — the description may have been edited on GitHub. */
export async function getPullRequest(number: number): Promise<PullRequestRef> {
  return toRef(await github<ApiPull>(`/repos/${await repoSlug()}/pulls/${number}`));
}

export async function updatePullRequestBody(number: number, body: string): Promise<PullRequestRef> {
  return toRef(
    await github<ApiPull>(`/repos/${await repoSlug()}/pulls/${number}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }),
  );
}
