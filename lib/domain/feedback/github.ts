/**
 * Server-only: files a composed feedback issue on GitHub.
 *
 * One REST call (`POST /repos/{owner}/{repo}/issues`), so plain `fetch`
 * rather than Octokit; a dependency for one endpoint isn't worth its weight.
 *
 * Configuration (both optional):
 *   GITHUB_FEEDBACK_TOKEN — fine-grained PAT scoped to the repo with
 *     "Issues: Read and write". Without it the in-app form hands the
 *     submitter a prefilled GitHub link instead of filing directly.
 *   GITHUB_FEEDBACK_REPO — "owner/name"; defaults to this project's repo.
 */

import { FEEDBACK_REPO_DEFAULT, type ComposedIssue } from "./issue-templates";

export function feedbackRepo(): string {
  const repo = process.env.GITHUB_FEEDBACK_REPO?.trim();
  return repo && /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : FEEDBACK_REPO_DEFAULT;
}

export function isGitHubFeedbackConfigured(): boolean {
  return !!process.env.GITHUB_FEEDBACK_TOKEN?.trim();
}

/**
 * Flat, not a discriminated union: tsconfig is `strict: false`, so tsc won't
 * narrow `{ ok: true } | { ok: false }` by `ok` (see CLAUDE.md, Code Standards).
 */
export interface CreateIssueResult {
  ok: boolean;
  number?: number;
  url?: string;
  /** HTTP status from GitHub; 0 when the request never went out. */
  status?: number;
  message?: string;
}

export async function createGitHubIssue(issue: ComposedIssue): Promise<CreateIssueResult> {
  const token = process.env.GITHUB_FEEDBACK_TOKEN?.trim();
  if (!token) return { ok: false, status: 0, message: "GITHUB_FEEDBACK_TOKEN is not set" };

  const res = await fetch(`https://api.github.com/repos/${feedbackRepo()}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "digital-garden-feedback",
    },
    body: JSON.stringify({ title: issue.title, body: issue.body, labels: issue.labels }),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 201) {
    const json = (await res.json()) as { number?: number; html_url?: string };
    if (typeof json.number === "number" && typeof json.html_url === "string") {
      return { ok: true, number: json.number, url: json.html_url };
    }
    return { ok: false, status: 201, message: "GitHub returned no issue number" };
  }

  let message = `GitHub responded ${res.status}`;
  try {
    const json = (await res.json()) as { message?: string };
    if (json.message) message = `${message}: ${json.message}`;
  } catch {
    // Non-JSON error body; the status line is enough.
  }
  return { ok: false, status: res.status, message };
}
