/**
 * AI 3.4 model-routing contract checks.
 *
 * Run with: pnpm model-routing:check
 *
 * Covers the pure, deterministic core: directive parsing (role/class/explicit/
 * garbage), class-family matching determinism, playbook phase→directive
 * selection incl. the standing-rules fallback, the durable turn-part round
 * trip, the six role FeatureSpecs + their capability contract, and the
 * archivist context-window floor. The route-level ladder + no-silent-
 * substitution invariants are exercised by the browser smoke test (they need
 * a live connection set); this script pins everything unit-testable.
 */

import assert from "node:assert/strict";
import {
  MODEL_ROLES,
  parseModelDirective,
  resolveModelClass,
  parseResolvedModelRoute,
  readMessageModelRoute,
  computeModelRouteDecorations,
  describeModelRouteSource,
  isModelRole,
  roleFeatureId,
  type RoutableModel,
  type ResolvedModelRoute,
} from "../lib/domain/ai/model-directive";
import { parseCharter } from "../lib/domain/ai/charters/parse";
import { getPhaseModelDirective } from "../lib/domain/ai/charters/model-directives";
import { FEATURE_BY_ID, lookupFeature } from "../lib/domain/ai/features/registry";
import { lookupTemplate } from "../lib/features/ai-connections/templates";

// ── directive parsing ─────────────────────────────────────────────────────

assert.deepEqual(parseModelDirective("scout"), { kind: "role", role: "scout" });
assert.deepEqual(parseModelDirective("  Analyst "), {
  kind: "role",
  role: "analyst",
});
assert.deepEqual(parseModelDirective("gpt-5 series"), {
  kind: "class",
  family: "gpt-5",
});
assert.deepEqual(parseModelDirective("gpt 5 series"), {
  kind: "class",
  family: "gpt-5",
});
assert.deepEqual(parseModelDirective("claude"), {
  kind: "class",
  family: "claude",
});
assert.deepEqual(parseModelDirective("o-series"), {
  kind: "class",
  family: "o-series",
});
assert.deepEqual(parseModelDirective("o series"), {
  kind: "class",
  family: "o-series",
});
assert.deepEqual(parseModelDirective("anthropic/claude-opus-4"), {
  kind: "explicit",
  providerId: "anthropic",
  modelId: "claude-opus-4",
});
// Gateway-style namespaced explicit id keeps everything after the first slash.
assert.deepEqual(parseModelDirective("openai/gpt-4o-mini"), {
  kind: "explicit",
  providerId: "openai",
  modelId: "gpt-4o-mini",
});
assert.equal(parseModelDirective(""), null);
assert.equal(parseModelDirective("   "), null);
assert.equal(parseModelDirective("/"), null);

// Every role keyword parses to itself; nothing else is a role.
for (const role of MODEL_ROLES) {
  assert.deepEqual(parseModelDirective(role), { kind: "role", role });
  assert.ok(isModelRole(role));
}
assert.equal(isModelRole("wizard"), false);
assert.deepEqual(parseModelDirective("wizard"), {
  kind: "class",
  family: "wizard",
});

// ── class matching (deterministic, most-specific-first) ────────────────────

const models: RoutableModel[] = [
  { connectionId: "c1", modelId: "gpt-4o" },
  { connectionId: "c1", modelId: "gpt-4o-mini" },
  { connectionId: "c1", modelId: "gpt-5" },
  { connectionId: "c1", modelId: "gpt-5-mini" },
  { connectionId: "c2", modelId: "claude-opus-4" },
  { connectionId: "c2", modelId: "o3-mini" },
  { connectionId: "c2", modelId: "openai/gpt-5.1" },
];

// Exact base id ranks above variants; all family members come back (the
// chain). Variant tie-break is normalized-id length (shorter first) — so the
// namespaced "openai/gpt-5.1" (normalizes to "gpt-5.1", 7 chars) precedes
// "gpt-5-mini" (10). The point is determinism; [0] is always the base model.
assert.deepEqual(
  resolveModelClass("gpt-5", models).map((m) => m.modelId),
  ["gpt-5", "openai/gpt-5.1", "gpt-5-mini"],
);
// Order-independence: shuffling the input yields the same ranked result.
const shuffled = [...models].reverse();
assert.deepEqual(
  resolveModelClass("gpt-5", shuffled).map((m) => m.modelId),
  ["gpt-5", "openai/gpt-5.1", "gpt-5-mini"],
);
// gpt-4 matches the 4-family only, not gpt-5.
assert.deepEqual(
  resolveModelClass("gpt-4", models).map((m) => m.modelId),
  ["gpt-4o", "gpt-4o-mini"],
);
// o-series special case.
assert.deepEqual(
  resolveModelClass("o-series", models).map((m) => m.modelId),
  ["o3-mini"],
);
// No match ⇒ empty chain (advisory; caller falls through the ladder).
assert.deepEqual(resolveModelClass("gemini", models), []);

// ── playbook phase → directive selection ───────────────────────────────────

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Setup" }] },
    { type: "paragraph", content: [{ type: "text", text: "model: writer" }] },
    { type: "paragraph", content: [{ type: "text", text: "Draft the outline." }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Research" }] },
    { type: "paragraph", content: [{ type: "text", text: "model: scout" }] },
    { type: "paragraph", content: [{ type: "text", text: "Gather sources." }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Freeform" }] },
    { type: "paragraph", content: [{ type: "text", text: "Just write." }] },
  ],
};
const parsed = parseCharter(doc);
assert.equal(parsed.phases.length, 3);
assert.equal(parsed.phases[0].modelDirective, "writer");
assert.equal(parsed.phases[1].modelDirective, "scout");
assert.equal(parsed.phases[2].modelDirective, undefined);

assert.deepEqual(getPhaseModelDirective(parsed, 0), {
  directive: { kind: "role", role: "writer" },
  source: "playbook-phase",
});
assert.deepEqual(getPhaseModelDirective(parsed, 1), {
  directive: { kind: "role", role: "scout" },
  source: "playbook-phase",
});
// Phase with no directive + no standing directive ⇒ null.
assert.equal(getPhaseModelDirective(parsed, 2), null);

// Standing-rules directive is the playbook-wide fallback.
const docStanding = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "model: analyst" }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Phase one" }] },
    { type: "paragraph", content: [{ type: "text", text: "Do the thing." }] },
  ],
};
const parsedStanding = parseCharter(docStanding);
assert.equal(parsedStanding.standingRules.modelDirective, "analyst");
assert.deepEqual(getPhaseModelDirective(parsedStanding, 0), {
  directive: { kind: "role", role: "analyst" },
  source: "playbook",
});

// Markdown-like path (literal `##` + `model:` lines in plain paragraphs).
const mdDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "## Research\nmodel: gpt-5 series\nGather the sources.",
        },
      ],
    },
  ],
};
const mdParsed = parseCharter(mdDoc);
assert.equal(mdParsed.phases.length, 1);
assert.equal(mdParsed.phases[0].modelDirective, "gpt-5 series");
assert.deepEqual(getPhaseModelDirective(mdParsed, 0), {
  directive: { kind: "class", family: "gpt-5" },
  source: "playbook-phase",
});

// A playbook with NO directives anywhere ⇒ null (byte-for-byte legacy path).
const plainDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Only phase" }] },
    { type: "paragraph", content: [{ type: "text", text: "No routing here." }] },
  ],
};
const plainParsed = parseCharter(plainDoc);
assert.equal(plainParsed.phases[0].modelDirective, undefined);
assert.equal(getPhaseModelDirective(plainParsed, 0), null);

// FIRST-LINE contract (review fix): a `model:` line inside a code sample or
// buried mid-prose must NOT become a live routing directive.
const codeBlockDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Configure" }] },
    {
      type: "codeBlock",
      attrs: { language: "yaml" },
      content: [
        { type: "text", text: "# example config\nmodel: gpt-4o-mini\ntemperature: 0.2" },
      ],
    },
  ],
};
assert.equal(
  parseCharter(codeBlockDoc).phases[0].modelDirective,
  undefined,
  "a model: line inside a code block must not route",
);
const midProseDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Write" }] },
    { type: "paragraph", content: [{ type: "text", text: "Draft the intro first." }] },
    { type: "paragraph", content: [{ type: "text", text: "model: scout" }] },
  ],
};
assert.equal(
  parseCharter(midProseDoc).phases[0].modelDirective,
  undefined,
  "a model: line that is not the phase's first line must not route",
);

// ── stamped-route round trip + divider decoration walk ─────────────────────

const route: ResolvedModelRoute = {
  providerId: "openai",
  modelId: "gpt-5",
  connectionId: "conn-1",
  source: "playbook-phase",
  playbookTitle: "Job Hunt",
  phaseIndex: 2,
};
// The metadata stamp survives a JSON round trip (persistence shape).
assert.deepEqual(
  parseResolvedModelRoute(JSON.parse(JSON.stringify(route))),
  route,
);
assert.equal(parseResolvedModelRoute({ providerId: "x" }), null);
assert.deepEqual(
  readMessageModelRoute({ modelRoute: route, modelRouteNotices: ["n1", 2] }),
  { route, notices: ["n1"] },
);
assert.deepEqual(readMessageModelRoute(undefined), {
  route: null,
  notices: [],
});

// Divider decoration walk (ONE implementation for both chat surfaces):
// divider appears only when the executed model changes between assistant
// turns; notices-only rows when the model held; legacy metadata-less
// history renders nothing.
const routeA: ResolvedModelRoute = {
  providerId: "anthropic",
  modelId: "claude-sonnet-4",
  source: "default",
};
const decoMessages = [
  { id: "u1", role: "user" },
  { id: "a1", role: "assistant", metadata: { modelRoute: routeA } },
  { id: "a2", role: "assistant", metadata: { modelRoute: routeA } },
  {
    id: "a3",
    role: "assistant",
    metadata: { modelRoute: route, modelRouteNotices: ["fell through"] },
  },
  { id: "a4", role: "assistant" },
];
const deco = computeModelRouteDecorations(decoMessages);
assert.equal(deco["a1"], undefined);
assert.equal(deco["a2"], undefined);
assert.equal(deco["a3"]?.kind, "divider");
assert.deepEqual(deco["a3"]?.notices, ["fell through"]);
assert.equal(deco["a4"], undefined);

// Switch-line copy names who switched. (P0a vocabulary: the persisted
// source values stay "playbook"/"playbook-phase", but every DISPLAY
// surface says charter.)
assert.equal(
  describeModelRouteSource(route),
  'by charter "Job Hunt" (Phase 3)',
);
assert.equal(
  describeModelRouteSource({ providerId: "a", modelId: "b", source: "user" }),
  "by you",
);
assert.equal(
  describeModelRouteSource({ providerId: "a", modelId: "b", source: "default" }),
  "",
);

// ── role FeatureSpecs exist with the intended contract ─────────────────────

for (const role of MODEL_ROLES) {
  const feature = lookupFeature(roleFeatureId(role));
  assert.ok(feature, `missing FeatureSpec for role ${role}`);
  assert.ok(
    feature!.requiredCapabilities.includes("text"),
    `role ${role} must require text`,
  );
  assert.ok(feature!.defaultSuggestion, `role ${role} needs a defaultSuggestion`);
  // Locked decision: `reasoning` is preferred, never required (effectiveCapabilities
  // does not emit it) — a required `reasoning` would make every model ineligible.
  assert.ok(
    !feature!.requiredCapabilities.includes("reasoning"),
    `role ${role} must not REQUIRE reasoning (see registry note)`,
  );
}
// Archivist carries the long-context floor.
assert.equal(FEATURE_BY_ID["role-archivist"].minContextWindow, 200_000);

// Every role defaultSuggestion must name a model id that ACTUALLY EXISTS in
// the preset template's defaultModels (review fix: two suggestions pointed
// at catalog-only ids — 'o3-mini' absent from the OpenAI template,
// 'codestral' vs the template's 'codestral-latest' — so they could never
// match a real connection and silently fell to arbitrary auto-bind).
for (const role of MODEL_ROLES) {
  const suggestion = FEATURE_BY_ID[roleFeatureId(role)].defaultSuggestion!;
  const template = lookupTemplate(suggestion.presetId);
  assert.ok(template, `role ${role}: no template for preset ${suggestion.presetId}`);
  assert.ok(
    template!.defaultModels.some((m) => m.id === suggestion.modelId),
    `role ${role}: suggestion ${suggestion.presetId}/${suggestion.modelId} is not in the template's defaultModels — it can never match a real connection`,
  );
}

console.log("model-routing checks passed");
