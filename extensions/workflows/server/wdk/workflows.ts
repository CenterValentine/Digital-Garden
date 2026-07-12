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
// Job application research — the proving journey. Research and match are
// STUBS until Session 5 wires DurableAgent through the app's feature routing;
// export is a STUB until Session 5 builds the DOCX domain function.
// ---------------------------------------------------------------------------

interface JobResearchResult {
  companyName: string;
  summary: string;
  highlights: string[];
}

interface JobMatchReport {
  score: number;
  strengths: string[];
  concerns: string[];
}

async function researchCompanyStep(
  runId: string,
  input: Record<string, unknown>
): Promise<JobResearchResult> {
  "use step";
  const pageUrl = typeof input.pageUrl === "string" ? input.pageUrl : null;
  const result: JobResearchResult = {
    companyName: "Stub Company",
    summary: `Stubbed company research${pageUrl ? ` for ${pageUrl}` : ""} — real DurableAgent lands in Session 5.`,
    highlights: ["stubbed highlight"],
  };
  await recordEvent({
    runId,
    type: "step.completed",
    key: "step:research-company",
    stepName: "research-company",
    payload: { companyName: result.companyName, summary: result.summary },
  });
  return result;
}

async function matchAgainstResumeStep(
  runId: string,
  research: JobResearchResult
): Promise<JobMatchReport> {
  "use step";
  const report: JobMatchReport = {
    score: 82,
    strengths: [`Stubbed strength vs ${research.companyName}`],
    concerns: ["stubbed concern"],
  };
  await recordEvent({
    runId,
    type: "step.completed",
    key: "step:match-resume",
    stepName: "match-resume",
    payload: { score: report.score, concerns: report.concerns },
  });
  return report;
}

async function exportResumeStubStep(runId: string): Promise<void> {
  "use step";
  await recordEvent({
    runId,
    type: "log",
    key: "step:export-resume:stub",
    stepName: "export-resume",
    payload: { note: "DOCX export stubbed until Session 5" },
  });
}

export async function jobApplicationWorkflow(input: WdkWorkflowInput) {
  "use workflow";
  await beginRunStep(input.runId);
  const research = await researchCompanyStep(input.runId, input.input);
  const match = await matchAgainstResumeStep(input.runId, research);
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
  await exportResumeStubStep(input.runId);
  await succeedRunStep(input.runId, {
    outcome: "completed",
    score: match.score,
  });
  return { outcome: "completed" };
}
