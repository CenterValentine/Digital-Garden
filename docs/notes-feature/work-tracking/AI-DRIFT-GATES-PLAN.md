# AI Drift Gates — CI checks for the AI subsystem's parallel tables

**Branch:** `AI-sys-improve/drift-gates` (stacked on `feat/ai-harness-reliability`, PR #156 — must merge first)
**Command:** `pnpm ai:drift:check` → `scripts/validate-ai-drift.ts`
**Workflow:** `.github/workflows/ai-drift.yml` (path-filtered, mirrors collaboration-hardening.yml)

## Why

The 2026-08-08 prod DeepSeek iteration failure (conv `0d67e46e`) was, at root, **silent
drift between parallel tables**: DeepSeek existed in the connection templates but not in
`PROVIDER_CATALOG`, so no reasoning config and (post-#156) no output ceiling could ever
apply. Fixing it required hand-touching four files that each hold a copy of the same
fact (catalog, templates, `types.ts` unions, settings validation enum) — proof the
copies drift. This repo already solves this class of problem with check scripts
(`collab:schema:check`, `extensions:check`, `prompt-cache:check`, `model-routing:check`);
the AI model/tool surfaces are the last major parallel tables without one.

**#156 raised the stakes**: `maxTokens` now resolves through
`getModelMeta(executedBareModelId)?.model.maxOutput` — a template model missing from the
catalog silently falls back to the provider's own default output cap. That is the exact
incident class this gate exists to prevent from recurring.

## The five gates (one script, all failures reported in one run)

### Gate 1 — Model identity tables agree
- **Direct-vendor templates** (presetId ∈ catalog provider ids: anthropic, openai,
  google, xai, mistral, groq, deepseek): every `defaultModels[].id` must exist in that
  provider's catalog entry. Miss = the model has no output ceiling and no reasoning
  config — the DeepSeek incident class.
- **contextWindow agreement**: where template and catalog both define the same
  (provider, model), the values must match. (Numbers quoted in two files WILL drift —
  gemini-2.5-pro was 1M in catalog, 2M in templates.)
- **Aggregator templates** (vercel-gateway, openrouter, fireworks, together, moonshot):
  namespaced ids are checked only if their bare id resolves in the catalog (then
  contextWindow must agree). Missing bare ids are the documented provider-default
  fallthrough (route.ts comment) — allowed, not warned, to keep the gate binary.
- **Source-scanned unions**: `AIProviderId` union (types.ts) == catalog provider ids ==
  settings validation `providerId` enum (validation.ts). `AIModelId` union ==
  `MODEL_MAP` keys (providers/registry.ts), and every member resolves in the catalog.
  These are literal unions, so a regex scan of the source is reliable; runtime
  introspection isn't possible for TS types.

### Gate 2 — Catalog completeness for consumed fields
- Every catalog model has `maxOutput > 0` (it is now load-bearing, not display-only).
- **Reasoning floor**: every model with `reasoning` set has `maxOutput ≥ 16_000`.
  Institutionalizes the incident lesson: a reasoning-capable model with a small output
  budget dies mid-thought before emitting a tool call.

### Gate 3 — Tool inventory ↔ settings metadata classification
Enumerate the real server tool names by **source-scanning** the four factory files for
`name: tool({` definitions (instantiating the factories is off the table: their import
graph reaches `lib/domain/editor/extensions-server.ts`, which is not tsx-safe — the
same constraint validate-markdown-block-safety.ts documents; scanning also keeps the
script free of Prisma/env, so the CI job needs no database). Add the client-executed
tool name constants and `search_web`. Then require every tool to be classified exactly
one way:
- in `ALL_TOOL_IDS` (user-configurable, settings UI), or
- in `HARNESS_INTERNAL_TOOL_IDS` (new export in tools/metadata.ts: loop-critical tools
  the user must not be able to disable — record_item_result, phase plumbing, etc.).
Failures: unclassified tool (forces a decision on every new tool), stale id in either
list, or an id in both.
- **Factory-coverage cross-check**: source-scan route.ts's `allTools` literal for
  `...create*Tools(` spreads and `[CONSTANT]:` registrations; assert the script
  assembled from the same factories/constants. Keeps the gate itself from going stale
  when a new tool module is added to the route.

### Gate 4 — Prompt/description tool-name references resolve
Build the full system prompt with every capability flag on (the proven
validate-prompt-cache pattern) and concatenate all tool descriptions. Extract
tool-shaped tokens (snake_case with ≥1 underscore, plus the known camelCase ids);
every one must be a defined tool name or in a reviewed non-tool allowlist seeded during
implementation. Catches the "renamed the tool, prose still says `read_page`" class —
tool descriptions routinely steer models to OTHER tools by name, so a stale name
actively misroutes weak models.

### Gate 5 — Adapter coverage
Every distinct `adapterKind` used by a template has a `case "<kind>"` in
`resolveChatModelFromConnection` (source-scan providers/registry.ts). A template whose
adapter has no branch can render in settings but never instantiate a model.

## Live drift this PR fixed to land green (33 findings on the gate's first run)

| Drift | Fix |
|---|---|
| `claude-haiku-4-5` in template, absent from catalog | added catalog entry |
| `mistral-large-latest` / `codestral-latest` (template) vs `mistral-large` / `codestral` (catalog) | added direct-API-id entries; kept legacy ids (MODEL_MAP/AIModelId still resolve them) |
| `mixtral-8x7b-32768` / `llama-3.3-70b-versatile` (template) vs `mixtral-8x7b` / `llama-3.3-70b` (catalog) | same |
| gemini-2.5-pro contextWindow 1M (catalog) vs 2M (google template, vercel-gateway, openrouter) | normalized to 1M (documented GA figure) |
| grok-3 AND grok-3-mini contextWindow 131_072 (catalog) vs 128_000 (template) | normalized to 131_072 (xAI documented) |
| gateway `groq/llama-3.3-70b-versatile` 131_072 vs Groq's 128_000 | normalized to 128_000 |
| `propose_sound_id_cards` / `propose_cards_from_media` defined in flashcard-tools but missing from FLASHCARD_TOOL_METADATA — invisible in settings while their siblings are toggleable | added metadata entries (user-configurable) |
| catalog header still said "display-only" (stale since #156) | fixed comment |
| no harness-internal classification existed | added `HARNESS_INTERNAL_TOOL_IDS` (13 tools: research trio, iteration quartet, six browser/co-browse client tools) |

## Wiring

- `package.json`: `"ai:drift:check": "tsx scripts/validate-ai-drift.ts"`, inserted in the
  `build` chain after `model-routing:check`.
- `.github/workflows/ai-drift.yml`: pull_request paths `lib/domain/ai/**`,
  `lib/features/ai-connections/**`, `lib/features/settings/validation.ts`,
  `app/api/ai/chat/**`, `scripts/validate-ai-drift.ts`, lockfiles; push on main.
  Steps: checkout → pnpm → node → install → `prisma generate` → `ai:drift:check`
  (script imports the tool registry, which imports the generated Prisma client at
  module scope; a dummy `DATABASE_URL` env satisfies the constructor — no query ever
  runs).
- CLAUDE.md: command list + CI gates bullet.
- STATUS.md / CURRENT-SPRINT.md per convention.

## Non-goals

- No runtime behavior changes (this PR is checks + data reconciliation only).
- No gating of `buildProviderOptions` branch coverage per reasoning vendor — o3-mini
  ("auto", no branch) is deliberate; "reasoning implies a vendor branch" is not an
  invariant.
- No warn-tier output. Binary gates only; warn lists rot (publishing:audit:themes'
  triage burden is the cautionary example).
