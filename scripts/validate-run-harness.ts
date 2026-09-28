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

import { computeTurnCost } from "../lib/features/ai-connections/usage/pricing";
import {
  fingerprintPrompt,
  findPrefixDivergence,
  serializePromptForDiag,
  PREFIX_CHUNK_CHARS,
} from "../lib/domain/ai/prompt-prefix-diag";

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
  const expected = ((369558 - 200561) * 2 + 200561 * 0.2 + 2806 * 12) / 1_000_000;
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

if (errors.length > 0) {
  console.error(`\n✖ run-harness:check (§8) failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log("✓ run-harness:check §8 — per-step long-context tier; prefix diagnostic locates a mid-prompt change");
