---
title: AI Infrastructure Upgrade v3 — agentic execution, acquisition, and browser reach
status: approved_direction (research complete 2026-07-16; build not started)
last_updated: 2026-07-17
owner: centervalentine
branch: TBD — fresh worktree, cut AFTER the workflows-extension PR merges (do not hijack that PR; it is docs-conflict away from done)
related:
  - lib/domain/ai/ (use-conversation-engine, providers, conversation-persistence)
  - extensions/browser-bookmarks/ (extension src, overlay, page-bridge, url-strategy)
  - app/api/conversations/
  - docs/notes-feature/work-tracking/FOLDER-STUDIO-PLAN.md (grounding machinery reused in S3)
  - Workflows hub/spoke (Trellis) — extension becomes a second executor spoke in S4
---

# AI Infrastructure Upgrade v3

**Premise: this is the third major iteration of the app's AI infrastructure,
not a browser-extension feature.** Lineage: **v1** — AI integration (chat
panel, BYOK, providers, tool registry). **v2** — the conversation engine
revamp (`Conversation` entity, `useConversationEngine`, gateway, attachments,
multi-surface chat) plus Folder Studio's grounding layer. **v3 (this plan)**
upgrades that same infrastructure with four new capabilities:

1. **Agentic execution** — playbook-driven multi-phase runs with conversational
   supervision (procedures as notes, artifacts as state).
2. **An Acquisition Service** — a distinct subsystem that gets external content
   into the AI's hands (server fetch → user-session fetch → supervised
   automation), independent of any UI surface.
3. **Targeted, placeful conversations** — every chat carries a target folder;
   inputs, outputs, and grounding follow it.
4. **Browser reach** — the existing chat surface projected into the browser
   (side panel + embed iframe), with the extension contributing context the
   server cannot see. "AI" becomes the third destination in the extension's
   chooser (notes, workflows → ai).

Everything lands in the shared AI layer (`lib/domain/ai/`); the browser is one
beneficiary, the in-app chat is another, workflows a third. The extension never
builds its own chat UI — it harvests context (selection / viewport / page /
screenshot / tabs) and pipes it through the page-bridge into the app's existing
chat surface.

## Decisions of record

1. **Two-surface principle (RESOLVED 2026-07-17, owner decision).** The **side
   panel** is the persistent workspace: chats AND content live there in tabs
   (just like the DG app main panel), surviving navigation and sessions. The
   **overlay** is the immersive projection: a chat or content item opened on
   the page when the user wants focus. Both render the same embed — same
   conversations, same components; a surface is a projection, not a place.
   **First-run tooltip teaches the principle** (e.g., "Your sidebar keeps tabs
   and chats across pages. Pop anything out for an immersive view."). Auth
   solved at the iframe boundary (Phase 5 embed). New manifest permission:
   `sidePanel`.
2. **Chats do NOT get a permanent tree home. Pages DO.** On first message, the
   extension find-or-creates the page's `ExternalPayload` node (deduped by URL via
   the existing `url-strategy.js` identity rules, placed in the configured default
   capture folder — same object bookmark sync already creates). The chat is a
   `Conversation` + `ConversationAssociation` to that node. Deleting a chat never
   deletes the node. If eager creation proves cluttery, a settings toggle can defer
   node creation to first save — but eager is the default: it matches the
   extension's premise (browser activity → external links in folders).
3. **Chat-derived notes are user-placed.** "Save to garden" on any answer runs the
   existing capture path with the chooser. No new payload type for conversations —
   payload types carry viewer/export/collab-schema obligations that disposable
   chats don't justify.
4. **Discovery**: a virtual "Chats" affordance (recent browser chats) in the
   sidebar + a chats indicator on external-link nodes (like backlinks). Chats open
   as main-panel tabs — the DM-tab pattern (commit 300221c).
5. **One primitive layer, two consumers — chat tools first.** Scraping/navigation
   primitives (`browser.navigate` / `browser.extract` …) are consumed by (a) AI
   chat tools (`read_page`, `open_and_read`, `search_web`) — the v1 flagship path —
   and (b) WDK workflow steps executed by the extension as a browser-executor
   spoke (parallel to the n8n spoke run-loop). Same primitives, same policy
   enforcer, two callers.
6. **One policy enforcer** in the background service worker gates every automated
   page access for both consumers: per-domain allow/deny, per-run page budget +
   rate limit, cross-origin consent, visible activity badge/toast (reuses the
   locked supervise UI direction from the extension-workflows plan).
7. **Target context unifies the file tree and the chat (decision 2026-07-16).**
   Every browser chat has a **target folder**, shown as a chip in the side-panel
   header and picked via the *existing extension file tree* (promoted from
   capture-destination picker to chat-context picker; sticky per tab, defaults
   to last-used/inbox). Everything follows the target: the page's
   `ExternalPayload` node is created IN the target folder (supersedes the
   "default capture folder" language in decision #2); `create_note`/`create_docx`
   default their destination to it; grounding scopes to it via the Folder
   Studio machinery (so `jobhunt.md`, base resume, values notes are in scope
   the moment the Job Hunt folder is targeted).
8. **There is no "transition" between browser chats and content chats — one
   Conversation, many surfaces.** A browser chat is a `Conversation` associated
   to BOTH the target folder and the page node. It therefore appears in the
   folder's Studio chat history and on the bookmark node in-app; a folder chat
   started in-app is likewise visible from the side panel when that folder is
   targeted (browser adds page context on top). Because the panel hosts the
   embed iframe, "same conversation, different surface" is literal — one
   persistence layer, identical components.
9. **One AI architecture, surface parity (assumption-requirement, 2026-07-17).**
   The browser chat IS the in-app chat — same conversation engine, tool
   registry, components, theming. The browser contributes a context *variance*
   (live page, selection, screenshot, tabs), never a parallel chat product.
   Corollaries: (a) every capability lands in the shared layer — anything that
   only works in the side panel is misplaced; (b) **URL-initiated execution**:
   pasting a link into any in-app chat ("execute a job hunt iteration for
   https://…") runs the identical flow — same page-node creation, same
   playbook, same tools — via the `read_page` resolution ladder (see A9). The
   extension is an enhancer, never a dependency.
10. **Targeting surface rendering (refines #7).** The target chip renders
   INSIDE the app chat surface (its header) — one component in-app and
   in-panel, backed by an app-rendered compact folder picker. The extension's
   file tree keeps its original job as the capture chooser (notes/workflows
   destinations). Both write the same Conversation target association. The
   extension's only chrome in the side panel is a thin context bar (page pill
   + Selection/Viewport/Full-page scope toggle + screenshot button) — the
   parts only the extension can know. In-app, a link chip takes the context
   bar's place when a URL is attached; Folder Studio chats show their folder
   as a pre-locked target.
11. **The side panel is a mini-DG shell (2026-07-17).** The launch-handle now
   opens the side panel, whose embed renders **file tree + tabbed content +
   chat** — the app shell at panel width. The file tree in the panel is
   app-rendered (consistent with #10's one-implementation rule); the
   extension's vanilla-JS tree remains only for the quick-capture chooser
   until the panel naturally absorbs that flow too. This satisfies parity
   (#9) by construction: the panel IS the app.
12. **Dispatch model (one rule + accelerators, not two buttons per row).**
   Single-click on any tree item → opens as a **panel tab** (the default,
   always). Immersion is a *promotion gesture*, not a dispatch-time choice:
   (a) a pop-out button on every panel tab → opens that content/chat as an
   overlay; (b) drag an item from the tree onto the page → overlay (spatial
   metaphor: pulling content onto the page IS immersion); (c) context-menu
   "Open as overlay." The overlay symmetrically has a "dock to sidebar"
   button. **All three promotion gestures confirmed by owner (2026-07-17).**
   Rejected: two launch buttons per row — clutter, and it front-loads
   a decision the user can defer.
13. **Workspaces (2026-07-17).** A workspace is a named, server-persisted set
   of panel state: `{ name, open tabs, default target folder, pinned chats,
   lastActive }`. A quick-new affordance (+) creates one instantly. Purpose:
   separate web-based information procurement (research, errands, chores)
   from internal app operations (reflection, studying, reviewing). Workspaces
   are an app-shell concept living in the embed (shared layer — can surface
   in-app later); the extension stores only the active-workspace pointer per
   window. The workspace's default target feeds the target chip;
   per-conversation targets still override. Ships in S2.
   **Resolved (2026-07-17): scope = per-window pointer (Opt 2); switch
   behavior = full swap (Opt A) with Opt C's messaging only** — activity dot
   on workspaces with live runs + switch-away toast, NO blocking prompt.
   Carry-over pins (Opt B) declined for v3 (possible later). **Overlay panels
   persist on webpages regardless of the selected workspace** — overlay
   lifetime binds to the page, never the workspace; full-swap does not touch
   overlays. Resumable streaming remains the technical prerequisite for
   swap-safe in-flight responses.
   **Browser sessions surface in-app:** the in-app workspace list gains a
   "Browser Sessions" item that expands to the browser-side workspaces; the
   user can view any workspace from the sidebar switcher. New sessions
   default to an easy-to-read date-time name, sorted most-recently-active
   first. AI-generated session names (from captured activity) → **backlog**;
   lightweight v1 path if pulled forward: an opt-in AI setting + a title
   write signal at session end.
14. **Settle-then-associate (general principle, 2026-07-17).** Opening
   content is exploratory by default and creates NO association. One settle
   mechanism (the preview-tab idiom: single-click = transient tab, italic,
   auto-replaced; promoted by double-click, pin, edit, chat activity, or
   dwell) governs ALL of: (a) workspace tab membership, (b) the
   content↔current-page association, (c) page-node creation timing. "Once the
   tab settles, so does the association." Chats are unchanged: the first
   message is itself a settle signal, so decision #2's
   eager-on-first-message page-node behavior is preserved as a special case.

## What already exists (do NOT rebuild)

| Capability | Where | Use |
|---|---|---|
| Chat engine, streaming, persistence | `use-conversation-engine`, `Conversation`/`ConversationMessage`/`ConversationAssociation`, `app/api/ai/chat/` | The entire chat surface, inside the embed iframe |
| Authenticated embed iframe | Phase 5 embed (`/embed` cookie discipline, page-bridge) | Side panel content; dodges MV3 CSP + cross-site cookie pain |
| URL identity / dedupe | `extensions/browser-bookmarks/browser-extension/src/url-strategy.js` | find-or-create page node |
| Capture path + chooser | overlay + background | "AI" destination entry; save-answer-to-garden |
| Rendered pageText send | extension-workflows plan (locked) | v1 page context |
| Grounded folder chat + auto-context | Folder Studio build | S3 garden grounding |
| Workflow hub/spoke + callbacks | Trellis Plans 1–3 | S4 browser-executor spoke |
| Manifest permissions | `tabs`, `activeTab`, `scripting`, `contextMenus`, `bookmarks`, `<all_urls>` | Rungs 1–3 need nothing new; only `sidePanel` (S1) and later `debugger` (post-plan) |

## The Acquisition Service (distinct subsystem — NOT part of the UI architecture)

**Mission: world-class web interoperability for the whole platform — not a
job-search accessory.** The job-application flagship is merely the *first
consumer*. This subsystem is designed against the frontier-lab bar (owner
directive 2026-07-17), deliberately decoupled from every surface: chat tools,
WDK workflow steps, and in-app URL entry are all just consumers of one
contract; providers can be added without touching any consumer. New
acquisition capability (scraping suites, research automation, monitoring)
lands HERE, never inside a UI surface.

### Design benchmarks (what Claude does / what OpenAI does / what the tooling industry does)

- **Anthropic**: separates `web_search` and `web_fetch` as distinct server
  tools with **mandatory citations**, domain allow/block lists, and content
  budgets. Claude in Chrome uses **plan-approval** (user approves a stated
  plan; the agent may not deviate without asking), per-site permissions,
  blocked high-risk site categories, and extra confirmation for sensitive
  actions (downloads, entering sensitive data). Reading and acting are
  different privilege levels.
- **OpenAI**: Deep Research runs **budgeted search→read→refine loops**
  producing cited syntheses; agent/browser modes use watch-mode on sensitive
  sites, user-takeover for credentials, and confirmation before consequential
  actions.
- **Industry (Firecrawl/Tavily/Exa/Jina)**: converged primitive taxonomy —
  search-first APIs, scrape/crawl engines, schema-driven `extract`, deep
  `/research` endpoints — all normalized to LLM-ready markdown, all packaged
  as MCP servers, all with provenance on every result.
- **Cautionary tale**: the ShadowPrompt zero-click prompt injection against
  Claude's own Chrome extension (patched Feb 2026) chained an overly
  permissive origin allowlist (`*.claude.ai`) with an XSS on a subdomain.
  Lesson for our embed/page-bridge: **exact-origin matching on every message
  channel**, no wildcard origins, and treat even own-subdomain content as
  untrusted input.

### Primitive taxonomy (the full API surface — homes exist even where v3 ships a subset)

| Primitive | Purpose | v3 status |
|---|---|---|
| `search` | Query → ranked, cited results (provider-native P0 preferred) | S3 |
| `fetch` | URL → normalized content envelope | S3 |
| `crawl` | Bounded multi-page traversal (depth/page budget) | S4 |
| `extract` | Schema-driven structured data from page(s) (Zod schema in, typed JSON out) | S4+ |
| `monitor` | Change detection on a URL over time (feeds workflows/cron) | Later |
| `interact` | Act on a page (click/fill) — a different privilege level entirely | Later; own safety review |

### The content envelope (every acquisition returns this — no raw strings)

`AcquiredContent`: markdown content + `{ url, canonicalUrl, title, site,
publishedAt?, retrievedAt, provider, mode, trustTier }` + citation-ready
chunks + token estimate + optional screenshot/structured payload.
Non-negotiables baked into the envelope:

- **Provenance always** — every downstream artifact (research note, resume
  fact-check list, Folder Studio context doc) can cite source + retrieval
  time.
- **Trust tiering** — web content is delimited and labeled untrusted at the
  envelope level; it can *inform* but never *instruct* (the A3 hygiene rule,
  enforced structurally rather than by prompt discipline alone).
- **Freshness metadata** — consumers can decide staleness policy.

### Provider abstraction + routing

Providers declare capabilities `{ modes, jsRendering, sessionAuth, cost,
latency }`; a resolver composes fallback chains per request — the same
pattern as the model layer's `executeWithFallback()`. **P0 = provider-native
tools** (Anthropic `web_search`, OpenAI web tools — citations included,
zero build) sits above the owned pipeline:

| Provider | Mechanism | Status |
|---|---|---|
| P0 provider-native | Model vendor's own search/fetch server tools, normalized into the envelope. **Coverage (owner 2026-07-17): Anthropic (`web_search`/`web_fetch`), OpenAI (web search tools), Google (Gemini search grounding + URL context), xAI (Grok Live Search).** Post-V3: **Kimi/Moonshot catch-up** — builtin `$web_search` P0 adapter + gateway routing + explicit BYOK keys. P0 is *tool resolution at request composition* (FEATURE_REGISTRY-layer decision, not model middleware): per active provider, abstract `search_web` maps to the native tool (with our policy compiled into its params — e.g. allowed_domains) or falls through to the owned pipeline when policy can't be expressed natively; results normalize into the envelope post-step. | S3 |
| P1 server-fetch | Server-side fetch + Defuddle (reuses fetch-url/OG machinery) | S3 |
| P2 sw-fetch | Extension SW credentialed fetch + `chrome.offscreen`/DOMParser — static HTML, invisible, user's cookies | S3 |
| P3 session-tab | Background-tab extraction in the user's session; full JS rendering; also serves the app remotely (A9) | S3/S4 |
| P4 supervised-nav | Visible-tab navigation + extraction, user-supervised | S4 |
| P5 cdp-agent | `chrome.debugger` / playwright-crx — clicks/forms/a11y-tree | Later; own safety review |
| P6 headless-remote | Firecrawl/Jina APIs or Playwright container on the Coolify homeserver via n8n | Later, on real need |

### Policy engine (lives here, serves every consumer)

Per-domain allow/deny/**ask**; site-category defaults (finance/health/auth
pages: session-only + explicit consent, mirroring Claude in Chrome's blocked
categories); per-domain rate limits + per-run budgets (pages, tokens, time);
robots.txt respect for bulk operations; the **read vs act** privilege split;
consequential-action confirmation (P4/P5); and an **audit log** of every
acquisition (reuse the admin audit-logging infra). Tool signatures stay
MCP-shaped so third-party ecosystems (and future MCP exposure of the garden)
slot in without redesign.

### Garden-as-corpus (the DG-native advantage)

Acquisition results can hydrate `ExternalPayload` nodes (content snapshot +
retrievedAt alongside the existing OG metadata): the garden itself becomes
the research cache — searchable, backlinkable, staleness-aware. URL-normalized
dedupe via url-strategy.js; TTL-based re-acquisition. No commercial scraping
API gets this: *their* cache is a cost center, *ours* is the product.

### Research orchestration (a consumer, not part of the service)

Deep-research loops (plan → search → read → refine → cited synthesis, under
budget) compose the primitives above — this is A1's mature form and stays in
the agent layer, exactly as OpenAI's Deep Research sits atop their tools.

## The Agent Runtime (agentic-execution infrastructure)

The explicit spec for upgrade #1 (added 2026-07-17) — parallel in stature to
the Acquisition Service. Best-practice and best-odds-of-performance are
listed separately where they diverge; both sit on a foundation designed to
*improve automatically* as models improve.

### Design benchmarks (researched 2026-07-17)

- **AI SDK v6 agent stack (stable, May 2026)**: `ToolLoopAgent` (default
  `stopWhen: stepCountIs(20)`), `prepareStep` (swap model/tools/messages
  between steps), **`needsApproval`** — native human-in-the-loop: tool enters
  `approval-requested` state, UI approves via `addToolApprovalResponse`,
  loop resumes. Stable MCP support. Our A4/A5 ride this machinery instead of
  hand-rolling it.
- **Anthropic context engineering** (published evals): context editing alone
  +29% task performance; + a memory tool +39%; **84% token reduction** on a
  100-turn web-search eval. Their multi-agent research system (orchestrator +
  parallel subagents, each returning ~1–2k-token condensed summaries)
  outperformed single-agent by 90.2% *on parallelizable research tasks
  specifically*.
- **Anthropic Agent Skills**: SKILL.md folders with **progressive
  disclosure** — ~100 tokens of name/description metadata always loaded;
  full instructions loaded only on invocation. This is *structurally
  identical to our playbooks-as-notes* — external validation of the design.

### Core loop

Built on `useConversationEngine` + `ToolLoopAgent`. **Single-agent tool loop
is the default** — best-odds finding: tool/ACI quality and context hygiene
beat orchestration cleverness for most tasks. Orchestrator-workers
(parallel subagents with condensed-summary returns) is reserved for
research mode (F35), where the 90.2% result actually applies.

### Playbooks = skills, formalized (progressive disclosure)

The playbook registry surfaces only name + one-line description (~100
tokens each) to the agent; the full playbook note loads on invocation (A3),
referenced notes load on demand (A6). Garden folders act as skill bundles
(jobhunt.md + jobresearch.md + templates). Later interop: a playbook is
exportable as a literal SKILL.md — the ecosystems converge.

### Context discipline (best-odds core)

- **Phase boundary = context checkpoint**: at each approved checkpoint,
  prune tool results and stale scaffolding; later phases re-read artifacts
  (A8) instead of dragging transcripts — the file system is the working
  memory (the +29/39% and 84% numbers are exactly this pattern).
- Tool-result pruning for bulky acquisitions (envelope stores full content
  in the garden; context keeps the citation + summary).
- Prompt-caching hygiene: stable system prompt + stable tool ordering so
  long runs hit provider caches (cost + latency).

### Supervision & safety

`needsApproval` on every mutating tool (`create_docx`, `create_note`,
`create_folder`, later `interact`) — propose_\* becomes SDK-native approval
states rather than custom protocol. Phase gates stay conversational
(decision on checkpoints, A3). `stopWhen` compositions: step count + token
budget + cost ceiling; per-run cost meter surfaces (catalog #39); the
Acquisition policy engine bounds all web reach independently.

### Step-level routing (scalability lever)

`prepareStep` + the existing `FEATURE_REGISTRY`/`executeWithFallback()`:
cheap models for extraction/classification steps, strong models for
synthesis/review steps, per-step provider swap with zero loop changes. This
is where "rapid AI development" lands as an upgrade rather than a rewrite:
new models slot into routing; the loop, tools, playbooks, and state are
untouched (the durable frame, mechanized).

### Durability & observability

Resumable streaming (already required for workspace swaps) + A8
artifacts-as-state = runs survive panel close, workspace switches, and new
sessions. Long-horizon graduation path to WDK (B3) for runs that outgrow a
conversation. Telemetry: AI SDK OpenTelemetry spans wired into the existing
`withTrace` logger infrastructure; later, a playbook eval harness replays
the flagship demo script as a regression suite.

## Sessions

### S1 — Side panel shell + chat surface + target context
- `sidePanel` permission; launch-handle opens the panel; panel hosts the embed
  rendering the mini-DG shell: **file tree + tabbed content + chat**
  (decisions #11–#12; single-click → tab, pop-out → overlay).
- "AI" as third chooser destination; quick-chat button in overlay + context-menu
  item + keyboard shortcut.
- Target chip in the chat surface header (decision #10), backed by the
  app-rendered folder picker; page context v1: rendered pageText through the
  page-bridge; **exact-origin message validation** on panel/page-bridge
  channels (ShadowPrompt lesson).
- First-run tooltip teaching the two-surface principle (decision #1).
- **Gate:** extension:build + reload; open content in panel tabs, pop one out
  to overlay, chat about the current page end-to-end with a chosen target
  folder (dev localhost:3014 + prod davidvalentine.org embed targets).

### S2 — Context fidelity + persistence + workspaces
- Workspaces v1 (decision #13): create/switch/rename; tabs + default target +
  pinned chats persist server-side; quick-new (+) affordance.
- Defuddle (+ Readability fallback) extraction with three user-selectable scopes:
  selection / visible viewport / full page. Markdown out (token-lean).
- Screenshot attach: `tabs.captureVisibleTab` → image part in the chat (vision).
- Eager find-or-create page node on first message IN the target folder
  (decisions #2 + #7); conversation dual-associated to target folder + page node
  (decision #8) so it surfaces in the folder's Studio chat history and on the
  node; chats indicator on the node; virtual Chats list in sidebar for
  inbox-targeted quick chats.
- "Save answer to garden" via chooser (target folder preselected).
- **Gate:** chat persists and reopens from BOTH the node and the folder's chat
  history in-app; screenshot answer references visible-only content correctly.

### S3 — Agentic toolset + garden grounding (THE FLAGSHIP SESSION)
- Web research suite (A1): `search_web` (provider-native + citations),
  `read_page`, `open_and_read` behind the policy enforcer (decision #6) —
  built once, shared with S4.
- Document-output tools (A2): `create_note` / `create_docx` with
  user-designated destination folder.
- Playbook convention (A3) + propose_* generalization to file creation (A4).
- Ground chat against the vault (reuse Folder Studio grounded-chat/auto-context):
  "have I saved anything about this?" / related-bookmarks recall.
- Multi-tab context: pick N open tabs as sources.
- **Gate:** the V1 demo script end-to-end — jobhunt.md playbook executed
  conversationally with approvals, docx lands in the designated folder; policy
  budget blocks runaway loops.

### S4 — Workflow mastery + browser-executor spoke (converges with extension-workflows plan)
- `run_workflow` + `propose_workflow` chat tools (B1/B2) — AI authors WDK graphs,
  validated + reviewed on the canvas before save; conversation→run handoff.
- Rung 1–3 primitives exposed as WDK steps; extension executes, calls back to hub
  (n8n-spoke-parallel run loop); supervise UI (badge/toast, interrupt).
- Watch-page-for-changes, capture-with-linked-context, research-session → note
  with `ExternalPayload` source children.
- **Gate:** "build me a workflow that researches jobs for listings I visit" →
  valid reviewed workflow saved; a hub-defined workflow drives a supervised
  multi-page extraction in the user's browser and reports back.

## V1 flagship use case — procedure-driven agentic chat (NO workflow engine)

**User story (v1 acceptance):** on a job posting, the user says *"Let's work on
a resume for this job description using the jobhunt.md."* The chat agent reads
`jobhunt.md` — a user-authored playbook note describing steps WITH supervision
between each — and executes it conversationally: company research → **user
approval** → job description analyzed with research context → **user approval**
→ resume formation → docx output **in the folder the user designates**.

This is NOT a compiled Trellis/n8n workflow. It is a multi-step agent loop in
the existing chat, where supervision checkpoints are ordinary conversation
turns: the agent completes a phase, presents results, and waits. Approval =
the user's next message. Mutating outputs (file creation) additionally follow
the established **propose_\* convention** (flashcards precedent: propose in
chat, user approves, then commit).

**Why chat-native is the right v1 shape:** every "gate" is free (it's a chat
turn); the playbook is attached by @-mentioning the note (mentions exist); and
the procedure lives as a *note the user owns and edits* — no builder UI needed
to change the process.

### The durable frame (survives the rapid state of change in AI)

Four independently-swappable layers; better models improve the system with
zero code changes:

1. **Procedures = notes** (`jobhunt.md`). User-owned, editable, versionable,
   shareable. The "skills" layer — process knowledge lives as content, never
   as code.
2. **Tools = thin stable primitives** in the AI tool registry (`read_page`,
   `search_web`, `create_note`, `create_docx`, `run_workflow`,
   `propose_workflow`). Small, composable, boring — they don't churn when
   models do.
3. **Models = swappable intelligence** — already abstracted via providers /
   AI Gateway / `FEATURE_REGISTRY` + `executeWithFallback()`.
4. **Supervision = conversation** — propose/approve as chat turns, plus the
   policy enforcer for automated page access. Control stays with the user
   regardless of how capable the model gets.

### Capability register for the flagship (A-series: chat-agent path)

| # | Capability | Size | Notes |
|---|---|---|---|
| A1 | **Web research tool suite** — `search_web` (provider-native web_search tools + citations), `read_page` (rung 1), `open_and_read` (rung 2, user session via extension) behind the policy enforcer. | Medium | The core enabler; S3 |
| A2 | **Document-output tools** — `create_note` (TipTap) and `create_docx` (wrap the `DOCXConverter` built on the workflows branch) with a folder param, PLUS `create_folder` (find-or-create by path) so playbooks can derive destinations dynamically (`job-search/{Company}/`). Target chip = outer scope/default; playbook standing rules refine within it. Resume-grade docx styling = later polish. | Small-medium | S3 |
| A3 | **Playbook execution convention** — @-mention a procedure note → agent treats it as phases/steps with checkpoints. Checkpoint placement is **playbook-declared** (default: one per phase, not per step). Standing rules (e.g., folder-placement invariants) persist across all phases. Agent must tolerate imperfect human documents — broken numbering, duplicate steps, truncated sentences, empty items — by interpreting intent, deduplicating, and asking when a step is unintelligible. Prompt-injection hygiene: procedure notes + garden content are trusted; fetched pages are NOT and must never override the playbook. | Small-medium | S3 |
| A4 | **In-chat supervision generalization** — propose_\* rides AI SDK v6 native `needsApproval` (approval-requested state → `addToolApprovalResponse`) for file/document creation; no custom approval protocol. | Small | S3 |
| A5 | **Multi-step tool loop** — adopt `ToolLoopAgent` + `stopWhen`/`prepareStep` in `useConversationEngine` (verified available: SDK 6 stable since May 2026). See Agent Runtime section. | Small | S1 |
| A6 | **Playbook reference resolution** — playbooks reference other garden notes (`jobresearch.md`) and folders (`job-search/source-material`); resolve wiki-link-style, searching the target scope first, and read them as trusted sub-procedures/sources. | Small | S3 |
| A7 | **Folder ingestion** — read a folder's contents as source material (reuse the Folder Studio source resolver + `document-extractor` so docx/pdf source files work, not just notes). | Small-medium | S3 |
| A8 | **Artifacts-as-state (resumability)** — convention: each phase's outputs are written to the derived folder immediately; later steps prefer re-reading artifact files over relying on chat context (long procedures WILL overflow context). A new per-task conversation targeted at the same folder can resume mid-procedure by inspecting which artifacts already exist. The folder IS the run state — no run database. | Convention + prompting | S3 |
| A9 | **`read_page` resolution ladder (URL entry / app parity)** — a consumer of the Acquisition Service: providers P1 → P3 → ask-user. P1 covers most job boards; P3 (extension session-tab, via the reverse page-bridge channel — content script already runs on app domains) covers bot-hostile pages like LinkedIn; final fallback asks the user to open the page (side-panel path) or paste content. P3-as-remote is v1.5. | Small (P1) + medium (P3 remote) | S3 / S4 |

### Workflow mastery (B-series: AI as workflow AUTHOR — "all the better")

The WDK is data (`graph/schema.ts` + `validate.ts` + React Flow canvas), which
makes workflows an ideal LLM *output format*:

| # | Capability | Size | Notes |
|---|---|---|---|
| B1 | **`propose_workflow` chat tool** — "build me a workflow that researches jobs for listings I visit" → agent emits a WDK graph, validated by `validate.ts`, reviewed on the canvas before save (propose_\* convention; the canvas IS the proposal surface). | Medium | S4+ |
| B2 | **`run_workflow` chat tool** + conversation→run handoff (chat conclusions as run input, Conversation↔run association). | Small-medium | S4 |
| B3 | Graduation path: a playbook that's been executed in chat repeatedly can be *offered* as a workflow ("want me to turn jobhunt.md into a reusable workflow?") — chat-mode is the prototype, WDK-mode is the productionized form. n8n compile comes free via the existing engine adapter. | Later | — |

**WDK ground truth** (verified 2026-07-16, workflows-n8n worktree): the
`job-application.ts` fixture already models this pipeline in WDK form
(`trigger-page-capture → get-content → ai-complete ×2 → gate → branch →
export-docx → notify`); 11 node types exist including `store-content` and
`export-docx` (real `DOCXConverter`). Two workflow-side gaps remain relevant
whenever the B-series runs: **destination folder targeting** on
`store-content`/`export-docx` (hardcoded to the Workflows folder today —
small hub-side fix, also needed by A2's tools) and richer docx styling.

**V1 demo script (acceptance, = playbook Phases 1–4):** on a posting →
"resume for this job using jobhunt.md" → agent reads the playbook, resolves
`jobresearch.md` (A6), find-or-creates `job-search/{Company}/` per the
standing rule (A2) → Phase 1: researches the company (A1), writes the company
profile + employer-needs statement as artifacts (A8), presents, waits →
approved → Phase 2–3: ingests `job-search/source-material` (A7), builds
evidence inventory + requirement-to-evidence matrix + evidence-gaps doc →
approved → Phase 4: drafts resume, runs its review passes, proposes note +
docx into the company folder (A4) → user accepts → files exist there.

**Playbook format learnings (from the draft jobhunt.md, 2026-07-17):** real
procedure docs have (a) standing rules before the phases, (b) phase-level
checkpoints (not per-step), (c) references to other notes and folders,
(d) human imperfections (duplicate steps, dropped numbering, truncated
lines) — the agent interprets rather than parses, which is precisely why
chat-mode beats compiling these to rigid workflow graphs. **Phase 5**
(cover letter, outreach, networking-path identification) is the flagship's
v1.5: it wants user-session people/company browsing (S4 rung-2/3 tools,
ToS-sensitive → policy enforcer) and pairs naturally with the `people`
extension (identified contacts → People entries). V1 acceptance stops at
Phase 4.

## Later shelf (explicitly liked — keep on record)

- **Gemini Nano progressive enhancement** (Chrome built-in AI, GA for extensions
  since 138): $0 on-device Summarizer TL;DR chip before a real chat; hardware/
  Chrome-gated so always optional.
- **WebLLM local provider tier** — interesting *despite* BYOK/Gateway. Perks:
  1. **Privacy mode unique to the browser context**: page content never leaves
     the machine — chat about banking/medical/internal dashboards where sending
     viewport text to any cloud API is a non-starter. No cloud provider can offer this.
  2. **Zero-key onboarding + zero marginal cost**: extension users without BYOK
     configured still get working chat.
  3. **Any-Chromium + model choice**: WebGPU runs in Edge/Brave/Arc (Gemini Nano
     is Chrome-only, Google-gated, fixed model); pick Llama/Qwen/Phi.
  4. **OpenAI-compatible API** → slots into `lib/domain/ai/providers/` as just
     another provider ("local"), so adoption is a provider entry + download UX,
     not an architecture change. Also a natural `executeWithFallback()` rung.
  5. **Roadmap leverage**: local embeddings → semantic search over captured
     bookmarks with no server round-trip; function calling → rung 1–2 scraping
     tools orchestrated locally at $0.
  - Costs: multi-GB model download, VRAM floor, weaker-than-cloud models. Position:
    after everything else, as the "local" tier alongside the Nano enhancement.
- **CDP agentic control (rung 4)** — Nanobrowser-style planner/navigator/validator;
  needs `debugger` permission, action-confirmation gate for mutating steps, and its
  own safety review.
- **Homeserver scraping spoke (rung 5)** — browserless/Playwright container on
  Coolify, driven by n8n, for scheduled/bulk crawls (e.g., re-check 40 bookmarks
  weekly).
- **Playbook linter** — on first execution of a procedure note (or on request),
  the agent reviews it structurally and proposes fixes: duplicate steps,
  truncated sentences, empty items, ambiguous references, missing checkpoint
  declarations. Cheap, high-leverage companion to A3.

## Appendix — chat surface tradeoffs: side panel vs in-page overlay

Supporting analysis for decision #1. **Status: RESOLVED 2026-07-17 — owner
landed the two-surface principle (panel = persistent workspace with tabs,
overlay = immersive projection; see decisions #1, #11–#13).** Analysis
retained as the rationale record.

| Dimension | `chrome.sidePanel` | In-page overlay iframe |
|---|---|---|
| **Navigation lifecycle** | Panel document persists across page navigations and link-following — the embed loads once; a streaming AI response survives the user clicking a link | Dies on every navigation: content script + iframe re-inject per page load; a mid-stream response is torn; conversation must rehydrate |
| **Agentic runs** | Multi-page playbook phases keep one live conversation | Each navigation interrupts the run's surface |
| **Page interference** | Outside the page DOM: immune to page CSS/JS, z-index wars, SPA re-renders, adblock heuristics, framebusting | Lives in hostile territory (the repo already carries hostile-context detection scars) |
| **Page CSP** | Immune — extension-owned document | Content-script-injected iframes to web origins are subject to the page's `frame-src` CSP; strict sites can block the embed outright |
| **Process/perf** | Own renderer; heavy pages don't jank the chat; one panel instance per window | Shares fate with the page; one iframe instance per tab with overlay open |
| **Page-anchored UX** | Cannot anchor to page content (popovers at selection, highlights) — needs content-script round-trips | Native at this: position near selection, annotate, point |
| **Occlusion** | Side-by-side with content — read while chatting | Covers page content |
| **API constraints** | `sidePanel.open()` requires a user gesture; one shared panel slot per window (another extension's panel can displace it); docking side is user/browser-controlled | Full positioning freedom (float, dock, pill) |
| **Reach** | Chromium 114+ (Chrome/Edge/Brave/Arc); Firefox has a different sidebar API | Any browser with content scripts |
| **Build cost** | New surface (panel page + wiring) | Already built (embed viewer overlay) |

**Why side panel wins for chat:** the flagship is a multi-phase agentic run
across page visits — the navigation-survival property is decisive, and CSP
immunity removes a whole class of "works on some sites" bugs. The overlay's
strengths (anchoring, positioning) are exactly the capture/quick-action
strengths it keeps.

## Appendix — Acquisition Feature Catalog (owner-approved 2026-07-17)

Tiers: **[v3]** in plan · **[near]** natural next on v3 infra · **[horizon]**
aspirational. Test passed: every item builds on the v3 infra without
re-architecting. Most DG-native (compound the garden, not just fetch the
web): 6, 21, 23, 27–33, 41.

**A. Retrieval & search** — research reach for playbooks + Folder Studio
1. [v3] Multi-provider cited web search (P0 native ×4 vendors; Tavily/Exa/Brave pluggable)
2. [near] Semantic "find similar" from a note or URL
3. [near] Domain-scoped / site-restricted search
4. [near] Recency-weighted news mode
5. [horizon] Scholarly providers (arXiv, Semantic Scholar, Crossref)
6. [near] Search-result dedup vs garden ("in your garden" badges)
7. [horizon] Image/media search

**B. Fetch & extraction** — clean content in; ExternalPayload enrichment
8. [v3] Markdown extraction (Defuddle + Readability fallback)
9. [v3] Selection/viewport/full-page scopes; screenshots
10. [near] Schema-driven `extract` (Zod in → typed JSON out)
11. [near] Metadata harvest (OG, JSON-LD, schema.org)
12. [near] PDF acquisition via document-extractor
13. [near] Table extraction → structured rows/notes
14. [near] Extraction-quality scoring + auto-escalation (thin → P3 retry)
15. [horizon] Feed detection + RSS ingestion; sitemap URL mapping
16. [horizon] Archival snapshots (HTML/MHTML); language detection/translation

**C. Crawl & multi-page** — research sessions → folders of sources
17. [v3-S4] Bounded crawl (depth/page/token budgets)
18. [near] Site snapshot → ExternalPayload children under a folder
19. [near] Incremental crawl; resumable frontier
20. [near] Parallel acquisition w/ per-domain politeness

**D. Monitoring & freshness** — the garden stays alive
21. [near] Watch-a-page → diff summary → inbox
22. [near] Watch-a-query → digests
23. [near] Staleness TTLs + re-acquire on access (dirty-bit pattern)
24. [near] Semantic diff ("what changed since I saved this")
25. [horizon] Link-rot report + Wayback fallback
26. [horizon] Structured value tracking over time (prices/stats)

**E. Garden integration (the moat)**
27. [v3] Acquisition hydrates ExternalPayload; url-strategy dedup
28. [v3] Provenance chain on every generated artifact
29. [near] Citation footnotes resolving to ExternalPayload nodes
30. [near] Auto-tagging/classification on capture
31. [near] Related-content surfacing (acquired ↔ existing notes)
32. [near] Full-text search over snapshots; offline reading
33. [horizon] Embedding index over acquired corpus (WebLLM synergy)

**F. Research orchestration (consumers)**
34. [v3] Playbook-driven research; session → note with source children
35. [near] Deep-research mode (budgeted plan→search→read→refine, cited)
36. [near] Comparison matrix builder
37. [near] Answer-from-these-links-only (bounded corpus QA)
38. [horizon] Source triangulation / claim-conflict detection
39. [near] Cost/budget surfacing per run

**G. Interop & ecosystem** — durable frame; garden as platform
40. [near] MCP client: external MCP servers as acquisition providers
41. [horizon] MCP server: expose garden + acquisition to external agents
42. [v3] P0 adapter layer (config translation + result normalization)
43. [near] BYOK for acquisition APIs (mirrors model BYOK)
44. [v3-S4] WDK step bindings; [near] n8n node binding
45. [horizon] Inbound ingestion (email-in/webhook → garden)
46. [horizon] Bulk import pipelines (Pocket/Instapaper/bookmarks)
47. [near] Web etiquette: robots modes, conditional GET, sitemaps

**H. Trust, safety, governance**
48. [v3] Policy engine + exact-origin bridge validation
49. [v3] Trust-tiered envelope; structural injection defense
50. [near] Prompt-injection scanning of acquired content
51. [near] Acquisition history/audit UI
52. [near] Consent ledger (per-domain grants w/ expiry + settings UI)
53. [near] Per-workspace policy profiles
54. [horizon] PII scrubbing on snapshots

**I. Performance & reliability**
55. [v3] Provider failover chains; TTL cache
56. [near] Cost/latency-aware routing
57. [near] Background batch queue (packed-batch pattern)
58. [near] Per-domain success telemetry feeding routing
59. [near] Degraded modes (no extension / server blocked)

**J. Recorded synergies** — Gemini Nano pre-summarization, WebLLM private
local tier, CDP interactive acquisition (P5), homeserver headless fleet
(P6), scheduled crawls via cron/n8n — on the Later shelf, restated here as
acquisition features.

## Open questions

- ~~Final surface confirmation~~ — RESOLVED 2026-07-17 (two-surface principle,
  decisions #1/#11–#13).
- Side panel on non-capturable pages (chrome://, Web Store): disable button or
  open panel in "no page context" mode?
- ~~Workspace scope + switch behavior~~ — RESOLVED 2026-07-17 (owner): per-window
  pointer + full swap + messaging-only guardrail (dot + toast); Opt B
  (carry-over pins) declined for v3; overlays persist independent of
  workspace. See decision #13.
- ~~Eager node creation default-folder UX~~ — RESOLVED by decision #7: the node
  is created in the chat's target folder; the tree chip changes it.
- Conversation title strategy for quick chats (page title vs first-message summary).
- ~~Conversation granularity per folder~~ — RESOLVED 2026-07-17: **per task**,
  each dual-associated to the folder (Folder Studio already supports multiple
  conversations per folder).
- Later niceity: AI-proposed retargeting ("this looks like Job Hunt content —
  switch target?").
