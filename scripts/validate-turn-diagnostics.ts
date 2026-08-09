/**
 * Self-describing turns — contract checks for lib/domain/ai/turn-diagnostics.
 *
 * Run with: pnpm ai:diagnostics:check
 *
 * The centerpiece fixture reproduces the 2026-08-08 prod DeepSeek failure
 * (conversation 0d67e46e): a 3-request turn whose terminal request died at
 * the output cap mid-reasoning, while the persisted metadata claimed
 * request #1's "tool-calls". The fold must sum the requests, keep the
 * terminal reason, and raise output-limit + silent-truncation.
 */

import assert from "node:assert/strict";
import {
  DIAGNOSTICS_VERSION,
  MAX_SEGMENTS,
  appendTurnSegment,
  deriveTurnFlags,
  mergeTurnUsageMetadata,
  readTurnDiagnostics,
  type TurnSegment,
  type TurnUsageAccum,
} from "../lib/domain/ai/turn-diagnostics";

let checks = 0;
function ok(label: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ✓ ${label}`);
}

function segment(overrides: Partial<TurnSegment>): TurnSegment {
  return {
    startedAt: "2026-08-08T08:21:36.000Z",
    finishReason: "stop",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    durationMs: 1000,
    stepsUsed: 1,
    stepCap: 7,
    capSource: "base",
    steps: [],
    stepsTruncated: 0,
    maxOutputTokens: 65536,
    maxTokensSource: "catalog",
    reasoningConfig: null,
    toolCount: 53,
    ...overrides,
  };
}

/** A raw per-request finish blob as the chat route's messageMetadata emits it. */
function finishBlob(
  seg: TurnSegment,
  usage: { inputTokens: number; outputTokens: number },
): Record<string, unknown> {
  return {
    modelRoute: { source: "default", providerId: "deepseek" },
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    },
    durationMs: seg.durationMs,
    finishReason: seg.finishReason ?? undefined,
    segment: seg,
  };
}

console.log("turn-diagnostics contract checks");

// ---------------------------------------------------------------------------
// 1. The DeepSeek death — 3 requests, terminal length, reasoning-only tail
// ---------------------------------------------------------------------------
{
  const accum = new Map<string, TurnUsageAccum>();
  const deathParts = [
    { type: "step-start" },
    { type: "reasoning", text: "…" },
    { type: "text", text: "I'll start by reading the playbook." },
    { type: "tool-getCurrentNote", state: "output-available", output: "…" },
    { type: "step-start" },
    { type: "reasoning", text: "…" },
    { type: "tool-co_browse_open", state: "output-available", output: { url: "x" } },
    { type: "step-start" },
    { type: "reasoning", text: "17k chars of planning, cut mid-sentence" },
  ];
  const r1 = finishBlob(
    segment({
      startedAt: "2026-08-08T08:21:36.000Z",
      finishReason: "tool-calls",
      durationMs: 6244,
      stepsUsed: 2,
    }),
    { inputTokens: 28705, outputTokens: 659 },
  );
  const r2 = finishBlob(
    segment({
      startedAt: "2026-08-08T08:22:10.000Z",
      finishReason: "tool-calls",
      durationMs: 8000,
      stepsUsed: 1,
    }),
    { inputTokens: 35000, outputTokens: 800 },
  );
  const r3 = finishBlob(
    segment({
      startedAt: "2026-08-08T08:22:40.000Z",
      finishReason: "length",
      durationMs: 36323,
      stepsUsed: 1,
    }),
    { inputTokens: 42260, outputTokens: 4096 },
  );

  mergeTurnUsageMetadata(accum, "msg-1", r1, deathParts);
  mergeTurnUsageMetadata(accum, "msg-1", r2, deathParts);
  const merged = mergeTurnUsageMetadata(accum, "msg-1", r3, deathParts)!;

  ok("sums usage across the turn's requests", () => {
    const usage = merged.usage as { inputTokens: number; outputTokens: number };
    assert.equal(usage.inputTokens, 28705 + 35000 + 42260);
    assert.equal(usage.outputTokens, 659 + 800 + 4096);
    assert.equal(merged.requestCount, 3);
    assert.equal(merged.durationMs, 6244 + 8000 + 36323);
  });
  ok("keeps the TERMINAL finishReason (length, not request #1's tool-calls)", () => {
    assert.equal(merged.finishReason, "length");
  });
  ok("records one segment per request, in order", () => {
    const segments = merged.segments as TurnSegment[];
    assert.equal(segments.length, 3);
    assert.equal(segments[0].finishReason, "tool-calls");
    assert.equal(segments[2].finishReason, "length");
    assert.equal(segments[2].stepCap, 7);
    assert.equal(segments[2].capSource, "base");
  });
  ok("raises output-limit + silent-truncation (reasoning-only tail)", () => {
    const flags = merged.flags as string[];
    assert.ok(flags.includes("output-limit"));
    assert.ok(flags.includes("silent-truncation"));
  });
  ok("strips the transient segment key and stamps the version", () => {
    assert.equal(merged.segment, undefined);
    assert.equal(merged.diagnosticsVersion, DIAGNOSTICS_VERSION);
    assert.ok(merged.modelRoute, "unrelated keys survive the fold");
  });

  ok("repeat fold of the same request does not double-count", () => {
    const again = mergeTurnUsageMetadata(accum, "msg-1", r3, deathParts)!;
    const usage = again.usage as { inputTokens: number };
    assert.equal(usage.inputTokens, 28705 + 35000 + 42260);
    assert.equal((again.segments as TurnSegment[]).length, 3);
    assert.equal(again.requestCount, 3);
  });

  // -------------------------------------------------------------------------
  // 2. Seed-then-continue (post-reload): restore, then append
  // -------------------------------------------------------------------------
  const fresh = new Map<string, TurnUsageAccum>();
  mergeTurnUsageMetadata(fresh, "msg-1", merged, deathParts);
  ok("seeding from a persisted merged blob restores segments without re-append", () => {
    const entry = fresh.get("msg-1")!;
    assert.equal(entry.segments.length, 3);
    assert.equal(entry.inputTokens, 28705 + 35000 + 42260);
    assert.equal(entry.requestCount, 3);
  });
  ok("a post-reload continuation appends its segment to the restored set", () => {
    const r4 = finishBlob(
      segment({
        startedAt: "2026-08-08T09:00:00.000Z",
        finishReason: "stop",
        durationMs: 2000,
        stepsUsed: 1,
      }),
      { inputTokens: 1000, outputTokens: 50 },
    );
    const resumedParts = [...deathParts, { type: "text", text: "done." }];
    const out = mergeTurnUsageMetadata(fresh, "msg-1", r4, resumedParts)!;
    assert.equal((out.segments as TurnSegment[]).length, 4);
    assert.equal(out.finishReason, "stop");
    assert.equal(
      (out.usage as { inputTokens: number }).inputTokens,
      28705 + 35000 + 42260 + 1000,
    );
    assert.ok(!(out.flags as string[]).includes("output-limit"));
  });
}

// ---------------------------------------------------------------------------
// 3. Flag derivations beyond truncation
// ---------------------------------------------------------------------------
{
  ok("step-cap-hit: all steps used and still wanting tools", () => {
    const flags = deriveTurnFlags(
      [{ type: "text", text: "…" }],
      [segment({ finishReason: "tool-calls", stepsUsed: 7, stepCap: 7 })],
    );
    assert.ok(flags.includes("step-cap-hit"));
  });
  ok("no step-cap-hit when the model stopped on its own", () => {
    const flags = deriveTurnFlags(
      [{ type: "text", text: "…" }],
      [segment({ finishReason: "stop", stepsUsed: 7, stepCap: 7 })],
    );
    assert.ok(!flags.includes("step-cap-hit"));
  });
  ok("tool-error / tool-failure / captcha / approval-denied part scans", () => {
    const flags = deriveTurnFlags(
      [
        { type: "tool-read_page", state: "output-error" },
        { type: "tool-co_browse_act", state: "output-available", output: { ok: false, note: "no match" } },
        { type: "tool-co_browse_open", state: "output-available", output: { captchaDetected: true } },
        { type: "tool-createNote", state: "output-denied" },
        { type: "text", text: "recovered" },
      ],
      [segment({ finishReason: "stop" })],
    );
    for (const f of ["tool-error", "tool-failure", "captcha", "approval-denied"]) {
      assert.ok(flags.includes(f as never), `missing ${f}`);
    }
  });
  ok("awaiting-continuation on a trailing unexecuted tool call, cleared on resolve", () => {
    const pending = [{ type: "tool-co_browse_open", state: "input-available" }];
    assert.ok(deriveTurnFlags(pending, []).includes("awaiting-continuation"));
    const resolved = [
      { type: "tool-co_browse_open", state: "output-available", output: {} },
    ];
    assert.ok(!deriveTurnFlags(resolved, []).includes("awaiting-continuation"));
  });
  ok("approval-requested is a normal pause, not an anomaly", () => {
    const flags = deriveTurnFlags(
      [{ type: "tool-createNote", state: "approval-requested" }],
      [],
    );
    assert.equal(flags.length, 0);
  });
}

// ---------------------------------------------------------------------------
// 4. Bounds + readers
// ---------------------------------------------------------------------------
{
  ok(`segment list caps at ${MAX_SEGMENTS} with a dropped-count`, () => {
    let segments: TurnSegment[] = [];
    let truncated = 0;
    for (let i = 0; i < MAX_SEGMENTS + 5; i++) {
      const res = appendTurnSegment(
        segments,
        segment({ startedAt: `2026-08-08T08:00:${String(i).padStart(2, "0")}.${i}Z` }),
        truncated,
      );
      segments = res.segments;
      truncated = res.segmentsTruncated;
    }
    assert.equal(segments.length, MAX_SEGMENTS);
    assert.equal(truncated, 5);
  });
  ok("append dedups by startedAt", () => {
    const first = appendTurnSegment([], segment({}), 0);
    const second = appendTurnSegment(first.segments, segment({}), 0);
    assert.equal(second.segments.length, 1);
  });
  ok("readTurnDiagnostics: pre-v1 rows read as null (unknown, never healthy)", () => {
    assert.equal(readTurnDiagnostics({ usage: { inputTokens: 5 } }), null);
    assert.equal(readTurnDiagnostics(null), null);
    assert.equal(readTurnDiagnostics("junk"), null);
  });
  ok("readTurnDiagnostics round-trips a merged blob", () => {
    const accum = new Map<string, TurnUsageAccum>();
    const merged = mergeTurnUsageMetadata(
      accum,
      "m",
      finishBlob(segment({ finishReason: "length" }), {
        inputTokens: 10,
        outputTokens: 4096,
      }),
      [{ type: "step-start" }, { type: "reasoning", text: "…" }],
    )!;
    const diag = readTurnDiagnostics(merged)!;
    assert.equal(diag.version, DIAGNOSTICS_VERSION);
    assert.equal(diag.segments.length, 1);
    assert.equal(diag.finishReason, "length");
    assert.ok(diag.flags.includes("output-limit"));
    assert.ok(diag.flags.includes("silent-truncation"));
  });
}

console.log(`\nturn-diagnostics: ${checks} checks passed`);
