# Cost Metering — Plan

**Branch:** `AI-sys-improve/cost-metering` (stacked on `feat/ai-harness-reliability` — must merge after it)
**Status:** IMPLEMENTED (P1–P4, 2026-08-08) — owner smoke + per-provider usage-semantics verification pending
**Drafted:** 2026-08-08

**Implementation deviations from the plan below:**
1. `estimateCost()` was deleted outright (not kept as a deprecated wrapper) — `telemetry.ts` migrated to `computeTurnCost` in the same change, so no compat window was needed.
2. The conversation-header cumulative-spend line is deferred: `ConversationDetail.spend` ships in the API (summed persisted costs + unpriced count), but no header UI consumes the detail response today — building that surface belongs with the `inspector` sibling rather than a one-off element here.
3. The avatar tooltip prices live/legacy turns at current rates as a fallback (labeled "(current rates)") instead of leaving legacy turn footers blank — uniform display, honesty preserved via the label.
**Sibling work:** `AI-sys-improve/self-describing-turns` (segment records) and `AI-sys-improve/inspector` (run inspector) extend the same accumulator seam; see [Coordination](#coordination-with-sibling-branches).

## Goal

Make the dollar cost of AI usage visible where decisions happen: per turn in the chat, per run in the iteration ledger, per conversation, and per connection in settings — for **OpenAI, Anthropic, Google, DeepSeek, and Moonshot (Kimi)**. The motivating incident: a single job-screening playbook run on Sonnet 4.5 cost ~$1, discovered only on the provider invoice. Cost must be readable off the run, not the bill.

**Non-goals (v1):** budget *enforcement* (that's roadmap item 3.7 — this work is its metering prerequisite), provider invoice reconciliation, DeepSeek off-peak discount windows, batch pricing, speech/image/transcribe cost (chat turns only), multi-currency.

## What already exists (extend, don't duplicate)

The repo already has a per-Connection usage subsystem in `lib/features/ai-connections/usage/`:

| Piece | File | State |
|---|---|---|
| Price table + `estimateCost()` | `usage/pricing.ts` | **A generation stale** (Claude Opus 4 at $15/$75; no Opus 4.6+/Sonnet 5, no DeepSeek, no Kimi, no current OpenAI/Gemini lineup). Input/output rates only. Unknown model → cost `0`. Exact-id + namespace-strip matching only. |
| Telemetry aggregator | `usage/telemetry.ts` | Recomputes cost **at read time** from the stale table; attributes messages to Connections by heuristic (direct presetId, then namespaced); carries a "usage capture isn't wired yet" note that is now obsolete. |
| Provider billing adapters | `usage/gateway.ts` | OpenRouter (`GET /api/v1/key`) and Vercel Gateway are authoritative; Anthropic/Google documented null adapters. Untouched by this plan. |
| Report types | `usage/types.ts` | `UsageReport` / `ModelUsageRow` / `UsageBudget` with an honesty `source` field. Good as-is. |
| Surfaces | `components/settings/ConnectionUsageCard.tsx`, `app/api/ai/connections/[id]/usage/route.ts` | Per-connection meters in settings. |

And the reliability branch (`feat/ai-harness-reliability`) just landed the **write-side prerequisite** this plan builds on:

- `mergeTurnUsageMetadata()` in `lib/domain/ai/use-conversation-binding.ts:129` — per-turn accumulator summing `inputTokens / outputTokens / totalTokens / reasoningTokens / cachedInputTokens / durationMs / requestCount` across every HTTP request of a multi-request turn, with terminal `finishReason` and an idempotency signature. Persisted into `ConversationMessage.metadata`.
- The chat route's `messageMetadata` finish blob (`app/api/ai/chat/route.ts` ~2275) now carries `usage` (incl. `reasoningTokens`, `cachedInputTokens`), `durationMs`, `finishReason`, and `modelRoute` (`providerId`, `modelId`, `connectionId`, `source`).
- `PROVIDER_CATALOG` gained DeepSeek entries; per-model output ceilings replaced the flat 4096 cap.

This plan = **pricing engine v2 + persist-cost-at-write + read-side upgrades + a CI gate**, all inside the existing subsystem.

## Design decisions

1. **Persist cost at write time, stamped with a price version.** Prices change (e.g. Sonnet 5's intro pricing ends 2026-08-31). A turn priced today must still report today's price next year. The turn's metadata blob gains a `cost` object computed at the accumulator merge; read-side aggregation **sums persisted costs** and only recomputes for legacy rows that predate this feature (labeled "estimated at current rates").
2. **Unpriced is a first-class state — never $0.** `estimateCost()`'s return-0 contract caused silent under-reporting. The v2 calculator returns `null` for unknown models; every surface renders an explicit "unpriced" state naming the model id, which doubles as the signal to add a catalog entry.
3. **Estimates, not billing.** All figures are list-price estimates from local telemetry. The existing `source: "telemetry" | "provider-api" | "hybrid"` honesty signal stays; per-turn figures carry an "estimated" affordance. OpenRouter/Gateway connections keep their authoritative provider-api numbers.
4. **The calculator is pure and client-safe.** `usage/pricing.ts` already imports nothing server-only — keep it that way (ChatMessage will import it). Import it **directly by path**, never via the `ai-connections` barrel (`index.ts` re-exports `service.ts`, which has Prisma — the known barrel→client Prisma-leak footgun).
5. **Family-prefix matching is required, not optional.** Moonshot ships zero seeded model ids (account-volatile: `kimi-k2.6`, `kimi-k3`, `kimi-k2.7-code` observed) and "Fetch from API" models carry no capabilities. Exact-id tables cannot price them; the matcher needs an ordered longest-prefix rule set.

## Pricing engine v2 (`lib/features/ai-connections/usage/pricing.ts`)

### Types

```ts
export interface ModelPrice {
  inputPer1M: number;           // for hit/miss-priced providers (DeepSeek, Kimi) this is the cache-MISS rate
  outputPer1M: number;          // reasoning/thinking tokens bill as output on all five vendors (verified OpenAI/Google; task: verify Kimi)
  cachedInputPer1M?: number;    // cache READ / hit rate; absent → cached tokens bill at inputPer1M
  cacheWritePer1M?: number;     // cache WRITE premium (Anthropic 1.25×; OpenAI gpt-5.6 family); absent → no write charge
  longContext?: {               // tiered pricing above a per-REQUEST input threshold (OpenAI gpt-5.6 >272K; Gemini Pro >200K)
    thresholdTokens: number;
    inputPer1M: number;
    outputPer1M: number;
    cachedInputPer1M?: number;
    cacheWritePer1M?: number;
  };
  asOf: string;                 // "2026-08-08" — when this row was verified
  note?: string;                // e.g. "intro pricing through 2026-08-31"
}
```

`PRICING_VERSION` (a date string, bumped whenever the table changes) is exported and stamped into every persisted cost.

### Matching ladder (`priceFor(modelId)` v2)

1. Exact id (`"deepseek-v4-flash"`).
2. Namespace-stripped exact (`"anthropic/claude-sonnet-5"` → `"claude-sonnet-5"`).
3. **Family prefix rules** — ordered, longest-first, e.g. `"kimi-k2.6"` matches ids `kimi-k2.6`, `kimi-k2.6-turbo`, `kimi-k2.6-1120`; `"claude-sonnet-4-5"` catches dated snapshots. Rules live beside the table as `PRICING_PREFIX_RULES: Array<{ prefix: string; use: keyof typeof MODEL_PRICING }>`.
4. Miss → `null` (never a guess across families).

### Calculator

```ts
export interface TurnCost {
  usd: number;
  priceVersion: string;
  breakdown: { input: number; cachedInput: number; cacheWrite: number; output: number };
  estimated: true;              // literal — every telemetry cost is an estimate
}
export function computeTurnCost(
  usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number },
  modelId: string | null | undefined,
): TurnCost | null;
```

Formula: `(input − cachedInput) × inputRate + cachedInput × (cachedRate ?? inputRate) + cacheWrite × (writeRate ?? 0) + output × outputRate`, all `/1M`, clamped at ≥0. When `longContext` is present and the **request's** input tokens exceed `thresholdTokens`, the tier's rates apply to the whole request (OpenAI semantics; Gemini matches closely enough for estimates).

**Cost is computed per request snapshot and accumulated — never from turn totals.** A multi-request turn sums input tokens across requests; pricing the sum would falsely trip long-context thresholds (five 60K-input requests ≠ one 300K request). So `TurnUsageAccum` gains `costUsd` + breakdown fields folded per request in `mergeTurnUsageMetadata`, exactly like the token fields. This also makes per-segment cost free for the `self-describing-turns` sibling.

`estimateCost()` stays as a deprecated thin wrapper over `computeTurnCost` until `telemetry.ts` migrates, then dies.

### ⚠ Usage-field semantics must be verified per provider (implementation task, not assumption)

The AI SDK normalizes usage, but **what `inputTokens` includes relative to `cachedInputTokens` differs by provider adapter** (OpenAI's `prompt_tokens` includes cached; DeepSeek reports hit/miss separately; Anthropic's cache-write tokens surface only in `providerMetadata`, not standard usage). Before wiring the formula:

- Record one real turn per provider (all five) with caching active; assert which fields sum to the provider's billed figure.
- Capture Anthropic `cacheCreationInputTokens` from `providerMetadata` into the route's `usage` blob as `cacheWriteTokens` (route `messageMetadata` finish branch), and thread it through `readUsageSnapshot`/`TurnUsageAccum` in the accumulator.
- Document the verified semantics in a comment block at the top of `pricing.ts`.

### Seed price table (verify each row at implementation time; `asOf` dates mandatory)

Anthropic rates verified 2026-08-08 against current API docs:

| Model (family key) | In $/1M | Out $/1M | Cached-in $/1M | Cache-write | Note |
|---|---|---|---|---|---|
| `claude-fable-5` | 10.00 | 50.00 | ~0.1× in | 1.25× in (5m TTL) | |
| `claude-opus-5` / `-4-8` / `-4-7` / `-4-6` | 5.00 | 25.00 | ~0.1× in | 1.25× in | |
| `claude-sonnet-5` | 3.00 | 15.00 | ~0.1× in | 1.25× in | intro $2/$10 through 2026-08-31 |
| `claude-sonnet-4-6` / `-4-5` | 3.00 | 15.00 | ~0.1× in | 1.25× in | |
| `claude-haiku-4-5` | 1.00 | 5.00 | ~0.1× in | 1.25× in | |

OpenAI — verified 2026-08-08 against [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing). Reasoning tokens bill as output (verified verbatim in their reasoning guide). Cache writes billed only on the gpt-5.6 family. Long-context tier >272K input (threshold is corroborated-secondary, not printed on the pricing page — re-verify at implementation):

| Model (family key) | In $/1M | Cached-in | Cache-write | Out $/1M | Long-ctx (>272K) |
|---|---|---|---|---|---|
| `gpt-5.6-sol` | 5.00 | 0.50 | 6.25 | 30.00 | in 10 / out 45 |
| `gpt-5.6-terra` | 2.00 | 0.20 | 2.50 | 12.00 | in 4 / out 18 |
| `gpt-5.6-luna` | 0.20 | 0.02 | 0.25 | 1.20 | in 0.40 / out 1.80 |
| `gpt-5.5` | 5.00 | 0.50 | — | 30.00 | — |
| `gpt-5.4` | 2.50 | 0.25 | — | 15.00 | — |
| `gpt-5.4-mini` | 0.75 | 0.075 | — | 4.50 | — |
| `gpt-5.1` / `gpt-5` | 1.25 | 0.125 | — | 10.00 | — |
| `gpt-5-mini` | 0.25 | 0.025 | — | 2.00 | — |
| `gpt-4o` | 2.50 | 1.25 | — | 10.00 | — |
| `gpt-4o-mini` | 0.15 | 0.075 | — | 0.60 | — |

Google Gemini — verified 2026-08-08 against [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing). Thinking tokens bill as output. **Context-cache *storage* ($/1M/hr) is time-based and excluded from estimates** (tooltip note on Gemini rows). Long-context tier >200K on Pro models only:

| Model (family key) | In $/1M | Cached-in | Out $/1M | Long-ctx (>200K) |
|---|---|---|---|---|
| `gemini-3.6-flash` | 1.50 | 0.15 | 7.50 | — |
| `gemini-3.5-flash` | 1.50 | 0.15 | 9.00 | — |
| `gemini-3.5-flash-lite` | 0.30 | 0.03 | 2.50 | — |
| `gemini-3.1-pro-preview` | 2.00 | 0.20 | 12.00 | in 4 / out 18 |
| `gemini-2.5-pro` | 1.25 | 0.125 | 10.00 | in 2.50 / out 15 |
| `gemini-2.5-flash` | 0.30 | 0.03 | 2.50 | — |
| `gemini-2.5-flash-lite` | 0.10 | 0.01 | 0.40 | — |

DeepSeek — verified 2026-08-08 against [api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing). Input rates are cache-**miss**; `cachedInputPer1M` is the cache-**hit** rate (usage fields: `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens`). Thinking and non-thinking modes cost the same. ⚠ Official page carries a notice that a "significant" price increase is expected — expect an early `PRICING_VERSION` bump. Legacy `deepseek-chat`/`deepseek-reasoner` aliases retired 2026-07-24:

| Model (family key) | In (miss) $/1M | Cached-in (hit) | Out $/1M |
|---|---|---|---|
| `deepseek-v4-flash` | 0.14 | 0.0028 | 0.28 |
| `deepseek-v4-pro` | 0.435 | 0.003625 | 0.87 |

Moonshot / Kimi — verified 2026-08-08 against [platform.kimi.ai](https://platform.kimi.ai/docs/pricing/chat-k3) (platform.moonshot.ai now redirects there). Same hit/miss shape as DeepSeek; caching is automatic, no write fees. These are the **family-prefix rows** the matching ladder exists for (account model ids are volatile). `moonshot-v1` classic series sunsets 2026-08-31 — goes straight to the `UNPRICED_MODELS` allowlist:

| Family prefix | In (miss) $/1M | Cached-in (hit) | Out $/1M |
|---|---|---|---|
| `kimi-k3` | 3.00 | 0.30 | 15.00 |
| `kimi-k2.7-code-highspeed` | 1.90 | 0.38 | 8.00 |
| `kimi-k2.7-code` | 0.95 | 0.19 | 4.00 |
| `kimi-k2.6` | 0.95 | 0.16 | 4.00 |

(Note the prefix-rule ordering requirement visible right here: `kimi-k2.7-code-highspeed` must sort before `kimi-k2.7-code` — longest-first is load-bearing.)

## Write path: cost lands in the turn metadata

**Site:** the return blob of `mergeTurnUsageMetadata()` (`use-conversation-binding.ts:158`). After folding the request snapshot, one added pure call:

```ts
// Inside the fold (per request snapshot, guarded by the existing lastRequestSig idempotency):
const requestCost = computeTurnCost(request, stampedModelId);  // stamp from incoming metadata.modelRoute ?? getMessageStamp fallback
if (requestCost) { entry.costUsd += requestCost.usd; /* + breakdown fields */ } else { entry.unpriced = true; }
// In the returned blob:
cost: entry.unpriced ? { unpriced: true, modelId } : { usd: entry.costUsd, priceVersion, breakdown, estimated: true }
```

- Per-request accumulation (see the tier-correctness rationale above) rides the existing `lastRequestSig` guard, so repeat persist passes can't double-count dollars any more than tokens.
- The blob is already persisted (and re-PATCHed per request) by the binding's persist path — no new persistence machinery.
- Unpriced turns persist `{ unpriced: true, modelId }` so the read side can count and surface coverage gaps.

## Read path upgrades

1. **`telemetry.ts`:** prefer persisted `metadata.cost.usd` when present; recompute via `computeTurnCost` only for legacy rows (pre-feature) and mark the report `note` accordingly. Upgrade attribution to use `metadata.modelRoute.connectionId` when present (exact) before falling back to the heuristic. Add cached/reasoning token columns to `ModelUsageRow.tokens`. Delete the obsolete "usage capture isn't wired yet" note path.
2. **Conversation cumulative:** `GET /api/conversations/[id]` response gains `costUsd` (sum of visible assistant messages' persisted costs + `unpricedCount`). Rendered as a small line in the chat panel header menu.
3. **Run ledger:** the iteration reconciliation entry (`record_iteration_findings`, `lib/domain/ai/tools/registry.ts` — currently records `tokensSoFar`) gains `~$X.XX estimated` computed via `computeTurnCost` with the run's executed model. Server-side import of the pure pricing module is fine.

## UI surfaces

- **Turn footer (ChatMessage):** appended to the existing usage/duration meta row — `· ~$0.0123` with a tooltip breakdown (input / cached / output / price version). Unpriced: `· cost n/a` with tooltip "No price entry for deepseek-v4-flash — figures unavailable".
- **ConnectionUsageCard:** no layout change; numbers become persisted-cost-backed, the "pending wiring" help-text disappears, and rows gain the cached-token column.
- **Conversation header menu:** cumulative line, e.g. `Estimated spend: $0.84 (2 turns unpriced)`.

## Chips & traceability

Per the standing convention every AI plan documents chip UX — live states and the durable trace:

**Live state machine (per assistant turn):**

```
streaming ──finish──▶ priced          (metadata.cost.usd present)
      │                  ▲
      │                  │ merge pass (multi-request turns re-PATCH; value may grow per request)
      └──finish──▶ unpriced           (metadata.cost.unpriced — model missing from catalog)
history row (pre-feature) ──▶ legacy-estimated   (no cost blob; read-side computes at current rates)
```

- **priced** — `~$0.0123` in the meta row; tooltip: breakdown + `priceVersion` + "estimated at list prices".
- **unpriced** — explicit `cost n/a`; tooltip names the model id. Never rendered as $0.
- **legacy-estimated** — aggregate surfaces only (turn footers stay blank for legacy rows); reports carry a note "N older turns estimated at current rates".
- **Mid-turn growth is expected**: a multi-request turn's cost climbs as each HTTP request folds in — the chip re-renders from the re-PATCHed metadata; no separate optimistic state.

**Durable trace:** the `cost` object lives in `ConversationMessage.metadata` beside `usage` — visible in the transcript forever, immune to later price-table edits (that's what `priceVersion` pins), and readable by the sibling inspector branch with zero coupling.

**Failure/stale states:** calculator throw → cost omitted entirely (turn still persists; never block persistence on pricing). Price-table drift → handled by `asOf` per row + the CI gate below; persisted history is unaffected by drift.

## CI gate + fixtures: `pnpm ai:pricing:check`

`scripts/check-ai-pricing.ts`, wired into `build` beside `model-routing:check`:

1. **Coverage:** every model id in every connection template's `defaultModels` **and** every `PROVIDER_CATALOG` entry resolves through `priceFor()` (exact/namespace/prefix) **or** appears in an explicit `UNPRICED_MODELS` allowlist with a reason string. Miss → hard fail naming the id.
2. **Calculator fixtures:** assert `computeTurnCost` against hand-computed expectations for ≥1 fixture per provider (including a cached-tokens case and an unpriced case). This is the repo's unit-test-via-check-script pattern.
3. **Sanity:** every `ModelPrice` row has a plausible shape (`0 < input ≤ output×2` warning-level, `asOf` parseable).

## Phases

| Phase | Scope | Gate |
|---|---|---|
| **P1 — Engine** | pricing.ts v2 (types, ladder, version, calculator, seed table for 5 vendors), semantics verification per provider, cacheWrite capture in route + accumulator snapshot | `ai:pricing:check` green; typecheck/lint |
| **P2 — Write path** | cost in `mergeTurnUsageMetadata` blob; ChatMessage turn footer + states | owner smoke: one turn per provider shows a plausible figure; DeepSeek turn ≠ $0 |
| **P3 — Read path** | telemetry.ts persisted-cost preference + connectionId attribution; conversation cumulative; ledger reconciliation cost | ConnectionUsageCard shows persisted-backed figures; ledger line renders |
| **P4 — Gate + docs** | wire `ai:pricing:check` into `build`; CLAUDE.md gate list; STATUS.md | full `pnpm build` green |

## Coordination with sibling branches

- **`self-describing-turns`** extends the same `mergeTurnUsageMetadata` return blob with segment records. Cost's footprint there is deliberately one pure call + one spread key, so either branch rebases over the other trivially. If segments land first, per-segment cost is a natural follow-up (`computeTurnCost` already accepts a single request snapshot).
- **`inspector`** reads message metadata verbatim — the persisted `cost` blob appears there for free; no work item on this branch.
- Merge order: `feat/ai-harness-reliability` → (either sibling) → this branch rebases before PR.

## Risks / open questions (owner input welcome)

1. **Usage-semantics verification could shift the formula** (see ⚠ above) — budgeted as a P1 task, not assumed away.
2. **Intro/promotional pricing** (Sonnet 5 through 2026-08-31): table takes the *current billed* rate with a `note` + `asOf`; bump `PRICING_VERSION` when it lapses. Acceptable drift for an estimates feature?
3. **DeepSeek pricing is a moving target**: the old off-peak discount died with the V3/R1 aliases (no current off-peak on the official page — nothing to model), but the official page warns of a "significant" upcoming price increase, and third parties report a possible peak-hour *surcharge* (unverified). The `asOf`/`PRICING_VERSION` design absorbs this; expect an early version bump.
4. **Gateway-routed turns** (Vercel Gateway/OpenRouter namespaced ids): priced by underlying-model family via the ladder; the per-connection card already prefers the gateway's own authoritative numbers, so double-reporting is avoided by keeping `source` precedence as-is.
5. **Speech/TTS/image endpoints** spend real money and are unmetered — follow-up item for BACKLOG, not this branch.
