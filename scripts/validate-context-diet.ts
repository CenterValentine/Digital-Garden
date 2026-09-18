/**
 * Context-diet gate — the model-facing transcript transforms keep their
 * contracts.
 *
 * Run with: pnpm context:diet:check
 *
 * Why this exists (AI-CONTEXT-ECONOMICS-PLAN, 2026-09-18): a 5-turn charter
 * run re-sent 21.9M tokens because the perception fold switched itself OFF
 * the moment a run ended (`runActive ? lastCheckpoint : null`) — 905 kB of
 * already-digested page data rode along on every later request. The fold's
 * behaviour was never asserted anywhere, so the regression was invisible
 * until a receipt was read by hand. These gates make the contracts a build
 * failure instead.
 *
 * Gates (all reported in one run):
 *   1. Fold on distillation, not run state — perception before the latest
 *      checkpoint OR findings record folds, whether or not a run is active;
 *      a later proposal never lowers the point; the current batch keeps
 *      full vision.
 *   2. Fold on turn — perception and re-readable reads in an earlier turn
 *      fold; `read_content` folds by turn only, never by distillation.
 *   3. Dedupe — a repeated toolCallId is dropped whole; identical
 *      type+input+output gets a pointer stub; the first occurrence, small
 *      outputs, pending calls and reasoning parts are untouched.
 *   4. Transforms are pure and idempotent — the input array is not mutated
 *      and a second application changes nothing (prefix-cache stability).
 *   5. The chat route actually applies both transforms (source anchor).
 *
 * Fixtures are hand-built UIMessage shapes — no Prisma, no env.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { UIMessage } from "ai";

import {
  dedupeRepeatedToolParts,
  duplicatePartStates,
  findDistillationPoint,
  perceptionFoldStates,
  supersedePerceptionHistory,
} from "../lib/domain/ai/context-diet";

const errors: string[] = [];
function assert(cond: unknown, msg: string): void {
  if (!cond) errors.push(msg);
}

// ── Fixture helpers ─────────────────────────────────────────────────────────

type Part = Record<string, unknown>;
let nextId = 0;
const big = (tag: string, n = 900): string => `${tag}:` + "x".repeat(n);

function tool(
  type: string,
  opts: {
    id?: string;
    input?: unknown;
    output?: unknown;
    state?: string;
  } = {},
): Part {
  return {
    type: `tool-${type}`,
    toolCallId: opts.id ?? `call-${++nextId}`,
    state: opts.state ?? "output-available",
    input: opts.input ?? {},
    output: opts.output ?? { ok: true },
  };
}
const act = (output: unknown, id?: string, input: unknown = { action: "click" }) =>
  tool("co_browse_act", { id, input, output });
const user = (text = "go"): UIMessage =>
  ({ id: `u-${++nextId}`, role: "user", parts: [{ type: "text", text }] }) as UIMessage;
const assistant = (parts: Part[]): UIMessage =>
  ({ id: `a-${++nextId}`, role: "assistant", parts }) as unknown as UIMessage;
const proposeOk = () => tool("propose_item_iteration", { output: { ok: true } });
const checkpoint = () => tool("record_batch_checkpoint");
const findings = () => tool("record_iteration_findings");

const outputOf = (m: UIMessage, i: number): unknown =>
  (m.parts[i] as { output?: unknown }).output;
const isStub = (v: unknown, word: string): boolean =>
  typeof v === "string" && v.includes(word);

// ── Gate 1: fold on distillation, not run state ─────────────────────────────

{
  // The D1 regression: run finished with findings; earlier perception must
  // STILL fold on the next request.
  const msgs = [
    user(),
    assistant([
      proposeOk(),
      act(big("p1")), // 1
      checkpoint(), // 2
      act(big("p2")), // 3
      findings(), // 4
      act(big("p3")), // 5 — current batch, after the latest distillation
    ]),
  ];
  const states = perceptionFoldStates(msgs);
  assert(
    states.get("1:1") === "folded-distilled",
    "G1: perception before a checkpoint must fold after the run ended (D1 regression)",
  );
  assert(
    states.get("1:3") === "folded-distilled",
    "G1: perception between checkpoint and findings must fold once findings exist",
  );
  assert(
    states.get("1:5") === "kept",
    "G1: perception after the latest distillation point in the live turn must be kept",
  );
  const folded = supersedePerceptionHistory(msgs);
  assert(
    isStub(outputOf(folded[1], 1), "superseded"),
    "G1: model path must stub the folded perception output",
  );
  assert(
    outputOf(folded[1], 5) === outputOf(msgs[1], 5),
    "G1: model path must leave the current batch's perception intact",
  );

  // A new proposal after findings never lowers the distillation point.
  const withNewRun = [
    user(),
    assistant([act(big("a")), findings(), proposeOk(), act(big("b"))]),
  ];
  const s2 = perceptionFoldStates(withNewRun);
  assert(
    s2.get("1:0") === "folded-distilled" && s2.get("1:3") === "kept",
    "G1: a later propose_item_iteration must not un-digest the previous run",
  );

  // No distillation at all, single turn → nothing folds.
  const none = [user(), assistant([act(big("z"))])];
  assert(
    findDistillationPoint(none) === null && perceptionFoldStates(none).get("1:0") === "kept",
    "G1: with no distillation point and one turn, perception stays",
  );
}

// ── Gate 2: fold on turn ────────────────────────────────────────────────────

{
  const msgs = [
    user(),
    assistant([
      act(big("t1")), // 1:0 — earlier turn → folded-turn
      tool("read_content", { output: big("charter") }), // 1:1 → folded-turn
      tool("query_database", { output: big("rows") }), // 1:2 — not ours (bulk-read fold owns it)
    ]),
    user("next"),
    assistant([act(big("t2"))]), // 3:0 — live turn → kept
  ];
  const states = perceptionFoldStates(msgs);
  assert(states.get("1:0") === "folded-turn", "G2: perception in an earlier turn must fold by turn");
  assert(states.get("1:1") === "folded-turn", "G2: read_content in an earlier turn must fold by turn");
  assert(!states.has("1:2"), "G2: query_database is not this fold's business");
  assert(states.get("3:0") === "kept", "G2: perception in the live turn is kept");
  const folded = supersedePerceptionHistory(msgs);
  assert(
    isStub(outputOf(folded[1], 1), "folded") && isStub(outputOf(folded[1], 1), "read_content"),
    "G2: the turn stub names the tool so the model knows what to re-call",
  );

  // read_content never folds by DISTILLATION — a charter read is not raw perception.
  const readBeforeCheckpoint = [
    user(),
    assistant([tool("read_content", { output: big("charter") }), checkpoint()]),
  ];
  assert(
    perceptionFoldStates(readBeforeCheckpoint).get("1:0") === "kept",
    "G2: read_content before a checkpoint in the live turn must NOT fold (turn rule only)",
  );

  // Small outputs are never worth the cache perturbation.
  const small = [user(), assistant([act("tiny")]), user("next"), assistant([])];
  assert(!perceptionFoldStates(small).has("1:0"), "G2: outputs under the min-chars guard are ignored");
}

// ── Gate 3: dedupe ──────────────────────────────────────────────────────────

{
  // Shape 1 — the same toolCallId persisted again in a later message (D3).
  const shared = act(big("snap"), "call-shared");
  const msgs = [
    user(),
    assistant([shared, { type: "text", text: "status 1" }]),
    assistant([{ ...shared }, { type: "text", text: "status 2" }]),
  ];
  const states = duplicatePartStates(msgs);
  assert(!states.has("1:0"), "G3: the first occurrence of a call is never a duplicate");
  assert(
    states.get("2:0") === "dropped-duplicate-call",
    "G3: a repeated toolCallId in a later message is a dropped duplicate",
  );
  const deduped = dedupeRepeatedToolParts(msgs);
  assert(deduped[1].parts.length === 2, "G3: the first message keeps every part");
  assert(
    deduped[2].parts.length === 1 && (deduped[2].parts[0] as { type: string }).type === "text",
    "G3: the duplicate call is removed WHOLE from the later message, its text kept",
  );

  // Shape 2 — a different call, identical input + output.
  const twice = [
    user(),
    assistant([
      act(big("same"), "c1", { action: "click", name: "Save" }),
      act(big("same"), "c2", { action: "click", name: "Save" }),
      act(big("same"), "c3", { action: "scroll" }), // same output, different input
      act(big("other"), "c4", { action: "click", name: "Save" }),
    ]),
  ];
  const s2 = duplicatePartStates(twice);
  assert(!s2.has("1:0"), "G3: first identical result is kept");
  assert(s2.get("1:1") === "identical-output", "G3: identical type+input+output is a pointer stub");
  assert(!s2.has("1:2"), "G3: same output with a DIFFERENT input is not a duplicate");
  assert(!s2.has("1:3"), "G3: same input with a different output is not a duplicate");
  const d2 = dedupeRepeatedToolParts(twice);
  assert(d2[1].parts.length === 4, "G3: identical-output keeps the part (tool_use/tool_result pairing)");
  assert(
    isStub(outputOf(d2[1], 1), "identical") && isStub(outputOf(d2[1], 1), "co_browse_act"),
    "G3: the identical-output stub names the tool",
  );
  assert(outputOf(d2[1], 0) === outputOf(twice[1], 0), "G3: the first occurrence's output is untouched");
  assert(
    (d2[1].parts[1] as { toolCallId: string }).toolCallId === "c2",
    "G3: the stubbed part keeps its own toolCallId",
  );

  // Never: small outputs, pending calls, reasoning.
  const untouched = [
    user(),
    assistant([
      act("tiny", "s1"),
      act("tiny", "s2"),
      { type: "reasoning", text: big("think") },
      { type: "reasoning", text: big("think") },
      tool("co_browse_act", { id: "pending", state: "input-available", output: undefined }),
      tool("co_browse_act", { id: "pending", state: "input-available", output: undefined }),
    ]),
  ];
  const s3 = duplicatePartStates(untouched);
  assert(s3.size === 0, `G3: small outputs, reasoning and pending calls are never candidates (got ${[...s3.keys()].join(",")})`);
  assert(dedupeRepeatedToolParts(untouched) === untouched, "G3: no candidates → same array back");
}

// ── Gate 4: pure and idempotent ─────────────────────────────────────────────

{
  const shared = act(big("snap"), "call-shared");
  const msgs = [
    user(),
    assistant([proposeOk(), act(big("p1")), checkpoint(), shared, findings()]),
    assistant([{ ...shared }, { type: "text", text: "status" }]),
    user("next"),
    assistant([act(big("live"))]),
  ];
  const before = JSON.stringify(msgs);
  const once = dedupeRepeatedToolParts(supersedePerceptionHistory(msgs));
  assert(JSON.stringify(msgs) === before, "G4: transforms must not mutate their input (persistence path)");
  const twice = dedupeRepeatedToolParts(supersedePerceptionHistory(once));
  assert(
    JSON.stringify(twice) === JSON.stringify(once),
    "G4: applying the transforms twice must equal applying them once (cache stability)",
  );
}

// ── Gate 5: the route applies both ──────────────────────────────────────────

{
  const routeSrc = readFileSync(
    path.join(process.cwd(), "app/api/ai/chat/route.ts"),
    "utf8",
  );
  const anchor = routeSrc.indexOf("const resolvedMessages = resolveAttachmentsForModel(");
  assert(anchor >= 0, "G5: route anchor `resolvedMessages = resolveAttachmentsForModel(` not found — the model-message assembly moved; update this gate");
  const block = routeSrc.slice(anchor, anchor + 1200);
  assert(block.includes("supersedePerceptionHistory("), "G5: the chat route must apply supersedePerceptionHistory in the model-message assembly");
  assert(block.includes("dedupeRepeatedToolParts("), "G5: the chat route must apply dedupeRepeatedToolParts in the model-message assembly");
  assert(
    block.indexOf("dedupeRepeatedToolParts(") < block.indexOf("supersedePerceptionHistory("),
    "G5: dedupe must wrap (run after) the index-keyed folds — it is the only pass that removes parts",
  );
}

// ── Report ──────────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.error(`\n✖ context:diet:check failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log("✓ context:diet:check — fold-on-distillation, fold-on-turn, dedupe, purity, route wiring");
