# AI v3.2.2 — Prompt-cache foundation

**Branch/worktree:** `codex/ai-v3.2.2-prompt-cache-foundation`
(`ai-v3.2.2-prompt-cache-foundation`), from `origin/main` after PR #128.

**Owner direction (2026-07-23):** begin with the low-risk portion of provider
prompt caching: make existing automatic GPT caching easier to hit, make its
economics observable, and prepare playbook phases for reuse across separate
runs. Do not turn on paid cache writes or introduce a cache-management UI yet.

## 1. What this revision does

### P1 — Stable OpenAI cache keys ✅ BUILT

- `lib/domain/ai/prompt-cache.ts` owns the provider policy instead of scattering
  cache options through the chat route.
- Supported OpenAI families receive `providerOptions.openai.promptCacheKey`.
  Legacy `gpt-4` and non-OpenAI providers remain untouched.
- Keys are opaque hashes. They include the user boundary, executed model, sorted
  final toolset, policy version, and—when present—the validated playbook plus its
  rendered active-phase context.
- Conversation and run IDs are deliberately excluded. Separate runs of the same
  unchanged playbook phase can therefore converge on the same provider cache.
- Playbook edits, phase changes, model changes, tool-contract changes, or user
  changes rotate the key naturally.

### P2 — Provider-neutral cache telemetry ✅ BUILT

- AI SDK's normalized `inputTokenDetails` now reaches the existing chat stream
  span as:
  - `cache_read_tokens`
  - `cache_write_tokens`
  - `cache_uncached_tokens`
  - `cache_hit_rate`
- Span setup records whether the policy was enabled, its scope (`general` or
  `playbook`), and its version.
- The replay sidecar records policy metadata but not the provider cache key.
  Keys are opaque already, but they are operational routing material rather than
  useful replay input.

### P3 — Cross-run playbook prefix ordering ✅ BUILT

The system prompt now orders context as:

1. stable Digital Garden/tool/playbook operating rules;
2. validated Active Playbook standing rules + active phase;
3. rooted-content identity and ambient awareness;
4. current date;
5. selected output target, custom context, mentions;
6. untrusted page content last.

This preserves instruction behavior while keeping the reusable procedure ahead
of run-specific subject and destination details. Progressive disclosure remains
the semantic boundary: each active phase receives a different cache identity.

## 2. What this revision does not do

- No Anthropic `cache_control`; that creates billable cache writes.
- No Google explicit `cachedContent` resource lifecycle.
- No OpenAI retention override. GPT-4o does not expose a guaranteed one-hour
  TTL; a stable key improves routing, not lifetime.
- No GPT-5.6 explicit breakpoints. The currently installed OpenAI adapter
  exposes cache keys and legacy retention but not the newer breakpoint/options
  contract.
- No semantic/result caching. Research findings, citations, tool outputs, and
  artifacts remain normal run data and are never treated as a provider prompt
  cache.
- No user-facing savings estimate until real cache-read/write measurements
  establish the workload shape.

## 3. Regression contract

`pnpm prompt-cache:check` proves:

- identical playbook phases across separate run-equivalent inputs get the same
  key regardless of tool registration order;
- edited playbooks, different phases, users, models, and toolsets rotate or
  disable the key correctly;
- legacy GPT-4 and non-OpenAI providers are not opted in;
- reasoning and cache provider options merge without overwriting each other;
- normalized read/write/uncached counts and hit rate remain correct;
- Active Playbook context appears before all run-specific prompt markers, with
  untrusted page content still last.

The check is part of the local production-build pipeline.

## 4. Durable lessons

1. **A cache key is a routing hint, not permission to reuse different text.**
   Exact prompt-prefix matching remains the correctness boundary.
2. **Cache identity describes reusable instructions, not a run.** Including a
   conversation ID would defeat cross-run playbook reuse.
3. **Telemetry precedes paid cache policy.** Cache-write TTLs should be enabled
   only after observed reuse cadence proves their break-even case.
4. **Prompt ordering is product architecture.** Stable rules and procedures go
   first; user/run/page variability goes last.
5. **Provider prompt caching is not memory.** It reduces repeated prefill cost
   and latency but never substitutes old findings for fresh model/tool work.

## 5. Deferred 3.2.2 followups

- Compare actual cache hit rates and cached-input savings by provider/model and
  playbook/general scope.
- Add Anthropic five-minute caching first; graduate selected playbooks to one
  hour only when their measured reuse cadence justifies the higher write price.
- Evaluate Google explicit caches for unusually large, repeatedly queried
  corpora—not ordinary chat.
- Upgrade the OpenAI adapter before adopting GPT-5.6 explicit breakpoints and
  paid cache-write policy.
- Consider a user-facing cost/latency panel only after telemetry has enough
  samples to avoid presenting speculative savings.
