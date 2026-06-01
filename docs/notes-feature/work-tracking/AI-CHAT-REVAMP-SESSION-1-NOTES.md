---
title: AI Chat Revamp — Session 1 Notes
status: in_progress
last_updated: 2026-05-25
session: 1
session_focus: Engine consolidation + AI Gateway + AI SDK revival
---

# Session 1 — Notes

## AI SDK changelog scan (ai@6.0.104 → 6.0.191)

No breaking changes across the entire range — all minor + patch. Safe upgrade.

### Relevant additions / fixes

| Version  | Change                                                                                | Relevance to DG                                                              |
| -------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 6.0.115  | Security: prevent unbounded memory growth in `download` functions                     | **Must adopt** — affects file downloads                                      |
| 6.0.116  | Security: URL validation in `downloadBlob`/`download` to prevent blind SSRF           | **Must adopt** — affects all file ingestion paths                            |
| 6.0.120  | Support for string model IDs through gateway                                          | **Foundation for `@ai-sdk/gateway`** ("provider/model" string form)          |
| 6.0.127  | Global default provider pattern                                                       | Optional later refactor; not adopted now                                     |
| 6.0.140  | HTTP Chat Transport — resolvable `headers`/`body`/`credentials`                       | We already use `body: () => ({...})` ref pattern; now first-class            |
| 6.0.149  | Top-level `reasoning` parameter in `generateText`/`streamText`                        | **Holds for Session 6** (reasoning surface)                                  |
| 6.0.150  | Per-tool timeout overrides (`toolTimeouts`)                                           | Useful for editor tools later                                                |
| 6.0.156  | `isLoopFinished` stop-condition helper                                                | Alternative to our `stepCountIs(8)` — not adopted now                        |
| 6.0.163  | `useChat` onFinish exposes `finishReason` + `messages`                                | **Pre-stage in engine hook** for Session 2 persistence                       |
| 6.0.179  | Zero-length text parts with provider options preserved                                | Bug fix — get for free                                                       |
| 6.0.180  | Static tool-call detection works when `dynamic` is undefined                          | Bug fix — strengthens our `detectToolPart` in `ChatMessage.tsx`              |
| 6.0.184  | Retry support for **gateway errors**                                                  | **Free reliability** once Gateway is wired                                   |
| 6.0.188  | Per-step timeouts (`timeout: { stepMs }`) in `streamText`                             | Useful for long editor-tool steps; consider in Session 5                     |
| 6.0.191  | Fix: `useChat` status no longer flashes "submitted" on reload during stream resume    | UX bug fix — get for free                                                    |

### Items NOT adopted now

- `experimental_transcribe` (6.0.123) — voice is out-of-scope for v1
- Per-tool timeout overrides (6.0.150) — useful but not a Session 1 concern
- Global default provider pattern (6.0.127) — would simplify resolver but
  also restructure provider wiring; defer to Session 2 or later

### Action items from the scan

1. Bump `ai` to `^6.0.191` via lockfile refresh
2. No code changes required for security fixes (transparent)
3. Remove workaround comments around `body: () => ({...})` pattern (now first-class)
4. Pre-stage `useChat` `onFinish` hook in the engine for Session 2 persistence
5. Verify `detectToolPart` in `ChatMessage.tsx` benefits from 6.0.180 fix (no change needed; we use both branches)

## AI Gateway adoption posture (corrected 2026-05-25)

Initial Session 1 plan: Gateway as default for non-BYOK. **Reverted to
opt-in / default-off** during preliminary testing — see "Strict BYOK is
the foundation" below.

- Latest `@ai-sdk/gateway` is `3.0.120` at scan time
- Gateway accepts plain `"provider/model"` strings
- Code path is preserved (not deleted) so single-user self-hosted
  deployments can opt in via `AI_USE_GATEWAY=true`

## Strict BYOK is the foundation (corrected 2026-05-25)

Gateway uses a single `AI_GATEWAY_API_KEY` env var; that key would be
shared across every user of a multi-user deployment. Wrong model for a
hosted multi-tenant app — all calls bill to one Vercel account, rate
limits aggregate across users, no way to enforce per-user terms.

The app is now **strict BYOK**:

- Resolver throws `BYOKRequiredError` when a request reaches it without
  a stored user key and Gateway is not opt-in
- Chat route returns `402` with `code: "BYOK_REQUIRED"` and the missing
  `providerId`
- Client can match on the code to render "Set up API key" CTA in
  Settings → AI (UI work for a later session; today the error message
  reads in the existing toast)
- No fallback to `ANTHROPIC_API_KEY`-style env vars in production
- Per-provider `case` branches in the resolver retain their defensive
  `config.apiKey ? createX({apiKey}) : x` form but the strict gate
  prevents the env-var branch from being reached

## Engine hook scope (Session 1 boundary)

The hook extraction is **purely structural** in this session:
- Both `ChatPanel` and `ChatViewer` already share `useChat()` + atoms
- Goal is to move identical setup into one place so Sessions 2+ have one
  surface to evolve
- UI / persistence / association behavior is **unchanged** in Session 1
