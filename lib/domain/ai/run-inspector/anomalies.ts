/**
 * Inspector-only anomaly detectors — deeper diagnostics layered on top of
 * the shared chip catalog (lib/domain/ai/anomalies.ts). All heuristic
 * (`source: "derived"`); each detector states its signal so a finding is an
 * explanation, not just a label.
 *
 * Calibrated against the 2026-08-08 production failures (DeepSeek job-scout
 * length-deaths, gpt-4o fabricated-URL iteration): every failure mode we had
 * to reconstruct by hand from raw parts has a detector here.
 */

import type {
  InspectorFinding,
  MetadataGeneration,
  StepDiagnostics,
  TurnUsage,
} from "./types";

/** ~4 chars/token is close enough to sanity-check recorded output volume. */
const CHARS_PER_TOKEN_ESTIMATE = 4;
/** Below this fraction of the parts-derived estimate, recorded usage is suspect. */
const MISMATCH_RATIO = 0.35;
/** Don't judge usage consistency on tiny turns — estimation noise dominates. */
const MISMATCH_MIN_CHARS = 2000;
/** Server stopWhen base caps: 7 steps (no editable doc) / 8 (editable doc open). */
const BASE_STEP_CAPS = [7, 8];

const SETTLED_STATES: ReadonlySet<string> = new Set([
  "output-available",
  "output-error",
]);

export interface TurnFacts {
  steps: StepDiagnostics[];
  stepCount: number;
  hasVisibleText: boolean;
  metadataGeneration: MetadataGeneration;
  finishReason?: string;
  usage?: TurnUsage;
}

export function deriveInspectorFindings(facts: TurnFacts): InspectorFinding[] {
  const findings: InspectorFinding[] = [];
  const terminal = facts.steps[facts.steps.length - 1];
  const pendingApproval = facts.steps.some((s) =>
    s.toolCalls.some((t) => t.state === "approval-requested"),
  );

  // --- silent-turn: finished with nothing the user can see. Suppressed when
  // the shared output-limit chip already explains it, or when the turn is
  // legitimately paused awaiting an approval decision.
  if (
    facts.stepCount > 0 &&
    !facts.hasVisibleText &&
    facts.finishReason !== "length" &&
    !pendingApproval
  ) {
    findings.push({
      kind: "silent-turn",
      label: "Turn produced no visible output",
      detail:
        "The turn ran steps but ended with no text the user can see — only reasoning and/or tool activity. " +
        "Typically a truncated or aborted final step.",
      severity: "warning",
      source: "derived",
    });
  }

  // --- trailing-reasoning: the terminal step is reasoning with no action.
  // The signature of an output-cap death or aborted stream — visible in the
  // DeepSeek failure even though its legacy metadata claimed "tool-calls".
  if (
    terminal &&
    terminal.reasoningChars > 0 &&
    terminal.textChars === 0 &&
    terminal.toolCalls.length === 0
  ) {
    findings.push({
      kind: "trailing-reasoning",
      label: "Ended mid-reasoning",
      detail:
        "The final step contains only reasoning — no tool call and no text followed it. " +
        "The model was likely cut off (output-token cap) or the stream aborted before it could act.",
      severity: "warning",
      source: "derived",
      evidence: terminal ? { partIndex: terminal.partEnd - 1 } : undefined,
    });
  }

  // --- unexecuted-tool-call: a call that never ran and is not awaiting approval.
  for (const step of facts.steps) {
    for (const tool of step.toolCalls) {
      if (tool.state === "input-available" || tool.state === "input-streaming") {
        findings.push({
          kind: "unexecuted-tool-call",
          label: `${tool.tool} never executed`,
          detail:
            `A ${tool.tool} call was emitted but never executed (state "${tool.state}"). ` +
            "The turn ended before the harness ran it — the model's intended action was dropped.",
          severity: "error",
          source: "derived",
          evidence: { partIndex: tool.partIndex },
        });
      }
    }
  }

  // --- approval-denied: user declined a proposed action.
  for (const step of facts.steps) {
    for (const tool of step.toolCalls) {
      if (tool.state === "output-denied") {
        findings.push({
          kind: "approval-denied",
          label: `User declined ${tool.tool}`,
          detail:
            `The user rejected the ${tool.tool} approval card. Whatever the model proposed there did not run; ` +
            "later behavior in this conversation may be a reaction to the denial.",
          severity: "warning",
          source: "derived",
          evidence: { partIndex: tool.partIndex },
        });
      }
    }
  }

  // --- step-cap vs. stalled auto-continue: both look like "turn ended right
  // after tools resolved with no closing text" — the step count disambiguates.
  const endedOnSettledTools =
    terminal &&
    terminal.toolCalls.length > 0 &&
    terminal.textChars === 0 &&
    terminal.toolCalls.every((t) => SETTLED_STATES.has(t.state));
  if (endedOnSettledTools) {
    if (facts.stepCount >= BASE_STEP_CAPS[0]) {
      findings.push({
        kind: "step-cap-suspect",
        label: `Ended at ${facts.stepCount} steps with tools resolved`,
        detail:
          `The turn stopped immediately after tool results at ${facts.stepCount} steps. ` +
          `That is the signature of the server step cap (base ${BASE_STEP_CAPS.join("/")}; higher for approved research/iteration runs) — ` +
          "the model likely wanted to continue.",
        severity: "warning",
        source: "derived",
      });
    } else if (terminal.toolCalls.every((t) => t.clientExecuted)) {
      findings.push({
        kind: "stalled-auto-continue",
        label: "Browser tool resolved but turn never continued",
        detail:
          "The final step's client-executed browser tools all settled, which should re-trigger the model " +
          "via the auto-continue predicate — but no further step ran. The continuation silently stalled.",
        severity: "warning",
        source: "derived",
        evidence: { partIndex: terminal.toolCalls[0].partIndex },
      });
    }
  }

  // --- metadata generation checks.
  if (facts.metadataGeneration === "legacy") {
    findings.push({
      kind: "legacy-metadata",
      label: "Pre-fix metadata (first request only)",
      detail:
        "This turn was persisted before the terminal-metadata fix: usage, duration, and finishReason reflect " +
        "only the FIRST HTTP request of the turn. For multi-request turns they understate reality — " +
        "trust the parts, not these numbers.",
      severity: "warning",
      source: "derived",
      evidence: { metadataKey: "usage" },
    });
  } else if (facts.metadataGeneration === "summed" && facts.usage) {
    const outputChars = facts.steps.reduce(
      (sum, s) => sum + s.reasoningChars + s.textChars,
      0,
    );
    const estimatedTokens = outputChars / CHARS_PER_TOKEN_ESTIMATE;
    if (
      outputChars > MISMATCH_MIN_CHARS &&
      facts.usage.outputTokens < estimatedTokens * MISMATCH_RATIO
    ) {
      findings.push({
        kind: "metadata-mismatch",
        label: "Recorded usage below parts volume",
        detail:
          `Recorded output is ${facts.usage.outputTokens} tokens, but the turn's parts hold ~${Math.round(outputChars)} chars ` +
          `(~${Math.round(estimatedTokens)} tokens estimated). The usage accumulator may have missed requests — ` +
          "worth checking the recorder.",
        severity: "warning",
        source: "derived",
        evidence: { metadataKey: "usage.outputTokens" },
      });
    }
  }

  return findings;
}
