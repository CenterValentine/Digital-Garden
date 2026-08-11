/**
 * Cost-metering pricing gate (COST-METERING-PLAN.md).
 *
 * Run with: pnpm ai:pricing:check
 *
 * Three layers:
 *   1. COVERAGE — every model id a user can reach without typing one by
 *      hand (connection-template defaults + the provider catalog) must
 *      resolve to a price row OR be on the explicit unpriced allowlist.
 *      A miss means a turn would silently render "cost n/a" for a model
 *      we ship — add a price row or an allowlist entry with a reason.
 *   2. TABLE INTEGRITY — price rows are plausibly shaped; prefix rules
 *      point at real rows and are ordered longest-first (load-bearing:
 *      the first matching prefix wins).
 *   3. CALCULATOR FIXTURES — hand-computed expectations for the cost
 *      formula across provider semantics (includes-cached vs Anthropic
 *      excludes-cached), cache writes, long-context tiers, hit/miss
 *      pricing, prefix matching, and the null-not-zero unpriced contract.
 */

import assert from "node:assert/strict";
import {
  MODEL_PRICING,
  PRICING_PREFIX_RULES,
  PRICING_VERSION,
  computeTurnCost,
  formatUsdEstimate,
  isKnownUnpriced,
  priceFor,
  readPersistedCost,
} from "../lib/features/ai-connections/usage/pricing";
import { CONNECTION_TEMPLATES } from "../lib/features/ai-connections/templates";
import { PROVIDER_CATALOG } from "../lib/domain/ai/providers/catalog";

let checks = 0;
const ok = (label: string) => {
  checks += 1;
  console.log(`  ✓ ${label}`);
};

// ── 1. coverage ───────────────────────────────────────────────────────────

console.log("coverage:");
const uncovered: string[] = [];
const seen = new Set<string>();

for (const template of CONNECTION_TEMPLATES) {
  for (const model of template.defaultModels) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    if (!priceFor(model.id) && !isKnownUnpriced(model.id)) {
      uncovered.push(`${template.id}: ${model.id}`);
    }
  }
}
for (const provider of PROVIDER_CATALOG) {
  for (const model of provider.models) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    if (!priceFor(model.id) && !isKnownUnpriced(model.id)) {
      uncovered.push(`catalog/${provider.id}: ${model.id}`);
    }
  }
}
assert.deepEqual(
  uncovered,
  [],
  `Models without a price row or unpriced-allowlist entry:\n  ${uncovered.join(
    "\n  ",
  )}\nAdd a MODEL_PRICING row (with asOf), a PRICING_PREFIX_RULES rule, or an UNPRICED entry with a reason.`,
);
ok(`${seen.size} reachable model ids priced or explicitly unpriced`);

// ── 2. table integrity ────────────────────────────────────────────────────

console.log("table integrity:");
for (const [id, row] of Object.entries(MODEL_PRICING)) {
  assert.ok(
    Number.isFinite(row.inputPer1M) && row.inputPer1M >= 0,
    `${id}: bad inputPer1M`,
  );
  assert.ok(
    Number.isFinite(row.outputPer1M) && row.outputPer1M >= 0,
    `${id}: bad outputPer1M`,
  );
  assert.ok(row.asOf.length > 0, `${id}: missing asOf`);
  if (row.longContext) {
    assert.ok(
      row.longContext.thresholdTokens > 0,
      `${id}: longContext threshold must be > 0`,
    );
    assert.ok(
      row.longContext.inputPer1M >= row.inputPer1M,
      `${id}: long-context input rate below base rate — check the row`,
    );
  }
}
ok(`${Object.keys(MODEL_PRICING).length} price rows well-formed`);

for (const rule of PRICING_PREFIX_RULES) {
  assert.ok(
    MODEL_PRICING[rule.use],
    `prefix rule "${rule.prefix}" points at missing row "${rule.use}"`,
  );
}
// Longest-first ordering: if rule B's prefix extends rule A's prefix, B
// must appear BEFORE A (else A shadows B forever).
for (let i = 0; i < PRICING_PREFIX_RULES.length; i++) {
  for (let j = i + 1; j < PRICING_PREFIX_RULES.length; j++) {
    const earlier = PRICING_PREFIX_RULES[i].prefix;
    const later = PRICING_PREFIX_RULES[j].prefix;
    assert.ok(
      !later.startsWith(earlier) || later === earlier,
      `prefix rule ordering: "${later}" is shadowed by earlier "${earlier}" — longest-first is load-bearing`,
    );
  }
}
ok(`${PRICING_PREFIX_RULES.length} prefix rules valid and longest-first`);

assert.match(PRICING_VERSION, /^\d{4}-\d{2}-\d{2}$/);
ok(`PRICING_VERSION "${PRICING_VERSION}" is a date`);

// ── 3. calculator fixtures ────────────────────────────────────────────────

console.log("calculator fixtures:");
const approx = (actual: number, expected: number, label: string) => {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${label}: expected ${expected}, got ${actual}`,
  );
  ok(label);
};

// Anthropic semantics: inputTokens EXCLUDES cache activity. opus-5 @ 5/25,
// cached 0.5, write 6.25.
{
  const c = computeTurnCost(
    {
      inputTokens: 1000,
      cachedInputTokens: 2000,
      cacheWriteTokens: 500,
      outputTokens: 300,
    },
    "claude-opus-5",
    "anthropic",
  );
  assert.ok(c, "anthropic fixture priced");
  approx(
    c.usd,
    (1000 * 5 + 2000 * 0.5 + 500 * 6.25 + 300 * 25) / 1_000_000,
    "anthropic: uncached-input semantics + cache write",
  );
  assert.equal(c.priceVersion, PRICING_VERSION);
}

// OpenAI semantics: inputTokens INCLUDES cached. terra @ 2/12, cached 0.2.
{
  const c = computeTurnCost(
    { inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 1_000 },
    "gpt-5.6-terra",
    "openai",
  );
  assert.ok(c, "openai fixture priced");
  approx(
    c.usd,
    (6_000 * 2 + 4_000 * 0.2 + 1_000 * 12) / 1_000_000,
    "openai: includes-cached semantics",
  );
}

// Long-context tier: terra above 272K bills the whole request at tier rates.
{
  const c = computeTurnCost(
    { inputTokens: 300_000, outputTokens: 1_000 },
    "gpt-5.6-terra",
    "openai",
  );
  assert.ok(c, "long-context fixture priced");
  approx(
    c.usd,
    (300_000 * 4 + 1_000 * 18) / 1_000_000,
    "openai: >272K request bills at long-context tier",
  );
}

// DeepSeek hit/miss: input = total prompt, cached = hits at the hit rate,
// misses at the miss rate.
{
  const c = computeTurnCost(
    { inputTokens: 100_000, cachedInputTokens: 80_000, outputTokens: 5_000 },
    "deepseek-v4-flash",
    "deepseek",
  );
  assert.ok(c, "deepseek fixture priced");
  approx(
    c.usd,
    (20_000 * 0.14 + 80_000 * 0.0028 + 5_000 * 0.28) / 1_000_000,
    "deepseek: hit/miss cache pricing",
  );
}

// Kimi volatile ids resolve via family prefix.
{
  const c = computeTurnCost(
    { inputTokens: 50_000, outputTokens: 2_000 },
    "kimi-k2.6-1120",
    "moonshot",
  );
  assert.ok(c, "kimi prefix fixture priced");
  approx(
    c.usd,
    (50_000 * 0.95 + 2_000 * 4) / 1_000_000,
    "kimi: account-volatile id matches family prefix",
  );
  assert.ok(
    priceFor("kimi-k2.7-code-highspeed-0630")?.outputPer1M === 8,
    "kimi: highspeed prefix wins over plain k2.7-code",
  );
  ok("kimi: longest prefix wins");
}

// Gateway-namespaced ids strip to the underlying model.
{
  const c = computeTurnCost(
    { inputTokens: 10_000, outputTokens: 500 },
    "anthropic/claude-sonnet-4-6",
    "anthropic",
  );
  assert.ok(c, "namespaced fixture priced");
  approx(
    c.usd,
    (10_000 * 3 + 500 * 15) / 1_000_000,
    "gateway: namespaced id prices as underlying model",
  );
}

// Unpriced contract: null, never zero.
{
  assert.equal(
    computeTurnCost({ inputTokens: 1000, outputTokens: 100 }, "totally-unknown-model"),
    null,
  );
  ok("unknown model → null (never $0)");
  assert.equal(isKnownUnpriced("moonshot-v1-8k"), true);
  assert.equal(isKnownUnpriced("deepseek-chat"), true);
  assert.equal(isKnownUnpriced("claude-opus-5"), false);
  ok("unpriced allowlist matches exact ids and prefixes");
}

// Persisted-cost reader: priced blobs read back; unpriced blobs are null.
{
  assert.deepEqual(
    readPersistedCost({ usd: 0.5, priceVersion: "2026-08-08", estimated: true }),
    { usd: 0.5, priceVersion: "2026-08-08" },
  );
  assert.equal(readPersistedCost({ unpriced: true }), null);
  assert.equal(readPersistedCost(undefined), null);
  assert.equal(readPersistedCost({ usd: Number.NaN }), null);
  ok("readPersistedCost narrows correctly");
}

// Formatting.
{
  assert.equal(formatUsdEstimate(1.234), "$1.23");
  assert.equal(formatUsdEstimate(0.042), "$0.042");
  assert.equal(formatUsdEstimate(0.0004), "<$0.001");
  assert.equal(formatUsdEstimate(0), "$0.00");
  ok("formatUsdEstimate bands");
}

console.log(`\nai:pricing:check PASS (${checks} checks)`);
