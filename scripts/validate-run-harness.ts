/**
 * Run-harness gate — the pure halves of ITERATION-RUN-HARNESS-FIXES, pinned.
 *
 * Run with: pnpm run-harness:check
 *
 * Every fixture is a shape-faithful reconstruction of something prod
 * conversation 23fd28d6 (2026-09-27, the one-item *Apply for a job* pass)
 * actually did — see docs/notes-feature/work-tracking/
 * ITERATION-RUN-HARNESS-FIXES-PLAN.md §1 for the transcript and §3 for the
 * fix each block pins:
 *   P1  charter references resolve id-first, unique-title second
 *   P3  a same-sitting write on a captured row is kept, not clobbered;
 *       update_row leaves the deliverables when capture is on
 *   P4  `capture` is read nested or flat
 *   P6  item-URL identity
 *   P7  navigation chrome is recognized by line shape
 *   P12 a note that repeats itself parses to ONE copy
 *   P13 a live continuation folds as a request (segments append, cost is
 *       priced from its own usage)
 * Mutation-tested at build time (each rule broken once, then restored).
 */

import type { JSONContent } from "@tiptap/core";
import {
  collapseRepeatedPhases,
  collectReferences,
  parseCharter,
  resolveCharterReferencedTables,
  type CharterSection,
} from "../lib/domain/ai/charters/parse";
import { looksLikeNavigationChrome } from "../lib/domain/ai/acquisition/extract";
import { partitionCaptureWrites } from "../lib/domain/data/capture-core";
import {
  normalizeCaptureArg,
  normalizeItemUrl,
  stripCaptureDeliverables,
} from "../lib/domain/ai/tools/iteration-proposal";
import { mergeTurnUsageMetadata } from "../lib/domain/ai/turn-diagnostics";

const errors: string[] = [];
function assert(cond: unknown, msg: string): void {
  if (!cond) errors.push(msg);
}

// ── P12 — duplicate charter content collapses to one copy ────────────────────

function heading(level: number, text: string): JSONContent {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}
function para(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function section(title: string, body: string): CharterSection {
  return { title, content: [para(body)], references: [] };
}

{
  const copy = [
    heading(1, "Employer Research and Resume Formulation Charter"),
    para("Purpose: transform a qualified opportunity into a tailored resume."),
    heading(2, "Process"),
    para("Review the opportunity. Research the company."),
  ];
  const fourCopies: JSONContent = { type: "doc", content: [...copy, ...copy, ...copy, ...copy] };
  const parsed = parseCharter(fourCopies);
  assert(parsed.phases.length === 1, `P12: four identical copies parse to ONE phase (got ${parsed.phases.length})`);
  assert(parsed.duplicatePhasesCollapsed === 3, `P12: duplicatePhasesCollapsed reports 3 (got ${parsed.duplicatePhasesCollapsed})`);

  const single: JSONContent = { type: "doc", content: copy };
  const one = parseCharter(single);
  assert(one.phases.length === 1 && one.duplicatePhasesCollapsed === undefined, "P12: a single copy is untouched and reports no collapse");

  const a = section("Review", "read the posting");
  const b = section("Research", "look up the employer");
  const periodic = collapseRepeatedPhases([a, b, a, b, a, b]);
  assert(periodic.phases.length === 2 && periodic.collapsed === 4, "P12: a repeated A,B sequence collapses to A,B");
  const consecutive = collapseRepeatedPhases([a, a, b]);
  assert(consecutive.phases.length === 2 && consecutive.collapsed === 1, "P12: consecutive identical phases collapse");
  const sameTitleDifferentBody = collapseRepeatedPhases([a, section("Review", "audit the draft")]);
  assert(sameTitleDifferentBody.phases.length === 2 && sameTitleDifferentBody.collapsed === 0, "P12: a repeated TITLE with a different body is two phases (never collapsed)");
  const twoDistinct = collapseRepeatedPhases([a, b]);
  assert(twoDistinct.collapsed === 0, "P12: two distinct phases are left alone");
}

// ── P1 — charter references carry ids; databases resolve id-first ────────────

{
  const nodes: JSONContent[] = [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Look at everything in the " },
        {
          type: "wikiLink",
          attrs: { targetTitle: "Career Evidence Library", targetId: "cel-id", displayText: null },
        },
        { type: "text", text: " and the [[Experience Gaps Library]]." },
      ],
    },
  ];
  const refs = collectReferences(nodes);
  const cel = refs.find((r) => r.targetTitle === "Career Evidence Library");
  assert(cel?.targetId === "cel-id", "P1: a wikiLink node's targetId survives into the charter reference");
  const gaps = refs.find((r) => r.targetTitle === "Experience Gaps Library");
  assert(gaps && !gaps.targetId, "P1: a literal [[link]] has a title and no id");

  const resolved = resolveCharterReferencedTables(
    [
      { targetTitle: "Renamed Since", targetId: "by-id" },
      { targetTitle: "career evidence library" },
      { targetTitle: "Duplicated Title" },
      { targetTitle: "Not A Database" },
    ],
    [
      { id: "by-id", title: "Whatever It Is Called Now" },
      { id: "cel", title: "Career Evidence Library" },
      { id: "dup-1", title: "Duplicated Title" },
      { id: "dup-2", title: "duplicated title" },
    ],
  );
  assert(resolved.includes("by-id"), "P1: an id on the link wins even when the title changed");
  assert(resolved.includes("cel"), "P1: a bare title resolves case-insensitively when unique");
  assert(!resolved.includes("dup-1") && !resolved.includes("dup-2"), "P1: an ambiguous title grants nothing");
  assert(resolved.length === 2, `P1: exactly two grants (got ${resolved.length})`);
}

// ── P7 — navigation chrome by line shape ─────────────────────────────────────

{
  // Shape-faithful to the LinkedIn body the run received: title, title,
  // company, region, age — repeated; then "Similar Searches" counts.
  const chrome = [
    "Mid-Senior level", "Full-time", "Engineering and Information Technology",
    "Referrals increase your chances of interviewing at SeatGeek by 2x", "See who you know",
    "Similar jobs",
    ...["Onit", "10X Health System", "Tenna", "Cotiviti", "Huge", "Smarsh", "Avalara", "Autodesk"].flatMap((co) => [
      "Solution Architect", "Solution Architect", co, "United States", "1 day ago",
    ]),
    "People also viewed", "Similar Searches",
    "Associate Technical Architect jobs", "235,165 open jobs", "Java Architect jobs", "12,031 open jobs",
    "Find curated posts and insights for relevant topics all in one place.", "View top content",
  ].join("\n");
  assert(looksLikeNavigationChrome(chrome), "P7: the LinkedIn 'Similar jobs' body is recognized as chrome");

  const prose = Array.from({ length: 6 }, (_, i) =>
    `Paragraph ${i + 1}: The Technical Architect supports internal teams, clients, and third parties as they integrate with the platform, aligning requirements to the right integration approach and serving as a subject matter expert on the integration landscape.`,
  ).join("\n\n");
  assert(!looksLikeNavigationChrome(prose), "P7: prose paragraphs are not chrome");

  const bullets = ["What You'll Do:", ...Array.from({ length: 20 }, (_, i) =>
    `- Own discovery for new third-party integrations and API requirements across client and partner teams (${i + 1})`,
  )].join("\n");
  assert(!looksLikeNavigationChrome(bullets), "P7: a bulleted job description is not chrome");

  assert(!looksLikeNavigationChrome("Home\nJobs\nAbout\nContact"), "P7: a short menu (< 15 lines) is not judged");
}

// ── P3 — capture keeps a same-sitting write; update_row leaves deliverables ───

{
  const writes = [
    { columnKey: "summary", value: "short" },
    { columnKey: "status", value: "opt_rq" },
    { columnKey: "empty", value: "filled now" },
  ];
  const current = { summary: "the fuller first write", status: "opt_q", empty: "", list: [] as string[] };
  const since = "2026-09-27T01:54:00.000Z";

  const noGuard = partitionCaptureWrites({ writes, current, rowUpdatedAt: "2026-09-27T01:55:00.000Z", keepFilledSince: undefined });
  assert(noGuard.writes.length === 3 && noGuard.kept.length === 0, "P3: without a since-stamp every write lands");

  const untouched = partitionCaptureWrites({ writes, current, rowUpdatedAt: "2026-09-27T01:00:00.000Z", keepFilledSince: since });
  assert(untouched.writes.length === 3 && untouched.kept.length === 0, "P3: a row untouched since approval takes every write");

  const sameSitting = partitionCaptureWrites({ writes, current, rowUpdatedAt: "2026-09-27T01:55:30.000Z", keepFilledSince: since });
  assert(sameSitting.kept.join(",") === "summary,status", `P3: non-empty cells written this sitting are kept (got ${sameSitting.kept.join(",")})`);
  assert(sameSitting.writes.length === 1 && sameSitting.writes[0]?.columnKey === "empty", "P3: only the empty cell is filled");

  const emptyList = partitionCaptureWrites({
    writes: [{ columnKey: "list", value: ["x"] }],
    current,
    rowUpdatedAt: "2026-09-27T01:55:30.000Z",
    keepFilledSince: since,
  });
  assert(emptyList.writes.length === 1 && emptyList.kept.length === 0, "P3: an empty list counts as empty");

  const on = stripCaptureDeliverables(["create_docx", "update_row"], true);
  assert(on.deliverables.join(",") === "create_docx" && on.stripped.join(",") === "update_row", "P3: update_row leaves the deliverables when capture is on");
  const off = stripCaptureDeliverables(["create_docx", "update_row"], false);
  assert(off.deliverables.length === 2 && off.stripped.length === 0, "P3: without capture the deliverables are untouched");
}

// ── P4 — `capture` nested or flat ────────────────────────────────────────────

{
  const nested = normalizeCaptureArg({ cells: { "Next Action": "Need to apply", "Coverage Scope": "API work" } });
  assert(nested.cells && Object.keys(nested.cells).length === 2 && !nested.note, "P4: the documented nesting reads as-is");
  const flat = normalizeCaptureArg({ "Next Action": "Need to apply", "Coverage Scope": "API work", admission: "all" });
  assert(flat.cells && Object.keys(flat.cells).join(",") === "Next Action,Coverage Scope", `P4: a flat map reads as cells minus meta keys (got ${flat.cells && Object.keys(flat.cells).join(",")})`);
  assert(typeof flat.note === "string" && /flat/.test(flat.note), "P4: the flat read is reported");
  assert(normalizeCaptureArg(undefined).cells === null, "P4: no capture → no cells");
  assert(normalizeCaptureArg({ cells: {} }).cells === null, "P4: empty cells → no cells");
  assert(normalizeCaptureArg("Need to apply").cells === null, "P4: a non-object is ignored, not fatal");
}

// ── P6 — item URL identity ───────────────────────────────────────────────────

{
  const a = normalizeItemUrl("https://www.linkedin.com/jobs/view/4465933681/");
  const b = normalizeItemUrl("https://LinkedIn.com/jobs/view/4465933681#top");
  assert(a === b, `P6: www, case, trailing slash and hash do not change identity (${a} vs ${b})`);
  assert(normalizeItemUrl("https://seatgeek.com/about") !== a, "P6: a different page is a different identity");
}

// ── P13 — a live continuation folds as a request ─────────────────────────────

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const prev = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && prev && typeof prev === "object" && !Array.isArray(prev)) {
      out[k] = deepMerge(prev as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
function rawRequest(n: number, inputTokens: number): Record<string, unknown> {
  return {
    modelRoute: { source: "default", providerId: "openai", modelId: "gpt-5.6-luna" },
    usage: { inputTokens, outputTokens: 50 * n, totalTokens: inputTokens + 50 * n, reasoningTokens: 10, cachedInputTokens: 0 },
    durationMs: 1000 * n,
    finishReason: n === 2 ? "stop" : "tool-calls",
    segment: {
      startedAt: `2026-09-27T01:5${n}:00.000Z`,
      steps: [{ tools: ["query_database"], finishReason: "tool-calls", outputTokens: 50 * n }],
      usage: { inputTokens, outputTokens: 50 * n, totalTokens: inputTokens + 50 * n },
      stepCap: 8,
      capSource: "editable",
      stepsUsed: 1,
      toolCount: 19,
      durationMs: 1000 * n,
      finishReason: n === 2 ? "stop" : "tool-calls",
    },
  };
}

{
  const r1 = rawRequest(1, 1000);
  const r2 = rawRequest(2, 2000);
  const costOf = (blob: Record<string, unknown> | undefined) => {
    const c = (blob?.cost ?? {}) as { usd?: unknown };
    return typeof c.usd === "number" ? c.usd : null;
  };
  const alone1 = mergeTurnUsageMetadata(new Map(), "m", r1, []);
  const alone2 = mergeTurnUsageMetadata(new Map(), "m", r2, []);

  const accum = new Map();
  const t1 = mergeTurnUsageMetadata(accum, "m", r1, []) as Record<string, unknown>;
  assert(typeof t1.diagnosticsVersion === "number", "P13: the first fold stamps the blob");
  // The client writes t1 back into message state; the SDK deep-merges the
  // second request's raw metadata over it — this is what arrives next.
  const m2 = deepMerge(t1, r2);
  assert(m2.segment !== undefined, "P13 fixture: the merged blob carries request 2's raw segment");
  const t2 = mergeTurnUsageMetadata(accum, "m", m2, []) as Record<string, unknown>;
  const segments = Array.isArray(t2.segments) ? t2.segments : [];
  assert(segments.length === 2, `P13: a live continuation APPENDS its segment (got ${segments.length})`);
  assert(t2.requestCount === 2, `P13: requestCount counts the continuation (got ${t2.requestCount})`);
  const usage = t2.usage as { inputTokens?: number } | undefined;
  assert(usage?.inputTokens === 3000, `P13: usage sums across requests (got ${usage?.inputTokens})`);
  assert(t2.segment === undefined, "P13: the transient segment key is stripped from the fold");
  const c1 = costOf(alone1 as Record<string, unknown>);
  const c2 = costOf(alone2 as Record<string, unknown>);
  const cMerged = costOf(t2);
  if (c1 !== null && c2 !== null) {
    assert(cMerged !== null && Math.abs(cMerged - (c1 + c2)) < 1e-9, `P13: cost = price(r1) + price(r2), never price(r1) twice (got ${cMerged} vs ${c1 + c2})`);
  } else {
    assert(cMerged === null || cMerged === c1, "P13: unpriced model — the fold stays consistent");
  }

  // A third request: the inherited stamp now says requestCount 2, and a
  // live request must still count as ONE (prod 2026-09-28: 1, 2, 4, 8).
  const r3 = rawRequest(3, 4000);
  const m3 = deepMerge(t2, r3);
  const t3 = mergeTurnUsageMetadata(accum, "m", m3, []) as Record<string, unknown>;
  assert(t3.requestCount === 3, `P13: a third live request counts as one (got ${t3.requestCount})`);
  assert(Array.isArray(t3.segments) && t3.segments.length === 3, `P13: three segments after three requests (got ${Array.isArray(t3.segments) ? t3.segments.length : "none"})`);
  const usage3 = t3.usage as { inputTokens?: number } | undefined;
  assert(usage3?.inputTokens === 7000, `P13: usage sums across three requests (got ${usage3?.inputTokens})`);

  // A reload-seeded blob (stamped, NO raw segment) still restores wholesale.
  const seeded = mergeTurnUsageMetadata(new Map(), "m", t3, []) as Record<string, unknown>;
  assert(Array.isArray(seeded.segments) && seeded.segments.length === 3, "P13: a persisted blob seeds its segments wholesale");
  assert(seeded.requestCount === 3, "P13: a persisted blob keeps its requestCount");
}

// ── Report ──────────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.error(`\n✖ run-harness:check failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log(
  "✓ run-harness:check — charter duplicates collapse; charter references resolve id-first; chrome is recognized by shape; capture keeps same-sitting writes and reads nested or flat; update_row leaves deliverables under capture; item URLs normalize; live continuations fold as requests",
);

// ── §8 — cost metering and the prefix diagnostic ─────────────────────────────

import { computeTurnCost, webSearchCallUsd } from "../lib/features/ai-connections/usage/pricing";
import {
  fingerprintPrompt,
  findPrefixDivergence,
  serializePromptForDiag,
  PREFIX_CHUNK_CHARS,
  fingerprintWireBody,
  findWireDivergence,
} from "../lib/domain/ai/prompt-prefix-diag";
import { summarizeRejections, unknownOptionError } from "../lib/domain/data/cells";
import {
  CHARTER_TURN_TOOLS,
  tailRefusalNotice,
  withBudgetNotice,
} from "../lib/domain/ai/tools/iteration-proposal";
import {
  cacheLifetimeMinutes,
  cacheVolleyDelayMs,
  pendingApprovalKey,
  trimToLastStepStart,
} from "../lib/domain/ai/cache-volley";
import { docxHtmlToCheckText } from "../lib/domain/ai/docx-check-text";
import { DOCXConverter } from "../lib/domain/export/converters/docx";
import JSZip from "jszip";

{
  // The fold hands the calculator the request's largest STEP: nine steps
  // summing to 369k with no step above 46k bill at base rates (prod
  // ecf1d0e5: the meter said $1.22 for an $0.82 turn).
  const steps = [42020, 43091, 43465, 44938, 45338, 45737, 45914, 29474, 29581].map((inputTokens, i) => ({
    tools: ["x"],
    finishReason: i === 8 ? "stop" : "tool-calls",
    outputTokens: 300,
    inputTokens,
    cachedInputTokens: i < 7 ? 27133 : i === 7 ? 0 : 10630,
  }));
  const raw = {
    modelRoute: { source: "default", providerId: "openai", modelId: "gpt-5.6-terra" },
    usage: { inputTokens: 369558, outputTokens: 2806, totalTokens: 372364, reasoningTokens: 0, cachedInputTokens: 200561 },
    durationMs: 51690,
    finishReason: "stop",
    segment: {
      startedAt: "2026-09-28T07:28:03.656Z",
      steps,
      usage: { inputTokens: 369558, outputTokens: 2806, totalTokens: 372364 },
      stepCap: 13,
      capSource: "editable",
      stepsUsed: 9,
      durationMs: 51690,
      finishReason: "stop",
    },
  };
  const folded = mergeTurnUsageMetadata(new Map(), "m", raw, []) as Record<string, unknown>;
  const cost = (folded.cost as { usd?: number } | undefined)?.usd ?? null;
  // Uncached input is billed as cache-written at 1.25× (terra write 2.5) —
  // GPT-5.6+ writes, unreported by the SDK (§10 round 3).
  const expected = ((369558 - 200561) * 2.5 + 200561 * 0.2 + 2806 * 12) / 1_000_000;
  assert(
    cost !== null && Math.abs(cost - expected) < 1e-6,
    `§8: a multi-step request is priced at base rates when no step crosses the tier (got ${cost}, expected ${expected.toFixed(4)})`,
  );
  const direct = computeTurnCost(
    { inputTokens: 369558, outputTokens: 2806, cachedInputTokens: 200561 },
    "gpt-5.6-terra",
    "openai",
  );
  assert(direct !== null && direct.usd > expected * 1.5, "§8 fixture sanity: without the step figure the sum still trips the tier");
}

{
  // The diagnostic names the chunk where a prompt stops matching.
  const base = "x".repeat(PREFIX_CHUNK_CHARS * 5);
  const grown = fingerprintPrompt(base + "y".repeat(PREFIX_CHUNK_CHARS));
  assert(findPrefixDivergence(fingerprintPrompt(base), grown) === null, "§8: a prompt that only grew is cache-friendly (no divergence)");
  const changedMiddle = base.slice(0, PREFIX_CHUNK_CHARS * 2 + 10) + "Z" + base.slice(PREFIX_CHUNK_CHARS * 2 + 11);
  const div = findPrefixDivergence(fingerprintPrompt(base), fingerprintPrompt(changedMiddle));
  assert(div?.chunkIndex === 2 && div.offset === PREFIX_CHUNK_CHARS * 2, `§8: a mid-prompt change is located at its chunk (got ${JSON.stringify(div)})`);
  const s1 = serializePromptForDiag({ system: "S", toolNames: ["a", "b"], messages: [{ role: "user", content: "hi" }] });
  const s2 = serializePromptForDiag({ system: "S", toolNames: ["b", "a"], messages: [{ role: "user", content: "hi" }] });
  assert(s1 !== s2, "§8: tool order is part of the fingerprint (it is part of the provider prefix)");
}

{
  // §10 L1a — the wire tap names the body part that stopped extending the
  // previous call: routing key, tools, or the index + kind of an input item.
  const body = (items: unknown[], extra: Record<string, unknown> = {}) => ({
    model: "gpt-6-sol",
    prompt_cache_key: "dg-chat:a",
    tools: [{ type: "function", name: "query_database" }],
    input: items,
    ...extra,
  });
  const sys = { role: "system", content: "S" };
  const user = { role: "user", content: [{ type: "input_text", text: "one low-interest job" }] };
  const call = { type: "function_call", call_id: "c1", name: "propose_item_iteration", arguments: "{}" };
  const out = { type: "function_call_output", call_id: "c1", output: "{\"ok\":true}" };
  const notice = (n: number) => ({ role: "user", content: `[Harness notice] ${n} steps left` });
  const fp = (b: unknown) => fingerprintWireBody(b)!;

  const step1 = fp(body([sys, user, call, out, notice(5)]));
  const step2 = fp(body([sys, user, call, out, { type: "function_call", call_id: "c2", name: "x", arguments: "{}" }, notice(4)]));
  assert(findWireDivergence(step1, step2) === null, "§10: a body that only grew (trailing notice replaced) is cache-friendly");
  assert(step1.conversationKey !== null && step1.conversationKey === step2.conversationKey, "§10: the conversation key is stable across steps");

  const rewritten = fp(body([sys, user, call, { ...out, output: "{\"ok\":true,\"openedAt\":2}" }, notice(4)]));
  const d = findWireDivergence(step1, rewritten);
  assert(
    d?.part === "input" && d.index === 3 && d.kindBefore === "function_call_output" && d.currExcerpt.includes("openedAt"),
    `§10: a rewritten mid-history item is named by index, kind and excerpt (got ${JSON.stringify(d)})`,
  );
  const rekeyed = findWireDivergence(step1, fp(body([sys, user, call, out, notice(5)], { prompt_cache_key: "dg-chat:b" })));
  assert(rekeyed?.part === "cacheKey", "§10: a changed prompt_cache_key is reported before anything else (it routes the cache)");
  const retooled = findWireDivergence(step1, fp(body([sys, user, call, out, notice(5)], { tools: [] })));
  assert(retooled?.part === "tools", "§10: a changed tool list is reported as the tools part");
  const dropped = findWireDivergence(step2, fp(body([sys, user, call])));
  assert(dropped?.part === "input" && dropped.index === 3, "§10: removed history items are a divergence");
  assert(fingerprintWireBody({ model: "x" }) === null, "§10: a body without input/messages is ignored");
}

{
  // §10 L3a — a rejection names the column, the value and the choices; the
  // footer groups identical rejections instead of repeating them.
  const column = {
    id: "c1",
    key: "c1",
    name: "Gap Category",
    type: "select",
    config: {
      options: [
        { id: "o1", label: "Capability" },
        { id: "o2", label: "Credential" },
        { id: "o3", label: "Domain knowledge" },
      ],
    },
  } as unknown as Parameters<typeof unknownOptionError>[0];
  const msg = unknownOptionError(column, "Technical capability");
  assert(
    msg.includes('"Gap Category"') && msg.includes('"Technical capability"') && msg.includes("Capability, Credential, Domain knowledge") && msg.includes('Closest: "Capability"'),
    `§10 L3a: the rejection names column, value, choices and the one near match (got ${msg})`,
  );
  assert(!unknownOptionError(column, "zzz").includes("Closest"), "§10 L3a: no near match, no guess");
  const many = { ...column, config: { options: Array.from({ length: 15 }, (_, i) => ({ id: `o${i}`, label: `L${i}` })) } } as typeof column;
  assert(unknownOptionError(many, "x").includes("(+3 more)"), "§10 L3a: long option lists are capped with a count");
  const summary = summarizeRejections(["a", "a", "a", "b", "a", "b"]);
  assert(summary === "- a (×4)\n- b (×2)", `§10 L3a: identical rejections group with a count (got ${JSON.stringify(summary)})`);
}

{
  // §10 L2 — one prompt per turn: the charter turn's tool set covers the
  // deliverables and the tail's close, and a tail refusal names the tail.
  for (const id of [...CHARTER_TURN_DELIVERABLES, ...CHARTER_TAIL_EXTRA, "record_item_result", "update_rows"]) {
    assert(CHARTER_TURN_TOOLS.includes(id), `§10 L2: CHARTER_TURN_TOOLS carries ${id} from the first request`);
  }
  const refusal = tailRefusalNotice({ tool: "search_content", tailTools: ["create_docx", "update_row", "summon"], remaining: 1 });
  assert(
    refusal.includes("search_content") && refusal.includes("create_docx, update_row") && !refusal.includes("summon") && refusal.includes("1 step remain"),
    `§10 L2: the tail refusal names the tool, the steps left and the tail tools (got ${refusal})`,
  );
}

{
  // §10 L4a — provider-run searches are billed per call; the app-run backend
  // (same name, no providerTools) is not. gpt-6-sol: $0.01 per call.
  const segmentWith = (providerTools: string[] | undefined) => ({
    modelRoute: { source: "default", providerId: "openai", modelId: "gpt-6-sol" },
    usage: { inputTokens: 10000, outputTokens: 100, totalTokens: 10100, reasoningTokens: 0, cachedInputTokens: 0 },
    durationMs: 1000,
    finishReason: "stop",
    segment: {
      startedAt: `2026-09-30T00:00:0${providerTools ? providerTools.length : 0}.000Z`,
      steps: [
        { tools: ["search_web", "search_web", "query_database"], finishReason: "tool-calls", outputTokens: 50, inputTokens: 5000, cachedInputTokens: 0, ...(providerTools ? { providerTools } : {}) },
        { tools: [], finishReason: "stop", outputTokens: 50, inputTokens: 5000, cachedInputTokens: 0 },
      ],
      usage: { inputTokens: 10000, outputTokens: 100, totalTokens: 10100 },
      stepCap: 16,
      capSource: "charter",
      stepsUsed: 2,
      durationMs: 1000,
      finishReason: "stop",
    },
  });
  const usdOf = (raw: Record<string, unknown>) =>
    ((mergeTurnUsageMetadata(new Map(), "m", raw, []) as Record<string, unknown>).cost as { usd?: number; breakdown?: { webSearch?: number } } | undefined);
  const native = usdOf(segmentWith(["search_web", "search_web"]));
  const appRun = usdOf(segmentWith(undefined));
  assert(
    native?.usd !== undefined && appRun?.usd !== undefined && Math.abs(native.usd - appRun.usd - 0.02) < 1e-9 && native.breakdown?.webSearch === 0.02,
    `§10 L4a: two provider-run searches add $0.02 on gpt-6-sol; app-run searches add nothing (got native ${native?.usd}, app ${appRun?.usd})`,
  );
  assert(
    webSearchCallUsd("gpt-4.1", "openai") === 0.025 && webSearchCallUsd("gpt-6-sol", "openai") === 0.01 && webSearchCallUsd("claude-opus-5-5", "anthropic") === 0,
    "§10 L4a: per-call fee — OpenAI reasoning $0.01, other OpenAI $0.025, unverified vendors 0",
  );
}

{
  // §10 round 3 — the step budget rides the result, not a trailing message.
  assert(withBudgetNotice("done", "[N]") === "done\n\n[N]", "round 3: a string result carries the budget line");
  const obj = withBudgetNotice({ ok: true }, "[N]") as Record<string, unknown>;
  assert(obj.ok === true && obj.harnessNotice === "[N]", "round 3: a plain object result carries harnessNotice");
  const arr = [1];
  assert(withBudgetNotice(arr, "[N]") === arr && withBudgetNotice(null, "[N]") === null, "round 3: arrays and null pass through untouched");
}

{
  // §10 round 3 — cache volley: only where the cache would lapse inside the
  // 10-minute window; one key per pending approval; the transcript is cut
  // at the approval step's start.
  assert(cacheLifetimeMinutes("anthropic", "claude-sonnet-5") === 5, "volley: Anthropic lives 5 min");
  assert(cacheLifetimeMinutes("openai", "gpt-6-sol") === 30 && cacheLifetimeMinutes("openai", "gpt-5.6-terra") === 30, "volley: GPT-5.6+ live 30 min");
  assert(cacheLifetimeMinutes("openai", "gpt-5.5") === 5 && cacheLifetimeMinutes("openai", "gpt-4.1") === 5 && cacheLifetimeMinutes(undefined, "openai/gpt-4o") === 5, "volley: older OpenAI caching models live 5 min");
  assert(cacheLifetimeMinutes("deepseek", "deepseek-chat") === null, "volley: no controllable cache, no lifetime");
  assert(cacheVolleyDelayMs("anthropic", "claude-sonnet-5") === 4 * 60_000, "volley: Anthropic fires at 4 min");
  assert(cacheVolleyDelayMs("openai", "gpt-6-sol") === null, "volley: GPT-6 needs none (30-min cache)");
  const approvalMsgs = [
    { id: "u", role: "user", parts: [{ type: "text", text: "go" }] },
    {
      id: "a",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "tool-query_database", state: "output-available", toolCallId: "c1" },
        { type: "step-start" },
        { type: "reasoning", text: "" },
        { type: "tool-propose_item_iteration", state: "approval-requested", toolCallId: "c2", approval: { id: "ap1" } },
      ],
    },
  ] as unknown as Parameters<typeof pendingApprovalKey>[0];
  assert(pendingApprovalKey(approvalMsgs) === "a:ap1", `volley: pending approvals key the volley (got ${pendingApprovalKey(approvalMsgs)})`);
  const trimmed = trimToLastStepStart(approvalMsgs);
  assert(
    trimmed.length === 2 && trimmed[1].parts.length === 2 && (trimmed[1].parts[1] as { toolCallId?: string }).toolCallId === "c1",
    "volley: the transcript is cut at the approval step's start (earlier steps kept, the pending call gone)",
  );
  assert(pendingApprovalKey(trimmed) === null, "volley: the cut transcript has nothing pending");
  const onlyApprovalStep = [approvalMsgs[0], { ...approvalMsgs[1], parts: approvalMsgs[1].parts.slice(2) }] as typeof approvalMsgs;
  assert(trimToLastStepStart(onlyApprovalStep).length === 1, "volley: a message that is only the approval step is dropped whole");
}

{
  // §10 round 3 — the model checks a DOCX against the FILE: breaks kept,
  // link targets visible, bullets marked.
  const text = docxHtmlToCheckText(
    '<h1>David</h1><p>La Verkin | <a href="mailto:x@y.com">x@y.com</a><br /><a href="https://www.linkedin.com/in/x">LinkedIn</a></p><ul><li>One &amp; two</li></ul>',
  );
  assert(
    text === "David\nLa Verkin | x@y.com [→ mailto:x@y.com]\nLinkedIn [→ https://www.linkedin.com/in/x]\n• One & two",
    `round 3: DOCX check text keeps breaks, shows link targets, marks bullets (got ${JSON.stringify(text)})`,
  );
}

void (async () => {
  // §10 round 3 — the converter writes links as real hyperlinks (the URL
  // used to be dropped, leaving "LinkedIn" pointing nowhere) and keeps
  // hard breaks as breaks.
  const doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Email" },
          { type: "hardBreak" },
          { type: "text", text: "LinkedIn", marks: [{ type: "link", attrs: { href: "https://www.linkedin.com/in/x" } }] },
        ],
      },
    ],
  };
  const r = await new DOCXConverter().convert(doc, { format: "docx", settings: {} as never });
  const zip = await JSZip.loadAsync(Buffer.from(r.files[0].content as Buffer));
  const xml = await zip.file("word/document.xml")!.async("string");
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  assert(
    (xml.match(/<w:hyperlink /g) ?? []).length === 1 && rels.includes('Target="https://www.linkedin.com/in/x"') && xml.includes("<w:br/>"),
    "round 3: a link mark becomes a hyperlink with its target; a hard break stays a break",
  );
  if (errors.length > 0) {
    console.error(`\n✖ run-harness:check (round 3 DOCX) failed — ${errors.length} problem(s):\n`);
    for (const e of errors) console.error(`  ${e}\n`);
    process.exit(1);
  }
})();

if (errors.length > 0) {
  console.error(`\n✖ run-harness:check (§8) failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log("✓ run-harness:check §8/§10 — per-step long-context tier; prefix diagnostic locates a mid-prompt change; wire tap names the diverging body part; rejections teach; the tail refuses instead of hiding; provider-run searches are metered; the budget rides results; the volley fires only where the cache would lapse; DOCX checks read the file");

// ── write-args — the document body under any sibling key ─────────────────────

import { resolveDocumentArgs } from "../lib/domain/ai/tools/write-args";

{
  // Prod f51fa2d8: a full resume sent as `content` to create_docx.
  const asContent = resolveDocumentArgs(
    { title: "David Valentine — Resume", content: "# David Valentine\n\nSummary…" },
    { toolName: "create_docx", canonicalBodyKey: "markdown" },
  );
  assert(asContent.ok && asContent.body?.startsWith("# David"), "write-args: `content` is read as the docx body");
  assert(asContent.shapeNotes.some((n) => /content/.test(n)), "write-args: the alias read is reported");

  const canonical = resolveDocumentArgs(
    { title: "T", markdown: "body" },
    { toolName: "create_docx", canonicalBodyKey: "markdown" },
  );
  assert(canonical.ok && canonical.shapeNotes.length === 0, "write-args: the documented key needs no note");

  const noBody = resolveDocumentArgs(
    { title: "T", parentId: "x" },
    { toolName: "create_docx", canonicalBodyKey: "markdown" },
  );
  assert(!noBody.ok && /markdown/.test(noBody.refusal ?? "") && /content, body, text/.test(noBody.refusal ?? ""), "write-args: a missing body is a teaching refusal naming the accepted keys");

  const noTitle = resolveDocumentArgs(
    { markdown: "## Tailored Resume\n\ntext" },
    { toolName: "create_docx", canonicalBodyKey: "markdown" },
  );
  assert(noTitle.ok && noTitle.title === "Tailored Resume", `write-args: a missing title falls back to the first heading (got ${noTitle.title})`);

  const loc = resolveDocumentArgs(
    { title: "T", markdown: "x", outputLocation: "Under Content" },
    { toolName: "create_docx", canonicalBodyKey: "markdown" },
  );
  assert(loc.ok && loc.outputLocation === "under_content", "write-args: outputLocation resolves by meaning");
  const badLoc = resolveDocumentArgs(
    { title: "T", markdown: "x", outputLocation: "somewhere" },
    { toolName: "create_docx", canonicalBodyKey: "markdown" },
  );
  assert(badLoc.ok && badLoc.outputLocation === undefined && badLoc.shapeNotes.some((n) => /ignored/.test(n)), "write-args: an unknown outputLocation is ignored with a note, never fatal");
}

if (errors.length > 0) {
  console.error(`\n✖ run-harness:check (write-args) failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log("✓ run-harness:check write-args — the document body is read under any sibling key; a miss teaches");

// ── Unsupported parameters — known families, and the net under the list ──────

import { resolveModelTemperature, modelRejectsTemperature } from "../lib/domain/ai/model-constraints";
import { parseUnsupportedParameter, withoutParameter } from "../lib/domain/ai/middleware/unsupported-parameter";

{
  assert(resolveModelTemperature("gpt-6-astra", 0.7) === undefined, "constraints: gpt-6-astra sends no temperature (prod 2026-09-29)");
  assert(resolveModelTemperature("openai/gpt-6", 0.7) === undefined, "constraints: namespaced gpt-6 sends no temperature");
  assert(resolveModelTemperature("o3-mini", 0.7) === undefined, "constraints: o-series sends no temperature");
  assert(resolveModelTemperature("kimi-k2.6", 0.7) === 1, "constraints: Kimi thinking line is fixed at 1");
  assert(resolveModelTemperature("gpt-5.6-terra", 0.7) === 0.7, "constraints: gpt-5.6 keeps the user's setting");
  assert(resolveModelTemperature("gpt-4o", 0.2) === 0.2, "constraints: an unconstrained model is untouched");
  assert(modelRejectsTemperature("gpt-6-astra") && !modelRejectsTemperature("gpt-5.6-luna"), "constraints: the reject predicate matches the resolver");

  const openai = new Error("Unsupported parameter: 'temperature' is not supported with this model.");
  assert(parseUnsupportedParameter(openai) === "temperature", "middleware: OpenAI's message names the SDK key");
  assert(parseUnsupportedParameter(new Error("Unsupported parameter: 'top_p' is not supported with this model.")) === "topP", "middleware: provider names map to SDK keys");
  assert(parseUnsupportedParameter(new Error("Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.")) === "maxOutputTokens", "middleware: max_tokens maps to maxOutputTokens");
  assert(parseUnsupportedParameter(new Error("Rate limit reached for gpt-6-astra")) === null, "middleware: an unrelated error is not a parameter refusal");
  assert(parseUnsupportedParameter(new Error("Unsupported parameter: 'banana' is not supported")) === null, "middleware: an unknown parameter name is not retried blindly");
  const stripped = withoutParameter(
    { temperature: 0.7, maxOutputTokens: 4000, prompt: [] } as Record<string, unknown>,
    "temperature",
  );
  assert(stripped.temperature === undefined && !Object.keys(stripped).includes("temperature") && stripped.maxOutputTokens === 4000, "middleware: the named parameter is removed, the rest kept");
}

if (errors.length > 0) {
  console.error(`\n✖ run-harness:check (unsupported parameters) failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log("✓ run-harness:check unsupported parameters — gpt-6 / o-series send no temperature; a provider's refusal names the key to retry without");

// ── §9 — charter turns carry a run budget; continuations keep a floor ─────────

import {
  CHARTER_TAIL_EXTRA,
  CHARTER_TURN_DELIVERABLES,
  continuationStepCap,
  computeIterationStepCap as capFor,
  reservedTailTools as tailToolsFor,
  reservedTailSize as tailSizeFor,
} from "../lib/domain/ai/tools/iteration-proposal";
import { REPEAT_GUARDED_TOOLS, repeatedCallKey, repeatedCallNotice } from "../lib/domain/ai/tools/repeat-guard";

{
  const charterCap = capFor({ itemBudget: 1, deliverables: CHARTER_TURN_DELIVERABLES });
  assert(charterCap === 16, `§9: a charter turn is sized like a one-item run with four write tools (got ${charterCap})`);
  assert(tailSizeFor(CHARTER_TURN_DELIVERABLES) === 6, "§9: the charter tail reserves the four writes plus two");
  const charterTail = tailToolsFor(CHARTER_TURN_DELIVERABLES, { record: false, extra: CHARTER_TAIL_EXTRA });
  assert(charterTail.includes("phase_checkpoint") && charterTail.includes("summon") && !charterTail.includes("record_item_result"), `§9: a charter tail keeps the writes, the checkpoint and summon, not the item-run record tools (got ${charterTail.join(",")})`);
  const itemTail = tailToolsFor(["create_docx"]);
  assert(itemTail.includes("record_item_result") && itemTail.includes("record_iteration_findings"), "§9: item runs keep their record/close tools in the tail (unchanged)");

  assert(continuationStepCap({ rawStepCap: 8, stepsAlreadySpent: 0, tailDeliverables: null }) === 8, "§9: a fresh request gets the whole cap");
  assert(continuationStepCap({ rawStepCap: 8, stepsAlreadySpent: 7, tailDeliverables: null }) === 3, "§9: a plain-chat continuation gets at least three (prod f51fa2d8 got one)");
  assert(continuationStepCap({ rawStepCap: 8, stepsAlreadySpent: 5, tailDeliverables: null }) === 3, "§9: a continuation with three left keeps three");
  assert(continuationStepCap({ rawStepCap: 8, stepsAlreadySpent: 2, tailDeliverables: null }) === 6, "§9: a continuation with more than the floor left keeps the remainder");
  assert(continuationStepCap({ rawStepCap: 16, stepsAlreadySpent: 14, tailDeliverables: CHARTER_TURN_DELIVERABLES }) === 7, "§9: a charter continuation gets its tail plus the answer (prod 62ac2b76 went 8 → 3 → 1)");
  assert(continuationStepCap({ rawStepCap: 16, stepsAlreadySpent: 4, tailDeliverables: CHARTER_TURN_DELIVERABLES }) === 12, "§9: a charter continuation with plenty left keeps the remainder");
  assert(continuationStepCap({ rawStepCap: 1, stepsAlreadySpent: 0, tailDeliverables: null }) === 1, "§9: a one-step cap stays one on a fresh request");

  assert(REPEAT_GUARDED_TOOLS.includes("search_web") && !(REPEAT_GUARDED_TOOLS as readonly string[]).includes("query_database"), "§9: only searches are repeat-guarded — a re-read after a write is legitimate");
  const k1 = repeatedCallKey("search_web", { query: "site:clay.com data providers", limit: 5 });
  const k2 = repeatedCallKey("search_web", { limit: 5, query: "site:clay.com data providers" });
  const k3 = repeatedCallKey("search_web", { query: "site:clay.com data provider", limit: 5 });
  assert(k1 === k2, "§9: key order does not change identity");
  assert(k1 !== k3, "§9: a different query is a different call");
  assert(/step 4/.test(repeatedCallNotice("search_web", 4)) && /NOT run again/.test(repeatedCallNotice("search_web", 4)), "§9: the notice names the first step and says it did not run");
}

if (errors.length > 0) {
  console.error(`\n✖ run-harness:check (§9) failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log("✓ run-harness:check §9 — charter turns are run-sized with a reserved tail; continuations keep a floor; identical searches are guarded");
