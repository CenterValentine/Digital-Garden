/**
 * AI drift gates — CI checks for the AI subsystem's parallel tables.
 *
 * Run with: pnpm ai:drift:check
 *
 * The 2026-08-08 prod DeepSeek iteration failure was, at root, silent drift
 * between parallel tables: DeepSeek existed in the connection templates but
 * not in PROVIDER_CATALOG, so no reasoning config — and, after the
 * per-model-ceiling fix, no output budget — could ever apply. The fix had to
 * hand-touch four files each holding a copy of the same fact. These gates
 * make that class of drift a build failure instead of a production incident.
 *
 * Five gates, all failures reported in one run:
 *   1. Model identity tables agree (catalog ↔ templates ↔ types unions ↔
 *      settings enum ↔ legacy MODEL_MAP)
 *   2. Catalog completeness for consumed fields (maxOutput; reasoning floor)
 *   3. Tool inventory ↔ settings-metadata classification (every tool is
 *      user-configurable or harness-internal, never unclassified/stale)
 *   4. Prompt/description tool-name references resolve to real tools
 *   5. Every AdapterKind has a resolveChatModelFromConnection branch
 *
 * Design notes:
 * - Tool definitions are SOURCE-SCANNED, not instantiated: the factory import
 *   graph reaches lib/domain/editor/extensions-server.ts, which is not
 *   tsx-safe (see validate-markdown-block-safety.ts's header for the same
 *   constraint). Scanning also keeps this script free of Prisma/env needs.
 * - TS unions and the legacy MODEL_MAP are likewise literal blocks that can't
 *   be runtime-introspected — same scanning approach
 *   (the validate-collaboration-schema pattern).
 * - Every scan asserts it found what it anchored on, so a refactor that moves
 *   a block fails the gate loudly instead of silently checking nothing.
 * - Binary gates only — no warn tier (warn lists rot).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PROVIDER_CATALOG, getModelMeta } from "../lib/domain/ai/providers/catalog";
import { CONNECTION_TEMPLATES } from "../lib/features/ai-connections/templates";
import { ADAPTER_KINDS } from "../lib/features/ai-connections/types";
import {
  ALL_TOOL_IDS,
  HARNESS_INTERNAL_TOOL_IDS,
} from "../lib/domain/ai/tools/metadata";
import {
  CO_BROWSE_OPEN,
  CO_BROWSE_ACT,
  READ_CURRENT_PAGE,
  LIST_TABS,
  CO_BROWSE_OPEN_DESCRIPTION,
  CO_BROWSE_ACT_DESCRIPTION,
  READ_CURRENT_PAGE_DESCRIPTION,
  LIST_TABS_DESCRIPTION,
} from "../lib/domain/ai/tools/co-browse-tools";
import {
  READ_PAGE_HEADLESS_OR_BROWSER,
  READ_PAGE_HEADLESS_OR_BROWSER_DESCRIPTION,
} from "../lib/domain/ai/tools/read-page-in-browser";
import {
  OPEN_TAB_AND_READ,
  OPEN_TAB_AND_READ_DESCRIPTION,
} from "../lib/domain/ai/tools/open-tab-and-read";
import { buildSystemPrompt } from "../lib/domain/ai/system-prompt";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const failures: string[] = [];
function fail(gate: string, message: string) {
  failures.push(`[${gate}] ${message}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Gate 1 — model identity tables agree
// ─────────────────────────────────────────────────────────────────────────

// Widened to Set<string>: the catalog's ids are literal unions, but
// everything compared against them (template ids, source-scanned tokens)
// arrives as plain strings.
const catalogProviderIds = new Set<string>(PROVIDER_CATALOG.map((p) => p.id));
const catalogModelsByProvider = new Map<string, Map<string, { contextWindow: number }>>(
  PROVIDER_CATALOG.map((p) => [p.id, new Map(p.models.map((m) => [m.id, m]))]),
);
const allCatalogModelIds = new Set<string>(
  PROVIDER_CATALOG.flatMap((p) => p.models.map((m) => m.id)),
);

for (const template of CONNECTION_TEMPLATES) {
  const isDirectVendor = catalogProviderIds.has(template.id);
  for (const model of template.defaultModels) {
    if (isDirectVendor) {
      // Direct-vendor template models MUST have a catalog entry: the chat
      // route resolves the output ceiling (and reasoning config) through
      // getModelMeta — a miss silently falls back to the provider's own
      // default cap, which is the DeepSeek-incident class.
      const entry = catalogModelsByProvider.get(template.id)?.get(model.id);
      if (!entry) {
        fail(
          "gate1",
          `template "${template.id}" model "${model.id}" has no PROVIDER_CATALOG entry — it gets no output ceiling and no reasoning config`,
        );
        continue;
      }
      if (entry.contextWindow !== model.contextWindow) {
        fail(
          "gate1",
          `contextWindow disagreement for ${template.id}/${model.id}: catalog ${entry.contextWindow} vs template ${model.contextWindow}`,
        );
      }
    } else if (model.id.includes("/")) {
      // Aggregator (gateway/openrouter/…) ids: the route strips everything
      // before the first "/" and looks the bare id up across all providers.
      // A missing bare id is the documented provider-default fallthrough —
      // allowed. But if it RESOLVES, the numbers must agree.
      const bareId = model.id.slice(model.id.indexOf("/") + 1);
      const meta = getModelMeta(bareId);
      if (meta && meta.model.contextWindow !== model.contextWindow) {
        fail(
          "gate1",
          `contextWindow disagreement for ${template.id} "${model.id}": catalog(${meta.provider.id}/${bareId}) ${meta.model.contextWindow} vs template ${model.contextWindow}`,
        );
      }
    }
  }
}

// Source-scanned literal tables.
function extractQuoted(block: string): string[] {
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}
function extractUnion(source: string, typeName: string, file: string): Set<string> {
  const match = source.match(new RegExp(`export type ${typeName} =([^;]*);`, "m"));
  if (!match) {
    fail(
      "gate1",
      `could not locate "export type ${typeName}" in ${file} — update validate-ai-drift.ts if it moved`,
    );
    return new Set();
  }
  return new Set(extractQuoted(match[1]));
}

const typesSource = read("lib/domain/ai/types.ts");
const aiProviderIds = extractUnion(typesSource, "AIProviderId", "lib/domain/ai/types.ts");
const aiModelIds = extractUnion(typesSource, "AIModelId", "lib/domain/ai/types.ts");

const validationSource = read("lib/features/settings/validation.ts");
const enumMatch = validationSource.match(/providerId:\s*z\s*\.enum\(\[([^\]]+)\]\)/);
if (!enumMatch) {
  fail(
    "gate1",
    "could not locate the providerId z.enum in lib/features/settings/validation.ts — update validate-ai-drift.ts if it moved",
  );
}
const validationProviderIds = new Set(enumMatch ? extractQuoted(enumMatch[1]) : []);

const providersRegistrySource = read("lib/domain/ai/providers/registry.ts");
const modelMapMatch = providersRegistrySource.match(/const MODEL_MAP[^{]*\{([\s\S]*?)\n\};/);
if (!modelMapMatch) {
  fail(
    "gate1",
    "could not locate MODEL_MAP in lib/domain/ai/providers/registry.ts — update validate-ai-drift.ts if it moved",
  );
}
const modelMapKeys = new Set(
  modelMapMatch
    ? [...modelMapMatch[1].matchAll(/"([^"]+)":\s*\{/g)].map((m) => m[1])
    : [],
);

function assertSetEqual(gate: string, label: string, a: Set<string>, b: Set<string>) {
  for (const x of a) if (!b.has(x)) fail(gate, `${label}: "${x}" present in the former, missing from the latter`);
  for (const x of b) if (!a.has(x)) fail(gate, `${label}: "${x}" present in the latter, missing from the former`);
}

if (aiProviderIds.size > 0) {
  assertSetEqual(
    "gate1",
    "AIProviderId union (types.ts) vs PROVIDER_CATALOG provider ids",
    aiProviderIds,
    catalogProviderIds,
  );
}
if (aiProviderIds.size > 0 && validationProviderIds.size > 0) {
  assertSetEqual(
    "gate1",
    "AIProviderId union (types.ts) vs settings providerId enum (validation.ts)",
    aiProviderIds,
    validationProviderIds,
  );
}
// MODEL_MAP is the legacy no-connection resolver; BYOK-only models (DeepSeek)
// are legitimately absent from it, so this is a subset check, not equality.
for (const key of modelMapKeys) {
  if (!aiModelIds.has(key)) {
    fail("gate1", `MODEL_MAP key "${key}" is not a member of the AIModelId union`);
  }
}
// Every canonical model id must resolve in the catalog — the route's output
// ceiling depends on it regardless of which resolution rung picked the model.
for (const id of aiModelIds) {
  if (!allCatalogModelIds.has(id)) {
    fail("gate1", `AIModelId union member "${id}" has no PROVIDER_CATALOG entry`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Gate 2 — catalog completeness for consumed fields
// ─────────────────────────────────────────────────────────────────────────

// The floor institutionalizes the incident lesson: a reasoning-capable model
// with a small output budget burns it on thinking and dies mid-step, before
// emitting a tool call, with zero visible output (finishReason "length").
const REASONING_MAX_OUTPUT_FLOOR = 16_000;

for (const provider of PROVIDER_CATALOG) {
  for (const model of provider.models) {
    if (!model.maxOutput || model.maxOutput <= 0) {
      fail(
        "gate2",
        `${provider.id}/${model.id} has no maxOutput — the chat route now sends this as the default output ceiling`,
      );
      continue;
    }
    if (model.reasoning && model.maxOutput < REASONING_MAX_OUTPUT_FLOOR) {
      fail(
        "gate2",
        `${provider.id}/${model.id} is reasoning-capable but maxOutput ${model.maxOutput} < ${REASONING_MAX_OUTPUT_FLOOR} — reasoning counts against the output budget`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Gate 3 — tool inventory ↔ settings-metadata classification
// ─────────────────────────────────────────────────────────────────────────

/**
 * Extract `name: tool({ … description: "…" … })` definitions from a factory
 * file. Matches object-literal keys only (`x: tool({`) — module-level
 * `export const xTool = tool({` client wrappers are deliberately excluded
 * (their names/descriptions come from imported constants instead).
 */
function extractToolDefs(
  rel: string,
): Array<{ name: string; description: string | null }> {
  const source = read(rel);
  const defs: Array<{ name: string; description: string | null }> = [];
  for (const match of source.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*tool\(\{/gm)) {
    const name = match[1];
    const from = (match.index ?? 0) + match[0].length;
    defs.push({ name, description: extractDescription(source, from, name, rel) });
  }
  if (defs.length === 0) {
    fail("gate3", `no tool definitions found in ${rel} — the extraction regex went stale, update validate-ai-drift.ts`);
  }
  return defs;
}

/**
 * From `from`, find the tool's `description:` and collect its string-literal
 * value (handles `"a" + "b"` concatenation chains and template literals with
 * `${…}` interpolations stripped). Returns null when the description is not
 * a literal in this block (e.g. an imported constant).
 */
function extractDescription(
  source: string,
  from: number,
  name: string,
  rel: string,
): string | null {
  const window = source.slice(from, from + 6000);
  // Boundary excludes needsApproval: approval-gated tools declare it BEFORE
  // their description (createNote, the workflow tools), and it must not
  // terminate the search early.
  const boundary = window.search(/\b(inputSchema|execute)\s*:/);
  const scope = boundary === -1 ? window : window.slice(0, boundary);
  const descAt = scope.indexOf("description:");
  if (descAt === -1) {
    fail("gate4", `tool "${name}" in ${rel} has no description before its schema/execute`);
    return null;
  }
  let i = from + descAt + "description:".length;
  const parts: string[] = [];
  for (;;) {
    while (i < source.length && /[\s+\n]/.test(source[i])) i++;
    const quote = source[i];
    if (quote !== '"' && quote !== "'" && quote !== "`") break;
    i++;
    let literal = "";
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\") {
        literal += source[i + 1] === "n" ? "\n" : source[i + 1];
        i += 2;
        continue;
      }
      if (quote === "`" && ch === "$" && source[i + 1] === "{") {
        const close = source.indexOf("}", i);
        i = close === -1 ? source.length : close + 1;
        continue;
      }
      if (ch === quote) {
        i++;
        break;
      }
      literal += ch;
      i++;
    }
    parts.push(literal);
  }
  return parts.length > 0 ? parts.join("") : null;
}

/**
 * Factory files scanned for server tools, keyed by the factory name the chat
 * route spreads (createBaseTools → "Base", …). The route cross-check below
 * fails if the route starts spreading a factory this map doesn't cover.
 */
const FACTORY_FILES: Record<string, string> = {
  Base: "lib/domain/ai/tools/registry.ts",
  Editor: "lib/domain/ai/tools/editor-tools.ts",
  Flashcard: "lib/domain/ai/tools/flashcard-tools.ts",
  Workflow: "lib/domain/ai/tools/workflow-tools.ts",
  Data: "lib/domain/ai/tools/data-tools.ts",
};

const serverToolDefs = Object.values(FACTORY_FILES).flatMap((file) =>
  extractToolDefs(file),
);

const CLIENT_TOOLS: Array<{ name: string; description: string }> = [
  { name: READ_PAGE_HEADLESS_OR_BROWSER, description: READ_PAGE_HEADLESS_OR_BROWSER_DESCRIPTION },
  { name: OPEN_TAB_AND_READ, description: OPEN_TAB_AND_READ_DESCRIPTION },
  { name: CO_BROWSE_OPEN, description: CO_BROWSE_OPEN_DESCRIPTION },
  { name: CO_BROWSE_ACT, description: CO_BROWSE_ACT_DESCRIPTION },
  { name: READ_CURRENT_PAGE, description: READ_CURRENT_PAGE_DESCRIPTION },
  { name: LIST_TABS, description: LIST_TABS_DESCRIPTION },
];

const realToolNames = new Set<string>([
  ...serverToolDefs.map((d) => d.name),
  ...CLIENT_TOOLS.map((t) => t.name),
  // Attached conditionally in the route (native vendor tool or the
  // app-executed Tavily/Brave fallback) under this fixed name.
  "search_web",
]);

const configurable = new Set<string>(ALL_TOOL_IDS);
const internal = new Set<string>(HARNESS_INTERNAL_TOOL_IDS);

for (const id of configurable) {
  if (internal.has(id)) {
    fail("gate3", `tool "${id}" is in BOTH ALL_TOOL_IDS and HARNESS_INTERNAL_TOOL_IDS — classify it exactly one way`);
  }
  if (!realToolNames.has(id)) {
    fail("gate3", `settings metadata lists "${id}" but no such tool exists — stale entry (dead settings toggle)`);
  }
}
for (const id of internal) {
  if (!realToolNames.has(id)) {
    fail("gate3", `HARNESS_INTERNAL_TOOL_IDS lists "${id}" but no such tool exists — stale entry`);
  }
}
for (const name of realToolNames) {
  if (!configurable.has(name) && !internal.has(name)) {
    fail(
      "gate3",
      `tool "${name}" is unclassified — add settings metadata (user-configurable) or add it to HARNESS_INTERNAL_TOOL_IDS in lib/domain/ai/tools/metadata.ts`,
    );
  }
}

// Route cross-checks: the allTools literal must be built from exactly the
// factories/constants this script enumerates, else the gate itself has gone
// stale (e.g. a new create*Tools module added to the route).
const routeSource = read("app/api/ai/chat/route.ts");
// Matches both spread (`...createBaseTools(`) and conditional
// (`editableContentId ? createEditorTools(` ) call sites, plus the imports —
// all resolve to the same factory-name set.
const routeFactories = new Set(
  [...routeSource.matchAll(/\bcreate([A-Za-z]+)Tools\b/g)].map((m) => m[1]),
);
assertSetEqual(
  "gate3",
  "tool factories spread in route allTools vs FACTORY_FILES in this script",
  routeFactories,
  new Set(Object.keys(FACTORY_FILES)),
);
const routeBracketConstants = new Set(
  [...routeSource.matchAll(/^\s+\[([A-Z_]+)\]:/gm)].map((m) => m[1]),
);
const scriptConstants = new Set([
  "READ_PAGE_HEADLESS_OR_BROWSER",
  "OPEN_TAB_AND_READ",
  "CO_BROWSE_OPEN",
  "CO_BROWSE_ACT",
  "READ_CURRENT_PAGE",
  "LIST_TABS",
]);
for (const c of routeBracketConstants) {
  if (!scriptConstants.has(c)) {
    fail(
      "gate3",
      `route registers client tool constant [${c}] that validate-ai-drift.ts does not enumerate — add it to CLIENT_TOOLS`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Gate 4 — prompt/description tool-name references resolve
// ─────────────────────────────────────────────────────────────────────────

// snake_case tokens that legitimately appear in prompt/description prose but
// are NOT tool names. Reviewed entries only — a new unknown token fails the
// gate so it gets classified (real tool reference, typo, or added here).
const NON_TOOL_TOKENS = new Set<string>([
  // placement vocabulary (output-target system)
  "under_chat",
  "under_content",
  "beside_content",
]);

// Build the full prompt with every capability flag on, in both playbook
// modes (attached context vs ambient awareness are mutually exclusive).
const basePromptCtx = {
  hasImageTools: true,
  hasFlashcardTools: true,
  hasWebSearch: true,
  hasCheckpointTool: true,
  hasBrowserReadTool: true,
  hasTabLauncher: true,
  hasCoBrowseTools: true,
  hasReadCurrentPage: true,
  hasResearchTools: true,
  hasListTabs: true,
  hasItemIteration: true,
  runtimeProviderName: "DeepSeek",
  runtimeModelId: "deepseek-v4-flash",
  openWorkflowTitle: "Example Workflow",
  editableContentId: "00000000-0000-0000-0000-000000000000",
  isChatContent: true,
  chatContentId: "00000000-0000-0000-0000-000000000000",
  autoPronounceDefault: true,
  userContextSection: "user context",
  mentionedContext: "mentioned context",
  rootedContentSection: "rooted content",
  outputTargetSection: "output target",
  checkpointIntegritySection: "integrity",
  pageContextSection: "page context",
  currentPageHint: { url: "https://example.com", title: "Example" },
  viewedContentHint: {
    contentId: "00000000-0000-0000-0000-000000000000",
    title: "Example",
  },
};
const promptText =
  buildSystemPrompt({
    ...basePromptCtx,
    playbookContext: "playbook context",
    hasAttachedPlaybook: true,
  }) +
  "\n" +
  buildSystemPrompt({
    ...basePromptCtx,
    playbookAwareness: "playbook awareness",
    hasAttachedPlaybook: false,
  });

const descriptionText = [
  ...serverToolDefs.map((d) => d.description ?? ""),
  ...CLIENT_TOOLS.map((t) => t.description),
].join("\n");

const scannedText = `${promptText}\n${descriptionText}`;
const tokenPattern = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
const unresolved = new Set<string>();
for (const match of scannedText.matchAll(tokenPattern)) {
  const token = match[0];
  if (realToolNames.has(token)) continue;
  if (NON_TOOL_TOKENS.has(token)) continue;
  unresolved.add(token);
}
for (const token of unresolved) {
  fail(
    "gate4",
    `prompt/description references "${token}" which is not a defined tool — stale tool reference, typo, or add it to NON_TOOL_TOKENS in validate-ai-drift.ts with a rationale`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Gate 5 — every AdapterKind has a resolveChatModelFromConnection branch
// ─────────────────────────────────────────────────────────────────────────

// ADAPTER_KINDS' own doc comment: "Extending this requires a matching branch
// in resolveChatModelFromConnection." This gate mechanizes that comment.
for (const kind of ADAPTER_KINDS) {
  if (!providersRegistrySource.includes(`case "${kind}":`)) {
    fail(
      "gate5",
      `AdapterKind "${kind}" has no case branch in resolveChatModelFromConnection (lib/domain/ai/providers/registry.ts) — templates using it can render in settings but never instantiate a model`,
    );
  }
}
for (const template of CONNECTION_TEMPLATES) {
  if (!(ADAPTER_KINDS as readonly string[]).includes(template.adapterKind)) {
    fail(
      "gate5",
      `template "${template.id}" uses adapterKind "${template.adapterKind}" which is not in ADAPTER_KINDS`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`ai:drift:check FAILED — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    "\nSee docs/notes-feature/work-tracking/AI-DRIFT-GATES-PLAN.md for what each gate protects.",
  );
  process.exit(1);
}

console.log(
  `ai:drift:check passed — ${PROVIDER_CATALOG.length} providers, ${allCatalogModelIds.size} catalog models, ${CONNECTION_TEMPLATES.length} templates, ${realToolNames.size} tools (${configurable.size} configurable, ${internal.size} harness-internal), ${ADAPTER_KINDS.length} adapters`,
);
