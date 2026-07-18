---
title: AI v3 Core Plan — app-side execution (agent runtime, acquisition core, targeted conversations)
status: approved_direction (split from AI-INFRASTRUCTURE-V3-PLAN.md 2026-07-17; build not started)
last_updated: 2026-07-17
owner: centervalentine
branch: fresh worktree — can start IMMEDIATELY (no workflows-extension-PR dependency; that constraint belongs to BROWSER-REACH)
parent: docs/notes-feature/work-tracking/AI-INFRASTRUCTURE-V3-PLAN.md (architecture umbrella — decisions #1–#14, subsystem specs, capability registers, feature catalog; intentionally UNMODIFIED for fork stability)
sibling: BROWSER-REACH-PLAN.md (browser surfaces; authored in a forked planning session off the same umbrella)
related:
  - lib/domain/ai/ (use-conversation-engine, providers, FEATURE_REGISTRY, conversation-persistence)
  - app/api/conversations/, app/api/ai/chat/
  - extensions/workflows/ (WDK — B-series consumer)
  - docs/notes-feature/work-tracking/FOLDER-STUDIO-PLAN.md (grounding reuse)
---

# AI v3 Core Plan (app-side execution)

Executes the app-side half of AI Infrastructure Upgrade v3. All architecture
authority — the 14 decisions of record, the Acquisition Service and Agent
Runtime specs, the A/B capability registers, the 59-item feature catalog —
lives in the parent umbrella doc and is cited here, never restated. This doc
adds only: the split manifest, the seam contracts, execution sessions with
gates, and core-plan-specific commitments.

## Split manifest (owner-approved 2026-07-17)

**This plan (core, app-side)** — everything with value at zero extensions
installed: Agent Runtime adoption, Acquisition Service (P0 ×4 vendors + P1),
the chat tool suite, playbook runtime, targeted conversations + URL entry,
document tools, Workspace entity/API, workflow mastery (B-series), resumable
streaming, context-discipline mechanics.

**BROWSER-REACH (sibling)** — everything whose purpose is the browser
surface: side-panel mini-DG shell + embed layout, launch-handle, context bar
(selection/viewport/page scopes + screenshot), overlay promotion gestures +
first-run tooltip, P2/P3 acquisition providers, per-window workspace
pointer, multi-tab context, settle-tab UX, exact-origin bridge hardening,
capture-chooser "AI" destination, browser-executor spoke.

Plans are **outcome-scoped, not directory-scoped**: some BROWSER-REACH code
lands in app paths (embed routes) — expected and fine.

**Split rationale:** umbrella decision #9 made the extension an enhancer,
never a dependency — so the flagship ships extension-free via URL entry
(A9). Splitting lets core start immediately, gives each plan honest gates
and clean PR streams, and each gets dedicated resources.

## Seam contracts (authority: THIS doc; BROWSER-REACH implements against these)

- **C1 — Acquisition provider interface.** What P2/P3 (later P4/P5)
  implement: `acquire(request) → AcquiredContent` per the umbrella's
  envelope spec; providers declare `{ modes, jsRendering, sessionAuth,
  cost, latency }`; every request routes through the policy engine. The
  extension registers as a *remote provider* over C2.
- **C2 — Page-bridge / embed protocol.** Message schema between extension
  and app: context payloads (pageText / selection / screenshot + metadata),
  target + workspace parameters into the embed, acquisition
  requests/results (P3-as-remote), conversation-open commands.
  **Exact-origin matching both directions, no wildcard origins**
  (ShadowPrompt lesson); versioned message envelope (`v` field) from day
  one.
- **C3 — Workspace semantics.** The Workspace entity + API are app-side
  (S6 here); the browser holds only a per-window active-workspace pointer
  and renders what the API returns. Full-swap semantics, overlay
  independence, and settle-then-associate timing (umbrella decisions
  #13/#14) are defined by the umbrella; the API shape is defined here.
  **RESOLVED at S6 (2026-07-18): the entity + API already exist** — the
  app's `ContentWorkspace` / `ContentWorkspaceItem` tables (named tab-sets
  with `paneState`, `settings` JSON, `viewRootContentId`, per-item
  assignments) and the complete route surface under
  `app/api/content/workspaces/` (CRUD, `[id]/state`, `[id]/assignments`,
  `[id]/duplicate`, `open-intent`, `reset`). BROWSER-REACH should consume
  these routes as-is for the "Browser Sessions" listing; the per-workspace
  default target folder can ride the existing `settings` JSON column —
  no schema change required. No new entity was (or should be) built.

## Context-discipline commitments (core-plan scope; extends the umbrella's Agent Runtime spec)

**v3 commitments** (build in S4): 1. **Run ledger** — per-run state note
(current phase, decisions, artifact index, open questions) in the derived
folder; always in context; doubles as A8's resumability index. 2. **Context
budgets + meter** — per-step token budget, eviction policy (oldest tool
results first; never ledger/playbook), visible meter in the debug panel.
3. **Summarize-on-write** — every artifact gets a 1–2 sentence abstract at
creation; re-reads pull abstract-first. 4. **Tool-result TTL** — acquisition
results collapse to their citation line after K steps (envelope already
persisted content to the garden).

**[near] tier**: just-in-time retrieval as default over pre-loading;
validated compaction (cheap-model cross-check of summaries against
artifacts); extraction subagents when input ≫ output; cache-aware message
layout (volatile content in newest message, stable system+tools);
tokens-per-successful-phase as an eval metric in the playbook harness.

## Approvals, verdicts & background runs (owner-specified 2026-07-17)

**Two approval layers:**
- **Phase checkpoints (conversational, tri-verdict):** every checkpoint
  message renders three quick actions — **Approve** (continue), **Revise**
  (do-over: re-run the phase incorporating the user's feedback), **Approve
  with tweaks** (apply the stated changes to the artifact, then continue).
  Free-text always works — a checkpoint is an ordinary chat turn; the
  buttons formalize the common cases.
- **Tool approvals (SDK-native, binary):** `needsApproval` on mutating
  tools; approve/reject + optional note via `addToolApprovalResponse`.

**Background continuation (leave and come back):** the tool loop runs
server-side; the client only renders the stream. Run state lives in the
conversation + run ledger, so the user can navigate away mid-run and
return — resumable streaming re-attaches the in-flight response. A run
paused on approval is fully at rest in the DB, indefinitely. **Phase
checkpoints double as durability checkpoints**: each phase execution is one
bounded server run, which also keeps executions inside function-duration
limits; runs that outgrow this graduate to WDK (umbrella B3).

**Notifications (owner-narrowed 2026-07-17): exactly two triggers, no
others.** (1) A run requests approval while its conversation is NOT
active-and-visible; (2) a run finishes (terminal state — success or
failure). Both notifications **deep-link to the conversation** (opens as a
main-panel tab — the DM-tab pattern). No notifications for any other run
event. Activity indicators supplement silently: Chats-list badge;
workspace activity dot (umbrella #13). Browser-side surfacing
(panel badge/routing) belongs to BROWSER-REACH via C2.

## Sessions (app-side; every gate verifiable in-app with zero extension)

### S1 — Agent loop adoption
- `ToolLoopAgent` + `stopWhen`/`prepareStep` into `useConversationEngine`
  (A5); `needsApproval` approval states rendered in the chat surface
  (foundation for A4); resumable streaming; server-side loop with
  leave-and-return continuation; **approval-pending inbox notification with
  deep-link** when the conversation isn't active-and-visible.
- **Gate:** a multi-step tool run pauses on an approval and resumes on
  grant; a streaming response survives a page reload; the user navigates
  away mid-run, receives the inbox notification, and the deep-link lands
  them back in the paused conversation.

### S2 — Acquisition core
- `AcquiredContent` envelope; P1 server-fetch (Defuddle + Readability);
  P0 adapters ×4 (Anthropic, OpenAI, Google, xAI) with policy→native-param
  translation; policy engine core (allow/deny/ask, budgets, audit log);
  garden hydration (ExternalPayload snapshot + retrievedAt).
- Tools: `search_web`, `read_page` (ladder = P1 → ask-user; P2/P3 rungs
  arrive with BROWSER-REACH via C1).
- **Gate:** URL entry acquires a job-board page with citations; the snapshot
  lands on the node; a denied domain is refused with the policy reason
  surfaced.

### S3 — Targeted conversations
- Target chip + compact folder picker in the chat surface header (umbrella
  #10); per-task conversations; first message find-or-creates the page node
  in the target folder (#2/#7, settle semantics #14); dual association
  (#8); chats surface on the node and in the folder's Studio history;
  virtual Chats list.
- **Gate:** a URL chat creates the node in the target folder; the same
  conversation reopens from both the node and the folder history.

### S4 — Documents + playbook runtime
- `create_note` / `create_docx` / `create_folder` with path-derived
  destinations (A2); playbook convention + progressive disclosure (A3),
  reference resolution (A6), folder ingestion (A7); propose_\* via
  `needsApproval` (A4); run ledger + phase-boundary context checkpoints
  (commitments 1–4 above); **tri-verdict checkpoint UI**
  (Approve / Revise / Approve-with-tweaks).
- **Gate:** a three-phase mini-playbook executes with phase approvals;
  a Revise verdict re-runs a phase incorporating feedback; an
  Approve-with-tweaks applies changes before continuing; artifacts land in
  the derived folder; the run resumes in a fresh conversation from the
  ledger alone.

### S5 — THE FLAGSHIP (in-app)
- jobhunt.md Phases 1–4 end-to-end via URL entry; Folder Studio grounding
  reuse; summarize-on-write live; per-run cost meter (catalog F39, basic).
- **Gate:** the umbrella's V1 demo script, entirely in-app, on a
  non-hostile job board.

### S6 — Workflow mastery + Workspace entity
- B1 `propose_workflow` (WDK graph out, canvas review); B2 `run_workflow` +
  conversation→run handoff; Workspace entity + API + in-app "Browser
  Sessions" listing (C3 ready for BROWSER-REACH).
- **Gate:** the AI authors a valid, canvas-reviewed workflow from chat;
  workspace CRUD via API drives the in-app listing.
- **BUILT 2026-07-18** — four tools in `lib/domain/ai/tools/workflow-tools.ts`
  (+ client-safe `workflow-metadata.ts`, merged into `ALL_TOOL_*` for the
  settings toggles): `get_workflow_node_catalog` (authoring reference
  rendered at runtime from `NODE_TYPE_METADATA` via
  `extensions/workflows/nodes/catalog-doc.ts` — third consumer of the same
  field specs as the builder forms and server enforcement, zero drift),
  `list_workflows`, `propose_workflow` (approval-gated; validates via
  `workflowGraphSchema` + `validateGraph` = full builder parity including
  per-node config schemas; invalid graphs return repairable GRAPH_INVALID
  issues, nothing created; result renders the clickable card via
  `__notePayload` + new `noun` field → click opens the canvas),
  `run_workflow` (approval-gated; resolves by id or title; dispatches
  through `dispatchWorkflowFromContent` — the same one-trigger-door the
  app and extension use). Both mutating tools auto-associate the workflow
  node with the conversation. Workspace half resolved as already-existing
  (see C3). **Gate pending owner smoke:** author → approve → canvas review
  → run.
- **S6 addendum (owner rule, same day): the OPEN workflow is the chat's
  default subject** — "chats serve their location" applied to the canvas.
  Added `get_workflow` (no-args = open workflow) and `update_workflow`
  (approval-gated full-replacement rewrite; blank trigger-only workflows
  get built out in place; canvas does not live-refresh — result says to
  reopen before manual edits, stale-canvas saves would clobber).
  `run_workflow` also defaults to the open workflow. Route detects an open
  workflow node → `openWorkflowTitle` prompt section states the default;
  document-editor tools stay OFF for workflow content. propose_workflow
  only for explicitly-new workflows or when nothing is open. Known gap
  (backlog, same family as file-tree refresh): canvas live-refresh after
  AI updates.
- **S6 addendum 2 (owner ask "both n8n and Trellis?"): `push_workflow_to_n8n`**
  (approval-gated, defaults to open workflow) wraps `pushWorkflowToN8n` —
  authoring stays single-model (Trellis graph); n8n is an execution
  target: compile → idempotent push → activate → engine flip, returns the
  n8n deep link. All node types compile (steps = HTTP callbacks into the
  app; gate/delay/branch = native n8n). run_workflow unchanged post-flip
  (same dispatch door). "The AI builds n8n workflows" — umbrella
  aspiration ("all the better") now covered chat-natively.
- **S6 addendum 3 (owner correction, 35cb9da): engines are NOT
  interchangeable — n8n is the assumed DEFAULT.** Precedence: user-named
  engine > the targeted workflow's current engine > n8n. propose_workflow
  takes `engine` ("n8n"|"trellis", unspecified = n8n; n8n = create+push+
  activate in one approved action, failed push = honest Trellis-pending
  state); update_workflow stays on the target's engine and AUTO-RE-PUSHES
  n8n-engine workflows (failed re-sync warns that n8n runs the old
  version); get/list report engine; push tool = engine-switch/forced
  re-sync only. Catalog completed for the owner's grounding question:
  8 trigger types added (wired/stubbed firing flags) + worked example
  rendered from the production jobApplicationGraph fixture. AI's workflow
  knowledge = 100%% runtime-derived (catalog from NODE/TRIGGER metadata +
  typed fixture) + builder-parity validation loop; n8n needs NO n8n docs —
  the compiler owns that translation.

## Verification conventions

`pnpm typecheck → lint → build` per repo standard, plus in-app browser smoke
per session gate against localhost:3015. No `extension:build`, no chrome
reload, no embed targets anywhere in this plan — if a session seems to need
them, its scope belongs to BROWSER-REACH.

## Provider integration lessons (living ledger — reread before the OpenAI/Google/xAI/Kimi passes)

Earned across six playbook smokes (2026-07-17/18), each entry a shipped fix:

| Law | Detail |
|---|---|
| Internal SDK sends must share user-send context | `sendAutomaticallyWhen`/regenerate bypass `sendMessage(msg,{body})`; a transport-level per-chat body resolver is mandatory, per-call wrappers are not enough |
| Resumes replay turn-start state | Live selection state can mutate mid-turn (stamp re-seeding); snapshot the body at send, replay on internal sends |
| Continuations need `originalMessages` | Without it the stream starts a fresh message and executed-tool results find no invocation → pipe death presenting as "network error" |
| Continuations need an UPDATE persistence path | Create-once + skip-saved-ids drops post-approval content; client PATCHes by parts-signature, server updates only uuid-id rows |
| Anthropic: tool_use/tool_result pairing is LAW | Any dangling pre-output tool part poisons every later send (400). Repair moved-past parts to output-error; never let a text message follow an unresolved pause |
| Provider-executed tool results are turn-scoped evidence | Anthropic search results carry multi-KB `encryptedContent` per result AND an output schema requiring it — strip-in-place fails validation; PRUNE the whole part from past messages (pairing intact by absence) |
| Gateway ids differ | `toolu_vrtx_*` / `srvtoolu_*` prefixes; `temperature` unsupported with thinking enabled (warning, harmless) |
| OpenAI: TPM tiers gate agentic loops | 30k TPM ≈ 3 steps/min at 9k/step; retry-afters come in ms AND s forms; webSearch needs the Responses API (default callable is fine) |
| Rate-limit patience must exceed the window | Retry-after hints are optimistic under rolling TPM; 5 retries ≈ 31s vs a 60s window |
| Straight-faced routing | Never substitute vendors under a picked label; MODEL_UNAVAILABLE with remedies beats a silent gpt-4o bill |
| Server-side tool execution has no `window` | `markdownToTiptap` degrades to plain paragraphs in Node (open followup: server-safe generateJSON) |
| Citation-split text parts (65ae4e7) | Native-search answers stream as MANY text parts — one per cited span — so bubble-per-part rendered fragment walls (lone "." / bare "- " bubbles). Render-side coalescing in ChatMessage merges text runs across invisible parts (source-url/source-document/step-start); join with "" reconstructs the original markdown. Provider-agnostic safety net — verify OpenAI/Google fragment shapes ride it during the reruns. |

## Open items (core-relevant)

- **Live stream re-attach needs a stream store (S1 partial, discovered
  2026-07-17).** Built: server-side `consumeStream()` + idempotent server
  persistence, so a disconnected client NEVER loses the turn — on return,
  the completed message is in the conversation. NOT built: live re-attach
  to an in-flight stream (`useChat resume`/`resumeStream` requires a
  resumable-stream store — Redis-class infra we don't run). Options when
  it matters: Upstash via Vercel Marketplace, or Redis on the Coolify
  homeserver. The gate's "survives reload" is satisfied at the
  no-lost-work level; live re-attach is a polish upgrade.

- Conversation title strategy for quick URL chats (page title vs
  first-message summary) — S3-time call.
- Workspace API shape details (C3) — S6-time; coordinate with BROWSER-REACH
  once its panel requirements firm up.
- Post-V3 queue (from umbrella): Kimi/Moonshot P0 + gateway + BYOK catch-up;
  acquisition explainer session for the owner.
- **Post-V3: prettify the approval card into a note-preview interface**
  (owner request 2026-07-17, after first live smoke of the S1 card). Today
  the card shows raw JSON args — functional and honest, kept for v3. The
  upgrade: per-tool preview renderers — `createNote` approvals render the
  proposed note as formatted markdown (title header + rendered body +
  destination folder breadcrumb resolved from `parentId`), matching how
  the note will actually look. Generalizes to `create_docx` (document
  preview) and future mutating tools; raw-JSON stays as the fallback
  renderer for tools without a preview.
