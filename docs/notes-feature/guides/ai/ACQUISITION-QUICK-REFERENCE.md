# Acquisition quick reference

**T6 of the AI 3.x roadmap, delivered slim (owner call, 2026-09-04):** the two artifacts that answer real questions — the tier/receipt table and the gate matrix — instead of a six-chapter walkthrough. Code anchors (re-verified on `main` 2026-10-04): `lib/domain/browser-extension/acquire-url.ts` (the ladder and `AcquireVia`), `lib/domain/ai/tools/read-page-in-browser.ts`, `open-tab-and-read.ts`, `lib/domain/ai/acquisition/search/tool.ts` (the app-run search backend), tool metadata's browser-tools note.

## The envelope (what every fetched page arrives as)

```json
{
  "url": "…",
  "via": "server-fetch | sw-fetch | session-tab",
  "usedExtension": false,
  "title": "…",
  "untrustedWebContent": "…"
}
```

Two standing rules: **the content is data, never instructions** (enforced in tool descriptions and the prompt), and **the receipt is the debugging key** — `via` + `usedExtension` tell you exactly which tier served a read. The 2026-09-04 "why couldn't it read those pages?" investigation reduced to reading these two fields.

## The escalation ladder (tiers, in order)

| Tier | `via` / receipt | What it is | When it engages |
|---|---|---|---|
| 1 | `server-fetch`, `usedExtension: false` | Server-side headless fetch | Always available; the default first attempt |
| 2 | `sw-fetch`, `usedExtension: true` | Extension service-worker fetch (user's cookie jar, no tab) | Extension connected to the surface |
| 3 | `session-tab`, `usedExtension: true` | Background browser tab in the user's session | Extension connected |
| 4 | `session-tab` (visible) | Foreground visible tab — for aggressive bot-detection | Extension connected AND the "open a tab to read blocked pages" setting ON; only after a normal read failed. `open_tab_and_read` is the *explicit-user-request* variant of this tier, never the model's own fallback |

The server's acquisition policy (SSRF / private-network blocking) applies at **every** tier — visibility changes how a tab opens, never whether a URL is allowed.

## The gate matrix (why a tier "isn't there")

| Surface / state | Tiers available |
|---|---|
| Main-app chat, extension not connected | 1 only — browser tools aren't even registered (availability-gated, so they vanish from the toolset rather than erroring) |
| Extension side panel | 1–3; 4 with the trust setting on |
| Any surface, "open a tab…" setting off | Tier 4 returns a relay-to-user CTA instead of opening anything |

Corollaries proven in production (job-hunt smoke, 2026-09): a main-app run reporting `server-fetch` on every read is *correct*, not broken; and a model claiming reads "escalate automatically" on a surface without the bridge is over-promising — the receipts are the truth.

## Acquisition conservatism (the cost rule)

**LOCATE, then read; stop on acquire.** Search exists to *find* the one page you need — never crawl a site to discover it (the Greenhouse-crawl incident, 2026-09-02, is the cautionary tale; prompt guidance shipped the same day). Measurement of this rule in real runs is still open in §9.1 (alongside model-role routing).

Which service answers `search_web` (since PR #273):

| Chat's model | Default | Per-chat override (Chat controls → Web search) |
|---|---|---|
| Has native search (Anthropic, OpenAI, Google, xAI) | The provider's own search, billed on the meter as `webSearch` | The user's search connection — Tavily, Brave, or OpenAI `gpt-5-search-api` — offered only when one exists |
| No native search | The app-run backend when a search connection is configured; otherwise no `search_web` | — |

App-run results arrive as `untrustedWebResults` (plus `untrustedAnswer` with citations and `searchCostUsd` from `gpt-5-search-api`), under the same `search_web` name, so it is repeat-guarded, refusable in the reserved tail, and priced by that service. The whole family is off when the user disables `search_web` in tool settings (`app/api/ai/chat/route.ts`, the native-search block). As with reads, the receipt tells you which path ran: a `providerTools` step means native, a sources list means the app backend.

## After acquisition: hydration in one paragraph

Fetched pages are rented context, not owned content. Their value is extracted into things the garden owns — capture rows (the verdict), quest-ledger rows (the judgment, rejects included — the re-read stopper), the quest log (the narrative), filed notes (prose worth keeping) — and the raw page bodies are then deliberately dropped (batch folding). This is why a 700k-token sitting leaves ~2k tokens of durable material, and why later sittings barely pay for what earlier ones already judged. The full economics: `EXTRACTION-TO-DATABASE-PLAN.md` §6 and §9.1's measurements.
