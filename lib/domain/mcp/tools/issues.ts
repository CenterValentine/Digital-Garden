import "server-only";

/**
 * `garden_report_issue` (MCP-DATABASE-REACH-PLAN §2.8) over the in-app
 * feedback pipeline PR #211 shipped: the same templates, labels, rate
 * limits and GitHub filing, with the token named as the reporter.
 */

import { consumeRateLimit, RATE_LIMITS } from "@/lib/infrastructure/rate-limiting";
import {
  buildGitHubNewIssueUrl,
  composeIssue,
  missingRequired,
  type FeedbackInput,
} from "@/lib/domain/feedback/issue-templates";
import { createGitHubIssue, feedbackRepo, isGitHubFeedbackConfigured } from "@/lib/domain/feedback/github";

export interface ReportIssueInput {
  userId: string;
  tokenName: string;
  kind: "bug" | "feature" | "small-change";
  title: string;
  body: string;
  area?: string;
  errorId?: string;
}

export type ReportIssueResult =
  | { status: "filed"; number: number; url: string; labels: string[] }
  | { status: "fallback"; url: string; reason: string; title: string; body: string }
  | { status: "refused"; reason: string };

function fieldsFor(kind: FeedbackInput["kind"], body: string, errorId?: string): Record<string, string> {
  const text = errorId ? `${body}\n\nError id: ${errorId}` : body;
  if (kind === "bug") return { description: text };
  if (kind === "feature") return { problem: text };
  // modification: the templates want what exists and what should change.
  const [existing, change] = text.includes("\n\n") ? [text.split("\n\n")[0], text.slice(text.indexOf("\n\n") + 2)] : [text, text];
  return { existing, change };
}

export async function reportIssue(input: ReportIssueInput): Promise<ReportIssueResult> {
  const kind: FeedbackInput["kind"] = input.kind === "small-change" ? "modification" : input.kind;
  const feedback: FeedbackInput = {
    kind,
    title: input.title,
    fields: fieldsFor(kind, input.body, input.errorId),
    areas: input.area ? [input.area] : [],
    diagnostics: null,
  };
  const missing = missingRequired(feedback);
  if (missing.length > 0) return { status: "refused", reason: `Missing: ${missing.join(", ")}.` };

  const hourly = await consumeRateLimit({ key: `feedback:hour:${input.userId}`, ...RATE_LIMITS.FEEDBACK_ISSUES_PER_HOUR });
  const daily = hourly.ok
    ? await consumeRateLimit({ key: `feedback:day:${input.userId}`, ...RATE_LIMITS.FEEDBACK_ISSUES_PER_DAY })
    : hourly;
  if (!hourly.ok || !daily.ok) {
    const retry = Math.max(hourly.retryAfterSeconds, daily.retryAfterSeconds);
    return { status: "refused", reason: `Rate limited — try again in about ${Math.ceil(retry / 60)} minute(s).` };
  }

  const issue = composeIssue(feedback, { reporter: `MCP token "${input.tokenName}"` }, { permittedExtras: new Set() });
  const fallbackUrl = buildGitHubNewIssueUrl(issue, feedbackRepo());
  if (!isGitHubFeedbackConfigured()) {
    return { status: "fallback", url: fallbackUrl, reason: "In-app filing is not configured here.", title: issue.title, body: issue.body };
  }
  try {
    const created = await createGitHubIssue(issue);
    if (created.ok && created.number && created.url) {
      return { status: "filed", number: created.number, url: created.url, labels: issue.labels };
    }
    return { status: "fallback", url: fallbackUrl, reason: created.message ?? "GitHub refused the issue.", title: issue.title, body: issue.body };
  } catch (error) {
    return {
      status: "fallback",
      url: fallbackUrl,
      reason: error instanceof Error ? error.message : "Could not reach GitHub.",
      title: issue.title,
      body: issue.body,
    };
  }
}
