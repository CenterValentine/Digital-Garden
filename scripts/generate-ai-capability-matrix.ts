/**
 * AI capability matrix generator.
 *
 * Generate: pnpm ai:matrix
 * CI check: pnpm ai:matrix:check   (fails when the committed doc is stale)
 *
 * Emits docs/notes-feature/core/AI-CAPABILITY-MATRIX.md — the answer to
 * "what does provider/model X actually get?" — derived ENTIRELY from the
 * code that decides it at runtime, so the doc cannot lie:
 *
 *   - PROVIDER_CATALOG                 → models, ceilings, reasoning posture
 *   - CONNECTION_TEMPLATES             → what a connection actually serves
 *   - resolveModelTemperature()        → fixed-temperature models (probed)
 *   - supportsOpenAIPromptCaching()    → app-managed cache coverage (probed)
 *   - route.ts NATIVE_TOOL_VENDORS     → native web_search      (scanned)
 *   - route.ts PDF_NATIVE_PROVIDERS    → native PDF ingestion   (scanned)
 *   - route.ts buildProviderOptions    → reasoning config       (scanned)
 *   - providers/registry.ts case list  → adapter branches       (scanned)
 *
 * Scans assert their anchors exist, so a refactor that moves a constant
 * fails this script loudly instead of silently emitting a wrong doc.
 * Same tsx constraint as validate-ai-drift.ts: nothing here imports the
 * chat route or the tool registry.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PROVIDER_CATALOG, getModelMeta } from "../lib/domain/ai/providers/catalog";
import { CONNECTION_TEMPLATES } from "../lib/features/ai-connections/templates";
import { resolveModelTemperature } from "../lib/domain/ai/model-constraints";
import { supportsOpenAIPromptCaching } from "../lib/domain/ai/prompt-cache";

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_REL = "docs/notes-feature/core/AI-CAPABILITY-MATRIX.md";
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function must<T>(value: T | null | undefined, what: string): T {
  if (value == null) {
    console.error(`generate-ai-capability-matrix: could not locate ${what} — update the script's scan anchors.`);
    process.exit(1);
  }
  return value;
}

// ── Source-scanned facts ──────────────────────────────────────────────────

const routeSource = read("app/api/ai/chat/route.ts");

const nativeSearchBlock = must(
  routeSource.match(/NATIVE_TOOL_VENDORS = new Set\(\[([\s\S]*?)\]\)/),
  "NATIVE_TOOL_VENDORS in app/api/ai/chat/route.ts",
)[1];
const nativeSearchVendors = new Set(
  [...nativeSearchBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);

const pdfBlock = must(
  routeSource.match(/PDF_NATIVE_PROVIDERS = new Set\(\[([\s\S]*?)\]\)/),
  "PDF_NATIVE_PROVIDERS in app/api/ai/chat/route.ts",
)[1];
const pdfNativeProviders = new Set(
  [...pdfBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);

// buildProviderOptions vendor branches — the function is the first ~140
// lines of the route; each branch is `providerId === "<vendor>"`.
const bpoEnd = must(
  routeSource.indexOf("export async function POST") > 0
    ? routeSource.slice(0, routeSource.indexOf("export async function POST"))
    : null,
  "POST handler boundary in app/api/ai/chat/route.ts",
);
const reasoningVendors = new Set(
  [...bpoEnd.matchAll(/providerId === "([^"]+)"/g)].map((m) => m[1]),
);
if (reasoningVendors.size === 0) {
  console.error("generate-ai-capability-matrix: no buildProviderOptions vendor branches found — update the scan.");
  process.exit(1);
}

const registrySource = read("lib/domain/ai/providers/registry.ts");

// ── Rendering helpers ─────────────────────────────────────────────────────

function fmtNumber(n: number): string {
  return n.toLocaleString("en-US");
}

const lines: string[] = [];
const out = (s = "") => lines.push(s);

out("<!-- GENERATED FILE — DO NOT EDIT BY HAND.");
out("     Regenerate: pnpm ai:matrix");
out("     CI guard:   pnpm ai:matrix:check (ai-drift.yml)");
out("     Source:     scripts/generate-ai-capability-matrix.ts -->");
out();
out("# AI Capability Matrix");
out();
out(
  "What each provider and model actually gets at runtime — derived from the code that decides it (`PROVIDER_CATALOG`, `CONNECTION_TEMPLATES`, `resolveModelTemperature`, `supportsOpenAIPromptCaching`, and the chat route's vendor sets), never hand-maintained. The narrative companion is [AI-ARCHITECTURE.md](AI-ARCHITECTURE.md).",
);
out();

// §1 Vendor behavior matrix -----------------------------------------------

out("## Provider behavior");
out();
out(
  "| Provider | web_search | PDF attachments | Reasoning config (route) | App-managed prompt cache | Adapter branch |",
);
out("|---|---|---|---|---|---|");
for (const provider of PROVIDER_CATALOG) {
  const search = nativeSearchVendors.has(provider.id)
    ? "provider-native"
    : "app fallback (needs Tavily/Brave connection, else NO search)";
  const pdf = pdfNativeProviders.has(provider.id)
    ? "native ingestion"
    : "text extraction";
  const reasoning = reasoningVendors.has(provider.id)
    ? provider.id === "deepseek"
      ? "adaptive thinking; low effort in mechanical runs"
      : "enabled-mode models get thinking config"
    : provider.models.some((m) => m.reasoning === "auto")
      ? "none needed (auto-emits)"
      : "—";
  const cache =
    provider.id === "openai"
      ? "per-model (`supportsOpenAIPromptCaching`)"
      : provider.id === "deepseek"
        ? "none (provider caches automatically server-side)"
        : "none";
  const adapter = registrySource.includes(`case "${provider.id}":`)
    ? "yes"
    : "**MISSING**";
  out(`| ${provider.id} | ${search} | ${pdf} | ${reasoning} | ${cache} | ${adapter} |`);
}
out();

// §2 Per-model catalog ----------------------------------------------------

out("## Catalog models");
out();
out(
  "`Max output` is load-bearing: it is the default output ceiling the chat route sends when the user has no explicit cap. `Reasoning` models get a 16k+ floor (drift gate 2) because thinking bills against the output budget.",
);
out();
for (const provider of PROVIDER_CATALOG) {
  out(`### ${provider.name} (\`${provider.id}\`)`);
  out();
  out("| Model | Context | Max output | Capabilities | Cost | Reasoning | Temperature | Cached |");
  out("|---|---|---|---|---|---|---|---|");
  for (const m of provider.models) {
    const reasoning = m.reasoning
      ? m.reasoning + (m.thinkingBudgetTokens ? ` (budget ${fmtNumber(m.thinkingBudgetTokens)})` : "")
      : "—";
    const temperature =
      resolveModelTemperature(m.id, 0.123) === 1 ? "fixed at 1" : "user setting";
    const cached =
      provider.id === "openai" && supportsOpenAIPromptCaching(m.id) ? "yes" : "—";
    out(
      `| \`${m.id}\` | ${fmtNumber(m.contextWindow)} | ${fmtNumber(m.maxOutput)} | ${m.capabilities.join(", ")} | ${m.costTier} | ${reasoning} | ${temperature} | ${cached} |`,
    );
  }
  out();
}

// §3 Connection templates -------------------------------------------------

out("## Connection templates");
out();
out("| Preset | Kind | Adapter | Seeded models | Model fetch |");
out("|---|---|---|---|---|");
for (const t of CONNECTION_TEMPLATES) {
  out(
    `| ${t.id} | ${t.kind} | ${t.adapterKind} | ${t.defaultModels.length} | ${t.supportsModelFetch ? "yes" : "no"} |`,
  );
}
out();

// §4 Aggregator model resolution ------------------------------------------

out("## Aggregator model ids → output-ceiling resolution");
out();
out(
  "Namespaced ids (`vendor/model`) are looked up in the catalog by their bare id (everything after the first `/`). A hit inherits that entry's output ceiling and reasoning posture; a miss falls through to the provider's own default output cap (documented fallthrough — the model still works, uncapped by us).",
);
out();
out("| Template | Model id | Catalog resolution |");
out("|---|---|---|");
const catalogDirectIds = new Set<string>(PROVIDER_CATALOG.map((p) => p.id));
for (const t of CONNECTION_TEMPLATES) {
  if (catalogDirectIds.has(t.id)) continue; // direct vendors: full coverage enforced by drift gate 1
  for (const m of t.defaultModels) {
    if (!m.id.includes("/")) continue;
    const bare = m.id.slice(m.id.indexOf("/") + 1);
    const meta = getModelMeta(bare);
    out(
      `| ${t.id} | \`${m.id}\` | ${
        meta
          ? `\`${meta.provider.id}/${meta.model.id}\` (max output ${fmtNumber(meta.model.maxOutput)})`
          : "none — provider default cap"
      } |`,
    );
  }
}
out();
out("---");
out();
out(
  "*Regenerated by `pnpm ai:matrix`; `pnpm ai:drift:check` guards the underlying tables against drifting from each other, and `pnpm ai:matrix:check` guards this doc against drifting from the tables.*",
);
out();

const rendered = lines.join("\n");

// ── Write / check ─────────────────────────────────────────────────────────

const outputAbs = path.join(ROOT, OUTPUT_REL);
const checkMode = process.argv.includes("--check");

if (checkMode) {
  let existing: string | null = null;
  try {
    existing = readFileSync(outputAbs, "utf8");
  } catch {
    existing = null;
  }
  if (existing !== rendered) {
    console.error(
      `ai:matrix:check FAILED — ${OUTPUT_REL} is stale (or missing). Run \`pnpm ai:matrix\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log(`ai:matrix:check passed — ${OUTPUT_REL} matches the code.`);
} else {
  writeFileSync(outputAbs, rendered);
  console.log(`wrote ${OUTPUT_REL} (${lines.length} lines)`);
}
