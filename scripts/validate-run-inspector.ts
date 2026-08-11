/**
 * Run Inspector contract checks.
 *
 * Run with: pnpm inspector:check
 *
 * Two fixture classes:
 * - Distilled production transcripts (scripts/fixtures/run-inspector/) from
 *   the 2026-08-08 job-scout failures — the runs the inspector exists to
 *   explain. Structure verbatim, long strings truncated.
 * - Synthetic turns exercising each detector in isolation, including the
 *   post-fix "summed" metadata generation that the prod fixtures predate.
 *
 * Also guards the AnomalyChips extraction: the shared derivation must keep
 * chip behavior for the flagship length-death case.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deriveMessageAnomalies } from "../lib/domain/ai/anomalies";
import {
  analyzeConversation,
  analyzeTurn,
  type AnalyzableMessage,
  type TurnDiagnostics,
} from "../lib/domain/ai/run-inspector";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "run-inspector",
);

interface Fixture {
  name: string;
  conversation: { id: string; title: string };
  messages: AnalyzableMessage[];
}

function loadFixture(file: string): Fixture {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), "utf8"));
}

function kindsOf(turn: TurnDiagnostics): string[] {
  return turn.findings.map((f) => f.kind).sort();
}

let checks = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    checks += 1;
  } catch (error) {
    console.error(`✗ ${label}`);
    throw error;
  }
}

// ------------------------------------------------------------------
// Distilled prod fixture: DeepSeek length-deaths
// ------------------------------------------------------------------

const deepseek = loadFixture("deepseek-job-scout.json");
const dsTurn1 = analyzeTurn(deepseek.messages[1]);
const dsTurn2 = analyzeTurn(deepseek.messages[3]);

check("deepseek turn 1: legacy metadata + mid-reasoning death", () => {
  assert.deepEqual(kindsOf(dsTurn1), ["legacy-metadata", "trailing-reasoning"]);
  assert.equal(dsTurn1.metadataGeneration, "legacy");
  assert.equal(dsTurn1.stepCount, 3);
  // 3 real HTTP requests: read_current_page ended #1, co_browse_open ended #2,
  // the trailing reasoning-only step was #3.
  assert.equal(dsTurn1.requestCountInferred, 3);
  assert.equal(dsTurn1.hasVisibleText, true);
});

check("deepseek turn 2: output-cap death with nothing visible", () => {
  assert.deepEqual(kindsOf(dsTurn2), [
    "legacy-metadata",
    "output-limit",
    "trailing-reasoning",
  ]);
  assert.equal(dsTurn2.stepCount, 1);
  assert.equal(dsTurn2.hasVisibleText, false);
  assert.equal(dsTurn2.finishReason, "length");
});

check("deepseek conversation totals", () => {
  const conv = analyzeConversation(deepseek.conversation, deepseek.messages);
  assert.equal(conv.totals.assistantTurns, 2);
  assert.deepEqual(conv.modelsUsed, ["deepseek/deepseek-v4-flash"]);
  assert.equal(conv.totals.findingsBySeverity.error, 1); // output-limit
  assert.equal(conv.totals.findingsBySeverity.warning, 4); // 2× legacy + 2× trailing
});

check("chips parity: extraction kept the length-death chip", () => {
  const msg = deepseek.messages[3];
  const anomalies = deriveMessageAnomalies(
    msg.parts as unknown[],
    msg.metadata as Record<string, unknown>,
    false,
  );
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].kind, "output-limit");
  assert.ok(anomalies[0].label.includes("nothing produced"));
  assert.equal(anomalies[0].severity, "error");
});

// ------------------------------------------------------------------
// Distilled prod fixture: gpt-4o iteration run
// ------------------------------------------------------------------

const gpt4o = loadFixture("gpt4o-job-scout.json");
const g4Turn1 = analyzeTurn(gpt4o.messages[1]);
const g4Turn2 = analyzeTurn(gpt4o.messages[3]);

check("gpt4o turn 1: denied proposal", () => {
  assert.deepEqual(kindsOf(g4Turn1), ["approval-denied", "legacy-metadata"]);
  assert.equal(g4Turn1.stepCount, 4);
  assert.equal(g4Turn1.requestCountInferred, 4);
});

check("gpt4o turn 2: silent-turn suppressed while awaiting approval", () => {
  assert.deepEqual(kindsOf(g4Turn2), ["legacy-metadata"]);
  assert.equal(g4Turn2.stepCount, 22); // propose + 10×(read, record) + createNote
  assert.equal(g4Turn2.hasVisibleText, false);
  assert.ok(!kindsOf(g4Turn2).includes("silent-turn"));
});

// ------------------------------------------------------------------
// Synthetic turns — one per detector, on post-fix "summed" metadata
// ------------------------------------------------------------------

let syntheticId = 0;
function assistantTurn(
  parts: unknown[],
  metadata: Record<string, unknown> | undefined,
): AnalyzableMessage {
  syntheticId += 1;
  return {
    id: `synthetic-${syntheticId}`,
    role: "assistant",
    providerId: "test",
    modelId: "test-model",
    parts,
    metadata,
  };
}

const summedMetadata = (
  outputTokens: number,
  finishReason: string,
  requestCount = 1,
): Record<string, unknown> => ({
  usage: {
    inputTokens: 1000,
    outputTokens,
    totalTokens: 1000 + outputTokens,
    reasoningTokens: 0,
    cachedInputTokens: 0,
  },
  durationMs: 1500,
  requestCount,
  finishReason,
});

check("synthetic: healthy multi-step turn has zero findings", () => {
  const turn = analyzeTurn(
    assistantTurn(
      [
        { type: "step-start" },
        { type: "text", text: "Let me look that up.", state: "done" },
        {
          type: "tool-searchNotes",
          state: "output-available",
          input: { query: "x" },
          output: "Found 2 notes.",
        },
        { type: "step-start" },
        { type: "text", text: "Here is what I found: everything is fine.", state: "done" },
      ],
      summedMetadata(120, "stop", 1),
    ),
  );
  assert.deepEqual(kindsOf(turn), []);
  assert.equal(turn.metadataGeneration, "summed");
  assert.equal(turn.requestCountRecorded, 1);
});

check("synthetic: summed-metadata truncation only flags output-limit", () => {
  const turn = analyzeTurn(
    assistantTurn(
      [
        { type: "step-start" },
        { type: "reasoning", text: "thinking ".repeat(40), state: "done" },
        { type: "text", text: "Partial answer that got cut", state: "done" },
      ],
      summedMetadata(4096, "length", 1),
    ),
  );
  assert.deepEqual(kindsOf(turn), ["output-limit"]);
});

check("synthetic: recorded usage far below parts volume", () => {
  const turn = analyzeTurn(
    assistantTurn(
      [
        { type: "step-start" },
        { type: "reasoning", text: "r".repeat(8000), state: "done" },
        { type: "text", text: "Done. ".repeat(100), state: "done" },
      ],
      summedMetadata(100, "stop", 2),
    ),
  );
  assert.deepEqual(kindsOf(turn), ["metadata-mismatch"]);
});

check("synthetic: settled browser read with no continuation stalls", () => {
  const turn = analyzeTurn(
    assistantTurn(
      [
        { type: "step-start" },
        { type: "text", text: "Reading the page now.", state: "done" },
        { type: "step-start" },
        {
          type: "tool-read_page_headless_or_browser",
          state: "output-available",
          input: { url: "https://example.com" },
          output: { url: "https://example.com", untrustedWebContent: "hello" },
        },
      ],
      summedMetadata(80, "tool-calls", 2),
    ),
  );
  assert.deepEqual(kindsOf(turn), ["stalled-auto-continue"]);
});

check("synthetic: dropped tool call is an error", () => {
  const turn = analyzeTurn(
    assistantTurn(
      [
        { type: "step-start" },
        { type: "text", text: "Saving that now.", state: "done" },
        { type: "step-start" },
        {
          type: "tool-searchNotes",
          state: "input-available",
          input: { query: "x" },
        },
      ],
      summedMetadata(60, "tool-calls", 1),
    ),
  );
  // Two findings, deliberately: the shared chip derivation reports the
  // user-facing cause ("interrupted" — the turn ended while a tool was still
  // in flight, warning), and the inspector adds the harness-side one
  // ("unexecuted-tool-call" — the call was dropped, error). Same evidence,
  // two causal stories; the inspector is where both belong. Assert by kind,
  // not by index — findings order follows source (derived first), not severity.
  assert.deepEqual(kindsOf(turn), ["interrupted", "unexecuted-tool-call"]);
  assert.equal(
    turn.findings.find((f) => f.kind === "unexecuted-tool-call")?.severity,
    "error",
  );
});

check("synthetic: seven settled-tool steps look like the step cap", () => {
  const parts: unknown[] = [];
  for (let i = 0; i < 7; i++) {
    parts.push({ type: "step-start" });
    if (i === 0) parts.push({ type: "text", text: "Working…", state: "done" });
    parts.push({
      type: "tool-searchNotes",
      state: "output-available",
      input: { query: `q${i}` },
      output: `result ${i}`,
    });
  }
  const turn = analyzeTurn(assistantTurn(parts, summedMetadata(500, "tool-calls", 1)));
  assert.deepEqual(kindsOf(turn), ["step-cap-suspect"]);
  assert.equal(turn.stepCount, 7);
});

check("synthetic: silent turn without a cap or pending approval", () => {
  const turn = analyzeTurn(
    assistantTurn(
      [
        { type: "step-start" },
        {
          type: "tool-searchNotes",
          state: "output-available",
          input: { query: "x" },
          output: "Found nothing.",
        },
        { type: "step-start" },
        { type: "reasoning", text: "hmm what next", state: "done" },
      ],
      summedMetadata(40, "stop", 1),
    ),
  );
  assert.ok(kindsOf(turn).includes("silent-turn"));
  assert.ok(kindsOf(turn).includes("trailing-reasoning"));
});

console.log(`✓ run-inspector checks passed (${checks} checks)`);
