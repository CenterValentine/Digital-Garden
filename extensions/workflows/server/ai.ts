import { generateText } from "ai";
import { prisma } from "@/lib/database/client";
import {
  executeWithFallback,
  resolveFeatureRoute,
} from "@/lib/domain/ai/features";
import { resolveChatModelFromConnection } from "@/lib/domain/ai/providers/registry";

/**
 * AI helpers for workflow steps. All model access goes through the app's
 * feature routing (BYOK connections + fallback chains) — proxy-not-share is
 * satisfied trivially because WDK steps run in-process. Reuses the "chat"
 * feature's routing rather than adding a registry entry; revisit if
 * workflow AI wants its own model choice.
 *
 * When no route is configured the helpers return stubbed results flagged
 * `stubbed: true` instead of failing the run — keeps keyless dev
 * environments usable, and the run timeline says so honestly.
 */

export interface JobResearchResult {
  companyName: string;
  summary: string;
  highlights: string[];
  stubbed: boolean;
}

export interface JobMatchReport {
  score: number;
  strengths: string[];
  concerns: string[];
  stubbed: boolean;
}

const LISTING_TEXT_CAP = 16000;
const RESUME_TEXT_CAP = 8000;

export async function getRunOwnerId(runId: string): Promise<string> {
  const run = await prisma.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    select: { ownerId: true },
  });
  return run.ownerId;
}

/** Owner-scoped note text lookup (captures, resume notes). */
export async function getNoteText(
  ownerId: string,
  contentNodeId: string
): Promise<string | null> {
  const note = await prisma.contentNode.findFirst({
    where: { id: contentNodeId, ownerId, deletedAt: null },
    select: { notePayload: { select: { searchText: true } } },
  });
  return note?.notePayload?.searchText ?? null;
}

/** Bounded server-side page fetch for URL-only dispatches (no extension capture yet). */
export async function fetchPageText(pageUrl: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { accept: "text/html,text/plain" },
    });
    if (!response.ok) return null;
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, LISTING_TEXT_CAP);
  } catch {
    return null;
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function generateViaChatRoute(
  ownerId: string,
  system: string,
  user: string,
  maxOutputTokens: number
): Promise<string | null> {
  const routes = await resolveFeatureRoute(ownerId, "chat");
  if (routes.length === 0) return null;
  return executeWithFallback({
    featureId: "chat",
    routes,
    attempt: async ({ route }) => {
      const model = await resolveChatModelFromConnection(
        route.connection,
        route.modelId
      );
      const { text } = await generateText({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxOutputTokens,
      });
      return text;
    },
  });
}

export async function runJobResearch(
  ownerId: string,
  listing: { pageUrl?: string; pageText?: string }
): Promise<JobResearchResult> {
  const listingText = (listing.pageText ?? "").slice(0, LISTING_TEXT_CAP);
  const text = await generateViaChatRoute(
    ownerId,
    'You are a job-application research analyst. Analyze the provided job listing. Respond with ONLY a JSON object: {"companyName": string, "summary": string (<= 500 chars, the company, the role, and what they seem to value), "highlights": string[] (3-5 short facts a candidate should know)}.',
    `Job listing${listing.pageUrl ? ` from ${listing.pageUrl}` : ""}:\n\n${listingText || "(no text captured)"}`,
    700
  );
  if (text === null) {
    return {
      companyName: "Unknown",
      summary: "No AI route configured — stubbed research result.",
      highlights: [],
      stubbed: true,
    };
  }
  const parsed = extractJson(text);
  return {
    companyName:
      typeof parsed?.companyName === "string" ? parsed.companyName : "Unknown",
    summary:
      typeof parsed?.summary === "string" ? parsed.summary : text.slice(0, 500),
    highlights: stringArray(parsed?.highlights),
    stubbed: false,
  };
}

export async function runJobMatch(
  ownerId: string,
  research: JobResearchResult,
  listing: { pageText?: string },
  resumeNoteId?: string
): Promise<JobMatchReport> {
  const resumeText = resumeNoteId
    ? (await getNoteText(ownerId, resumeNoteId))?.slice(0, RESUME_TEXT_CAP) ??
      null
    : null;
  const text = await generateViaChatRoute(
    ownerId,
    'You are a candidate-fit analyst. Compare the job listing/research against the candidate resume (if provided; otherwise assess the role\'s general demands). Respond with ONLY a JSON object: {"score": number (0-100 fit), "strengths": string[] (2-4), "concerns": string[] (2-4)}.',
    [
      `Company research: ${research.summary}`,
      `Highlights: ${research.highlights.join("; ") || "n/a"}`,
      `Listing text: ${(listing.pageText ?? "").slice(0, 6000) || "n/a"}`,
      `Candidate resume: ${resumeText ?? "(not provided)"}`,
    ].join("\n\n"),
    500
  );
  if (text === null) {
    return {
      score: 50,
      strengths: [],
      concerns: ["No AI route configured — stubbed match report."],
      stubbed: true,
    };
  }
  const parsed = extractJson(text);
  const rawScore = typeof parsed?.score === "number" ? parsed.score : 50;
  return {
    score: Math.min(Math.max(Math.round(rawScore), 0), 100),
    strengths: stringArray(parsed?.strengths),
    concerns: stringArray(parsed?.concerns),
    stubbed: false,
  };
}
