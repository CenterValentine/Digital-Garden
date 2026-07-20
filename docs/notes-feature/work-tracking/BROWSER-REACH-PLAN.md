---
title: Browser Reach Plan — extension surfaces + session acquisition for AI Infrastructure v3
status: approved_direction (split from AI-INFRASTRUCTURE-V3-PLAN 2026-07-17; build not started)
last_updated: 2026-07-17
owner: centervalentine
branch: TBD — fresh worktree, cut AFTER the workflows-extension PR merges (that dependency lives in THIS plan only; the infra plan is unblocked)
umbrella: docs/notes-feature/work-tracking/AI-INFRASTRUCTURE-V3-PLAN.md (FROZEN shared record — decisions #1–#14, Agent Runtime + Acquisition Service specs, registers, catalog; never edited from this session)
peer: docs/notes-feature/work-tracking/AI-V3-CORE-PLAN.md (app-side execution plan + AUTHORITY for seam contracts C1–C3; authored in the core session, never edited from this session)
related:
  - extensions/browser-bookmarks/browser-extension/src/ (overlay, page-bridge, url-strategy, background SW)
  - app/(embed) routes + Phase 5 auth seam
  - lib/domain/ai/ (consumed via the embed — never reimplemented here)
---

# Browser Reach Plan

**Premise:** the extension half of AI Infrastructure v3, split out 2026-07-17
so each half gets dedicated resources. This plan makes the browser a
first-class *reach surface* for the shared AI infrastructure: the side panel
becomes a mini-DG shell, the overlay becomes an immersive projection, and the
extension becomes acquisition providers P2–P4 for the platform. **Nothing
intelligent lives here** — chat, agent runtime, tools, policy authority, and
workspace entities are all app-side (infra plan); this plan contributes
surfaces, context, and session-authenticated acquisition. The extension
remains an enhancer, never a dependency (shared decision #9): the flagship
runs extension-free via URL entry; everything here upgrades it.

## Seam contracts (authority: AI-V3-CORE-PLAN.md, contracts C1–C3)

This plan implements against the core plan's contracts and MUST NOT fork
them locally (summaries below; the core plan's text wins on any conflict):

- **C1 — Acquisition provider interface**: P2/P3 (later P4/P5) implement
  `acquire(request) → AcquiredContent` per the envelope spec, declare
  capabilities `{modes, jsRendering, sessionAuth, cost, latency}`, and route
  every request through the policy engine. The extension registers as a
  **remote provider over C2**.
- **C2 — Page-bridge / embed protocol**: context payloads, target/workspace
  params, acquisition requests/results (P3-as-remote), conversation-open
  commands. **Exact-origin matching both directions, no wildcard origins**
  (ShadowPrompt lesson); **versioned message envelope with a `v` field from
  day one**.
- **C3 — Workspace semantics**: Workspace entity + API are app-side (core
  plan S6); the browser holds only the per-window active-workspace pointer
  and renders what the API returns. Full-swap, overlay independence, and
  settle timing (#13/#14) are defined in the umbrella.

## Governing decisions

Per the umbrella's rule, children **cite, never restate**. This plan is
governed by umbrella decisions **#1** (two-surface principle + tooltip),
**#7/#10** (targeting; extension chrome = context bar only), **#9** (parity;
enhancer-never-dependency), **#11** (mini-DG panel shell), **#12** (dispatch
+ promotion gestures), **#13** (workspaces, per-window pointer, overlay
persistence), **#14** (settle-then-associate). Read them there.

## Terminology (read first — resolves real ambiguity)

- **Side panel** — the Chrome-owned UI region (`chrome.sidePanel`), docked
  beside the page.
- **Side-panel page** — Chrome's own term of art for the extension HTML
  document loaded into that region (like a "popup page"). Ours is a thin
  host: context bar + the embed iframe, nothing else. Anywhere this doc says
  "panel page," it means this — never the overlay.
- **Mini-DG shell** — the app UI the embed serves at panel width: file tree
  + content tabs + chat. Everything inside it is app code.
- **Content tab** (written "panel tab" in umbrella decisions #12–#14) — a
  DG-style tab in the shell's tab strip. NOT a browser tab, NOT the
  launch-handle.
- **Launch-handle** — the on-page affordance (content script) that opens the
  side panel.
- **Overlay** — the in-page iframe projection for immersion. Never called a
  panel of any kind.
- **Acquisition Service vs. acquisition providers** — the *Service* is the
  app-side subsystem (core plan authority). The extension contributes
  *providers* (P2–P4): capability modules that register with the Service
  over C2. In this doc, "acquisition providers" always means the
  extension-side modules only.

**User-journey intent (interpretive key for the two surfaces):** the side
panel is for *staying* — ongoing work that outlives any single page
(research sessions, chats, tabs, workspaces). The overlay is for *focusing*
— a momentary immersive view of one thing on the current page. The user
*lives* in the panel and *visits* the overlay.

## What already exists (do NOT rebuild)

| Asset | Where | Use here |
|---|---|---|
| Embed iframe + auth seam (Phase 5) | app `(embed)` routes; cookie path `/embed` (NEVER path `/` — prod logout incident) | Panel + overlay both host this |
| Overlay shell + page-bridge | `browser-extension/src/overlay/`, `src/page-bridge.js` | Overlay surface; bridge extended per seam contract #2 |
| URL identity | `src/url-strategy.js` | Page-node dedup; canonicalization for P2/P3 results |
| Capture chooser + file tree (vanilla) | extension src | Quick-capture flow only; not the chat targeting surface |
| Hostile-context detection | embed viewer work | Overlay CSP/framebusting fallbacks |
| esbuild pipeline | `pnpm extension:build` (~100ms; loads from `dist/`) | Every src edit; remind: reload in chrome://extensions |

**V3-built assets (verified 2026-07-18 — core PR #114 MERGED, S1–S6
complete):**

| V3 asset | Where | Use here |
|---|---|---|
| Acquisition Service core | `lib/domain/ai/acquisition/` (`server-fetch`, `native-search`, `policy`, `hydrate`, `extract`, `page-node`, `types`) | C1 is real — P2/P3 register against these types; policy config issuance exists |
| Agent loop + approval UX | tool-loop w/ `needsApproval` "pretty approval cards" (per-tool previews) | B-session tools inherit approval UX for free |
| Targeted conversations | auto-target on chat creation; moves re-derive target | Target chip behavior the panel relies on |
| Context discipline runtime | `run-ledger.ts`, `compact-tool-outputs.ts`, summarize-on-write, per-run cost meter | Panel chats get disciplined runs for free |
| Documents + playbook runtime | `documents.ts` + S4/S5 flagship path | The in-app flagship works today, extension-free |
| Workflow mastery | S6 tools (author/run Trellis workflows, n8n push, engine catalog) | B6 executor spoke binds to these |

⚠ Not verified as built: the Workspace entity/API (no `model Workspace` in
the core worktree's schema) — **confirm its shipped shape before B4**; it
may have landed under a different name or been deferred to v3.1 (a v3.1
plan is already in flight on the core track: mid-run review, freshness,
stickiness, Kimi+DeepSeek catch-up, remaining context-discipline items).

## Scope of work

### Surfaces
*(Outcome-scoped per the umbrella: the embed mini-shell **layout** is
app-path code — `(embed)` panel route composing tree + tabs + chat at panel
width — but it is owned and built by THIS plan.)*
- **Side panel** (`sidePanel` permission): panel page hosting the embed
  mini-DG shell; launch-handle opens it; per-tab page context binding.
- **Embed panel layout** (app-side code, this plan): panel-width composition
  of file tree + content tabs + chat inside the `(embed)` route family.
- **Context bar** (only extension chrome in the panel): page pill
  (favicon/title), scope toggle Selection / Viewport / Full page, screenshot
  button (`captureVisibleTab`).
- **Overlay as projection**: reuse overlay shell to host embed
  content/chat views; promotion + dock gestures; overlay lifetime bound to
  page, not workspace.
- **Entry points**: "AI" third chooser destination; context-menu item;
  keyboard shortcut; first-run tooltip.

### Context capture
- Defuddle (+ Readability fallback) vendored into the content script →
  markdown; selection & viewport scoping; screenshot attach; tab inventory
  for multi-tab context (metadata only until user confirms inclusion).

### Acquisition providers (implement seam contract #1)
- **P2 sw-fetch**: background SW credentialed fetch + `chrome.offscreen`
  DOMParser (MV3: SW has no DOM) — static HTML, invisible, user's cookies.
- **P3 session-tab**: `tabs.create({active:false})` → inject extractor →
  extract → close; full JS rendering in the user's session. **P3-as-remote**:
  the reverse page-bridge channel letting the *app* request a session fetch
  (content script already runs on app domains) — the LinkedIn path for
  in-app URL entry.
- **P4 supervised-nav**: visible-tab navigation + extraction with the
  supervise UI (badge/toast/interrupt — reuses the locked
  extension-workflows UI direction).
- **Local policy enforcement**: the background SW enforces the app-issued
  policy config (domain allow/deny/ask, budgets, rate etiquette, visible
  activity indicator) before any P2–P4 action; policy *authority* stays
  app-side.

### Workspace + association plumbing
- Per-window active-workspace pointer (session storage keyed `windowId`),
  relayed via the bridge; settle-signal detection (dwell timer, pin,
  interaction) forwarded to the embed which owns association writes.

### Security hardening (S1, non-negotiable)
- Exact-origin matching on every `postMessage`/bridge channel, both
  directions; allowlist = exact embed origins (localhost:3014 dev,
  davidvalentine.org prod); no `*.` patterns; page-derived strings are
  untrusted everywhere, including on app domains.

## Sessions (cut from gates, not habit)

**Cross-plan dependencies — STATUS 2026-07-18: core PR #114 merged (S1–S6
complete), workflows-extension PR #111 merged.** B5's dependency (core S2
acquisition) and B6's (core S6 workflow mastery) are SATISFIED. B4's
(Workspace entity/API) is the one open verification — confirm its shipped
shape before B4 (see V3-built assets note). **This plan is fully unblocked;
execution can begin with B1 whenever the owner chooses.** Note: the local
main checkout may lag origin/main — `git pull` before cutting the branch.

### B1 — Panel shell + hardening
Panel page + launch-handle; embed mount (tree/tabs/chat); first-run tooltip;
exact-origin validation.
**Gate:** panel opens the mini-DG shell on dev + prod embed targets; origin
checks demonstrably reject a spoofed message; extension:build + reload clean.

### B2 — Context capture + entry points
Context bar (scopes + screenshot); Defuddle extraction; chooser "ai" entry,
context menu, shortcut; pageText/selection/screenshot through the bridge.
**Gate:** chat about the current page in all three scopes + screenshot Q&A,
from all three entry points.

### B3 — Two-surface dispatch
Single-click → panel tab; pop-out, drag-to-page, context-menu overlay
gestures; dock-to-sidebar; transient-tab settle signals to the embed.
**Gate:** full round-trip — tree → tab → pop-out → overlay → dock; an
exploratory click leaves no association; a settled tab does.

### B4 — Workspaces (browser side)
Per-window pointer; switch relay; overlay persistence across switches;
browser-session creation defaults (readable date-time name) via embed.
**Gate:** two windows on two workspaces simultaneously; full-swap in one
leaves the other and all overlays untouched.

### B5 — Acquisition providers
P2 + P3 implementations against seam contract #1; P3-as-remote reverse
channel; local policy enforcement + activity badge/toast.
**Gate:** in-app URL entry on a bot-hostile page falls through P1 → P3 and
succeeds; a denied domain and an exhausted budget both fail visibly and
politely.

### B6 — Supervised navigation + executor spoke
P4 supervised-nav; WDK browser-executor step bindings + run-loop callbacks;
supervise UI (badge/toast/interrupt).
**Gate:** a hub-defined workflow drives a supervised multi-page extraction in
the user's browser and reports back.

## Testing workflow (owner preference confirmed 2026-07-18)

**Single extension entry, original load path, branch in the MAIN checkout.**
Unpacked extension IDs are path-derived: a second instance from a worktree
dist/ gets a new ID (fresh storage, re-granted permissions, duplicated
context menu, unassigned shortcut) and — worse — a second set of content
scripts and a second sync loop on every page if both are enabled. Since
BROWSER-REACH executes serially after the core plan completes, no worktree
is needed: work on a branch in the main checkout, keep the one existing
entry, rebuild (~100ms) + reload per edit.

- **Guardrail 1:** point the embed at localhost:3014 while a session is in
  flight; flip to davidvalentine.org only for gate smokes.
- **Guardrail 2 (fallback only):** if parallel work forces a worktree, load
  its dist/ as a second entry but keep exactly ONE instance enabled at a
  time — never both (double content scripts + double sync against prod).
- **B1 implication:** make the app-side extension-ID allowlist configurable
  (env-based, multi-ID) as part of C2 hardening — free now, required if the
  fallback is ever used.

## Correction to umbrella decision #12 (drag-to-page is not implementable)

**Recorded 2026-07-20, found during B1 smoke.** Decision #12 listed three
promotion gestures; the second — *drag an item from the tree onto the page →
overlay* — **cannot work as literally specified.** The side panel and the web
page are separate top-level documents in separate processes; HTML5
drag-and-drop does not cross that boundary, so a drag begun in the panel dies
at the panel's edge (observed: the drag preview stops at the border). No
amount of app-side code changes this — it is a browser boundary, not a bug.

Surviving promotion gestures (both unaffected):
- **Pop-out button** on a panel tab → overlay. Primary gesture; build in B3.
- **Context-menu "Open as overlay"** on a tree item or tab.

Possible approximation, if the spatial feel proves worth it: treat a drag that
*ends outside* the panel as a pop-out request. `dragend` fires in the source
document with coordinates, so "dragged toward the page and released" is
detectable — but coordinates may be clamped to the panel and the drop target
is unknowable, so this is a B3 experiment, not a commitment. The honest
framing for users: **the pop-out button is the gesture; dragging is not.**

## Later shelf (extension-native items)
- **P5 CDP agent** (`chrome.debugger` / playwright-crx / Nanobrowser
  patterns) — own design + safety review before any build.
- **Gemini Nano** on-device TL;DR chip pre-chat.
- **WebLLM local tier** — extension-side runtime aspects (WebGPU, model
  cache); provider registration itself is infra-side.
- Panel absorption of the quick-capture chooser (retire the vanilla tree).

## Open questions
- ~~Panel behavior on non-capturable pages~~ — RESOLVED 2026-07-18 (owner:
  cheapest wins): **no special handling.** Content scripts cannot run on
  restricted pages, so the launch-handle simply never appears there; the
  toolbar icon still opens the side panel, and with no bridge responding it
  naturally shows no page pill — "no page context" mode for free, zero
  special-case code.
- Drag-to-page overlay gesture on sites with aggressive drag handlers —
  fallback affordance if it proves flaky.
- Firefox: sidebar API differs — out of scope for v3, revisit with reach data.
