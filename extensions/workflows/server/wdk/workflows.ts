import {
  fetchPageText,
  getRunOwnerId,
  runJobMatch,
  runJobResearch,
  type JobMatchReport,
  type JobResearchResult,
} from "../ai";
import { storeRunDocxArtifact } from "../documents";
import { finishRun, markRunning, recordEvent } from "../runs";
import { superviseGate } from "./gate";

/** Every WDK workflow receives the app-side run id plus the dispatch input. */
export interface WdkWorkflowInput {
  runId: string;
  input: Record<string, unknown>;
}

async function beginRunStep(runId: string): Promise<void> {
  "use step";
  await markRunning(runId);
}

async function probeWorkStep(runId: string): Promise<void> {
  "use step";
  await recordEvent({
    runId,
    type: "step.completed",
    key: "step:probe-work",
    stepName: "probe-work",
    payload: { note: "pre-gate work done" },
  });
}

async function succeedRunStep(
  runId: string,
  output: Record<string, unknown>
): Promise<void> {
  "use step";
  await finishRun(runId, { status: "succeeded", output });
}

async function failRunStep(runId: string, message: string): Promise<void> {
  "use step";
  await finishRun(runId, { status: "failed", error: { message } });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workflow step failed.";
}

/**
 * Session 2 plumbing proof: two steps around one supervision gate.
 * NOTE: no workflow-level try/catch — replay engines can implement
 * suspension as control flow, and a broad catch risks swallowing it.
 * Failure marking lives in steps and the dispatch service.
 */
export async function gateProbeWorkflow(input: WdkWorkflowInput) {
  "use workflow";
  await beginRunStep(input.runId);
  await probeWorkStep(input.runId);
  const review = await superviseGate<{ approved?: boolean }>(
    input.runId,
    "probe",
    {
      title: "Gate probe awaiting approval",
      body: "Resume via POST /api/workflows/runs/{id}/resume with the gate token.",
    }
  );
  const approved = review.approved === true;
  await succeedRunStep(input.runId, { approved });
  return { approved };
}

// ---------------------------------------------------------------------------
// Job application research — the proving journey. AI runs through the app's
// feature routing (BYOK); export produces a real DOCX in the "Job
// Applications" folder. Keyless environments degrade to flagged stubs.
// ---------------------------------------------------------------------------

type ResearchStepResult = JobResearchResult & { listingExcerpt: string };

async function researchCompanyStep(
  runId: string,
  input: Record<string, unknown>
): Promise<ResearchStepResult> {
  "use step";
  const ownerId = await getRunOwnerId(runId);
  const pageUrl = typeof input.pageUrl === "string" ? input.pageUrl : undefined;
  let pageText =
    typeof input.pageText === "string" ? input.pageText : undefined;
  if (!pageText && pageUrl) {
    pageText = (await fetchPageText(pageUrl)) ?? undefined;
  }
  const result = await runJobResearch(ownerId, { pageUrl, pageText });
  await recordEvent({
    runId,
    type: "step.completed",
    key: "step:research-company",
    stepName: "research-company",
    payload: {
      companyName: result.companyName,
      summary: result.summary,
      stubbed: result.stubbed,
    },
  });
  // Pass only an excerpt between steps — step payloads are persisted+replayed.
  return { ...result, listingExcerpt: (pageText ?? "").slice(0, 6000) };
}

async function matchAgainstResumeStep(
  runId: string,
  research: ResearchStepResult,
  resumeNoteId: string | undefined
): Promise<JobMatchReport> {
  "use step";
  const ownerId = await getRunOwnerId(runId);
  const report = await runJobMatch(
    ownerId,
    research,
    { pageText: research.listingExcerpt },
    resumeNoteId
  );
  await recordEvent({
    runId,
    type: "step.completed",
    key: "step:match-resume",
    stepName: "match-resume",
    payload: {
      score: report.score,
      strengths: report.strengths,
      concerns: report.concerns,
      stubbed: report.stubbed,
    },
  });
  return report;
}

function dossierTiptap(
  research: ResearchStepResult,
  match: JobMatchReport,
  pageUrl: string | undefined
): Record<string, unknown> {
  const bullets = (items: string[]) => ({
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [
        { type: "paragraph", content: [{ type: "text", text: item }] },
      ],
    })),
  });
  const heading = (level: number, text: string) => ({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  });
  const paragraph = (text: string) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  });
  return {
    type: "doc",
    content: [
      heading(1, `${research.companyName} — Job Application Dossier`),
      heading(2, "Company Research"),
      paragraph(research.summary),
      ...(research.highlights.length ? [bullets(research.highlights)] : []),
      heading(2, "Match Report"),
      paragraph(`Fit score: ${match.score}/100`),
      ...(match.strengths.length
        ? [heading(3, "Strengths"), bullets(match.strengths)]
        : []),
      ...(match.concerns.length
        ? [heading(3, "Concerns"), bullets(match.concerns)]
        : []),
      heading(2, "Source"),
      paragraph(pageUrl ?? "Captured page text"),
    ],
  };
}

async function exportDossierStep(
  runId: string,
  research: ResearchStepResult,
  match: JobMatchReport,
  pageUrl: string | undefined
): Promise<{ contentNodeId: string; fileName: string }> {
  "use step";
  const ownerId = await getRunOwnerId(runId);
  return storeRunDocxArtifact({
    runId,
    ownerId,
    title: `${research.companyName} application dossier`,
    tiptap: dossierTiptap(research, match, pageUrl),
    searchText: `${research.companyName} ${research.summary} ${match.strengths.join(" ")}`,
  });
}

/**
 * Error semantics: step sections are wrapped in try/catch that marks the
 * run failed and re-throws (so the engine records its own failure too).
 * The GATE is deliberately never inside a try — suspension may be
 * implemented as control flow, and catching it would corrupt a healthy run.
 * (This exact gap left a run stuck at "running" when a storage error
 * bubbled — see Session 5 log.)
 */
export async function jobApplicationWorkflow(input: WdkWorkflowInput) {
  "use workflow";
  await beginRunStep(input.runId);
  const pageUrl =
    typeof input.input.pageUrl === "string" ? input.input.pageUrl : undefined;
  const resumeNoteId =
    typeof input.input.resumeNoteId === "string"
      ? input.input.resumeNoteId
      : undefined;

  let research: ResearchStepResult;
  let match: JobMatchReport;
  try {
    research = await researchCompanyStep(input.runId, input.input);
    match = await matchAgainstResumeStep(input.runId, research, resumeNoteId);
  } catch (error) {
    await failRunStep(input.runId, errorMessage(error));
    throw error;
  }

  const review = await superviseGate<{
    approved?: boolean;
    conversationId?: string;
  }>(input.runId, "review-match", {
    title: `Job match ready — ${match.score}% fit`,
    body: research.summary,
    data: { score: match.score, concerns: match.concerns },
  });
  if (review.approved !== true) {
    await succeedRunStep(input.runId, { outcome: "declined" });
    return { outcome: "declined" };
  }

  try {
    const artifact = await exportDossierStep(
      input.runId,
      research,
      match,
      pageUrl
    );
    await succeedRunStep(input.runId, {
      outcome: "completed",
      score: match.score,
      artifact: artifact.fileName,
    });
    return { outcome: "completed" };
  } catch (error) {
    await failRunStep(input.runId, errorMessage(error));
    throw error;
  }
}
