/**
 * In-app feedback → GitHub issue.
 *
 * GET  /api/feedback — whether this deployment files issues directly
 *   (`inApp`), so the dialog can say "Submit" or "Continue on GitHub"
 *   before the user writes anything; plus the repo labels this user may
 *   apply (live from GitHub, role-filtered) and their username.
 * POST /api/feedback — validates the structured form, recomposes the issue
 *   server-side with `composeIssue` (labels from the allowlist only, server
 *   diagnostics added here; "More labels" re-checked against the live repo
 *   list and the submitter's role), rate-limits per user, and files it. Without a
 *   token, or when GitHub refuses, it answers with a prefilled GitHub link
 *   (`fallbackUrl`) so what the user wrote is never lost.
 *
 * The repo is public: the dialog warns, and the username goes in only when
 * the submitter opts in.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/infrastructure/rate-limiting";
import { logger, withRouteTrace } from "@/lib/core/logger";
import {
  FEEDBACK_KIND_ORDER,
  FEEDBACK_LIMITS,
  buildGitHubNewIssueUrl,
  composeIssue,
  extraLabelCandidates,
  missingRequired,
  permittedRepoLabels,
  type FeedbackInput,
  type ServerDiagnostics,
} from "@/lib/domain/feedback/issue-templates";
import {
  createGitHubIssue,
  feedbackRepo,
  isGitHubFeedbackConfigured,
  listRepoLabels,
} from "@/lib/domain/feedback/github";

const ROUTE_PATH = "/api/feedback";

const shortText = z.string().max(300).optional();

const FeedbackBodySchema = z.object({
  kind: z.enum(FEEDBACK_KIND_ORDER as [string, ...string[]]),
  title: z.string().max(FEEDBACK_LIMITS.title * 2),
  fields: z.record(z.string(), z.string().max(FEEDBACK_LIMITS.field * 2)),
  areas: z.array(z.string().max(60)).max(20).default([]),
  flags: z.array(z.string().max(40)).max(4).default([]),
  extraLabels: z.array(z.string().max(60)).max(20).default([]),
  severe: z.boolean().optional(),
  includeUsername: z.boolean().optional(),
  diagnostics: z
    .object({
      page: shortText,
      viewport: shortText,
      browser: shortText,
      theme: shortText,
      timeZone: shortText,
    })
    .nullable()
    .optional(),
});

function fail(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: { code, message }, ...extra }, { status });
}

export async function GET() {
  let session;
  try {
    session = await requireAuth();
  } catch {
    return fail(401, "UNAUTHORIZED", "Sign in to send feedback.");
  }
  const labels = await listRepoLabels();
  return NextResponse.json({
    success: true,
    data: {
      inApp: isGitHubFeedbackConfigured(),
      repo: feedbackRepo(),
      username: session.user.username,
      // null → GitHub unreachable; the dialog then hides "More labels".
      labels: labels ? permittedRepoLabels(labels, session.user.role) : null,
    },
  });
}

export async function POST(req: NextRequest) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    let session;
    try {
      session = await requireAuth();
    } catch {
      return fail(401, "UNAUTHORIZED", "Sign in to send feedback.");
    }

    let parsed;
    try {
      parsed = FeedbackBodySchema.safeParse(await req.json());
    } catch {
      return fail(400, "INVALID_JSON", "The request body wasn't valid JSON.");
    }
    if (!parsed.success) {
      return fail(400, "INVALID_INPUT", "Some fields are missing or too long.");
    }

    const body = parsed.data;
    const input: FeedbackInput = {
      kind: body.kind as FeedbackInput["kind"],
      title: body.title,
      fields: body.fields,
      areas: body.areas,
      flags: body.flags,
      extraLabels: body.extraLabels,
      severe: body.severe,
      diagnostics: body.diagnostics ?? null,
    };
    const missing = missingRequired(input);
    if (missing.length > 0) {
      return fail(400, "MISSING_FIELDS", `Please fill in: ${missing.join(", ")}.`);
    }

    const userId = session.user.id;
    const hourly = await consumeRateLimit({
      key: `feedback:hour:${userId}`,
      ...RATE_LIMITS.FEEDBACK_ISSUES_PER_HOUR,
    });
    const daily = hourly.ok
      ? await consumeRateLimit({ key: `feedback:day:${userId}`, ...RATE_LIMITS.FEEDBACK_ISSUES_PER_DAY })
      : hourly;
    if (!hourly.ok || !daily.ok) {
      const retry = Math.max(hourly.retryAfterSeconds, daily.retryAfterSeconds);
      return fail(
        429,
        "RATE_LIMITED",
        `That's a lot of reports in a short time. Try again in about ${Math.ceil(retry / 60)} min.`,
      );
    }

    // Environment and commit ride with the diagnostics opt-in; the reporter
    // line has its own opt-in. composeIssue drops empty rows.
    const reporter = body.includeUsername
      ? `${session.user.username} (${session.user.role})`
      : undefined;
    const server: ServerDiagnostics = input.diagnostics
      ? {
          environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
          commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8),
          reporter,
        }
      : { reporter };

    // Extras are honoured only if the live repo has them and this role may
    // use them. GitHub unreachable → no extras (the issue still files).
    const repoLabels = body.extraLabels.length > 0 ? await listRepoLabels() : null;
    const permittedExtras = new Set(
      extraLabelCandidates(permittedRepoLabels(repoLabels ?? [], session.user.role)).map((l) => l.name),
    );
    const issue = composeIssue(input, server, { permittedExtras });
    const fallbackUrl = buildGitHubNewIssueUrl(issue, feedbackRepo());

    if (!isGitHubFeedbackConfigured()) {
      return fail(503, "NOT_CONFIGURED", "In-app filing isn't set up here.", { fallbackUrl });
    }

    try {
      const created = await createGitHubIssue(issue);
      if (created.ok && created.number && created.url) {
        return NextResponse.json({
          success: true,
          data: { number: created.number, url: created.url, labels: issue.labels },
        });
      }
      logger.error({
        layer: "external",
        event: "feedback:github_refused",
        summary: created.message ?? "GitHub refused the issue",
      });
      return fail(502, "GITHUB_ERROR", "GitHub didn't accept the issue.", { fallbackUrl });
    } catch (error) {
      logger.error({
        layer: "external",
        event: "feedback:github_caught",
        summary: "GitHub issue request failed",
        error,
      });
      return fail(502, "GITHUB_UNREACHABLE", "Couldn't reach GitHub.", { fallbackUrl });
    }
  });
}
