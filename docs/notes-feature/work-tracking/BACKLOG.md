---
last_updated: 2026-08-29
---

# Sprint Backlog

**Prioritized work items for upcoming sprints, organized by epoch.**

**Sprint Execution Protocol**: Before commencing any sprint, always ask the user for input before planning and executing — there may be additions or modifications.

---

## Quest master ledger under-counts sitting tokens (2026-09-04, first production quest)

- [x] **FIXED same day (`chore/release-tail`)**: the route now sums the turn's earlier segments (riding the trailing assistant message's `metadata.segments`) into `ctx.priorTurnUsage`; `turnTokensSoFar()` + `estimateRunCostUsd()` stamp turn-cumulative numbers at every checkpoint and at `closeSitting`. Residual caveat: prior segments are priced at the current executed model, so mixed-model turns carry an estimate — which is all the stamp ever claimed.

## Workspace layout: multi-tab last-writer-wins reverts D+D (2026-09-04; owner repro; lands with layout-intent "P4 live fan-in")

**PARTIAL FIX SHIPPED (PR #210, merged 2026-09-04):** the null-base write path now returns `conflict` instead of blind-overwriting (a writer with no compare base never loaded what it overwrites) — the adopt-and-retry loop converges in one round. The remaining items below (writer recency for PRIMED-but-stale writers, URL-re-projection question) still ride the fan-in phase.

Owner report during the Release-4 smoke: split-pane tab D+D "repeatedly regressed/ignored" on dev; prod unaffected; hard refresh helps. Diagnosed, not fixed (the fix IS the planned live fan-in phase, not a drive-by):

- [ ] **Null-base saves are unconditional overwrites** (`saveWorkspaceState` — no `expectedUpdatedAt` → plain update). Legitimate for first-save/layout-authority, but it lets any client whose `lastAppliedUpdatedAt` map is unprimed clobber newer state. Revisit the semantics with fan-in (e.g., server distinguishes "create/first write" from "stale blind write").
- [ ] **Writer UNIDENTIFIED (2026-09-04; two theories eliminated).** Eliminated: multi-tab live writers — owner's only other 3015 tabs were weeks-unviewed across several browser restarts, i.e. lazy-loaded/discarded, running no JS. Surviving single-client hypotheses: (a) **restore-from-URL re-projection** — the URL query is a full layout snapshot (`tabs_top_left=…`) that predates the drag; any cold-load/refresh path honoring the URL tiebreaker re-applies the stale arrangement with NO server write (fits: hard refresh recovers, prod has no HMR-driven re-runs); (b) **active-tab Fast Refresh** re-arming the shell's debounced persist against a stale snapshot or wiping the module-scope `lastAppliedUpdatedAt`/`lastAppliedSnapshotJson` maps (null base → unconditional overwrite); (c) the browser-extension side-panel embed as an invisible second client (unconfirmed). **Settling diagnostic on next repro:** drag once, note the time, then diff `ContentWorkspace.updatedAt`/`paneState` — a revert WITHOUT a new server write convicts (a); with writes, attribute the writer. Fan-in work should also add a writer recency/liveness signal regardless.

## Deferred batch execution for row-driven AI runs (2026-08-29; plan: EXTRACTION-TO-DATABASE-PLAN.md §3.3/§6, decision D4)

Stage-2 lead investigation (research a captured lead, tailor resume/CL) is
being built **live-but-batch-shaped**: the unit of work is `(tableId, rowId,
playbook)` with results stamped back as cell writes — independent,
restartable, order-free. That unit is exactly what vendor batch APIs consume.
Deliberately NOT built now: the repo has **zero deferred-AI infrastructure**
(every model call lives inside a request; the only offline-AI precedent is the
`studio-context-sweep` cron), and the discount halves a weekly number that is
currently small. Build when row volume or model tier makes the number real.

- [ ] **Deferred batch runner.** Submit → poll → reconcile substrate (cron or
  queue) consuming row-work units; results land via the same validate-all
  upsert helper as live capture. Requires direct-vendor BYOK keys — gateway
  routing does not broker batch jobs.
- [ ] **Model the discounts in `pricing.ts`** — batch/flex tiers are
  explicitly listed as unmodeled today (pricing.ts header); the turn
  accumulator prices per-request and would misprice batch results without a
  tier flag.

**Savings survey (list prices as of 2026-08; re-verify before building):**

| Vendor | Offering | Discount | Turnaround |
|---|---|---|---|
| Anthropic | Message Batches API | **50%** input+output; stacks with prompt caching | most <1h, ≤24h guaranteed |
| OpenAI | Batch API | **50%** | ≤24h window, separate quota pool |
| Google | Gemini batch mode | **50%** | ≤24h |
| Mistral | Batch API | **50%** | ≤24h |
| Groq | Batch processing | **~25%** | ≤24h |
| DeepSeek | No batch API — automatic off-peak windows (UTC 16:30–00:30) | up to **50–75%** off-peak | immediate (just schedule into the window) |
| xAI | No public batch API at time of writing | — | — |

The DeepSeek row matters for a cheap runner: a scheduler that simply *fires
during the off-peak window* gets batch-class savings with the ordinary
synchronous API — potentially the lowest-effort first increment (a cron that
runs queued row-work at night through the existing live path), ahead of any
true async-batch substrate.

## Workspace Workbenches — follow-ups (2026-08-26, branch `feat/workbenches`; plan: WORKBENCHES-PLAN.md)

Built and committed: workbench rows (`parentWorkspaceId` + `dormantAt`), dwell submenu nestable to 3 layers, hide/reorder per layer, lifecycle hooks (archive on delete, purge on hard delete, dormant-clearout cron), tab counts, tri-state tree scope, and the redundant view-root row fix. Remaining:

- [ ] **`vercel.json` cron entry for `/api/cron/dormant-workbenches`** — the route exists and is CRON_SECRET-guarded, but nothing invokes it in production yet, so dormant benches accumulate silently. Daily is the intended cadence (matches `purge-trash`).
- [ ] **Claims: inherit vs independent** (the plan's one open question). Workbenches currently claim content independently, like any workspace — zero special cases, but two benches under one parent can each borrow the same note and conflict with each other. Revisit only if that actually bites; the alternative (inheriting the parent's claims) makes open-intent resolution depth-aware.
- [ ] **Server list endpoint is root-only.** `listWorkbenchFolders` serves layer 1; nested layers derive client-side from the one scoped-tree fetch. Fine while the submenu is the only consumer — if a second surface (mobile, extension panel) ever needs workbenches, it needs a depth parameter rather than a second tree walk.
- [ ] **Dormant sweep is per-row.** `sweepDormantWorkbenches` does a hop-walk per workbench (≤3 point reads each). Correct and cheap at personal-vault scale; if a tenant ever holds hundreds of benches, batch the ancestor resolution.
- [ ] **`membershipContentIds` union for tab counts** is computed client-side per row. If the count ever needs to appear somewhere without the full workspace payload, push it into `ContentWorkspaceResponse` as a scalar.

## Co-browse bind-first + navigation awareness — follow-ups (2026-08-18, after the co-browse performance PR)
## Database content type — follow-ups (2026-08-26, branch `feat/data-content-type`; plan: DATABASE-CONTENT-TYPE-PLAN.md)

- [ ] **AI decision-survey card (owner-requested 2026-08-28).** When a chat
  request is ambiguous between surfaces (note body vs row cells; which of
  two databases; rename vs duplicate), the model should present a
  Claude-style choice card the user clicks, not free-text guessing. Today
  the row-page grounding carries prompt-level "ask, name both options"
  guidance; the real affordance is a small tool (`ask_user_choice`) +
  chat-card UI + harness handling of the selection as the next user turn.
  Generalizes the flashcard proposal-card and update_row confirm patterns.
- [ ] **Drag-a-row-into-the-tree promotion trigger (Phase 5 deferral).** The
  plan lists tree drag-in among the deliberate promotion triggers (role
  "primary", parentId = drop target). Deferred from the Phase 5 pass: the
  file tree is react-arborist, whose drag-and-drop is internal react-dnd —
  accepting an external HTML5 drag from the data grid means bridging the
  grid into arborist's DnD context, real surgery on a shared surface. The
  same outcome already composes from two working primitives (Open as page →
  move the node in the tree; rows are freely movable, plan O11 resolution),
  so the trigger is sugar. Build when the tree next gets DnD attention.
- [ ] **Table-grant → promoted-row-page access fallback (multi-user).** B3
  verification (2026-08-26) confirmed ViewGrant is flat, so no folder-grant
  leak exists — but a TABLE grantee can read a row's cells via the data
  routes while its promoted page 404s (per-node resolution, fails closed).
  When multi-user matters: teach `/api/content/content/[id]` the
  `promotedFromRow → resolveDataRowAccess` fallback (additive-only union).

- [ ] **(Parked — keep-forever is the decision) Stale column links.** Owner
  raised a cron sweep for links of soft-deleted relation columns, then asked
  the better question: is keeping them even bloaty? It is not — a
  `DataRowLink` is ~100–150 bytes with indexes, hydration filters by LIVE
  column ids so stale links are never scanned per request, and hard-deleting
  a database cascades everything anyway. Keeping them forever costs
  kilobytes and buys UNBOUNDED column undo (the `Restrict` FK, plan V1-2,
  restores a column with all relationships intact at any distance). Decision
  2026-08-26: no cron; revisit only if a real vault ever measures otherwise.
  If one is ever built: links first (Restrict demands the order), then the
  column, then vacuum orphaned cell keys; dry-run mode; `app/api/cron/`
  pattern.

## Co-browse bind-first + navigation awareness — follow-ups (2026-08-18, after `feat/cobrowse-bind-first`)

Surfaced while building bind-first topology / `documentChanged` / primary-scroller enumeration; not blocking:
- **Same-site vs same-page bind heuristic.** `startSession` binds the user's tab for any same-site url (host modulo `www.`). If smoke shows the model passing a same-site url for a genuinely different task ("now search X" while the user sits on an unrelated page of the same site), consider a `bindPolicy` hint or a path-distance rule — but only with evidence; the current rule deliberately favors the user's page state.
- **Scroll a NAMED container.** `scroll`/`collect` pick the primary scroller heuristically (window vs dominant inner pane). A `role`/`name` target on `scroll` ("scroll the container holding this element", via `DOM.scrollIntoViewIfNeeded` on the last collected item) would make virtualized side-lists that don't dominate the viewport enumerable too. Add when a real page needs it.
- **Harness-enforced item itinerary.** Per-item runs now freeze the enumerated list by observed `href` at the prompt level; the ledger already tiers url > label. If drift persists, have `propose_item_iteration` reject/flag "next" items whose keys aren't in the approved set (code guarantee over prompt).
- **`documentChanged` for OOPIF-hosted lists.** `docId` is the TOP frame's loaderId; a results list living inside an embedded ATS iframe (Greenhouse/Lever) navigates the child frame only. Extend `currentDocId` to include child-session loaderIds when Slice-4 targets show it matters.
- **Pre-existing:** the engine had been dropping `scroll`'s `atBottom` (lived in `res.data`); now forwarded. Audit other act ops for the same `res.data`-vs-`res` shape assumption.

## Layout intent/projection — follow-ups (2026-08-16, after P1–P3 on `feat/layout-intent-projection`; spec: LAYOUT-INTENT-PROJECTION-PLAN.md)

- **F2 sync affordance** — workspace-bar dropdown of per-device layout records (<30d, data already in `ContentWorkspaceResponse.layoutRecords`), radio to pick the lead layout overriding the R5 chain; expiry falls back to default.
- **F1 Main-workspace-only "adopt into new workspace"** — snapshot current tab layout into a new workspace (quick name + icon; reuse the workspace-create dialog).
- **P4 client tab events** — call `POST/DELETE …/tabs` from open/close actions directly (today R1 truth rides the legacy PATCH dual-write); then live membership fan-in (presence-poll channel is the natural carrier).
- **P6 settings split** — device / universal / universal-with-override buckets (spec §7).
- **Legacy cleanup (expand-contract "contract")** — once all clients write records: stop applying/writing `layoutMode`/`activePaneId`/`paneState` blob, then drop the columns with a migration.
- **Right-sidebar <960px auto-collapse** — fold into projection when next touched (lowest priority; writes only device-local state).
## Nested-editor event-routing examination (2026-08-14, after Note Window; owner-requested)

Systematic study of focus/selection/drag/keyboard/IME routing through **stacked ProseMirror editors** at depth ≥2: the `stopEvent` allowlist in `node-view-factory.ts`, `.block-note-window-mount` boundaries, BubbleMenu/suggestion-plugin scoping (which editor's slash menu / wiki-link autocomplete fires when nested?), and the `noteWindowDepth`/`noteWindowAncestorTargetIds` plumbing. **Plus the window-CustomEvent addressing audit**: the 2026-08-15 mermaid-multiplication regression proved window-level events with no editor addressing fan out to every mounted MarkdownEditor. `create-diagram-block`, `embed-diagram-create`, and `block-attrs-change` are fixed (editor in detail + listener guard); still unaddressed and needing the same treatment or an explicit single-instance argument: `editor-image-upload`, `editor-open-ai-image`, `insert-ai-image`, `insert-ai-audio`, `scroll-to-heading`. Goal: a safe plan for reducing bugs when editors get nested. **Prerequisite before ever relaxing the Note Window depth cap (currently: depth 1-2 collapsed→snapshot, depth ≥3 chip) or making nested windows editable.** Context: the Note Window v1 deliberately keeps nested windows read-only/never-runtime-acquiring precisely because two-editors-deep event routing is where embedded-editor bugs breed.

(The diagram-header rename desync — excalidraw/mermaid titles never PATCHing the real file — was a backlog candidate here but got fixed in-scope with the Note Window work, 2026-08-14.)

---

## Collab write path — Slices 2–4 + the server-side edit executor (2026-08-12, after `feat/collab-write-path`; plan: AI-COLLAB-WRITE-PATH-PLAN.md)

- **Slice 2 — `firstOpenedInEditorAt`** (migration + backfill). Slice 1 uses the `CollaborationDocument` row as the "does another copy exist" discriminator. It is a leaky proxy: the client creates an IndexedDB cache unconditionally on open, so a note first opened while Hocuspocus was unreachable has a cache but no row, and an AI write to it takes the payload path and can still be masked. The stamp is set inside the existing `POST /api/collaboration/state` (no new request), backfilled from notes that already have a row.
- **Slice 3 — advisory lock** closing the check-then-write race. The AI reads the discriminator, then a user opens the note before the write lands, and the fresh bootstrap masks it. A Postgres advisory lock keyed on contentId, taken by both the bootstrap fetch hook and `writeNoteContent`, makes the two orderings the only outcomes. Must be `try`-flavoured with fall-through, DB-scoped, and **never held across the Hocuspocus HTTP call** — this is the only change in the plan that could stop a document from opening.
- **Slice 4 — `readNote` → `tiptapToMarkdown`.** The AI read path returns flattened plain text (no headings, no structure) while `replace` mode asks the model for a faithful full document. Measure the context-cost delta against the diet budget before shipping.
- **Wake slept clients on OTHER devices via a presence-heartbeat hint.** Wake-on-write
  (shipped 2026-08-13) covers the tab that caused the write. A second browser or device
  holding the same document open-but-slept still shows stale text, and — checked, not
  assumed — returning to that tab does **not** fix it: the visibility handler re-promotes
  only when `browserSessionTopology === "multiSession"` or `remoteCollaborationTopology
  === "remotePresent"` ([runtime.ts:2165-2173](../../../lib/domain/collaboration/runtime.ts)),
  so a solo user's second device stays local-only and keeps its IndexedDB copy. Only a
  reload (fresh bootstrap re-fetches canonical state) or a promotion converges it. That
  gate is correct for the cost design — it just predates server-side writes being possible
  at all.
  **Design:** the presence heartbeat already runs on a dormant cadence while slept, so it
  is an existing client↔server channel that costs nothing extra. Return the document's
  server-side version on the heartbeat response (`CollaborationDocument.updatedAt` is
  sufficient and already stored); the client records that value whenever it is
  connected/synced (by definition up to date), and if a heartbeat while slept reports a
  NEWER value, it promotes itself with the existing `"remote-write"` reason. No new
  transport, no keepalive sockets, no change to sleep thresholds; convergence latency is
  one dormant heartbeat interval.
  **Rejected alternative:** a server→client push channel to disconnected clients — that is
  precisely what sleep exists to avoid.
- **Convert the four remaining edit tools to client execution.** `apply_diff` was
  converted 2026-08-12 after a smoke run showed it announcing success before the client
  attempted the edit (payload + write receipt returned from the server `execute`), so a
  failed edit produced "Done …" in the transcript and an "Updated note X" chip over an
  untouched document. `replace_document`, `insert_block`, `update_block` and
  `insert_image` still have that shape. Pattern to follow: drop the server `execute`,
  handle the call in the engine's `onToolCall` via `editExecutorRef`, return the
  orchestrator's real `EditResult`, and emit a receipt only after the edit lands.
- **A server-side executor for the existing edit ops (the "(ii)" decision).** Targeted editing already exists client-side — `apply_diff`, `update_block`, `insert_block`, `list_document_blocks`, chunked reads — but is gated to the chat's rooted document (`editableContentId = contentId && !isChatContent && !openWorkflowTitle`, chat route ~line 991). So a sidebar chat on a note gets precise edits while a **full-page chat, i.e. the playbook flow, gets only `updateNote`**. Giving those ops a server-side executor is what makes modification (not just addition) affordable on any document: `replace` costs O(document) tokens per edit in both directions. Two real design questions first: what an AI edit should look like when it arrives as a *remote* Y update rather than a local one (the orchestrator's animation and editor lock assume it causes the change), and how the orchestrator's application semantics separate from its UI entanglement. Slice 1's `append` overlaps a future server-executed `insert_block` — absorb or deprecate it, never a third path.

## Context diet — follow-ups (2026-08-09, after PR #156 Sprints 7–8; measurements in the `ai-reliability-fix-plan` memo)

Owner direction: generalize beyond the shipped named-param stripping — review real sessions to find the NEXT bloat class, especially **non-informative fluff in the HTML/content itself**. Hard boundary from the elision analysis (see `read-elision-rejected` memory): every cut must be *provably absence-safe* — structural chrome and opaque tokens, never evidence the analysis might judge. Fuzzy/heuristic removal of content text stays banned.

- [ ] **Learn-and-heal session audits.** Script the decomposition harness used in the 2026-08-08 analysis (chars by part type, resend curve, consecutive-snapshot repetition ratio) so it runs over recent co-browse conversations on demand. Each audit's findings graduate into concrete diet rules — this loop is what caught tracking params; it should catch whatever is next.
- [ ] **Maintained tracking-param ruleset.** Replace the hand-named `TRACKING_PARAMS` sets (app `co-browse-tools.ts` + extension `snapshot.js` — keep them as fallback) with a vendored community ruleset (ClearURLs rules DB or AdGuard's tracking-params list) per the repo's prefer-maintained-standards rule. Skip value-length/entropy stripping for any URL the model may navigate to — presigned/filter URLs carry functional long values.
- [ ] **HTML/content fluff pass.** Audit what still reaches the model after the existing filters (AX-tree interactable+orientation allowlist, readability extraction, overlay/embed-frame exclusion, delta snapshots): candidates are cookie/consent banner subtrees, skip-links, icon-only elements with verbose accessible names, repeated per-card action labels ("Dismiss job", "Save"), `banner`/`contentinfo` boilerplate in reads, and page-read text outside the readability main region. Measure first (via the audit script), cut only what classifies as chrome by ROLE/STRUCTURE — not by content similarity.
- [ ] **Canonical-URL surfacing.** Extension reports `<link rel="canonical">` alongside the address-bar URL — clean ledger keys and dedup on tracking-heavy sites (LinkedIn job pages canonicalize to bare `/jobs/view/ID`). Display/dedup hint only; never substitute it for the navigation URL (pagination canonicals lie).

## Folder Context Capsule — follow-ups (2026-08-06, branch `feat/ai-context-capsule`; plan: FOLDER-CONTEXT-CAPSULE-PLAN.md)

- [ ] **Recent-activity projection in the capsule** — "what changed lately" derived from `updatedAt` columns; zero LLM cost; valuable "what the user is up to" context. Deferred by owner decision.
- [ ] **Glossary section** — promote when the AI demonstrably fumbles folder-local vocabulary (acronyms, entity names). Interim home: `directives` prose.
- [ ] **Conventions/patterns section** — "a well-formed item here has sections X/Y/Z"; promote when creation-tasks need it. Interim home: `directives`.
- [ ] **`search_folder` probe tool** — scoped full-text search within a subtree (needle-shaped queries; cheaper than walking). Global `searchNotes` is the interim fallback.
- [ ] **Latency-class warning in Feature Routing UI** — flag when a slow reasoning model is routed to a background-frequency route (`studio-metadata`, `ai-context-enhanced`). The gate's stale-serve ladder already prevents hangs; this is advisory.
- [ ] **Contract migration: drop `contextOptOut`** — the expand/contract second half (sweep B4). After one release on `contextMode`, remove the boolean column + `explicitMode` transition logic.
- [ ] **Settings relocation** — `autoContextMode`/`dailyCallCap` storage keys live under `settings.studio.*` and the UI under `/settings/extensions/studio`, while the engine is core domain now (D2 identifier stability). Relocate keys + surface when worth a settings migration.
- [ ] **File-tree context-menu quick-set** for context modes (rail is the only surface today).
- [ ] **Dev-DB reproducibility** — local dev Postgres predates the baseline squash and carries push-drift (`SearchConnection`/`SitePage`/StudioContextSpend FK) + stale `_prisma_migrations` rows; a `migrate reset` on a day dev data doesn't matter restores `migrate dev`. (The capsule migration was applied via `db execute` + `resolve` for this reason; its recorded checksum predates the final file — cosmetic, dev-only.)
- [ ] **Anthropic template curation** — `claude-haiku-4-5` added (build gate requires suggestions ∈ template); the remaining entries (sonnet-4, sonnet-3-5, opus-4, retired haiku-3-5) are dated — refresh via the catalog-freshness pass.
- [ ] **Cross-folder `relations` section** — edges like "Banks draws evidence from Experience"; revisit if root roll-ups prove insufficient.

---

## Per-item iteration + co-browse — follow-ups (2026-08-05, after the per-item-playbook-checkpoints PR)

Surfaced during the reliability sweep; not blocking the PR:
- **Restart-vs-recover by idempotency.** Co-browse session recovery re-attaches to the same tab (preserves in-progress state, e.g. a half-filled application). For URL-addressable/idempotent work (read iteration) a fresh re-open is simpler + safer; for stateful work (forms) re-attach is essential. Refinement: remember the last URL + whether an uncommitted action was in flight, and pick restart vs recover accordingly.
- **Round-2 playbook chaining.** The URL-linked roll-up now *enables* "take the qualified set → run a resume-tailoring playbook over those exact pages" via the pasted-URLs enumeration source. New feature, not yet built.
- **Broader NotePayload↔Y.Doc seam.** `updateNote` now reseeds the collab Y.Doc after a NotePayload write; audit other server write paths (imports, migrations, other tools) for the same "edit invisible in an open collab note" gap.
- **PWA → extension co-browse handoff** (carried from Phase 2b) — co-browse is unavailable in the installed PWA (no side panel); a handoff to a browser tab is a nice-to-have.

## AI Block Authoring — follow-ups (2026-08-03, after the insert_block feature wraps)

The `insert_block` tool (Phases 0–2, branch `feat/ai-block-authoring`) lets the AI **create** rich editor/publishing blocks — leaf blocks plus containers (columns/tabs/accordion/cardPanel/listContainer) with nested content. Surfaced during smoke-testing; pick up **after** the current AI-blocks work ships:

- [x] **AI block EDITING (`update_block`) — SHIPPED (Phase 3, branch `feat/ai-block-editing`, 2026-08-04).** The AI can now list a note's blocks (`list_document_blocks`), edit an existing block's attrs in place (`update_block(blockId, attrs)`, applied via the orchestrator's `setNodeMarkup` at the block's position), and insert between blocks (`afterBlockId`). Remaining edge: `update_block` patches **attributes** only — it can't add/remove a container's children or rename a non-registered `tabPanel` wrapper.
- [~] **List-item sub-shape hints — PARTIALLY addressed (Phase 3).** `insert_block`/`update_block` now surface each attr's Zod `.describe()` inline (including item shapes like `featureList.items {icon,title,description}`), which fixed the "undefined" titles for the common blocks. Remaining: an on-demand `get_block_schema` tool for deeper shape disclosure on more exotic/nested blocks.
- [ ] **Phase 2b — prose children in containers.** Allow paragraph/heading (with text) as container children — currently only registered blocks can be children, so "a card with a paragraph of prose" isn't expressible. (Custom tab labels — **DONE in Phase 3**: tab children take a `label`.)

---

## Registry-authoritative model population → PROMOTED to AI 3.5 (2026-07-25)

**Now the AI 3.5 milestone — in progress** (`AI-ROADMAP.md`). The catalog-drift safety net shipped (see `guides/ai/MODEL-CATALOG-FRESHNESS.md`): fetch reconciliation flags/freezes provider-retired models, danger affordances surface them, routing skips them, and a `MODEL_RETIRED` chat error points at re-fetch. AI 3.5 stops pre-installing model lists entirely:

- **Auto-populate on install.** When a user adds a provider connection (with a valid key), auto-fetch its model list from the registry instead of relying on the template's seed `defaultModels`. Templates would then carry only provider metadata (endpoint, adapter kind, key hint) — no hardcoded model ids to go stale. Bootstrapping edge cases to handle: fetch failure at create time (fall back to seed + prompt manual fetch), and providers without a model-list API (keep manual entry + the permanent warning).
- **Monthly model-category cron (STAYS BACKLOGGED — owner "we can back log that").** Provider `/models` payloads don't reliably classify models by category (realtime / audio / image / reasoning / …). Categories are inferred at runtime today via `inferCapabilities` (id patterns, `lib/domain/ai/features/capabilities.ts`). A monthly cron maintaining an authoritative category map is an enhancement over that inference — build only if runtime inference proves too brittle (new provider naming patterns slip through). NOT part of the 3.5 build.

## Chat surface UX → FOLDED into ~AI 3.8 chat control panel (2026-07-25)

**Both items are now the ~AI 3.8 milestone** (`AI-ROADMAP.md`, "right before T6"): the control-panel sprint absorbs the rail-crowding item; a fix sprint in the same milestone handles the expand-loses-settings item. Detail retained here for reference. These are **pre-existing** issues (not caused by AI 3.4 model routing) noticed while smoke-testing it.

- **Expand-to-full-view drops inherited chat settings.** Expanding a sidebar side-chat to the full-page viewer loses the target-folder and context chips (e.g. sidebar shows an inherited "AI Playbook Tests" folder target; the expanded view shows "No target"). Root cause: `ChatPanel` and `ChatViewer` each hold their **own** `targetFolder`/`activeContextId` state seeded from **different** sources — the sidebar derives an *inherited* target from ambient open-content context (`targetInherited`), while the full-page viewer seeds from `initialTargetLocation` / a `/api/conversations/:id` fetch and never re-derives the inherited value. The **model pin and output-target DO carry** (both keyed by the shared `dg:*:conv:${conversationId}` localStorage key). Fix: make target-folder + context single-sourced across the two surfaces (server-persist the inherited target on selection, or have the viewer re-derive it), so expand is loss-less. Touches `components/content/ai/ChatPanel.tsx`, `components/content/viewer/ChatViewer.tsx` (both `targetFolder`/`targetInherited`), and `handleOpenInPage`.
- **Side-chat delete is undiscoverable + tab rail crowding.** The only delete path for a side-chat tab is the right-click action menu (`SidebarChatTabs.tsx` — the visible tab `X` is "Unpin from this content", hover-gated, not delete). Users can't find how to delete a side-chat. Partial mitigation already shipped (2026-07-25): the footer control rail scrolls horizontally instead of clipping (`ChatInput.tsx`), and the tab strip already has `overflow-x-auto`. **Enhancement wanted:** condense the tab strip + footer control rail (model picker, target/output/pin chips, expand) into a denser, less cluttered layout, and surface an always-discoverable delete affordance for side-chats (visible close `X` or a kebab menu), not right-click-only.

---

## Approval cards → rich, previewable (needsApproval overhaul) (2026-07-31)

**Future overhaul — not now.** Today's `needsApproval` HITL cards render the
thing-being-approved as flat text/JSON blocks. Overhaul so an approval **previews
what it's approving** with content-type-appropriate affordances, so the user can
tell *from presentation* what the action is and what it will produce:

- **Rich-text / TipTap preview** when the payload is note content — render the
  proposed TipTap (as it will look), not raw markdown/JSON.
- **File-attachment affordance** for generated files — clicking the attachment
  chip opens a preview (mirror the composer's attachment chip).
- **Structured field previews** — e.g. a research-plan card showing objective /
  sources / budget / target / ledger as organized, scannable fields (not a JSON
  dump); a form-fill checkpoint showing the filled fields.
- **Principle:** steer away from flat blocks of text; the approval should be
  self-explanatory and let the user preview results readily before deciding.

Surfaced while scoping **Agentic Browsing Phase 1** (its research-plan card
reuses `needsApproval`). The same overhaul benefits `createNote`,
`phase_checkpoint`, and the future co-browsing action checkpoints
(`AGENTIC-BROWSING-PLAN.md` Phases 3–5), so it's a shared-surface investment.

**Shipped so far (2026-08-01, from the Phase 1 smoke test):** the generic
approval renderer now **humanizes field labels** (camelCase → "Spaced Label",
`ChatMessage.tsx`). Still pending here: per-field **tooltips** (thread each
tool's zod `.describe()` text to the client so a value's meaning is hoverable)
and the richer per-tool previews above.

---

## AI model handling (surfaced during Browser Reach B2, 2026-07-21 — AI-core, do after browser core)

- [x] **AI v3.2.2 prompt-cache foundation** — stable OpenAI cache keys,
  provider-neutral read/write/hit-rate traces, and cross-run Active Playbook
  prefix ordering built on `codex/ai-v3.2.2-prompt-cache-foundation`; see
  `AI-V3.2.2-PROMPT-CACHING-PLAN.md`.
- [ ] **Prompt-cache policy graduation** — review measured reuse cadence before
  enabling paid writes: Anthropic 5m first / selective 1h, Google explicit only
  for large recurring corpora, GPT-5.6 explicit breakpoints after the OpenAI
  adapter exposes the current options contract. Do not add keep-warm requests.
- [ ] **Model-catalog "not found" false-availability** — the model picker marks a model available whenever a Connection advertises its id, but the provider can still 404 it on use (observed: `claude-haiku-3-5` → "Model 'anthropic/claude-haiku-3-5' not found", routed through the AI Gateway connection). `isModelAvailable` (`components/content/ai/MakeAndModelPicker.tsx`) trusts the connection's claimed model list; needs validation against what the provider/gateway actually serves, or a use-time fallback.
- [ ] **Don't default to / allow selecting an unavailable model** — `useModelSelection` (`components/content/ai/ModelPicker.tsx:149`) falls back to a hardcoded `claude-sonnet-3-5` that may have no key; resolve an *available* default instead. Keep unavailable models greyed for discoverability but make them non-selectable (hard-disable), per owner.
- [ ] **Gate `web_search` by model capability, not provider** — chat route (~L534) attaches `search_web` whenever the provider is a native-search vendor; models like Claude 3 Haiku don't support it and Anthropic 400s (`web_search_20250305 ... does not match expected tags`). Attach only for models that support the server tool.

---

## Browser Reach B2 followups (surfaced 2026-07-21, PR #123)

Panel workspace + page-aware chat + Quick access + chat-about-page shipped. Deferred by design:

- [x] ~~Composer auto-focus on "Ask AI about this page"~~ — **SHIPPED (PR #123)**: `ChatInput` focuses itself (caret at end) on mount when it opens with content in the panel embed (`isPanelEmbedSurface()`), scoped so it never steals focus from the app editor.
- [ ] **Page nodes land at tree root** — `createExtensionContentPickerItem(type:"external")` creates the page's external node with `parentId: null` (root). Consider a dedicated "Web pages" (or per-domain) folder so "Ask AI about this page" doesn't accumulate nodes at the tree root. Dedup already prevents duplicates per URL.
- [x] ~~On-demand reader injection for capture~~ — **SHIPPED (PR #123)**: `src/reader` bundles a UI-free `dg-extract-content` responder to `dist/reader.js`; the panel host injects it via `chrome.scripting` when a tab has no overlay, then retries. Only fires when the overlay is absent (no double-listener). ⚠ verify `chrome.scripting.executeScript` works from the side panel at runtime.
- [ ] **Re-verify fresh-tab / stale-tab capture end-to-end** — confirm page-context attach works on a tab that predates the extension load (the reader-injection path) and on a freshly-loaded tab. Panel auto-recovery self-heals the panel context; this verifies the capture half.

---

## AI v3 Core Followups (2026-07-18, branch `worktree-ai-v3-core`, PR #114)

S1–S6 built and MERGED (PR #114 / `9f15281`); Anthropic + OpenAI flagship runs passed. **AI v3.1 (R1–R6) is BUILT but UNMERGED — 18 commits on `worktree-ai-v3-core` ahead of main, no PR opened yet.** Status below reflects 3.1 delivery; the memory-bank / JIT-retrieval / validated-compaction thread is deferred to AI V4 (design captured in `AI-V3.1-PLAN.md`'s final section).

- [x] **Mid-run document review disruption** — BUILT 3.1 R1 (`d84b710`): artifact cards open in a split pane during active runs; peek overlay descoped. *Smoke pending.*
- [x] **Note-card right-click "Open in pane"** — BUILT 3.1 R1 (`d84b710`): portaled menu on every artifact card, both chat surfaces. *Smoke pending.*
- [ ] **[→ 3.2 T2] Markdown ↔ TipTap source-view toggle** in the editor toolbar (owner request) — view/edit a note's markdown source alongside rich text.
- [x] **Model-selection stickiness** — BUILT 3.1 R3 (`6cd7d2d`): persisted last-explicit-pick; chain = conversation stamp > last pick > settings. Root cause included a dead `claude-sonnet-3-5` fallback. *Smoke pending.*
- [x] **File-tree live refresh** — BUILT 3.1 R2 (`d84e945`): refresh dispatches on tool-output arrival mid-stream, not at turn end. *Smoke pending.*
- [x] **Canvas live-refresh after AI `update_workflow`** — BUILT 3.1 R2 (`d84e945`): builder listens for `dg:workflow-refresh`; clean canvas reloads, dirty canvas gets a non-destructive banner. *Smoke pending.*
- [ ] **[→ 3.2 T4] Resumable-stream store (live re-attach)** — no-lost-work already ships (server `consumeStream` + idempotent persistence); live re-attach to an in-flight stream needs Redis-class infra (Upstash via Vercel Marketplace, or Redis on the Coolify homeserver).
- [~] **[→ 3.2 T3] S4c playbook progressive-disclosure registry** — P1–P4 + P5-mark BUILT (branch `feature/ai-v3.2-t3-playbooks`, gates green, smoke-tested; not yet merged/PR'd). See `AI-V3.2-T3-PLAYBOOKS-PLAN.md` and the new "AI v3.2 T3 followups" section below for what's deferred.
- [ ] **[→ 3.2 T1] HARDEN the markdown ↔ TipTap translation layer (owner directive 2026-07-20 — "I don't like this patching approach")** — markdown content will keep arriving (AI tools, imports, pastes, publishing), so translation correctness must be a hardened, tested seam rather than a series of repair scripts. Scope when taken up: ONE canonical translation entry point (server + client parity), round-trip test coverage (markdown → TipTap → markdown) over the real node/mark set, explicit failure behavior instead of a silent paragraph fallback, and collab-aware repair semantics (Y.doc is authoritative for collab notes — payload rewrites are invisible/divergent). `scripts/regen-degraded-notes.ts` (R6) is the SALVAGE tool for already-degraded content and should be folded in as the backfill arm of that work, not extended piecemeal.
- [~] **Regen sweep for pre-fix degraded notes** — TOOL BUILT 3.1 R6 (`af4dca6`, `pnpm notes:regen`). Dry run: 57 payloads → 4 degraded + 3 collab-skipped. **1 of 4 applied** (Resume, verified). Remaining: 3 non-collab notes unapplied by choice; the 3 collab-live notes need the hardening work above, not a patch.
- [ ] **[→ 3.2 T5] Conversation title strategy for quick URL chats** — page title vs first-message summary (deferred S3-time call).
- [x] **Context-discipline near-term set** — BUILT 3.1 R5 (`4d1687a`): tokens-per-phase meter + ledger stamps, extraction subagent (`tool-result-extraction` route), cache-aware prompt ordering. **Validated compaction split to R5b → deferred to V4** (no history compaction exists to validate — net-new hot-path work). JIT retrieval stays with V4 memory. *Smoke pending — extraction needs the feature routed.*
- [x] **Kimi/Moonshot + DeepSeek catch-up** — BUILT 3.1 R4 (`1241291`): BYOK templates + DeepSeek adapter, gateway parity verified. Kimi native search proved unwirable via AI SDK (builtin_function) → both ship straight-faced searchless. *Smoke pending — needs BYOK keys.*
- [ ] **[→ 3.2 T6] Acquisition explainer session** for the owner (umbrella post-V3 queue).

Completed en route (recorded here so nobody re-plans them): approval-card per-tool previews (486544c), citation-split bubble coalescing (65ae4e7), new-chat auto-targeting + move-follows (0a31ca0), connection-editor instant persistence + fieldset grammar (6fd3dcb/1ea57ee/88b1341).
- **Universal web search for non-native providers (2026-07-21)** — modular app-executed `search_web` backend (Tavily default + Brave; swappable via APP_SEARCH_PROVIDER; add a backend = one file + one registry line) attaches for "dumb models" (DeepSeek, Kimi, Mistral, Groq, local) that lack native search; big four keep native. Dissolves R4's straight-faced non-attachment. Needs TAVILY_API_KEY (or BRAVE_SEARCH_API_KEY) in env. Followups: settings-UI backend picker + per-connection key (today: env-driven); SearXNG/Serper backends (interface ready).

---

## AI v3.2 T3 Followups (2026-07-22, branch `feature/ai-v3.2-t3-playbooks`, worktree `ai-v32-t3`)

P1–P4 (parser, registry, `/playbook` picker, progressive-disclosure injection) + P5-mark (hand-author "Mark as Playbook") BUILT, gates green, not yet merged. Deferred by the plan's own sequencing (`AI-V3.2-T3-PLAYBOOKS-PLAN.md` §5):

- [x] **Run Ledger titles remain searchable at scale** — BUILT 2026-07-23 as a precaution: filenames now follow `Run Ledger — <whole-run summary> · <deterministic word pair>`. The checkpoint can supply a subject-and-anticipated-deliverables title, with summary fallback; conversation identity keeps the suffix stable across phases. Legacy exact-title ledgers are adopted and renamed on their next write.
- [x] **AI writes declare their effective destination in-chat** — BUILT 2026-07-23 after owner request: content-writing tools attach a shared receipt resolved from the persisted node, and chat renders a clickable emerald affordance with the write action plus effective folder/referenced owner. Covers run-ledger checkpoint writes as well as notes, sidecar notes, editor edits, DOCX, generated media, workflows, cached web pages, and created folders; older saved note payloads retain their legacy card.
- [x] **Phase checkpoint remains actionable after reload** — FIXED 2026-07-23 after owner smoke: persistence used a stale React `messages` closure for assistant parts even though the AI SDK `onFinish` supplied the final message, saving `phase_checkpoint` as `input-streaming` without an approval ID. Initial saves and continuation PATCHes now use fresh assistant parts; reload seeds the persisted signature baseline; and complete legacy checkpoint inputs are restored to `approval-requested` with a deterministic ID so already-affected conversations recover.
- [x] **First prompt survives referenced-chat materialization** — FIXED 2026-07-23 after owner smoke: transient auto-promotion stored only a boolean send marker while the prompt remained in draft state keyed to the rooted content. Creating the referenced chat changed that key; hydration of the new conversation's empty draft could clear the prompt before the resend effect ran, and tab refresh unnecessarily gated the rebind. Promotion now snapshots and seeds the exact prompt under the destination conversation key, restores it before sending if needed, and activates the new conversation immediately while tab refresh runs independently.
- [x] **Output-target preset survives side-chat rebinding** — FIXED 2026-07-23 after owner smoke: the sidebar intentionally stays mounted across conversation switches, but `useConversationEngine` only read localStorage during its first mount. A selected target could therefore disappear after reopen/switch (or another chat's target could leak), while the compact icon hid the active value. Key changes now hydrate the destination conversation, transient→bound promotion migrates the current selection, unrelated chats reset safely, the labeled chip exposes the active preset, and build/CI covers the state-transition contract with `output-targets:check`.
- [x] **Explicit attachment recognition for pasted/unsectioned playbooks** — FIXED 2026-07-23 after owner smoke + retest: literal SKILL.md stored in ordinary TipTap paragraphs previously parsed as `0 phases`, so the route silently omitted the attached context and the model searched by topic. Markdown-like headings/frontmatter now parse into phases, unsectioned content becomes one implicit phase, empty attachments stay explicitly identified, and a resolved attachment removes `search_playbooks` for that turn. Retest then showed a correctly injected Active Playbook could still lose to rooted-note context in DeepSeek because the selection existed only in the system prompt/composer. Sent user turns now persist and render a `data-playbook` pill, while the server binds the validated playbook identity directly to the latest user request and treats rooted content as optional input. Covered by the build/CI `playbooks:check` gate.
- [~] **SKILL.md import adapter (P5-import)** — BACKEND BUILT (2026-07-22): `lib/domain/ai/playbooks/import/` (pure `SkillImportAdapter` interface + `skillMdAdapter` frontmatter/body parser + `IMPORT_ADAPTERS`/`detectAdapter`/`importPlaybook` registry) + `POST /api/content/playbooks/import` (parse → create marked playbook note; tsx-validated incl. quoted values, thematic-break-in-body, null on non-SKILL input). **Remaining: a UI affordance** to call it (paste box / .md upload — e.g. an "Import Skill" entry near the file-tree import flow). Backlog adapters (fabric, mcp-prompt) are append-only additions to `IMPORT_ADAPTERS`.
- [ ] **Backlog import adapters** (same interface, do NOT build ad hoc — batch with the next major AI version): fabric patterns (trivial, pure markdown), MCP prompt templates (ties to the MCP epic), Claude Code commands/CLAUDE.md, OpenAI GPTs (weakest fit, likely never).
- [ ] **Upgrade `renderPlaybookSection` to the T2 lossless serializer** once AI v3.2 T2 (PR #125, `lib/domain/content/markdown-serialize.ts`) merges — the local renderer (`lib/domain/ai/playbooks/render.ts`) preserves `[[wiki-links]]` correctly but not full markdown fidelity (bold/italic/tables render minimally). Not a correctness bug, just a fidelity upgrade once the dependency exists.
- [ ] **"Unmark as Playbook"** — the context-menu action only marks; no UI path to clear `metadata.playbook` yet. Low priority (metadata edit via any generic note-metadata surface works today).
- [ ] **Full authenticated browser smoke test** — automated verification was pure-logic + live-route-boot only (no auth fixture in this repo; documented gap — same one blocking 5 stubbed dark-mode e2e tests). Owner should manually verify: mark a note → `/playbook` attach → token meter shows only the active phase → checkpoint approval advances the phase → a `[[reference]]` gets traced via `read_note` → a sub-playbook reference is tagged in the manifest.
- [ ] **[T4] Resource governance** (see `guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md` §4 state table) — enforced token/step budgets (decrement + stop), sub-agent isolation for sub-playbooks (isolate context, return conclusion + artifact pointer), per-run compaction, self-critique/no-progress loop guards, difficulty-based effort allocation. Each is its own subsystem; deliberately kept out of T3 to protect the gate.
- [ ] **Phase checkpoint stuck "running…" after leaving and returning to a chat** (owner-reported 2026-07-23) — the approval card doesn't resolve/re-render correctly on a chat re-open while a `phase_checkpoint` was mid-flight. Not yet root-caused; explicitly backlogged by the owner over a credit-budget concern, not fixed in this pass.

---

## Browser Reach B3-B — settle-then-associate + viewership (SHIPPED, PR #131, 2026-07-25)

Merged via PR #131 (2026-07-25) and smoke-tested (settings card, browser-history capture, filter). Follow-on shipped in the same PR: Recents now interleaves notes/files + browser history under a **3-state cycling filter** (All / Notes & files / Browser history), replacing the earlier two-section Show/Hide toggle.

Shipped:
- **Capture policy** (`lib/domain/browser-extension/capture-policy.ts`) — pure `shouldCapturePage()` shared safety gate: blocks non-web schemes, browser-internal (Web Store), Digital Garden's own origins, mailboxes/auth/password-managers, and a user denylist. Applied at record time (extension) and display time (panel).
- **Phase B — settle-then-associate** (`PanelShellClient`): a page that holds steady 5s while a note is open auto-links to it, gated by the killswitch + policy + panel visibility + a per-session dedup (so a manual unlink isn't re-linked). The Phase A link icon reflects/undoes it.
- **Phase C — viewership → Recents**: the background records a capped, deduped page-history ring buffer to `chrome.storage.local` (record-time guards: navHistory on, not DG-origin, not denylisted). `RecentsPanel` gains a panel-only browser-history section behind a "Show/Hide history" filter (default shown in panel, absent in the app); clicking re-opens the URL in a new tab. Also fixed a dormant background bug: the catch-all `sendResponse` sat above `get-recent-viewed-tabs`/`send-note-to-tabs`, making both unreachable.
- **Settings** — a "Capture & privacy" card in the browser-bookmarks extension settings page (killswitch, nav-history toggle, denylist editor, clear-history), stored in `chrome.storage` via the app↔extension bridge.

**Storage note**: browsing history lives in `chrome.storage` (never the server), so today it's panel-only and its controls sit with the extension settings. The schema guardrail that forced this has since been **lifted** (2026-07-25); owner scheduled the server-side unification as the FIRST task of B6 hardening (see followups).

Followups:
- [ ] **[B6 — first task, before other hardening] Server-side `PageView` → unify Recents across app + panel.** A server-persisted, opt-in page-view log gives the *standalone app's* Recents the same browser-history source the panel has today (plus cross-device sync). When it lands, apply the SAME mixed-list + 3-state cycling filter to the main-app Recents and **delete the `isPanelEmbedSurface()` isolation branch in `components/content/RecentsPanel.tsx`** — the app/panel fork collapses into one code path, and the panel's bridge-fetch (`requestPageHistory` + `page-history` message) becomes a normal authed API read. This is a net *removal* of access-code. Guardrail now lifted; still run the `MIGRATION-BASELINE-SQUASH.md` reconciliation and pick the app-side filter default (spec: browser-history OFF by default in the app, shown by default in the panel).
- [ ] Refresh panel browser-history on visibility change (today it loads once per panel mount). Likely subsumed by the API-read above once history is server-side.
- [ ] "a browser extension setting allows this default to be ON" — the killswitch default is a fixed OFF; a chrome.storage/popup override to flip the *default* is not yet wired.

---

## Browser Reach B5 followups (2026-07-25, branch `feat/browser-reach-b5-acquisition`)

B5 (acquisition providers) shipped in that PR: P2 sw-fetch + P3 session-tab as remote providers, client-orchestrated P1→P2→P3 ladder, server builds the trusted envelope, "Read full content" on external-link nodes (with a press-and-hold quick-pick to force a provider), working in both the main app (page-bridge) and the side panel (panel-host channel). Two panel dialog-stacking fixes bundled.

- [x] ~~**AI browser-acquisition tool (client-side, conditionally registered).**~~ — SHIPPED as **Agentic Browsing Phase 0** (2026-07-29), then hardened + grown into a research agent (Phase 1) and a deterministic reader + launcher (Phase 2a). The first client-executed chat tool: `browserExtensionAvailable` flag per turn → conditional registration → no server `execute` → `onToolCall` runs `acquireUrlWithFallback` → `addToolResult`; declines with a CTA when absent. Renamed `read_page_in_browser` → `read_page_headless_or_browser`. Full spec + followups now live in `AGENTIC-BROWSING-PLAN.md` (see the Agentic Browsing followups section below).
- [ ] Clearer quick-pick labels: "Browser session" → "Signed-in fetch" (P2), "Background tab" → "Signed-in tab" (P3) — the current labels don't convey the cookies-vs-JS distinction.
- [ ] Cache acquired content onto the external node's payload so "Read full content" doesn't re-fetch each view (today `hydrateExternalPayload` caches garden-side, but the viewer re-fetches per open).
- [ ] Quick-pick menu positioning in a short panel — the non-portaled dropdown may clip near the bottom; portal + flip if it surfaces.

---

## Agentic Browsing Followups (2026-08-01, branch `feat/agentic-browsing`)

Phase 0 + hardening + Phase 1 (research loop) + Phase 2a (launcher + one deterministic reader) shipped; full spec + phase roadmap in `AGENTIC-BROWSING-PLAN.md`. Deferred by owner during the build:

- [ ] **[after Phase 2b] Layer #2 — in-chat read-mode toggle.** A composer control that biases the reader's default; per owner it **defaults to opening the browser** (visible tab) rather than a headless fetch, for the interactive scraping experience. Sits on top of the deterministic reader (the code still owns the ladder; the toggle only moves the default entry rung). Deferred until the ladder is proven through Phase 2b.
- [ ] **[after Phase 2b] Layer #3 — live per-phase step display.** The read chip is action-expressive *after the fact* (it reads the result's `via`/`escalationNote`), but a tool call is atomic, so the intermediate rungs (headless → background → visible) are invisible *while they run*. Layer #3 threads a progress channel through the acquire ladder so the chip shows the current rung as it happens — **build shared with Phase 2b's navigation-step UI** (same "what is the agent doing right now" surface). This is the "show what phase it's in when it's in that phase, or when the first phase fails" ask.
- [ ] **LinkedIn-grade extraction validation on a fair target.** Phase 0 hardening's settle-then-extract + main-landmark tier is confirmed live, but the original test target (LinkedIn job pages) is pathological (anti-automation + auth SPA never renders into a backgrounded tab). Validate rich extraction against a fair target (Greenhouse / Lever / news / Reddit) before the read-tool PR.
- [ ] **[nice-to-have] PWA → extension co-browse handoff.** Co-browse is trust-gated to the extension's side-panel embed (`isPanelEmbedSurface`), which a standalone **PWA window doesn't have** (no side panel; not part of the browser tab strip; `chrome.debugger` drives browser tabs, not a PWA window). So co-browse is correctly UNAVAILABLE in the PWA and fails safe (the `co_browse_*` / `read_current_page` tools simply don't register — `coBrowseAvailable:false`). A future nicety: when the user asks to co-browse from the PWA, **hand off** to the browser — open/focus a regular browser window with the extension side panel and carry the conversation over. Owner: nice to have, not necessary now (co-browsing arguably belongs in the browser context anyway).
- [ ] **`web_search_preview` + gpt-4 silent-hang model-gating.** The OpenAI `web_search_preview` tool isn't supported on `gpt-4` and hangs the turn silently (surfaced during Phase 1 smoke testing; worked around by switching to GPT-4o). Gate the tool off for unsupported models with a clear signal instead of a hang.
- Rich, previewable approval cards (the research-plan card + future co-browsing checkpoints) are tracked in the **needsApproval overhaul** item above — a shared HITL-surface investment, not agentic-browsing-specific.

---

## Extension Workflows Followups (2026-07-16, branch `feature/workflows-extension`, PR #111)

Phases 0–4 built (see `EXTENSION-WORKFLOWS-PLAN.md`); P0–P2 smoke-passed live; n8n spoke merged in mid-build (browser dispatch of n8n workflows is live). Deferred by design:

- [ ] **Richer n8n run step view** — n8n run input carries no `graph`, so `RunGraphSteps` renders nothing (graceful). A per-engine step renderer (n8n node names from callbacks) is now unblocked, still deferred.
- [ ] **Chooser pre-flight "not pushed" badge for n8n workflows** — read `metadata.webhookPath` (n8n spoke now in-tree); today the dispatch toast surfaces the clean ENGINE_ERROR instead.
- [ ] **Per-user extension-disabled parity in bearer routes** — extension enable/disable state is client-side only; the chooser's empty state covers today. Revisit if server-side per-user extension settings land.
- [ ] **Bottom-sheet chooser <768px** — N/A for the Chrome toolbar popup (desktop-only surface); mobile runs through the app's WorkflowsPanel. Recorded so nobody re-plans it.
- [ ] **System notifications channel** — deliberately dropped in design (no `notifications` permission); revisit only on user demand.

---

## Folder Studio Followups (2026-07-16, branch `worktree-folder-studio`)

Phases 0–7 of `FOLDER-STUDIO-PLAN.md` shipped; deferred by design during the build:

- [ ] **Option A — Studio as a folder view** (plan Phase 8 first half) — second mount of the existing StudioTab surfaces inside `FolderViewContainer`; registry-driven, no new logic. Deferred to land the working feature first; revisit Option C ("expand" tab) with usage evidence.
- [ ] **Browser smoke + Playwright activation** — all studio surfaces are auth-gated; blocked on the shared e2e auth fixture (same blocker as workflows/flashcards specs). Manual smoke checklist in the PR body.
- [ ] **Image sources vision pass** (plan Phase 2 item) — images currently resolve empty ("NO TEXT" flag flows honestly); wire a vision-model description pass + decide the `enableOCR` fallback flip.
- [ ] **Custom report variants from ChatContext presets** — the variant-resolver contract supports it (`variants` as async resolver); wire `ChatContext` list → report tile flyout.
- [ ] **Infographic diffusion mode** — the `image` variant of the infographic tool fails gracefully today; wire through `lib/domain/ai/image/` when prioritized.
- [ ] **Per-conversation source-selection overrides** — v1 persists selection per (owner, folder) in `StudioSourceSelection`; the plan's original shape was per-conversation via `ConversationAssociation`. Add an override layer if folder-level proves too coarse.
- [ ] **Study plan → daily notes** — plan wanted the FSRS study plan written into daily notes; v1 creates a folder note. Needs periodic-notes resolve integration.
- [ ] **Wiki-links in generated artifacts render as literal `[[Title]]` text** — `markdownToTiptap` doesn't produce wikiLink nodes; add a post-conversion pass (or extend the converter) so generated Sources sections are real links.
- [ ] **Schema drift debt (shared Neon dev DB)** — `AgenticMetadata`, `StudioSourceSelection`, `StudioGenerationRun` were created via targeted SQL because `prisma db push` wanted to drop another worktree's `ServiceToken` table; the auto-context V1 columns (`AgenticMetadata.contextDirty` + `summaryHash` + index) were added the same way. Before prod deploy: create proper migrations (`migrate dev --create-only`) and reconcile drift per `DATABASE-CHANGE-CHECKLIST.md`.
- [x] ~~Auto-context: per-user daily spend ceiling~~ — SHIPPED 2026-07-16: `StudioContextSpend` (owner, UTC day, generationCalls) + `studio.dailyCallCap` setting (default 200, slider in Studio settings). Engine gate stack pre-checks and stops drains mid-way (`budgetExhausted`/`budgetStopped`); explicit right-click refresh 409s with a clear message; manual per-node Generate deliberately uncounted. Soft ceiling (concurrent drains may overshoot one per-run cap).
- [ ] **Auto-context: budget surfacing in UI** — the ceiling is enforced + logged; consider a "budget used today" readout in Studio settings and a `budget-exhausted` variant of the aiContextStatus banner.
- [x] ~~Auto-context: incremental roll-up patching (mechanism D)~~ — SHIPPED in V1.1 as anchored patching, used only when single-delta is PROVEN via hash substitution (see context-refresh.ts).
- [ ] **Auto-context: dirty hooks for duplicate + upload finalize** — duplicate and file-upload finalize create children without flagging the parent's roll-up; on-access staleness (uncovered-node discovery) papers over it, but the bits should be set at the source like create/move/delete.
- [x] ~~Auto-context: per-folder opt-out~~ — SHIPPED broader in V1.1 as per-NODE `contextOptOut` (toolbar eye toggle + Context panel checkbox); folders shield their subtree.
- [ ] **Auto-context: SourcePicker opted-out badge** — SourceRow already carries `optedOut` (hard-excluded from defaults + assembly); the picker should render a small privacy badge so users see why a row can't be included.
- [ ] **Auto-context: settle window configurability** — fixed at 10 min (SETTLE_MINUTES). Expose in Studio settings only if real usage wants it.

## References-as-children Followups (2026-07-16)

- [ ] **Folder main-panel views still list note-owned references** — ~~ListView/Grid/Kanban query by parentId + `includeReferencedContent`~~ **CORRECTED 2026-08-18:** they do NOT query by that flag, and never did. `buildContentListUrl` (folder-views/content-query.ts) emits only `parentId`/`personId`/`peopleGroupId`/`type`, and `GET /api/content/content` has no `role` key in its where-clause, so folder views list referenced content unconditionally. The symptom is real; the cause is the *absence* of a role filter. Fix = add a `role` param to `buildContentListUrl` + a matching where-clause key. Note the tree no longer shares this problem (see Reference Drawer below).
- [ ] **Drop `FolderPayload.includeReferencedContent`** (2026-08-18) — verified inert: threaded through 6 components + 9 API handlers, nothing filters on it. Gallery/Kanban/Dashboard/Canvas never destructure it; ListView uses it only as a `useEffect` dep. Only writer of `true` is `flashcards/media-folder.ts:61`, whose comment describes unimplemented behaviour. Removal is 2 commits: (1) API field reads/writes + types, (2) schema `DROP COLUMN` **atomically** with all 7 create-time defaults, or `prisma generate` breaks. Needs an owner-run forward migration.
- [ ] **Drag-attached references don't parentId-cascade with the note** — the move route's reference cascade follows the ContentLink embed graph; a reference attached by drag (not embedded) keeps its old storage parentId when the note moves folders. Display is correct (ownedByNoteId), but storage home drifts. Extend the cascade to also cover `ownedByNoteId`-children.
- [ ] **Reference ordering under a note** — displayOrder is folder-scoped, so sibling references under a note sort by their folder order; fine for small counts, revisit if per-note ordering matters.
- [x] ~~**Referenced-content visual treatment under notes**~~ — SHIPPED 2026-08-18 as the **Reference Drawer**: the tree API partitions referenced children out of `children` into `references`, and a count chip on the parent row reveals them in a washed, rail-marked block indented a half-step. Replaced BOTH visibility toggles (tree-wide `showReferencedContent` store + per-folder menu entry) and the "N referenced items hidden" hint. Chip state keys off `refs:<parentId>` in `expandedIds`, so it inherits localStorage persistence + workspace snapshots. Design record: `Reference Drawer` artifact.
- [ ] **Reference Drawer: pinned references** — pin an individual attachment so it renders as a normal sibling even while the block is collapsed. This is the real answer to "keep important referenced content on hand"; the block handles the rest.
- [ ] **Reference Drawer: cross-device expansion** — chip state persists to localStorage only. If "remembered universally" should mean across devices, it needs to ride the workspace record the way layout intent does.
- [ ] **Reference Drawer: root-level references** — a reference with no resolvable owner AND no parent has no row to host a chip, so it still renders as an ordinary root row. Deliberate (hiding it would orphan it); revisit if it shows up in practice.
- [ ] **Reference Drawer: drop index inside an open block** — references are appended to `children` when expanded, so a drop at the end of a folder computes an index past them. No corruption, but ordering can surprise. Consider clamping drop indices to the primary-children range.
- [ ] **Status dot: `scheduled` state** — the new three-state dot covers live / withdrawn / silent. `PublishState.scheduled` has a good claim to its own dot and is a one-line addition on the same `publicItems` select.
- [ ] **Auto-context banner on Studio tab** — v1 surfaces the once-per-session unconfigured banner via the Context tab GET only; the Studio tab's compose/runs 409 toasts cover explicit actions. Consider a shared status probe if users miss it.
- [ ] **Audio overview TTS voice override** — Studio inherits the global AI speech voice by design (inherit-with-override pattern); add the per-studio override field only if requested.
- [ ] **Two-host audio + video overview** — postponed per plan Non-goals (Gemini multi-speaker TTS is the gap-filler candidate); video tile ships as a stub.
- [ ] **Mobile bottom-nav chat routing** — decision of record (Phase 3): the bottom-nav AI icon keeps opening the GLOBAL chat; folder-scoped chat is reached via the Studio tab's button. Revisit only with usage evidence.

---

## Workflows Foundation Followups (2026-07-12, branch `feature/workflows-foundation`)

Deferred by design from Plan 1 (see `WORKFLOWS-FOUNDATION-PLAN.md` session logs):

- [x] ~~Soak: real BYOK AI + approve-path DOCX artifact~~ — **verified live by user 2026-07-12** ("Unknown application dossier.docx" produced end-to-end). Residual soak lesson folded into Plan 2 S5: URL-only dispatch vs JS-rendered job boards yields empty research; gate framing must adapt (no "0% fit" scored card on empty data).
- [x] ~~Trigger nodes for Trellis~~ — **SHIPPED 2026-07-13**: `execution: "trigger"` class, exactly-one-entry validation, 8 types. WIRED: Manual (Run form), Page Capture (URL-pattern routing in the capture route), Called (sub-workflows). STUBBED FIRING (nodes+config real, automatic firing deferred): Content Event, Schedule, Periodic Note, Calendar Event, Inbox/Activity Event (targets real notification kinds). Remaining trigger-firing work below.
- [ ] **Trigger firing wiring (the deferred half)** — automatic dispatch when a source event occurs. Per type: **Schedule** → `app/api/cron/` scan of schedule-triggered workflows (has cron infra). **Periodic Note** → hook `periodic-notes/resolve` post-create. **Content Event** → ContentNode create/update lifecycle hook. **Calendar Event** → calendar poll + lead-time queue. **Inbox/Activity Event** → hook `publishEvent()` to find + dispatch workflows whose `trigger-activity-event.kind` matches (events feature still maturing — wire when stable). Each finds matching workflow nodes and calls `dispatchWorkflowFromContent`. Loop-guard needed for activity triggers (workflow.* kinds already excluded from the targetable list).
- [ ] **edit-content node (user-requested 2026-07-13)** — a step that edits an existing note's TipTap JSON (distinct from store-content which creates). Position strategies: append/prepend (easy), under-heading (Nth or by-text), after/replace-regex-match, after-keyword. **Idempotency is the hazard**: support a "managed region" mode (invisible marker pair, like periodic-summary blocks / the `<!-- tag:... -->` format) that the node REPLACES on re-run instead of appending — makes note-editing re-runnable and reversible. Operate structurally on the doc tree, never string-splice.
- [ ] **"Open in chat" gate action** — conversation seeded from run output per AI-chat conventions; server side already accepts `conversationId` in the resume payload and links it. This is the doctor-the-resume loop's missing UI half.
- [ ] **Inbox → run detail deep link** — notification renderers have no click-through; needs a navigate-to-extension-view affordance (open Workflows panel + select run).
- [ ] **Dedicated `workflow-research` feature id** — AI steps currently reuse the "chat" feature's routing; add a registry entry if workflow AI should have its own model choice/fallbacks.
- [ ] **Plan 3 (n8n spoke) — demoted by the 2026-07-12 builder pivot**: PAT auth, HTTP callback transport, `n8n-nodes-digital-garden`, engines settings panel. Only if the external-integration long tail outgrows the builder's `http-request` node. SUL licensing gate documented in the plan's licensing appendix.
- [ ] **Run-state reconciliation sweeper** — engine-vs-table status drift safety net (cron comparing engineRunId state for stale `running` runs); the step-section try/catch pattern covers the known path, a sweeper covers unknown ones.
- [ ] **Workflows Playwright specs** — stub per repo convention; blocked on the shared e2e auth fixture.
- [ ] **`WorkflowRunEvent` retention/pruning** — not needed at current scale; revisit with usage.

---

## Connections / Notifications / DM Followups (2026-07-10)

Deferred by design from the connections-inbox feature (branch `worktree-connections-inbox`); the architecture has explicit seams for each:

- [ ] **SSE/pub-sub transport upgrade** — replace `createPollingTransport()` (`lib/features/notifications/transport.ts`) when real-time latency matters; callers depend only on the `NotificationTransport` interface. Needs a pub/sub backing (Redis/Upstash) or the Cloud Run service — serverless SSE alone still polls the DB server-side.
- [ ] **Partial unique index on `NotificationRecipient(userId, collapseKey)`** — closes the coalescing race (two concurrent DM sends can create two unread rows). Needs raw SQL migration (`WHERE readAt IS NULL AND archivedAt IS NULL`); harmless dupes at current scale.
- [ ] **Signup-time invite resolver** — invites to not-yet-registered emails never resolve today; on account creation, match `ConnectionInvite.inviteeIdentifier` and backfill `inviteeUserId` + publish the notification.
- [ ] **Activate inbox Playwright stubs** (`tests/e2e/inbox/inbox.spec.ts`) — blocked on the e2e auth fixture; `scripts/seed-smoke-users.ts` mints session tokens and is the building block.
- [ ] **Shared-folder sharing events** — the original motivation for the event-log architecture: new kinds (`share.grant`, `share.revoke`) + `ViewGrant` integration, gated on connections via `areConnected()`.
- [ ] **Email digest channel** — daily unread-summary email via the existing cron pattern + per-kind preferences already in settings.
- [ ] **`Person.linkedUserId`** — link People-extension contacts to connected accounts (auto-materialize a Person card on connection accept).
- [ ] **Migration-chain repair (pre-existing)** — `prisma migrate dev` fails shadow-DB replay at `20260608120000_backfill_tenancy_drift_columns` (P3006: `TenantHost` table missing). Unrelated to this feature; `migrate deploy` unaffected. Worth a `migrate resolve`/baseline pass.

---

## Settings Reorg Followups (2026-07-10, branch `feat/settings-reorg`)

The settings surface was reorganized (grouped sidebar IA, extension settings consolidated under `/settings/extensions/[id]`, Preferences dissolved into Appearance + Editor & Files, hybrid instant/explicit save via `components/settings/ui/` primitives). Deferred items:

- [ ] **Orphaned settings schema cleanup** — `settings.files`, `settings.search`, `settings.editor`, and `settings.ui.panelLayout` exist in the backend blob but the wired sources of truth are `upload-settings-store`, `search-store`, nothing, and `panel-store` respectively. Either migrate those stores into the blob (cross-device sync) or prune the dead schema sections. The reorg deliberately kept reads/writes on the wired paths.
- [ ] **Auth fixture for settings visual coverage** — `tests/e2e/dark-mode/settings-routes.spec.ts` has skipped light+dark screenshot specs for all 19 settings routes; they activate once `tests/e2e/_fixtures/auth.ts` lands.
- [ ] **Glass-button retirement in AI sub-pages** — `AIConnectionsPage`, `AIFeatureRoutingPage`, and `ConnectionUsageCard` still import `@/components/ui/glass/button` (~20 buttons; deliberately not blind-swapped). Migrate to `@/components/client/ui/button` with per-button variant review.
- [ ] **Settings search** — a `Command`-based filter box in the settings sidebar (stretch goal from the reorg plan, skipped).
- [ ] **Pre-existing Playwright failures (not from the reorg)** — signed-out home spec has a strict-mode violation (3 "Sign in" links match one locator); habit-tracker and daily-summary block snapshots are date-dependent and drift with the current month. Both fail on `main` too.

---

## Context-Menu Unification (2026-06-01)

Three menu surfaces in the publishing UI were restyled in Phase 19 to visually match the file-tree ContextMenu and the People panel header — establishing one consistent affordance pattern across the IDE. The work was cosmetic-only; the underlying components are still three separate implementations:

- **`components/content/context-menu/ContextMenu.tsx`** — file-tree's right-click menu. Tightly coupled to `useContextMenuStore` (global, single-instance). Action-provider pattern with `ContextMenuSection[]`.
- **`extensions/publishing/components/view-mode/PublishingPathContextMenu.tsx`** — custom positioned menu via `createPortal`. Local state for dialogs.
- **`extensions/publishing/components/sidebar/PublishItemMenu.tsx`** — Radix `DropdownMenu` with classNames overridden to match.

Followups:
- [ ] **Extract a shared `MenuPrimitive`** that all three can use — same button/item/divider/section-label classes in one place. Today, if file-tree's visual style changes, the publishing menus drift.
- [ ] **Decide whether `useContextMenuStore` should generalize** to support transient menus from any source (3-dot dropdowns, popovers), or whether Radix-based dropdowns remain the right tool for click-anchored menus while `ContextMenu` stays for right-click. Probably the latter — they have different positioning semantics.

### Preserved "premium" 3-dot styling

Phases 16-17 originally shipped a different styling for `PublishItemMenu` — gold-tinted text on a deep-glass surface, more design-system "premium" feel than the current file-tree match. The user liked it but chose consistency for now. The pattern is documented here for potential future adoption as the *new* platform-wide context-menu look:

- Container: `rounded-xl border border-amber-200/15 bg-zinc-900/95 shadow-2xl`
- Item: `text-amber-100/85 hover:bg-white/5 hover:text-amber-50`
- Destructive: `text-rose-400 hover:bg-rose-500/10`
- Icon: `opacity-65`

If the design system later moves toward a more distinctive (less generic-shadcn) look for menus, recover this from the git history at commit `d5578cf` and apply it as the new shared primitive.

---

## Publishing Card Slice C (deferred from 2026-06-01 multi-tenancy work)

Three more 3-dot menu actions on the right-sidebar publishing card. Slice A (breadcrumb + relative time) and Slice B (Copy URL, Edit metadata, Move path, Archive, Delete) shipped in PR #50. Slice C remaining:

- [ ] **Move to a different site** — adds a tenant picker to the move flow. Only visible when the user owns >1 tenant. Backend already supports it via `PATCH /api/publishing/items/[id]` accepting a `tenantId` field (would need to add this field if not present yet — currently only accepts `pathId`). UX consideration: paths are tenant-scoped, so changing the tenant requires also re-picking a path. Probably a two-step flow: pick site → pick path within that site.

- [ ] **Schedule expire (auto-unpublish at a future date)** — datetime picker that sets a `publishedUntil` (or similar). Requires:
  - New nullable column on `PublicItem`: `publishedUntil DateTime?`
  - The scheduled-publish cron extended to also check `publishedUntil < now` and transition published → unpublished
  - UI: show the expire date on the card if set, with a "cancel expire" affordance

- [ ] **Cancel scheduled publish** — visible only when `scheduledFor` is set. One-click clears the schedule. Tiny addition once the menu has somewhere to put it; current Slice B menu doesn't conditionally show items based on item state, so this needs a small refactor to support conditional menu items.

Total estimated effort: ~150 lines + 1 schema field + cron extension.

---

## Speed Reader Followups (from worktree `worktree-speed-reader`, 2026-06-01)

The Speed Reader extension shipped as a disabled-by-default global extension with RSVP playback over notes, PDFs, OCR'd images, and external articles. Followup work:

- [ ] **Adaptive AI reading speed** — observe per-user reading behavior (pause frequency, step-backs, longest dwell positions) and use an AI model to adapt WPM dynamically based on text complexity (lexical density, sentence length, technical-term ratio). Goals: slow down on dense paragraphs without user intervention; speed up on filler. Considerations: privacy-preserving (local inference where possible vs. cloud model fan-out), opt-in only, must surface why it's adjusting (a subtle "AI: dense passage, –15%" affordance). Likely depends on a small classifier fed by the chunk's preceding paragraph; could pilot with a cached embeddings-based readability score before going model-driven. Track effect on comprehension via retention prompts at session end.
- [ ] **Sticky session resume** — persist current `position` per `contentId` in localStorage so closing/reopening the dialog resumes where you left off.
- [ ] **Keyboard speed-trim shortcuts** — `[` and `]` to bump WPM ±25 without mousing to the slider.
- [ ] **Comprehension prompts at session end** — optional 1-question recall on the final chunk's paragraph, scored locally, feeds the adaptive model in the first bullet.

---

## Dev Infra Followups

- [x] **Local Postgres (Docker) for development** — Shipped 2026-06-03 in PR `chore/local-postgres-dev`. Deliverables: `docker-compose.yml` (Postgres 16-alpine), `.env.docker.example` template, `scripts/check-db-target.ts` safety guard, `pnpm db:local:up/down/reset` + `pnpm db:target` scripts, `docs/notes-feature/guides/database/LOCAL-POSTGRES.md`. Verified workflow: `pnpm db:local:up → migrate deploy → db push → db:seed → pnpm dev` boots in <2s. Neon connection preserved as opt-in fallback.

### Migration history drift (surfaced by local-postgres setup, 2026-06-03)

Verifying the local-postgres workflow exposed that several merged features applied schema changes via `prisma db push` against Neon without backfilling proper migration files. `prisma migrate deploy` alone produces a DB missing ~30 tables that the running app expects. The local-postgres workflow documents `npx prisma db push` as the interim catch-up step.

**Template for each backfill**: `prisma/migrations/20260530150000_baseline_ai_chat_tables/migration.sql` (PR #48, AI Chat tables). Idempotent `CREATE TABLE IF NOT EXISTS` + `DO` blocks for enums/constraints. After each backfill migration merges, every existing Neon environment (prod, prod-mirror dev, live preview branches) must run `npx prisma migrate resolve --applied <name>` once.

- [ ] **Backfill: Tenancy schema (PR #47, Phases 5-12)** — Tables: `Tenant`, `TenantHost`. New columns on `User`: `canClaimCustomHosts`, `primaryTenantId`. Plus related indexes and FKs. **Smallest of the four; freshest in team memory; recommended first.**
- [ ] **Backfill: Publishing system schema** — Tables: `PublicItem`, `PublicItemRevision`, `PublicPath`, `PublicPathRedirect`, `PreviewToken`, `Series`, plus 14 payload tables (`BlogPostPayload`, `CaseStudyPayload`, `ChatPayload`, `DataPayload`, `ExternalPayload`, `FolderPayload`, `HopePayload`, `MediaItemPayload`, `PagePayload`, `ProfileSectionPayload`, `ProjectPayload`, `VisualizationPayload`, `WorkflowPayload`, `BookmarkPayload`). **Largest of the four; may warrant splitting into payload-tables and routing-tables sub-PRs.**
- [ ] **Backfill: Browser extension schema** — Tables: `BrowserExtensionToken`, `BrowserExtensionInstall`, `BookmarkSyncConnection`, `BookmarkSyncConnectionInstall`, `BookmarkSyncLink`. Relatively isolated surface.
- [ ] **Backfill: Web resources schema** — Tables: `WebResource`, `WebResourceContentLink`, `WebResourceViewState`. Smallest after tenancy.

Once all four land, the `npx prisma db push` step can be deleted from the LOCAL-POSTGRES.md quick-start and the workflow becomes `migrate deploy → db:seed` only.

---

## AI Chat Revamp Followups (from PR #49, 2026-05-31)

PR #49 polish wave shipped on `feature/ai-chat-revamp` and was merged via `abaad12`. Two known issues remain:

- [ ] **Sticky chat drafts don't survive tab switches** — current implementation lands the draft via `useState` lazy init reading localStorage, but in user testing the draft is blank after navigating to another chat and back. Suspected interaction with `ChatPanel`'s `key={activeId}` remount + localStorage write timing. Needs deeper investigation of the mount/persist ordering inside `useConversationEngine`.
- [ ] **Brief flash between `loading.tsx` and hydrated content** — too short to characterize without instrumentation. Right-sidebar collapse mismatch was fixed in `8293b3e` (loading skeleton no longer paints a 300px right sidebar that collides with the default `isCollapsed: true`), but a residual flash remains. Suspected cause: `MainPanelContent` paints the SSR `initialContent` once, the client store hydrates with empty `selectedContentId`, the empty branch renders for one frame, then the URL→store effect re-selects the content. Needs a DevTools paint capture before changing render paths — that area is race-prone and already absorbed multiple stabilization commits.

---

## Dark Mode Followups (from 2026-05-13 epoch completion)

**Dark Mode** epoch shipped on branch `feature/dark-mode` (see [STATUS.md](../STATUS.md) entry). Followups carved out for future sprints:

- [ ] **Production deploy** unblocks slash-command collab edge case — server schema already supports `ExcalidrawBlock`/`MermaidBlock`; only the client-side registration needs to propagate
- [ ] **Smarter unsupportedBlock sanitization** — differentiate "client doesn't render this node type" from "truly unknown node type"; the former should be a graceful degradation, not a destructive rewrite. User flagged this during slash-command debugging
- [ ] **Auth fixture for Playwright** — `tests/e2e/_fixtures/auth.ts` should sign in a seeded test user via `/api/auth/sign-in`, capture session cookie as `storageState`. Unblocks 5 stubbed authenticated dark-mode tests in `tests/e2e/dark-mode/authenticated-routes.spec.ts`
- [ ] **Fill in Playwright stub coverage** — 10 stub specs across `tests/e2e/{auth,editor,file-tree,content,search,extensions}/` document scope but are `test.skip()`'d. Each has a top-level docstring explaining what to cover
- [ ] **`ProfileMenu` dark mode polish** — signed-in nav dropdown still has 11 hardcoded light classes; defer until user flags
- [ ] **Embed iframe parity verification** — original motivator of the epoch (overlay-iframe seam). Verify visually with a real production browser-extension overlay once deployed

---

## Epoch 8: Editor Stabilization (Sprints 35-36) ✅ COMPLETE

**Goal**: Fix all known editor bugs, establish rules, implement focus guardrails.
**Detailed plan**: [epoch-8-editor-stabilization.md](epochs/epoch-8-editor-stabilization.md)

### Sprint 35: TipTap Rules Doc + Input Rule Bug Fixes ✅
- [x] Create TIPTAP-EDITOR-RULES.md (focus rules, input priorities, autocomplete conventions)
- [x] Tag/heading conflict: `#` triggers tag autocomplete instead of heading
- [x] `## ` triggers tag autocomplete, sometimes fails to convert to H2
- [x] `##` shows persistent tag autocomplete after continued typing
- [x] Tag autocomplete: 2-second delay, space breaks autocomplete
- [x] Slash command: only on first character of empty line
- [x] Header escape: backspace on empty header → `#` chain
- [x] `# ` (H1 with space) must never trigger tag autocomplete

### Sprint 36: Table Rebuild + Link Fix + Cleanup + Focus Guardrails ✅
- [x] **Table rebuild**: remove ALL CSS + logic, rebuild from TipTap docs (user approves before moving on)
- [x] URL/link escape: cursor adjacent to link must not inherit formatting; lightweight URL dialog
- [x] `>` blockquote: only affects current line, never child content
- [x] Header in paragraph with `hardBreak`: only convert text before hardBreak
- [x] Remove old console.log/console.warn from editor code
- [x] Implement focus guardrails per approved rules doc

---

## Epoch 9: Editor Enhancements (Sprint 37 complete; Sprints 38-42 deferred to Epoch 11)

**Goal**: Full-featured content editor with images, embeds, templates, snapshots, rich interactions.
**Detailed plan**: [epoch-9-editor-enhancements.md](epochs/epoch-9-editor-enhancements.md)

> **Note**: Epoch 10 (AI TipTap) was injected after Sprint 37, taking sprint slots 38-42.
> Remaining Epoch 9 sprints (URL embeds, drag/reorder, templates, snapshots, context menu)
> are deferred to Epoch 11.

### Sprint 37: Images in TipTap + Referenced Content Lifecycle ✅
- [x] Enable `@tiptap/extension-image` with custom EditorImage/ServerImage extensions
- [x] Image upload via slash command + bubble menu
- [x] Image paste → FilePayload REFERENCED content in same folder
- [x] Image URL paste → inline image with source tracking
- [x] Image resize (drag handles + bubble menu size presets)
- [x] Move API: REFERENCED content follows parent on move
- [x] Delete REFERENCED content when removed from document (orphan detection on save)
- [ ] **Deferred:** Image caption (custom figure/figcaption node) → Epoch 11
- [ ] **Deferred:** Image export to markdown (`![alt](src)`) → Epoch 11
- [ ] **Deferred:** Lazy loading → Epoch 11

#### Known Bugs (backlogged from Sprint 37)
- [ ] **Image bubble menu: viewport positioning** — When a large image is selected and its top is above the viewport, the menu isn't visible. Adding Floating UI `options` (`flip`, `shift`) caused cross-contamination with the table bubble menu. Needs investigation into why `options` prop disrupts other BubbleMenu instances.
- [ ] **Image bubble menu: stale size indicator** — When clicking between two images of different sizes, the S/M/L buttons briefly show the prior image's size before updating. `editor.getAttributes("image")` lags behind the selection change.

### Remaining Epoch 9 Sprints → Deferred to Epoch 11

The following sprints were originally 38-42 in Epoch 9 but are deferred to Epoch 11 now that Epoch 10 (AI TipTap) has taken those sprint slots:

- [ ] URL/OG Embeds + YouTube + Bubble Menu enhancements
- [ ] Gated Autofocus + Outline + Drag/Reorder
- [ ] Templates / Forced Content Structure
- [ ] Snapshots / Document History
- [ ] Editor Context Menu + Syntax Highlighting + Drawing

---

## Epoch 10: AI TipTap (Sprints 38-42) — Injected Before Remaining Epoch 9

**Goal**: Deep AI integration into the editor experience.
**Detailed plan**: [epoch-10-ai-tiptap.md](epochs/epoch-10-ai-tiptap.md)

> **Renumbering**: Original backlog had Epoch 10 as Sprints 43-47.
> It was injected after Sprint 37, renumbered to Sprints 38-42.

### Sprint 38: Providers + BYOK Persistence + Rich Bot Responses ✅
- [x] 4 new AI providers: Google Gemini, xAI Grok, Mistral, Groq (6 total)
- [x] BYOK key persistence: encrypted DB storage, CRUD API, verify endpoint
- [x] AIKeyManager settings UI: per-provider key input, masked display, verify button
- [x] ChatMessage rich markdown rendering: react-markdown + remark-gfm + lowlight syntax highlighting
- [x] Code blocks with copy button, tables, lists, blockquotes, inline formatting

### Sprint 39: AI Text-Editing Tools — Client-Side Architecture ✅
- [x] 8 agentic tools: read_first_chunk, read_next_chunk, read_previous_chunk, apply_diff, replace_document, plan, ask_user, finish_with_summary
- [x] Client-side editing architecture: tools return structured payloads, frontend applies to live TipTap editor
- [x] Editor instance Zustand store: shares TipTap editor between editor component and chat panel
- [x] ProseMirror text search utility: finds exact text positions in document for AI edits
- [x] AI edit orchestrator: 4-phase animation (cursor arrival → selection → content insertion → settle)
- [x] Editor lock with 30s timeout failsafe, queued execution, abort on navigation
- [x] Dual insertion strategy: char-by-char typing for inline text, parsed node-by-node for structured content
- [x] Fixed `markdownToTiptap` — added `marked` for proper markdown → HTML → TipTap JSON pipeline
- [x] Dev-only debug toggle in chat tool call bubbles (raw response viewer)
- [x] "AI is editing..." indicator in chat panel

### Sprint 40: AI Edit Highlighting + AI Image Insert ✅
- [x] `aiHighlight` ProseMirror Mark: `inclusive: false`, `source` attr, indigo CSS tint
- [x] Orchestrator auto-marks all AI-inserted content (text + structured)
- [x] `insert_image` tool (9th editor tool): image from URL with `source: "ai-generated"`
- [x] AI badge on ImageBubbleMenu for AI-generated images
- [x] "Show AI Content Highlights" toggle in AI settings
- [x] CSS class toggle: `.ai-highlight-hidden` hides marks without removing from document
- [x] Fixed selection highlight regression (deferred lock to Phase 3)

### Sprint 41: Chat Content Outlines ✅
- [x] Chat outline extractor: UIMessage[] → ChatOutlineEntry[] (compact + expanded modes)
- [x] ChatOutlinePanel: role-based SVG icons (user/assistant/tool), granularity toggle
- [x] Outline tab registered for `chat` content type in tool registry
- [x] Real-time outline sync: ChatViewer → outline store (updates as messages stream)
- [x] Click-to-scroll with gold flash animation via `scroll-to-chat-message` CustomEvent
- [x] Expanded mode: dot-and-indent sub-items for headers, lists, images in assistant responses

### Sprint 42: AI Image Generation ✅
- [x] 8-provider image generation (OpenAI DALL·E 3/GPT Image 1, Google Imagen 3, DeepAI, fal.ai FLUX, Together AI, Fireworks, RunwayML, Artbreeder)
- [x] `generate_image` chat tool: LLM calls providers, auto-uploads to storage, creates referenced FilePayload
- [x] GeneratedImageCard component: image preview, AI badge, prompt display, provider info
- [x] "Insert into document" button: `insert-ai-image` CustomEvent → MarkdownEditor at cursor
- [x] Drag-and-drop: chat images draggable to TipTap editor via `application/x-dg-ai-image`
- [x] `/api/ai/image` standalone endpoint for direct generation + storage upload
- [x] Image provider catalog with model metadata (sizes, quality/style support)
- [x] Works in both ChatPanel and ChatViewer

---

## Epoch 11: Editor Enhancements (Remaining Epoch 9 — Unscheduled)

**Goal**: Complete the editor enhancements deferred from Epoch 9.

- [ ] URL/OG Embeds + YouTube + Bubble Menu (text color, highlight, subscript, superscript, strikethrough, alignment)
- [ ] Outline click → autofocus with CSS flash animation
- [ ] Notion-style drag/reorder: blocks, list items
- [ ] Template builder UI in settings + apply on new/existing notes
- [ ] Snapshots / Document History (diff-based or full snapshot, 30-day retention)
- [ ] Editor context menu, enhanced syntax highlighting, Excalidraw drawing

---

## Epoch 12: Main Panel Tabs + Split Workspace

**Goal**: Introduce tabbed main-panel content first, then build split workspace on the same pane-aware state model.
**Detailed plan**: [epoch-12-main-panel-tabs-and-split-workspace.md](epochs/epoch-12-main-panel-tabs-and-split-workspace.md)

### Sprint 50: Tab Foundation
- [x] Pane-aware workspace state (`panes`, `tabs`, `activePaneId`, `openContentIds`)
- [x] Main-panel tabs with activate/reuse/close behavior
- [x] URL reflects active content and open tabs
- [x] Delete closes matching tabs
- [x] Preview-tab reuse until explicit pin/focus
- [x] Tree distinguishes active content from open content
- [x] Sidebar active tab restored per content
- [ ] Build + smoke gate on port `3001`

### Sprint 51: Sidebar Isolation + Workspace Preservation
- [x] Scope outline state by content/view
- [x] Scope editor instance / AI editing state by content/view
- [x] Scope navigation history by pane
- [x] Restore sidebar state without bleed between tabs
- [x] Preserve workspace restoration when leaving content and returning

### Sprint 52: Dual-Pane Split
- [x] Render dual-pane split on the same workspace model
- [x] Focused pane drives shared sidebar state
- [x] Maintain save and tree-highlight correctness across both panes
- [x] Manual smoke on port `3001`

### Sprint 53: Quad Split
- [x] Expand to four-corner layout
- [x] Keep pane activation and shared-sidebar behavior deterministic
- [x] Pass final stability gate under rapid pane/tab switching

### Sprint 54: Tab Drag + Adaptive Pane Reshaping
- [x] Drag tabs between existing panes
- [x] When only one pane is visible, drag tabs into standardized viewport targets to create vertical, horizontal, or quad splits
- [x] Collapse the workspace to the simplest valid layout when panes are emptied by tab moves
- [x] Treat explicit drag-and-drop as the source of truth for tab placement, separate from toolbar-driven layout memory
- [ ] Manual smoke on port `3001`

---

## Sprint 48: UI Polish + Bug Fixes

**Goal**: Address visual regressions, interaction polish, and minor bugs observed in the live app post-Sprint 55.

### Items
- [ ] **1. Calendar widget missing** — Left panel header previously had a calendar widget; it is no longer showing. Restore it.
- [ ] **2. Logo missing (non-mobile)** — Logo (gold ring) appears on mobile but not on desktop. Fix so it renders consistently.
- [ ] **3. Double scrollbar in file tree** — Two scroll planes appear when the file tree expands past the viewport. Only one scroll container should exist; it must cover all expanded content without clipping.
- [ ] **4. Block Properties auto-load** — Selecting a block should automatically load its Properties in the right sidebar. The ⋯ menu should allow selecting a non-focused block to edit its properties without leaving current focus. (Verify already implemented; fix if not.)
- [ ] **5. Inline file rename from header** — Clicking the document title displayed as the content header should make it editable inline. Saving updates the filename in the file tree in real time, optimistically (no flash).
- [ ] **6. File click error ("folder is...")** — Frequent bug: clicking any file shows an error mentioning a folder. Diagnose and fix. (User message was cut off — investigate error in console/network.)
- [ ] **7. Settings hover white-on-white** — Hovering over settings items shows white text on white background. Fix contrast.
- [ ] **8. Neon purple buttons → glass style** — Any buttons/UI elements styled with neon purple (e.g. "Save External Link Settings") should be restyled to match the glass node design system.
- [ ] **9. Block container hover transition** — Add a subtle CSS transition on block containers so hovering feels more polished.
- [ ] **10. Root placeholder selectable** — The "root" entry in the file tree should be selectable/clickable like any other tree item.

---

## Sprint 56: UI Polish + Bug Fixes (Continued)

**Goal**: Resolve remaining bugs from Sprint 49/55 that could not be fixed before context limit.

### Items
- [ ] **1. Folder double-click not expanding** — `node.open()`/`node.close()` + `node.select()` attempted but react-arborist is still not reliably expanding. Root cause: `node.open()` may not exist on the `NodeApi` — need to verify the exact API surface on the installed version, or handle via `onToggle` callback. Also check whether `e.stopPropagation()` is preventing the tree's internal click handler from running `select` (which triggers `onSelect` / navigation).
- [ ] **2. Scrollbar still visible in content panel** — Overflow is being set to `overflow-hidden` on the wrapper but FolderViewer (and potentially other viewers) have internal `overflow-auto` that are escaping. Check the full ancestor chain: `MainPanel → MainPanelContent → isNonNoteContent wrapper → content div → FolderViewer` — ensure every level in the chain has `overflow-hidden` or `min-h-0` as appropriate. The scrollbar appears most visibly when a folder is open.
- [ ] **3. "Failed to load content" on new note creation** — After creating a new note, the main panel shows "Failed to load content / Failed to fetch content". The temp-ID guard in MainPanelContent was added but the error persists. Likely the GET `/api/content/content/[id]` is firing before the real ID is swapped in — check console logs for the actual status code and response body to confirm root cause.
- [ ] **4. Tabs block: keyboard tab walking does not iterate** — First ArrowDown from a paragraph above a tabs block correctly focuses Tab 1 and sets `data-keyboard-tab-mode="tab"`. Second ArrowDown does NOT step to Tab 2; instead the editor scroll takes over and subsequent arrows scroll the note. Suspect that focus on the `.block-tab-btn` is being stolen between keystrokes (ProseMirror `updateState` / DOM observer after the `activeTab` attr dispatch may refocus the editor DOM), so the global capture listener's `if (!mode) return` check short-circuits because the mode attribute was cleared by the `focusout` handler when PM re-grabbed focus. Fixes attempted (did not work): (a) removed `requestAnimationFrame` wrapper around `button.focus()` in `focusTabSurfaceButton` — made focus sync. Still fails. Investigate: is `focusout` firing during the second keystroke? Is the capture listener even running? Add a breakpoint/log in `handleDocumentKeyDown` to confirm whether it reaches `handleKeyboardTabSurfaceNavigation` on the second press. Alternative architecture: move the entire tab-walking state machine into a ProseMirror plugin with its own plugin state (not DOM attributes), and handle the arrow keys via a `handleKeyDown` prop that checks plugin state rather than relying on DOM focus. See `lib/domain/editor/extensions/blocks/tabs.ts:459` and `lib/domain/editor/extensions/block-boundary-insert.ts:292`.
- [ ] **6. People tree: contacts not reorderable within a group** — `PeoplePersonRow` sets `draggable` and fires `onDragStart` with `kind: "person"`, but the drop targets (`onDrop`) only exist on `PeopleGroupRow` — dragging a person onto a group reassigns their `primaryGroupId` (via `/api/people/move`), it does not change display order within the same group. The `Person` model has no `displayOrder` column. To support within-group reordering: add `displayOrder Int` to the `Person` schema, expose it in the tree API sort, and add a reorder endpoint (or extend `/api/people/move` with `displayOrder` patching). Also need drop-indicator UI between person rows (not just on groups). See `components/content/people/PeoplePanel.tsx:1220` (`PeoplePersonRow`) and `app/api/people/move/route.ts`.
- [ ] **5. Accordion block: arrow navigation scrolls to top** — Pressing Up/Down through a list of accordion blocks causes the main panel scroll container to jump to the top of the page. `moveCursorToAdjacentParagraphAroundBlock` in `lib/domain/blocks/node-view-factory.ts:140` dispatches a selection change, and ProseMirror's `selectionToDOM` then places the cursor via the browser Selection API, which triggers an uncontrolled scroll. Fix attempted (did not work): added `findScrollContainer` helper to save/restore `scrollTop` on the nearest `overflow-y: auto` ancestor around the `view.dispatch()` call. Still jumps. Investigate: (a) is the scroll happening BEFORE the save (i.e., does another layer dispatch first?), (b) is there an additional scroll event from `focusEditorView` itself, (c) try restoring via `requestAnimationFrame` instead of synchronously, (d) walk the ancestor chain and save scroll on ALL scrollable ancestors not just the nearest, (e) consider using `view.dispatch(tr, { scrollIntoView: false })` or setting the selection WITHOUT scrollIntoView flag. Also check whether the accordion nodeview's `selectNode`/`deselectNode` is triggering focus/scroll.

---

## Epoch 13: People + Collaboration (Starts Sprint 58)

**Goal**: Add a People system with safe file-tree representations, person mentions, and Hocuspocus-backed collaboration.
**Detailed plan**: [epoch-13-people-and-collaboration.md](epochs/epoch-13-people-and-collaboration.md)

### Sprint 58: Foundations
- [ ] Work from `/Users/davidvalentine/Documents/Digital-Garden/.worktrees/epoch-13-people-collab`
- [ ] Rename file-tree creation menu wording from `New` to `Add`
- [ ] Add People schema foundations: default `People` group, group/subgroup, person, mount, mention planning
- [ ] Keep group/subgroup as People-domain mount nodes rendered folder-like; do not add `ContentType.group`
- [ ] Add server-side People tree policy scaffolding for create/move/duplicate/delete/mount APIs
- [ ] Add collaboration access planning for owner, signed-in `view`/`edit`, and public `/share` view-only paths

### Sprint 59: People View + Mount UX
- [ ] Build People view with canonical group/subgroup tree
- [ ] Build person detail surface with person-scoped content
- [ ] Add `Add -> Person/Group` searchable mount flow in file-tree context menu and `+` menu
- [ ] Add conflict detection for already-mounted people/groups/subgroups

### Sprint 60: Tree Policy Hardening
- [ ] Enforce exactly-one file-tree representation per person/group/subgroup
- [ ] Implement confirmed remount transactions for conflicting group/subgroup mounts
- [ ] Implement controlled-content reassignment inside People mirrored areas
- [ ] Implement warning + preference when moving controlled content out to normal folder jurisdiction

### Sprint 61: Person Mentions
- [ ] Add `@person` TipTap extension and autocomplete
- [ ] Sync mentions to normalized storage
- [ ] Clicking an `@person` opens the person and focuses their file-tree mount if present

### Sprint 62: Hocuspocus Collaboration
- [ ] Add same-repo Hocuspocus service and Yjs persistence
- [ ] Support owner `/content` collaboration access
- [ ] Support signed-in collaborator `/content` access with `view` and `edit`
- [ ] Prevent legacy autosave from racing collaboration persistence

### Sprint 63: Share + Media Prototype
- [ ] Add public `/share` view-only access for non-users
- [ ] Preserve expected signed-in `view`/`edit` access when entering through `/share`
- [ ] Prototype small P2P WebRTC rooms only after Hocuspocus stability gates pass

## Epoch 14: Saved Content Workspaces

**Goal**: Persist named tab/pane workspaces with locked claims, temporary borrowing, permanent sharing, and expiration cleanup.
**Detailed plan**: [epoch-14-saved-content-workspaces.md](epochs/epoch-14-saved-content-workspaces.md)

### Sprint 65: Workspace Persistence + Claims
- [ ] DB-backed `ContentWorkspace` and `ContentWorkspaceItem` models
- [ ] Main Workspace fallback for unassigned/catchall tabs
- [ ] Workspace selector and settings popup in the main-panel navigation chrome
- [ ] Per-workspace tab/pane layout persistence and restoration
- [ ] Locked recursive folder/content claims with conflict reminder
- [ ] Temporary borrowing with auto-release and permanent sharing
- [ ] Tab context menu actions to move or share tabs across workspaces
- [ ] Workspace expiration archive/release flow
- [ ] Build + smoke gate on port `3014`

---

## Future Epochs (Unplanned)

**Detailed stubs**: [future-epochs.md](epochs/future-epochs.md)

### Collaboration & Sharing
- Real-time editing (TipTap collaboration), content sharing, security review required
- Mentions, annotations, commenting layers
- Session validation for AI features, editor session limits

### UI Revisions
- Default themes + custom user themes, editor styling, font/color customization

### YouTube Playlists & Summarizing (much later)
- Playlist support, AI video summarization, transcript indexing

---

## Deferred Items (Icebox)

### From Sprint 28 Backlog (Epoch 5-6)
- [ ] Table view component for folders (3 pts)
- [ ] Timeline view component for folders (5 pts)
- [ ] View preference persistence (2 pts)
- [ ] View switcher UI with keyboard shortcuts (2 pts)

### Payload Stubs
- [ ] ExcalidrawPayload schema + stub viewer
- [ ] MermaidPayload schema + stub viewer (includes Mermaid in TipTap — deferred from earlier work)
- [ ] CanvasPayload schema + stub viewer
- [ ] WhiteboardPayload schema + stub viewer
- [ ] Dedicated PdfPayload with annotations

### From Epoch 7 (AI — partially shipped, rest deferred)
- [ ] Speech-to-text / text-to-speech
- [ ] RAG / embeddings / semantic search
- [ ] Chat history search

### Settings Improvements
- [ ] **Settings: back arrow navigation** — Add a back arrow at the top of the Settings page to navigate back to the content IDE. Should return to the last viewed note (or once tabs exist, restore the full workspace state). (2 pts)
- [ ] **Storage Settings: show existing providers** — The Providers tab should list all currently configured storage providers (with status, type, default indicator) and allow editing/removing them. Currently only shows "+ Add Provider" with no visibility into what's already configured. (3 pts)

### Refactoring / Tech Debt
- [ ] **People panel drag-and-drop: consolidate with file tree** — The People panel reimplements drag logic (insert indicators, edge-zone detection, drop-into-group vs drop-beside) that mirrors the file tree. Extract the shared logic into a reusable hook or utility (`useSortableDragDrop` or similar) so both trees use the same implementation. Currently in `components/content/people/PeoplePanel.tsx` (`PeopleGroupRow`) and `components/content/FileTree.tsx`. (3 pts)

### Bug Fixes
- [ ] **Desktop logo missing in content layout** — The Digital Garden tree logo inside the gold medallion (NotesNavBar → NotesLogo → CompactLogo) renders on mobile and the home page but is invisible on desktop in the content layout. The gold medallion ring appears but the animated SVG tree inside is blank. Likely a `useLogoAnimation` issue where SVG paths stay at `opacity: 0` if the draw animation fails silently on desktop. (2 pts)

### Performance & UX
- [ ] Folder view performance tuning for large folders
- [ ] Virtualization for grid and kanban views
- [ ] Empty state designs for all views
- [ ] Folder sorting and filtering UI
- [ ] Custom kanban columns

### Mobile & PWA
- [ ] Mobile-responsive layout
- [ ] Touch gesture support
- [ ] Offline mode with service workers

### Integrations
- [ ] Google Drive sync
- [ ] GitHub repository sync
- [ ] Notion import/export

---

## Estimation Reference

**Story Points**:
- 1 pt: Simple task (<2 hours)
- 2 pts: Small task (2-4 hours)
- 3 pts: Medium task (4-8 hours)
- 5 pts: Large task (1-2 days)
- 8 pts: Very large task (2-3 days)
- 13 pts: Epic (needs breakdown)

**Velocity Target**: 18-22 points/sprint (2-week sprints)

---

**Last Updated**: Mar 12, 2026
**Next Review**: Sprint 41 kickoff
