---
last_updated: 2026-08-26
current_epoch: 18
current_sprint: 58
sprint_status: in-progress
---

# Digital Garden Content IDE - Status

**Single source of truth for current development status**

<!--
MAINTENANCE INSTRUCTIONS (for AI assistants & developers):

ALWAYS UPDATE when:
- Completing a work item -> Move to "Recent Completions"
- Starting work -> Change Planned to In Progress
- Significant progress -> Update percentages
- Encountering blockers -> Add to "Active Blockers"

WHAT TO UPDATE:
1. Frontmatter: Change `last_updated` to current date (YYYY-MM-DD)
2. Work Items: Update status emoji
3. Recent Completions: Add new entry at TOP (keep last 30 days)
4. Progress: Recalculate (Completed Points / Total Points) * 100
5. Known Issues: Add/remove/update blockers

SYNC WITH: work-tracking/CURRENT-SPRINT.md (detailed tracking)
FULL GUIDE: STATUS-MAINTENANCE-GUIDE.md

SPRINT EXECUTION PROTOCOL:
Before commencing any sprint, always ask the user for input on the sprint plan
before planning and executing. There may be additions or modifications.
-->

## Current Work

> **Reconciled 2026-06-11.** This project runs **multiple parallel feature epochs/worktrees**, not a single linear sprint ladder. The frontmatter `current_epoch`/`current_sprint` reflect the primary in-flight focus; the lists below reflect reality across worktrees.

### Active Epoch: Epoch 18 — Multi-Tenancy Foundation
**Status**: In progress (Phase 1) — worktree `feature+multi-tenancy`, dev DB isolated (Neon `dev-david`, `pg_trgm` enabled). Phase 0 ✅; additive schema + tenancy helpers + backfill underway.
**Theme**: Additive multi-tenant schema, tenancy helper module, backfill
**Detailed Plan**: `docs/notes-feature/work-tracking/epochs/epoch-18-multi-tenancy.md` (+ `MULTI-TENANCY-PLAN.md`)

**Other in-flight worktrees** (parallel): Epoch 19 — Flashcards FSRS (`flashcards-fsrs`); `ai-chat-polish`; `ai-flashcards-tools`; `mobile-webview-spike`; `speed-reader`; **Agentic Browsing** (`feat/agentic-browsing` — Phase 0 + hardening + Phase 1 shipped, PR pending; `AGENTIC-BROWSING-PLAN.md`).

### Next (booked, not started): Epoch 13 — People + Collaboration
**Duration**: 6 sprints (58–63) — Foundations · People View + Mount UX · Tree Policy Hardening · Person Mentions · Hocuspocus Collaboration · Share + Media Prototype
**Detailed Plan**: `docs/notes-feature/work-tracking/epochs/epoch-13-people-and-collaboration.md`

### Planned: Offline Work epoch (number TBD)
Durable offline editing for the **plain/REST save path** (continuous localStorage draft + reconnect replay), tab-content preload, and clearer collaboration-degraded UX. Continuation of the May-17 anti-overwrite ("Phase I") guards and the 2026-06-11 canonical-`bodyHash` hotfix (#56). Today the conflict resolver only protects the **online plain path**; the collab path relies on Y.js IndexedDB + CRDT, and plain-path offline edits are **not** durably persisted (in-memory; reload can lose them).

## Recent Completions (Last 30 Days)

**August 26, 2026** *(updated Aug 27: Phase 2 completed — file column/gallery/split/form/list views + options editor; Phase 6 built — property header, DataCapsule, query_database/describe_database/append-only insert_rows with enforced token contract and association jurisdiction, B5-classified; creation-path audit fixed external-link + JSON context-menu gaps)*: **Database content type — Phases 1–6 built** (branch `feat/data-content-type`; per-slice eslint + scoped-tsc green throughout, owner smoke-testing phase-by-phase on Mac; plan: `work-tracking/DATABASE-CONTENT-TYPE-PLAN.md`; ⚠ **rebase onto main + owner regression pass pending**, ⚠ **migration `20260817172426_data_content_type` must `migrate deploy` before any non-local env**, ⚠ **Hocuspocus redeploy required at merge** — noteWindow attrs, TipTap schema 1.16.0)

The user-defined database feature (Notion/Airtable-class) replacing the stubbed `data` payload: row-as-JSONB under a relational meta-schema (`DataColumn`/`DataView`/`DataRowLink`, opaque immutable column keys, 23-value type enum with an implemented-gate), CAS cell writes with three-outcome undo, shared 10s poller + windowed grid, fractional ordering. **Phase 2** views: `?view=` URLs, view bar with rename, Airtable access model (collaborative/personal/locked), one filter compiler serving SQL + client preview, typed raw-SQL sorts, board/kanban (drag = cell write), row peek, databases rail. **Phase 3** query mode: tables that project ContentNodes through the same view stack (synthesized columns, read-only by construction, tags/types query bar). **Phase 4** relations: links only in `DataRowLink` (RESTRICT on column FK buys unbounded column undo), backlink pairs with `isBacklink` discriminator, immutable relation targets, V1-3 redaction, read-time lookups/rollups, contentLink columns (ContentTreePicker reuse, open-in-tab, `ContentLink` dual-write with cross-column cleanup), person columns (People-extension search, `personSource` config). **Phase 5** lazy promotion: open-as-page (role `primary`, tree-visible under the table), wiki-link `[[...]]` + chat `@`-mention suggestion of un-promoted rows with promote-on-selection at `referenced` via one shared resolver (`searchRowSuggestions` + `/api/content/data/suggest`) — the plan's flagged prototype came out clean, D2 stands; `?row=` canonical URLs redirecting to the node once promoted; provenance breadcrumb on promoted pages ("Row of ‹table› · Open in table"); `displayOrder` stamped once at promotion (O11); B3 verification CONFIRMED ViewGrant is flat — no folder-grant leak is possible, one fails-closed asymmetry backlogged. B-items live: AI schema digest + REFERENCE seeding (B1), search consistency incl. live-row match rolled up to tables (B2), additive-only access helpers (B3), real undo with CAS inverses (B4). Deferred with reasons in plan/backlog: tree drag-in promotion, gallery/list/split/form view modes, Phase 6 chat tools, Phase 7 import/export.

**August 20, 2026**: **File tree Reference Drawer — referenced content nests behind a count chip; both visibility toggles removed; publish dot made meaningful** (branch `feat/file-tree-reference-drawer`, PR #169; typecheck/lint(**ratchet lowered 159 → 149**)/**new `reference-block:check` gate**/build green; owner browser smoke pending)

Referenced content no longer interleaves with real files. Root cause was a one-line fallback in the tree route: `treeParentId = referenceOwnerId ?? item.parentId` — references are re-homed under their owning note when ownership resolves (`ownedByNoteId`, else the oldest live `image-ref`/`audio-ref` ContentLink), but when it doesn't, they silently landed back in their storage folder as ordinary siblings. The API now fetches both roles unconditionally and **partitions** referenced children out of `children` into a new `references` array; a **count chip** on the parent row (`🔗 3`) reveals them in a washed, rail-marked block indented a half-step. Separation is deliberately visual, not structural — the rows inside are ordinary tree nodes with their own selection, drag and context menus, so system-generated attachments read apart from authored content without becoming a special case. Chip state keys off `refs:<parentId>` in `expandedIds` (`lib/features/content/reference-group.ts`), inheriting localStorage persistence and `TreeStateSnapshot` workspace round-tripping for free; default collapsed. The chip's second half is a **two-direction arrow** that flips the whole block between the start and end of the parent's content — per parent, since a media folder reads better attachments-first while a working folder wants them out of the way. Placement lives in its own persisted set (`referencesAtStartIds`, tree-state-store **v3**) rather than folded into `expandedIds` under a prefix: "is expanded" and "sits at the start" are independent facts, and one set meaning both makes every read ambiguous. The arrow renders only while the block is open (no visible effect otherwise), and both chip actions are mirrored into the row's right-click menu so the chip isn't the only route.

**Removed:** the tree-wide `showReferencedContent` store (`state/file-tree-filter-store.ts`, deleted), its root-menu entry, the per-folder "Show/Hide referenced content" menu entry, the whole `onToggleReferencedContent` prop chain (5 files), the `handleToggleReferencedContent` PATCH handler, `hiddenReferencedCount` + the "N referenced items hidden · Show" banner, and the WS3 chat-deliverable carve-out — a deliverable now lands in its chat's reference block, so it can't be orphaned and needs no exemption.

**Bundled fix — the draft dot.** `FileNode` rendered a grey dot on `!isPublished`, but `ContentNode.isPublished` is a legacy share-link boolean the publishing extension **never writes**, so it fired on essentially every row and meant nothing. Replaced with a three-state rule derived from real publish history (`PublicItem.firstPublishedAt` + `PublishState`, one added select): **never published → silent** (the majority), **live → emerald**, **withdrawn (was live, now not) → amber**. `scheduled` deliberately left out. No schema change.

**New gate — `pnpm reference-block:check`** (`scripts/validate-reference-block.ts`, wired into the build chain after `blockid:hygiene:check`). The transform lives in `lib/features/content/reference-group.ts` — pure and dependency-free precisely so it can be exercised without react-arborist or a browser. It pins an invariant neither tsc nor eslint can see: `expandReferences` must return nodes **and** arrays by object identity when nothing changed. react-arborist keys row recycling off identity, so the obvious "simplification" — always returning fresh objects, which produces byte-identical JSON — remounts every row on any tree re-render and eats the inline-rename caret mid-keystroke (same class as the `OnlyOfficeEditor` `Date.now()` key bug). Verified the gate actually fails on that regression before shipping it: deliberately returning the cloned array trips 7 checks and exits non-zero. Also pins ordering either side of primary children, edge tagging for the block's rounded corners, and independent nesting.

**Follow-ups on the branch.** The placement arrow is hidden on rows whose only children are references — with nothing to order the block against it offered a swap with no visible outcome, which read as broken. And drag-and-drop now incorporates a dropped reference immediately: `applyMoveToTree` builds the optimistic tree and predated the `references` array, so it walked `children` only. Dropping **into** a parent inserted the node in `children` while the server partitions it into `references` (row rendered unnested, chip count stale until reload); dragging **out of** a block couldn't find the node at all, leaving `movedNode` null so the whole optimistic update silently no-op'd. Both traversals now cover both arrays and insertion mirrors the server's partition, with root kept as the deliberate exception — the API never partitions the root array, which is the "unassigned" state a root drop produces on purpose.

**Also corrected:** `BACKLOG.md` claimed folder views "query by parentId + `includeReferencedContent`". They don't and never did — `buildContentListUrl` emits no role param and `GET /api/content/content` has no `role` where-clause key, so `FolderPayload.includeReferencedContent` is **inert everywhere** (verified across 6 components + 9 handlers). Folder views therefore still list references unconditionally — logged as a separate followup, along with dropping the dead column (needs an owner-run migration).

**August 19, 2026**: **Mobile app — the shell is installed on a physical iPhone** (branch `feat/mobile-shell-p0`, PR #164; typecheck/lint(151) green; full owner smoke passed on simulator, device install verified)

The June spike's native shell (`mobile/`) is revived, hardened, and running on real hardware as `com.centervalentine.digitalgarden`. **Phase 0 — revival + auth:** Expo 52→57 (React 19.2, RN 0.86, TS 6; expo-doctor 21/21) with the three SDK-57 breaks fixed (`newArchEnabled` removed, `absoluteFill` rename, `babel-preset-expo` now explicit) and WKWebView content-process termination recovery wired (silent reload once; error screen if it thrashes within 30s). Auth is validated end-to-end in-shell: `/mobile` is auth-gated server-side (no sign-in, no menu), Google OAuth completes **inside** the WebView via a nav-policy allowlist for `accounts.google.com` (externalizing it stranded the session cookie in the Safari sheet's jar — the allowlist decision `mobile/README.md` explicitly deferred), and the cookie survives app termination. In-shell smoke surfaced three **web-side** bugs, all fixed here: a coarse-pointer-only BubbleMenu infinite loop (`Maximum update depth exceeded` — inline options object identity re-initing TipTap's floating plugin; **was live on main for every touch web user**, desktop never armed it), the nav logo dead-linking to `/` in-shell (now routes to the `/mobile` launcher via `isNativeShell()`), and the Upload dialog unusable on phones (iOS sticky auto-zoom from sub-16px form controls → global 16px floor on coarse pointers, which keeps pinch-zoom unlike `maximum-scale=1`; plus dark-authored text on a theme-aware glass surface → subtree scoped `dark`). **Phase 1 — installable:** free Apple Personal Team signing, no TestFlight; the ATS local-networking exception now derives from the target URL scheme so an https build structurally cannot ship it, and `.env.production` is committed so Xcode-driven Release bundling inlines the prod URL. Eight one-time blockers were cleared to get there, three needing repo changes: `expo run:ios` is unusable because Xcode 26 keeps signing certs in Apple's cloud where `security find-identity` sees zero identities (use `xcodebuild -allowProvisioningUpdates`); `expo-modules-jsi@57.0.4` doesn't compile under Xcode 26.3 (C++ interop leaks the C stdlib's `abs()` → ambiguous call), pinned via `patch-package` (`Swift.abs`, drop at 58.x); and installs need the phone unlocked to mount the Developer Disk Image. The whole pipeline is frozen into `mobile/scripts/install-device.sh` — one command for the weekly re-sign the free-team path requires. Full plan: memory `mobile-app-shell-plan`; next is the app icon and Phase 2 (haptics round-trip, `native:app-state` → collab sleep/wake). The layout revert-fight observed during smoke is deliberately out of scope (owned by the layout intent/projection workstream).

**August 18, 2026**: **Co-browse performance — bind-first tab topology, document-identity navigation, primary-scroller enumeration** (branch `feat/cobrowse-bind-first`; typecheck/lint(149)/prompt-cache/ai:drift/extension build green; owner smoke pending; extension **5.4.0** — reload at `chrome://extensions` after pulling)

The AI's co-browsing now defaults to the page the user is on. `co_browse_open` is bind-first and the decision is made in code from real tab facts (`session.js startSession`): no url, or a url on the same site as the user's active tab, binds that tab in place (no reload, their filters/personalized list survive); an existing session's tab is kept for a same-site re-open (a mid-run re-open or a post-eviction recovery can no longer spawn a sibling tab); a fresh agent-owned tab opens only for a different site or an explicit `newTab: true`. "The user's active tab" is scoped to the panel's own window (`panelWindowId` stamped by the panel host — the old `tabs.query({active:true})` returned one tab per window), and binding replaces a session on another tab instead of refusing. The prompt, tool descriptions, and the `NO_SESSION` recovery text were rewritten to the same default. Two page-agnostic perception upgrades ride along: every act reports **`documentChanged`** from the top frame's CDP `loaderId` (real navigation vs an in-place update whose query string changed — trusts document identity, not URL text — so `back` is used only after real navigations, and results lists aren't reloaded/re-ranked between items), and `scroll`/`collect` drive the page's **primary scroller** (the window when it has travel, else the dominant visible inner list container — two-pane results layouts, mail, dashboards now enumerate fully instead of `atBottom` on an unmoving window; `atBottom`/`scroller` are now actually forwarded to the model, which the engine had been dropping). Timed and per-item iteration now freeze the enumerated list (by observed `href`) as the itinerary and never re-derive "next" from a re-read list. Companion in the same PR: the on-page co-browse banner (`banner.js`, `--silent-debugger-extension-api` note) and chat-panel interface polish (mention-pill ⌘/Ctrl+click open, associated-content chip overflow menu, breadcrumb menu via `use-anchored-menu`). Plan amendment: `AGENTIC-BROWSING-PLAN.md` §"Co-browsing presence".

**August 16, 2026**: **Workspace layout intent/projection — behavioral spec + P1–P3 infra** (branch `feat/layout-intent-projection`; typecheck/lint(151)/build + full CI chain green at every commit; migration `20260815120000_workspace_membership_and_layout_records` applied to local dev, ⚠ **`npx prisma migrate deploy` against Neon required before the Vercel preview or prod can serve workspace endpoints** — the list include queries the new tables)

Workspace state is reclassified into intent (synced) / projection (derived, never stored) / device navigation (local) per `work-tracking/LAYOUT-INTENT-PROJECTION-PLAN.md` (owner requirements R1–R8 + F1/F2 encoded, all decisions recorded). **P1:** `ContentWorkspaceTab` — workspace-scoped tab membership (R1: opens/closes sync everywhere) with per-tab pane-affinity hints; legacy snapshot PATCHes dual-write it (set-reconcile, DB-verified idempotent), and new-client `POST/DELETE …/tabs` endpoints exist. **P2:** `ContentWorkspaceLayoutRecord` — per-family layouts (`desktop` couples via one `deviceId="shared"` row; native/web phone/tablet and each extension surface write their own rows; 30-day freshness). Ghost-writers killed: the extension side-panel can no longer PATCH workspace intent (it was about to prune membership to its single pane post-P1 — gated at `persistActiveWorkspace`), and background sync-restores now run "reconcile" (tab set + titles only), ending the cross-device layout/active-view revert fight (R3). **P3:** `useProjectedLayout()` — phone orientation mapping (side-by-side ⇄ stacked; quad passes per owner D2 with a one-line chop point), focus-route + single-content embeds project to `single`, panel embed gets only the R7 quad ban; the MobileNotesLayout `setLayoutMode` coercion effect and FocusContentWorkspace's `restoreWorkspace`/`setCollapsed` ghost-writes are deleted. Workspace opens run the R5 inheritance chain (own record → shared desktop → newest extension → newest mobile → legacy blob) with `lastActive` applied only as a last-resort seed. Deferred: F1/F2 UI affordances, client-side tab events (P4), settings split (P6), legacy-field cleanup, live membership fan-in.

**August 14, 2026**: **Note Window block ("window another note in place") + clipboard round-trip fixes** (main working tree; typecheck/lint(149)/collab:schema/markdown:blocks/blockid:hygiene/extensions gates green; owner smoke pending; ⚠ **Hocuspocus redeploy required post-merge** — new `noteWindow` node type)

A new core editor block, **Note Window** (`/window`): windows any other content node's note content inline — view, edit, retarget, create. The architecture reuses what already works: the window's editable mode is byte-identical wiring to a workspace pane (`useCollaborationRuntime` with a new `"note-window"` surfaceKind, `requiresLiveTransport: false` — no nested Hocuspocus exists, the runtime dedupes per contentId), the body is `MarkdownEditor` composed directly, and sidecar notes (NotePayload on non-note nodes) stay REST-only with the `X-Body-Hash` 409 guard. Editing is gated by a shared 10s presence poller (`lib/domain/collaboration/presence-poll.ts`): a target actively open in another session renders as a read-only snapshot with "Live elsewhere" + hover-visible refresh; in ydoc-local mode the refresh becomes "Sync latest" (`promote("explicit-live-workflow")` — never a REST swap into a bound editor). Header: filename as plain text (click renames the ACTUAL file — PATCH + `content-updated`), retarget picker (tree browse + search + file-tree "blank line" create-with-required-name at the top of any folder), history dropdown, open-full-page. Per-instance retarget history travels in the host note's Y.Doc (`blockNoteWindow:{blockId}`) and is copy/paste-immune via a new collision-scoped `transformPasted` re-id extension (`BlockIdPasteHygiene`) + an unconditional blockId walk in the duplicate route (`pnpm blockid:hygiene:check` pins both). Nesting: depth 1-2 windows render collapsed → expand to read-only snapshot; depth ≥3 and cycles render inert chips. Windows count as links — the backlinks walker matches `noteWindow.targetContentId` (id-only) with a "window" badge, and AI chat context pulls windowed notes via `collectWikiLinkRefs`. **Bundled fixes:** (1) mermaid/excalidraw header rename ate the caret every keystroke (updateContent `innerHTML=""` teardown destroyed the focused contentEditable — now a title-only fast path syncs in place via `inline-edit.ts`, and blur/Enter finally PATCHes the real file title, closing the rename desync); (2) copying an accordion pasted a stray "▶Title" line — renderHTML emits header chrome beside the content hole and parseHTML had no `contentElement`; fixed on accordion, cardPanel, and pullQuote (which was ALSO losing to StarterKit's generic blockquote parse rule — priority 51 now preserves the type), pinned by a new norm-free HTML-round-trip layer in `markdown:blocks:check`. (branch `feat/collab-write-path`; typecheck/lint(149)/collab:schema:check/note-edit:check green; owner smoke pending)

AI and browser-extension note writes now apply **through** the live collaborative document instead of writing `NotePayload` behind it, so an edit appears in an open editor immediately. Out-of-band writes branch on document state through one shared helper (`lib/domain/content/write-note-content.ts`): a note with no `CollaborationDocument` has no other copy, so the payload write is correct and Hocuspocus is never contacted; a note that has been opened is applied via a new authenticated `POST /internal/apply` on the Hocuspocus service, which broadcasts to connected editors and persists through the normal store hook. The edit is a minimal diff (`updateYFragment`), so untouched blocks keep their Y identity and concurrent cursors survive — pinned by `pnpm note-edit:check`, whose load-bearing assertion is Y *identity* of an untouched block, since a delete-and-refill implementation would produce identical JSON while silently breaking every concurrent cursor. `updateNote` gains an `append` mode (default) so the model sends only new material and cannot wipe a note by omission; destructive rewrites are gated by shrink rather than by mode, so ordinary edits stay frictionless while a replace that drops most of a document raises an approval card. Receipts now carry route + block/char deltas, and write tools ship a pre-write snapshot that gives them the same Undo chip as editor-tool edits (stripped from the wire and from persistence, so it never reaches the model's context or a DB row). Also: resumable-stream reattach now waits for transcript hydration instead of racing it, and dark-mode borders plus the DeepSeek label were re-tuned for contrast. See `work-tracking/AI-COLLAB-WRITE-PATH-PLAN.md` (Slices 2–4 scoped, not built).

**August 11, 2026**: **Workspace tab-type filters + drag file-tree items onto pane tab strips** (branch `integration/workspace-tab-filters`, carries `feature/heading-ids-folding` + PR #160; typecheck/lint(151)/build gates green; owner smoke pending)

The workspace bar grows per-content-type filter toggles beside the clear-all control — one affordance per icon group that has an open tab anywhere in the workspace (icons inherited from the tab strip's canonical mapping, extracted to `components/content/headers/tab-icons.ts`, so icon changes propagate). Click cycles off → show-only → hide → off; all active filters compose as a strict AND, so overlapping/contradictory filters legitimately empty the strip (which then reads "N tabs hidden by filters"). View-only (hidden tabs stay open), not persisted, and a filter is pruned when its type's last tab closes. Separately, tree nodes can now be dragged onto any pane's tab strip to open them there — VS Code-style. Each strip is a react-dnd `NODE` drop target (native handlers alone are suppressed by the tree's drag manager; same constraint the chat composer documented). While a tree drag is in flight every strip shows a faint gold wash; the hovered strip shows a gold insertion caret at the exact slot (before/between/after tabs, computed from tab midpoints over the filtered `visibleTabs`). Drops open pinned, non-temporary tabs positioned via the new `ContentSelectionOptions.beforeTabId` — positional opens insert exactly at the caret and never evict the pane's preview tab; an already-open file's tab is moved/repositioned instead of duplicated. Multi-selection drags open every dragged node in selection order (`tree-drag-store` now carries the full `draggingNodes` set with title/contentType so tabs paint named, not "Loading..."). People nodes are excluded at the drag source, as before.

**August 8, 2026**: **AI Cost Metering** (branch `AI-sys-improve/cost-metering`, stacked on `feat/ai-harness-reliability`; typecheck/lint(151)/full-build green incl. new `ai:pricing:check` gate; owner smoke pending)

Pricing engine v2 in `lib/features/ai-connections/usage/pricing.ts`: 5-vendor seed table verified against official pages (Anthropic, OpenAI gpt-5.6 family incl. cache-write + >272K tier, Gemini incl. >200K Pro tier, DeepSeek hit/miss, Kimi via family-prefix matching), `PRICING_VERSION` stamping, null-not-zero unpriced contract. Cost computed **per request** in the turn accumulator (`mergeTurnUsageMetadata`) and persisted in message metadata; Anthropic cache-write tokens captured via `providerMetadata` in the chat route. Surfaces: avatar-tooltip est. cost (priced / current-rates / n-a states), per-connection meters now prefer persisted costs + exact `modelRoute.connectionId` attribution, run-ledger token stamps carry `~$` estimates, `ConversationDetail.spend` cumulative (API only — header line deferred to the inspector work). Gate: `pnpm ai:pricing:check` (coverage + calculator fixtures) wired into `build`. See `work-tracking/COST-METERING-PLAN.md`.

**August 8, 2026**: **AI Architecture Map + generated Capability Matrix** (branch `AI-sys-improve/architecture-map`, stacked on drift-gates PR #157; typecheck/lint/ai:drift:check/ai:matrix:check green)

Two orientation docs for the AI subsystem: `core/AI-ARCHITECTURE.md` (hand-written, symbol-anchored — the multi-request turn lifecycle, the 6-rung model resolution ladder, the five parallel model tables and which code consumes each, tool assembly + the deliberately-narrow resume predicate, step-budget formulas, playbook injection modes, prompt-cache policy, and "changing things safely" checklists) and `core/AI-CAPABILITY-MATRIX.md` (**generated** by `pnpm ai:matrix` from `PROVIDER_CATALOG`/`CONNECTION_TEMPLATES`/`resolveModelTemperature`/`supportsOpenAIPromptCaching` + scanned route vendor sets — per-model ceilings, reasoning posture, native search/PDF/caching, adapter coverage; `pnpm ai:matrix:check` in build + ai-drift.yml keeps it from going stale).

**August 8, 2026**: **AI Drift Gates — CI checks for the AI subsystem's parallel tables** (branch `AI-sys-improve/drift-gates`, stacked on `feat/ai-harness-reliability` PR #156; typecheck/lint/ai:drift:check green)

New `pnpm ai:drift:check` (`scripts/validate-ai-drift.ts`) + path-filtered `ai-drift.yml` workflow + build-chain wiring. Five binary gates born from the 2026-08-08 prod DeepSeek failure: (1) model identity tables agree — direct-vendor template models must have `PROVIDER_CATALOG` entries (now load-bearing: output ceiling + reasoning config), contextWindows must match across files, `AIProviderId`/`AIModelId` unions and the settings enum must match the catalog, `MODEL_MAP` keys ⊆ union; (2) catalog completeness — every model has `maxOutput`, reasoning-capable models ≥16k floor; (3) every tool classified user-configurable (settings metadata) or `HARNESS_INTERNAL_TOOL_IDS`, with route cross-checks so the gate can't go stale; (4) prompt/description tool-name references resolve to real tools; (5) every `AdapterKind` has a resolver branch. First run caught **33 live drift findings**, all fixed in the same PR (haiku-4-5 + mistral/groq direct-API ids added to catalog, gemini/grok contextWindow reconciliation, two flashcard proposal tools restored to settings metadata). Plan: `work-tracking/AI-DRIFT-GATES-PLAN.md`.

**August 7, 2026**: **Browser Extension V5 — Browser UI Overhaul** (Panel Overlay: tree-as-overlay, reclaimed sidebar, pin + link handles, slim panel chrome) (branch `feat/panel-tree-overlay`; ext 4.2.x → **5.0.0**; typecheck/lint(151)/extension-build gates green; owner-smoke-validated; PR #152)

The extension's file tree moves to a right-side on-page overlay; the side panel reuses the real content workspace + the real `RightSidebar` (chat + backlinks/outline/tags) as a resizable, clamped bottom strip (Studio disabled). A minimal handle cluster — both / panel / tree / **pin** / **link** / AI — with movable collapsed re-open handles (independent app vs panel localStorage keys). **Pin** files the current page under the selected folder (panel resolves target, background writes with the bearer token); **Link** associates the page with the content open in the panel; both flash persistent green cleared on navigation. Co-browse verified surface-gated (no schema). See `work-tracking/PANEL-OVERLAY-PLAN.md`.

**August 6, 2026**: **Workspaces — folder-scope borrow/share decisions now stick** (direct to `main`; typecheck/lint(151)/build green)

Fixed the Epoch-14 conflict-dialog gap where a folder-scope decision ("also apply to folder and all descendants" + Borrow/Always share) was a no-op for future opens: neither the client fast-path nor `resolveOpenIntent` ever consulted the requesting workspace's own **recursive** claims, so the borrow dialog re-asked for every descendant. `resolveOpenIntent` now honors a recursive claim (any assignment type) held by the requesting workspace on the content or an ancestor — checked before both the view-scope and overlap gates — and returns `alreadyCovered`, which the client uses to **skip the auto-primary assignment** for covered opens (previously that upsert could silently convert a borrowed/shared item to `primary`, or permanently pin descendants of a folder that was only borrowed). Follow-up (same day, owner-reported from prod): **the Main Workspace is now fully exempt as a requester** — opens from Main never hit the open-intent gate (client short-circuit + server `isMain` guard) and mint no claims into Main, matching its stated catchall role; previously a locked workspace's claim popped the borrow dialog even in Main. Known limitation: when a recursive folder borrow expires, descendant tabs opened under its cover stay open as unassigned tabs (only the folder's own tab is auto-released); next open re-asks.

**August 6, 2026**: **Folder Context Capsule — folder mentions, context modes, and the graduation of AI context to content-graph infrastructure** (branch `feat/ai-context-capsule`; full `pnpm build` green incl. the model-routing gate; **owner smoke PASSED 2026-08-06** — two smoke-round fix commits followed: settings/rail UX rework incl. proposal-flow retirement (D18) and the B10 empty-node coverage fix; PR opened)

Mention a folder in chat or a playbook and the AI receives a **capsule** — purpose (directives + role), summary, enhanced-only **signals** (gaps/ambiguities/misalignment), and a machine-readable child index (ids, one-liners, token estimates, freshness) — then walks down via the new `read_folder_context` tool, reading only the files it needs. Plan: `work-tracking/FOLDER-CONTEXT-CAPSULE-PLAN.md` (17 locked decisions + pre-build bug sweep B1–B9, all landed).

- **Graduation (Phase 0)**: the agentic-metadata substrate moved `extensions/studio/server/` → `lib/domain/ai-context/` — content-graph infrastructure now; studio is a consumer. Code moved, identifiers stayed. Also fixed six feature routes whose `defaultSuggestion` named retired `claude-haiku-3-5` (+ added `claude-haiku-4-5` to the Anthropic template — the model-routing build gate enforces suggestion↔template consistency).
- **Context mode ladder (Phase 1)**: `contextMode` enum `OPT_OUT < REFERENCE < STANDARD < ENHANCED`, nullable = inherit, nearest-explicit-ancestor-wins, OPT_OUT absolute downward; expand/contract migration (`contextOptOut` survives one release). Write hardening from the bug sweep: hash-at-read/revalidate-at-write (B1), cross-instance refresh claim CAS (B2), single-transaction mode writes (B3).
- **Capsule + gate (Phase 2)**: hybrid assembly (structure live from ContentNode, semantics from cached rows); code-side freshness gate with the failure ladder fresh → stale-flagged → hard-fail-only-if-none; mentions bypass the settle debounce (B9); `ai-context-enhanced` feature route with fallback-to-standard (B6).
- **AI Context rail (Phase 3)**: one mode selector replaces toggles; sections render per resolved mode; ContextTab/ContextAiPanel relocated to `components/content/ai-context/` and no longer follow studio enablement.
- **Folder mentions (Phase 4)**: two-stage gate (composer pre-flight on pill insert drives live chips; server re-gates at send, authoritative); durable trace rides the sent message as a `data-folder-context` part.
- **Walk tool (Phase 5)**: `read_folder_context` in the AI tool registry — progressive disclosure with the D17 frugality nudge.

**August 6, 2026**: **Heading folds + in-document heading links** (branch `feature/heading-ids-folding`; schema 1.14.0; typecheck/lint(151)/markdown/collab/publishing gates green; needs Hocuspocus redeploy post-merge)

Headings get accordion-like collapse and linkable identity. Fold state is one stored boolean (`heading.collapsed` via `DGHeading`) — persists with the doc, shared in collaboration; the fold *range* (following siblings to the next heading of equal-or-higher rank; blank headings participate) is derived per edit and hidden with decorations, never restructured. A deterministic unfold-on-edit guard means nothing invisible is ever edited. The gutter chevron is a widget decoration in the left padding (zero flow presence, generous hit target). Heading anchor ids are **live slugs derived from text** (`lib/domain/content/heading-ids.ts` — unified the three previous slugifiers; published pages stop stamping ids on publishing-block headlines). `[[#` opens a heading-mode suggestion; links carry `headingSlug`, heal on rename via a deterministic appendTransaction, and break/un-break in real time via decorations when the target vanishes/returns. Source view shows `## Title {.collapsed}` (ids never appear — derivable); file exports stay clean. The accordion block moved to `extensions/publishing/blocks/` as the presentation-side collapse container (node type unchanged; published headings never collapse).

**August 5, 2026**: **Per-item playbook iteration + co-browse reliability sweep** (branch `feat/per-item-playbook-checkpoints`; typecheck/lint(151)/prompt-cache/collab/extension gates green; owner-smoke-validated on tabs + LinkedIn list; PR-ready)

Applies a playbook to EACH item of an enumerated set — jobs collected from a board, the user's open tabs (`list_tabs`), or given URLs — with the **ledger as the loop's authoritative state** so "all qualified documented" is checkable, not the model's memory. The **harness owns the loop; the playbook is the per-item unit** (works on a single JD or an N-item list). ~85% composition on the Phase-1 research-run pattern.

The feature landed, then a smoke-test-driven **reliability sweep** hardened the whole chat + co-browse surface (each an independent, pre-existing bug surfaced by real use):
- **Loop reliability:** raised the server step-cap for iterations (was ending after ~1 item) + prompt/tool-result nudges to continue autonomously; per-source processing (co-browse LISTS navigate item-by-item, not one snapshot); **completeness** — every opened page is recorded (empties → `unreadable`), never silently skipped; ledger rows/roll-up **link to source URLs** (click-through + round-2 re-read).
- **Chat UX:** a persistent **"Working" indicator with elapsed time** (reasoning models no longer look frozen); **active-doc awareness** (chat resolves "this note" to the focused tab, no mention needed); generation **duration** in the avatar tooltip.
- **Write safety:** `updateNote` is **content-only** now (a `title` param let the model serialize its own guard text into a rename — the `/do-not-rename/` bug); renaming split into an explicit `renameNote`; `updateNote` reseeds the **collab Y.Doc** so AI edits show in open notes (the NotePayload↔Y.Doc seam).
- **Co-browse robustness:** `captchaDetected` only halts on an ACTIVE challenge (not LinkedIn's ambient reCAPTCHA); **session recovery** across SW eviction / app reload (re-attach while the tab is open — no timer), with an actionable no-session message so it never stalls; theme-independent banner; extension `4.0.0` versioning to distinguish WIP from released builds.

**August 4, 2026**: Agentic Browsing **Slice 4 — hostile-target de-risk** (branch `feat/agentic-slice-4`; extension build/typecheck/prompt-cache/lint green; owner-validated live; PR-ready)

Drove the raw-CDP co-browse pipeline directly against deliberately-hard real pages (LinkedIn, a Greenhouse board, a live cross-origin widget) so the "surprise miss" risk is *measured, not asserted*. Four target-agnostic resolve/perception fixes, and — the headline — **cross-frame acting proven on raw CDP** (the engine's biggest unknown).

- **3-tier name matching** (exact → starts-with → substring, whitespace-normalized; Playwright `getByRole` name semantics + a starts-with tier for concatenated names) — validated on two sites with opposite structures: LinkedIn cards are title-leading `button`s (starts-with tier, which also dodges the destructive `Dismiss` sibling), Greenhouse cards are company-leading `link`s (substring tier). Same matcher, both resolve.
- **Cross-frame acting proven**: clicking a control *inside* a live OOPIF (Forethought widget) opened it — the `frameOffset` frame-local→root translation works. This retires the risk that hedged `playwright-crx`; the deferral now holds on evidence.
- **Robustness**: fail-loud snapshot with no session; skip worker + captcha/challenge frames; **captcha detect-and-pause** (`captchaDetected` → the model stops and hands to the user). Role/destructive-sibling guidance added to the co-browse prompt + tool description.
- No `playwright-crx` swap trigger hit — every miss was raw-CDP-fixable.

**August 3, 2026**: Agentic Browsing **Phase 2b — supervised co-browsing** (branch `feat/agentic-browsing`; typecheck/lint/prompt-cache/build green; owner-validated live on a real jobs board; PR opened)

The AI can now DRIVE a tab in the user's own browser while they watch — read/click/hover/type/navigate/scroll, across same-frame and cross-origin (OOPIF) pages, under co-browsing governance.

- **Interaction engine** (raw `chrome.debugger`/CDP, D-ENG): a11y-tree snapshot targeting (role+name+`group`), the actionability pipeline (resolveFresh → `scrollIntoViewIfNeeded` → hit-test → trusted `Input.*`), and cross-frame read + act (frame-local→root coordinate translation). Validated on Indeed, a cross-origin widget, and a LinkedIn board.
- **AI tools** (client-executed, no server `execute`, trust-gated to the side-panel embed): `co_browse_open`, `co_browse_act` (read/click/hover/type/navigate/scroll/collect/wait/back/reveal), and `read_current_page` (reads the tab you're already on — no new tab). The engine's `onToolCall` drives the extension through the panel bridge (never the open page-bridge, so a web page can't attach the debugger).
- **Session/tab manager + control**: agent-owned-tab topology, `back`/`reveal`, an in-app co-browse **indicator + Stop** (the reliable cross-browser "agent is driving / halt it" signal, since the debugger banner is subtle in some browsers).
- **Timed iteration**: `wait` with an on-page countdown overlay + page-behavior classification (current URL in every snapshot → new-page vs in-place) so it can spend N seconds per item and reliably return to the list. Automatic `collect` gathers whole virtualized lists.
- **Context-awareness**: the panel chat knows the page you're viewing (lightweight hint) and reads it on request.
- **Composes with playbooks**: a "job fit" analysis per posting is authored content (`/`-attach a playbook note + `@`-mention your résumé) — no new code.
- **Deferred (own follow-ups):** Slice 4 hostile-target de-risk (may trigger a playwright-crx swap), per-item playbook checkpoints; both in BACKLOG.

**August 1, 2026**: Agentic Browsing **Phase 2a** — read-completion launcher + one deterministic reader (branch `feat/agentic-browsing`; typecheck/lint/prompt-cache/build green; owner-validated)

- **Read-completion launcher** (`open_tab_and_read`): when a read is blocked, the assistant opens the page in a VISIBLE foreground tab (the user's own session), reads it, and continues. Consent = one opt-in switch in **Browser Bookmarks → Capture & privacy** (`capture.allowTabLaunch`, off by default); the extension enforces it and — per the security review — the `visible` path still runs the SSRF/private-network policy gate (`visible` only changes *how* the tab opens, never *whether* the URL is allowed). Rode almost entirely on Phase 0's acquire rails: one `visible` boolean threaded through 5 hops + one gate.
- **One deterministic reader** (`read_page_headless_or_browser`, renamed from `read_page_in_browser`): smoke-testing showed the model inconsistently choosing among three read tools — including server-only `read_page`, a dead end that can't escalate. Fixed structurally — the route **drops `read_page` when the extension is present**, so there's ONE reader and the **code** runs the whole ladder (headless fetch → background tab → visible tab when enabled) in one call. Principle: *the model decides WHETHER to read; the code decides HOW.* `open_tab_and_read` stays for an explicit "open a tab" request.
- **Visibility:** action-expressive chips ("Read page (headless): host" / "Read page — opened a browser tab: host") + an `escalationNote` the model narrates. Deferred (after Phase 2b): an in-chat read-mode toggle (layer #2) + a live per-phase step display (layer #3, shared with 2b nav steps).
- No new libs/perms/Prisma. Full spec: `work-tracking/AGENTIC-BROWSING-PLAN.md` (Phase 2a). **Phase 2b (supervised navigation)** is next — opens with D-ENG/D-TGT/D-BANNER + the playwright-crx spike.

**August 1, 2026**: Agentic Browsing Phase 0 + hardening + Phase 1 — the browser read tool becomes a research agent (branch `feat/agentic-browsing`; typecheck/lint/build green; owner-validated smoke tests; PR pending rebase after #142)

- **Phase 0** (`read_page_in_browser`): the first client-executed chat tool (no server `execute`) — the model's tool call streams to the browser, `onToolCall` runs `acquireUrlWithFallback` in the user's **own** session, the result posts back via `addToolResult` + a *targeted* resume predicate (scoped to this tool so it can't defeat the `stopWhen` bound). Registered only when the extension is reachable; declines with a CTA otherwise. Reads login-walled / bot-blocked / JS-heavy pages a server fetch can't.
- **Phase 0 hardening**: the extension's session-tab extraction waited a flat 1.5s then extracted once → nav/footer chrome on JS-hydrated pages. Now a **settle-then-extract poll loop** (re-extract until Readability succeeds or content length stabilizes, 8s cap) + a **main-landmark tier** (`main`/`[role=main]`/`article` before full-body). LinkedIn validation deferred (pathological anti-automation — job pane never renders into a backgrounded tab).
- **Phase 1** (multi-step research loop): `propose_research_run` (a `needsApproval` plan card fixing objective / budget / target / ledger up front), `extract_structured` (cheap-model `generateObject` → structured rows, infers interpretive columns), `record_research_findings` (per-objective ledger). Rides the existing AI-SDK tool loop under a gated research-methodology prompt. **Per-run page budget** enforced client-side (run-scoped, fail-open, soft-stop, count-only-successful) + server-side budget derived from the plan result in `body.messages` (raises the step cap + acquisition budget). ~90% reuse: `createNote` (GFM→TipTap table), `upsertRunLedger`, output-placement, associations. **No new libs / perms / Prisma.**
- Fixed en route: composer provider/model/context menus clipped by the `overflow-x-auto` control rail (portal + `anchorMenuAbove`, **PR #142**); `web_search_preview`+gpt-4 silent-hang diagnosed (gating fix backlogged).
- Full spec + phase roadmap: `work-tracking/AGENTIC-BROWSING-PLAN.md`. Deferred: read-completion tab launcher → Phase 2; rich approval-card previews (tooltips/TipTap/file) → backlog.

**July 25, 2026**: Wiki-links survive renames — `wikiLink.targetId` (TipTap schema 1.13.0, branch `minor-work/markdown-roundtrip-tables`)

- Renaming a note silently orphaned every inbound `[[link]]`: the node stored only `targetTitle`, resolution was an exact title match, and a miss returned without navigating or saying anything (read as a dead click). The autocomplete had been passing the target's id all along — the node never declared the attribute, so ProseMirror stripped it.
- `wikiLink` now carries a nullable `targetId` (client + server variants). Resolution is id-first with the exact-title search as a permanent fallback (hand-typed, AI-authored, and imported links have no id), shared by all three surfaces via `lib/domain/editor/wiki-link-resolve.ts`.
- ID-less links self-heal: a successful title lookup stamps the resolved id onto every equivalent link in the document (attr-matched, not position-matched; skipped on read-only surfaces). No migration — the corpus converges as links get used. Backlinks (API route + browser-extension service) match on id too, so a rename no longer drops them.
- A genuine miss now shows a toast and a transient `.wiki-link-broken` style — DOM-only, never written into the document, since a failed lookup can be transient.
- Markdown round-trip unaffected: paragraphs with wiki-links already serialize at Tier 2 (node HTML), where `data-target-id` rides along and `parseHTML` reads it back — verified lossless for id/alias/legacy/metachar cases. The block-safety gate's attr sweep only reached top-level blocks and waved inline nodes through as "tested via parent", so an **inline-node attr sweep** was added; all 16 inline attrs pass.
- Post-merge: **Hocuspocus redeploy required** (new attribute in the collab schema).

**July 25, 2026**: AI 3.4 — playbook-orchestrated model routing on PR #132 (branch `feat/ai-v3.4-model-routing`; S1–S3 + 8-angle review fixes + 4 browser-smoke rounds + catalog-drift safety net; typecheck/lint/build/model-routing:check green)

- A playbook phase declares its model via a structured `model:` line — a role (`scout`/`analyst`/`writer`/`coder`/`reviewer`/`archivist`), a vendor class (`gpt-5 series`, resolved deterministically), or an explicit `provider/model`. Resolution is deterministic — no runtime LLM router, no prose interpretation.
- Roles are new `role-*` FeatureSpecs, so users map each to their own ordered backups in the existing Feature Routing settings page; the whole existing fallback + capability-filter machinery is reused. Precedence: pinned user pick > phase directive > standing-rules > default; `modelPinned` (per-conversation, mirrors output-target) distinguishes a real pick from the carried baseline.
- Every turn's resolved model is stamped into message metadata (single source of truth) and shown inline in both chat surfaces as a subtle "Switched to X · by playbook Y (Phase N)" divider — never a pill, and it names who switched. Unresolvable directives emit a visible fall-through notice (never a silent vendor swap). `model-routing:check` gate added to the build.
- Deferred: checkpoint pre-flight (warn before running an unresolvable next-phase directive) — its value is already covered by the visible notice + structural single-resolution; documented in the plan doc.

**July 24, 2026**: AI 3.3 — resumable streams on PR #130 (branch `feat/ai-v3.3-resumable-streams`, worktree `ai-v33-resumable`; Upstash provisioned + TCP/pub-sub verified, owner smoke-tested the live re-attach path)

- A reload or second tab now re-attaches to the still-running chat response and keeps rendering it live, on top of (not replacing) S1's `consumeStream()` no-lost-work machinery.
- SSE output tees into Redis via `toUIMessageStreamResponse`'s `consumeSseStream` (`resumable-stream` + ioredis, Upstash TCP `REDIS_URL`); a new GET on `/api/ai/chat` replays it; the engine fires one gated `resumeStream()` per chat with a `prepareReconnectToStreamRequest` bridge (useChat id is the surface key, server keys by persistent conversationId).
- Reloaded content settles in full instead of re-typing the buffered backlog (the resumed message would otherwise re-run the typewriter over already-generated text); only genuinely new tokens type.
- Kill-switch in `/settings/ai` (`ai.resumableStreams`, default on). Off or no `REDIS_URL` ⇒ byte-for-byte prior behavior with zero Redis traffic. Association keys are owner-scoped with 1h TTL; migration-free.

**July 23, 2026**: AI v3.2.2 prompt-cache foundation

- Supported OpenAI models now receive a stable, privacy-safe cache key scoped
  to the executed model, final toolset, user boundary, and validated playbook
  phase—not the individual conversation—so unchanged phases can reuse prefixes
  across separate runs.
- Chat stream traces now report normalized cache reads, writes, uncached input,
  hit rate, policy version, and general/playbook scope from AI SDK usage.
- Active Playbook instructions precede current date, output target, rooted
  content, mentions, and page data, preserving a deterministic reusable prefix
  without enabling paid Anthropic/Google cache writes.
- `prompt-cache:check` covers key stability/rotation, provider safety, option
  merging, usage math, and prompt ordering and is part of the build pipeline.

**July 23, 2026**: Playbook checkpoints now require provider-neutral evidence

- Root-caused GPT-4o's instant false Phase 1 completion to a nonexistent model-facing `read_note` name, missing rooted-playbook reference IDs, and a checkpoint tool that trusted completion claims without runtime proof.
- All providers now receive the real `getCurrentNote` contract; rooted and picker-attached playbooks share the same ownership-scoped linked-extension manifest.
- Research/reference phases cannot surface approval until their required observable tool activity completes. Premature checkpoints return corrective results, while approval resumes recover evidence from persisted tool parts.
- `playbooks:check` covers premature rejection, independent research/reference requirements, resume hydration, pure-writing phases, and disabled-tool safety.

**July 23, 2026**: Generic AI writes refresh the file tree in real time on PR #126

- Root-caused the stale tree to a contract split: chat cards rendered generic `__contentWrites` receipts, while freshness dispatch still recognized only legacy `__notePayload` results.
- Every validated persisted write now dispatches a tree refresh; note/folder and workflow receipts also dispatch their narrower live-view events, with legacy results retained for old conversations.
- The completion backstop can now recover partial stream states because tool calls are marked seen only after a recognized write.

**July 23, 2026**: Rooted-playbook output directives are runtime-enforced on PR #126

- Confirmed the Test 14 model understood “under the chat” but omitted `outputLocation` from `create_docx`; the runtime then correctly used the `underContent` preference.
- Canonicalized chat/content/folder placement vocabulary, removed the legacy `parentId` contradiction, and made “execute this file as a playbook” validate and bind the rooted file as Active Playbook context.
- Trusted title-matched output directives now provide a note/Word placement fallback when the model omits the optional field; explicit tool placement remains highest priority and unrelated artifacts remain on the selected preset.
- `playbooks:check` covers the exact malformed owner-smoke wording, rooted execution cues, and non-playbook ordinary questions.

**July 23, 2026**: Promoted chats retain their visible output preference on PR #126

- Confirmed from the owner-smoke trace that the first promoted request and its artifact still used `underContent`; only the chip regressed to `Under this chat` after the client key transition.
- Replaced the storage-only promotion transfer with an explicit in-memory handoff owned by the conversation engine, while retaining per-conversation storage for reloads and ordinary chat switching.
- `output-targets:check` covers promotion with unavailable storage so the visible preference cannot silently reset at the transient-to-conversation boundary.

**July 23, 2026**: Playbook outputs support per-artifact location overrides on PR #126

- Root-caused the Test 14 smoke failure from its `chat_input` trace: the playbook explicitly routed one note under the chat, but `createNote` could only override the preset with a folder UUID, so the model had no way to express a referenced-under-chat destination.
- Note and Word-document tools now accept ownership-safe symbolic destinations (`under_chat`, `under_content`, `beside_content`) for one artifact; omitted placement still uses the selected output preference and specifically resolved folders still use `parentId`.
- `output-targets:check` now verifies overrides in both directions plus sibling placement, preserving the rule that a run-wide preference yields to an explicit per-artifact instruction without affecting other outputs.

**July 23, 2026**: AI output routing and receipt icons unified on PR #126

- Cached web pages, generated image/audio files, workflows, folders, and Run Ledgers now use the same output-placement resolver as notes and Word documents.
- “Under this chat” creates referenced children of the chat; a selected folder creates primary children there; an explicitly user-named destination still overrides the preset.
- Content-write receipts now show type-appropriate icons for notes, external pages, folders, files, images, audio, workflows, chats, visualizations, data, and code instead of presenting every write as a folder.

**July 23, 2026**: Markdown paste prompt and frontmatter conversion corrected on PR #126

- The paste suggestion now has an `×` that dismisses only the current prompt; the existing “Don't show again” action remains the persistent preference.
- Paste conversion preserves a leading YAML-shaped block as visible plain text between two horizontal rules instead of letting its closing `---` become a Setext heading underline.
- Unmarked labels such as `name:`, `description:`, `Phase A:`, and `Phase B:` gain bold emphasis inside ordinary paragraph content; headings are created only when the pasted source actually contains heading syntax.

**July 23, 2026**: Run Ledgers receive searchable, run-stable titles on PR #126

- New ledgers are named `Run Ledger — <whole-run summary> · <memorable word pair>`; the phase-checkpoint contract asks for a stable subject-and-deliverables title and derives one from the summary when omitted.
- The word pair is deterministic from conversation identity, so every phase updates the same ledger while otherwise-similar runs remain distinguishable in search.
- Existing plain `Run Ledger` notes are adopted, tagged with their run identity, and renamed on their next checkpoint instead of being duplicated.

**July 23, 2026**: File-tree Shift selection no longer opens content on PR #126

- Shift-click and Shift-double-click now remain selection-only gestures: range selection, persisted selection state, status counts, and bulk context-menu actions still work without changing the active content pane.

**July 23, 2026**: AI content writes gain durable destination receipts on PR #126

- Every AI tool that persists garden content now returns a shared write receipt resolved from the saved `ContentNode`, including its effective folder or referenced-under owner.
- Chat messages render the receipt as a clickable emerald affordance naming what was created/updated/generated/cached and exactly where it lives.
- Coverage includes notes and sidecar notes, editor writes, Word documents, generated image/audio files, workflows, acquisition-cached web pages, created folders, and the playbook Run Ledger; legacy note cards still render for older persisted conversations.

**July 23, 2026**: Phase-checkpoint approval survives conversation reload on PR #126

- The owner reproduction was confirmed in persisted data: the live checkpoint reached `approval-requested`, but `ConversationMessage.parts` captured the stale `input-streaming` React snapshot without its approval ID, so reload rendered a running tool bubble.
- Conversation persistence now uses the AI SDK's fresh final assistant parts for both initial saves and post-approval continuation patches, not only for token metadata.
- Reload seeds persisted part signatures so the first resumed approval is patched, and complete legacy checkpoint snapshots are safely restored to an actionable approval card with a deterministic approval ID.

**July 23, 2026**: First transient side-chat submission preserved during referenced-chat creation on PR #126

- Root cause matched the owner report: the first send created the referenced chat node, then changed the conversation-scoped draft key before the queued resend. The queue stored only a boolean, so valid draft rehydration could clear the only copy of the submitted prompt.
- Promotion now snapshots the exact submitted text, seeds the new conversation's draft before rebinding, restores it if necessary, and only then sends through the bound conversation engine.
- The sidebar activates the new conversation immediately; refreshing its tab metadata no longer gates delivery of the first turn.

**July 23, 2026**: Assistant replies can be copied or sent to their configured output target on PR #126

- Completed assistant replies now retain a visible action row with copy and “send to output target” controls instead of hiding all actions until hover.
- Sending a reply creates a Markdown-backed note through the same validated chat/content/folder placement rules used by AI content tools.
- The naming dialog prefills only when the reply contains an explicit Markdown or standalone-bold title; otherwise it requires the user to name the note.

**July 23, 2026**: Output targets survive playbook checkpoint reloads on PR #126

- Root-caused mixed placement in one run: web caches executed during the original `underContent` request, while approved note/checkpoint tools resumed after reload with the default `chat` target.
- Each user turn now carries its selected output target as a durable data part. Approval continuations recover that turn-start contract instead of trusting rehydrated live UI state.
- Phase tool affordances now identify their phase as `Phase checkpoint: [phase]` in both approval and completed states.

**July 23, 2026**: AI output-target persistence and routing hardened on PR #126

- Root-caused a side-chat output that ignored its preset: `createNote` correctly omitted `parentId`, but the client had reverted to `{ mode: "chat" }` because the long-lived sidebar engine did not rehydrate output-target state when conversation keys changed.
- Output targets now hydrate per conversation, migrate from transient content keys when a side chat is promoted, reset rather than leak across unrelated chats, and remain visibly labeled in the sidebar header.
- The server validates and traces the target, tells the model the exact configured default, and preserves the contract that an explicitly named user destination overrides the preset.
- Added `pnpm output-targets:check` to the build and Quality workflow.

**July 23, 2026**: AI v3.2 T3 — explicit playbook recognition hardened on PR #126

- Root-caused the owner smoke failure from the captured `chat_input` trace: the marked test notes stored pasted SKILL.md as ordinary TipTap paragraphs, so the structural parser reported `0 phases`; the chat route then silently omitted the attachment and told the model that “this playbook” meant the rooted note.
- The parser now recognizes markdown-like headings/frontmatter in ordinary text and treats unsectioned instructions as one implicit phase. Valid empty attachments remain explicitly identified instead of falling back to discovery.
- Once an ownership-scoped attachment resolves, `search_playbooks` is removed for that turn. Discovery and execution are now server-enforced mutually exclusive states; generic note search remains available for phase work.
- Owner retest exposed a second representation gap: the server had correctly injected `Active Playbook: "Test"`, but the selection existed only in system context and the composer chip, so DeepSeek still opened rooted note `Test6` first. Each sent user message now carries a persistent `data-playbook` pill, and the server places the ownership-validated attachment directly beside the latest user request in model context. Rooted content is framed as optional task input whenever a playbook is attached.
- Added `pnpm playbooks:check` to the build and Quality workflow with structured, pasted-SKILL, textual-reference, unsectioned, and empty-playbook coverage.

**July 22, 2026**: AI v3.2 T3 — playbook registry + progressive disclosure, P1–P4 + P5-mark built (branch `feature/ai-v3.2-t3-playbooks`, worktree `ai-v32-t3`; plan: `work-tracking/AI-V3.2-T3-PLAYBOOKS-PLAN.md`; resource-discipline reference: `guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md`)

- **Framework-agnostic playbook model**: a playbook is just a note (`metadata.playbook` flag + `##` phases + `[[wiki-link]]` references) with a pluggable import-adapter interface for future frameworks (SKILL.md-shaped now; fabric/MCP-prompts backlogged, not built).
- **Registry + picker**: `GET /api/content/playbooks`, merged into the composer's `/` command list — selecting a playbook attaches it (chip in composer) instead of inserting text. Active phase is DERIVED from resolved `phase_checkpoint` calls in the message history, not manually tracked — survives reload for free.
- **Progressive-disclosure injection (the gate)**: `app/api/ai/chat/route.ts` injects standing rules + the ACTIVE PHASE ONLY (never the whole playbook) plus a "Linked extensions" manifest (title-resolved `[[refs]]`, sub-playbooks tagged) that the model traces on demand via `read_note` — never preloaded.
- **Hand-authoring (primary use case)**: "Mark as Playbook" in the editor context menu (inline description input) → `POST /api/content/playbooks/mark`.
- **Resource discipline formalized**: durable principles doc (termination/effort/context/decomposition mechanisms + maintained state table) governs this and future AI-agent builds; enforced budgets + sub-agent isolation deferred to T4.
- **Smoke-tested**: pure parser/renderer logic verified (wiki-link preservation, phase clamping, sub-playbook tagging); live route boot-check caught and fixed a 401-vs-500 auth bug on both new endpoints. Full authenticated browser click-through NOT done — no auth fixture in this repo yet (documented gap); manual smoke test recommended before merge.
- **Deferred**: SKILL.md import adapter (P5-import) — backlogged per the plan's own sequencing (append-only, no cost to defer).
- ⚠ Branches from `origin/main` before AI v3.2 T2 (PR #125, lossless markdown) merged — `lib/domain/ai/playbooks/render.ts` is a scoped temporary renderer (preserves `[[links]]`, not full markdown fidelity); revisit once T2 lands.

**July 20, 2026**: ✅ Browser Reach B1 — the side panel is a mini-DG shell (PR #115; plan: `work-tracking/BROWSER-REACH-PLAN.md`)

- **Side panel shell**: launch-handle opens `chrome.sidePanel` hosting `/embed/panel` — file tree + tabbed workspace + multi-conversation chat at panel width. Extension chrome is only a context bar (page pill, reload). Alt/shift-click still opens the legacy overlay; older Chromium falls back automatically.
- **Panel chrome**: navigation bar suppressed, workspace chooser moved inside the collapsible Files section, single-pane enforced through the store, first-run tooltip teaching the two-surface principle.
- **Overlay projection**: right-click a tree item or tab → "Open as overlay"; drag a tab → four-quadrant chooser that maps to page corners. (A drag can't cross from the panel into the page — separate documents — so the panel shows a miniature *of* the page instead. Umbrella decision #12's drag-onto-page gesture is corrected in the plan.)
- **App features that came with it**: Recents view (left rail, aggregates navigation history), clear-tabs ⊗ hold-for-per-pane menu, freezable (❆) overlay panels that follow across sites.
- **Two systemic fixes**: failed collaboration no longer steals the caret (`useEditor` deps reduced to `[editorMode]`); Hocuspocus `/readyz` no longer crashes the process (PR #116 — `throw null` is Hocuspocus's required stop-the-chain signal; the `try` now scopes to the DB probe alone).
- **Dev collaboration topology changed**: dev DB is local Docker Postgres while the hosted Hocuspocus reads Neon, so local dev now requires `pnpm dev:collab` from the same checkout. Documented in CLAUDE.md.

**July 18, 2026**: AI Infrastructure Upgrade v3 — core (app-side) build complete, S1–S6 (branch `worktree-ai-v3-core`, PR pending; plan: `work-tracking/AI-V3-CORE-PLAN.md`)

- **Agentic tool loop (S1)**: AI SDK v6 `needsApproval` HITL — approval cards, auto-resume via `addToolApprovalResponse`, idempotent server-side message persistence, approval/finish notifications (deep-link to conversation).
- **Acquisition Service (S2)**: `AcquiredContent` envelope + policy engine (SSRF guard, per-turn budgets), provider-native `search_web` across Anthropic/OpenAI/Google/xAI keyed off the EXECUTED provider, `read_page` server-fetch (Readability, 16k cap), garden hydration onto ExternalPayload page nodes.
- **Targeted conversations (S3)**: `Conversation.targetFolderId` ("chats serve their location") — location inference, target chip UI (inherited/mismatch states), settle-then-associate page filing. ⚠ needs migration file pre-merge (see PR checklist).
- **Playbook runtime (S4)**: `phase_checkpoint` tool — tri-verdict (Approve / Revise / Approve-with-tweaks via denial-channel framing), Run Ledger note per run, straight-faced model routing (MODEL_UNAVAILABLE 422, no silent substitution), continuation persistence (PATCH message parts).
- **Flagship passed (S5)**: jobhunt playbook end-to-end on Anthropic (Company Profile → Fit Analysis → resume .md + .docx in target folder) through approvals + checkpoints; summarize-on-write abstracts; token meter; server-safe markdown→TipTap (@tiptap/html twins). Connection editor reworked to instant model persistence + per-field ✓ commits (fieldset persistence grammar).
- **Workflow mastery (S6)**: 7 chat tools — runtime-rendered node catalog (8 triggers + 11 nodes + worked example, zero drift from builder metadata), list/get/propose/update/run + push-to-n8n. Engine fidelity: named engine > target's engine > **n8n default**; n8n-engine updates auto-re-push. Open workflow = chat's default subject. Workspace entity resolved as already-existing (`ContentWorkspace` + full API) — C3 documented for BROWSER-REACH.

**July 16, 2026 (evening)**: References display as CHILDREN of their owning note (branch `worktree-folder-studio`, post-#110 — PR pending)

- Tree model change: `role: "referenced"` nodes with a live `ownedByNoteId` now render under that note in the file tree (notes grow a chevron); references with no owning note stay adjacent to primary content in their folder. **Display-only re-homing** — storage `parentId` remains the folder, so move cascades, folder scans, auto-context BFS, and materialized paths are untouched; implemented as a display-parent redirect in the tree route (owner must be in the same fetch; soft-deleted owners fall back to folder placement).
- Drag rules: primary content still can NOT be dropped onto a leaf (deliberately not Notion). References CAN be dropped onto a note — the move route re-homes (`ownedByNoteId = note`, storage parent = note's folder); dropping a reference onto a folder or root detaches it from its note.
- Deletion safety unchanged: ref-counting stays on the ContentLink embed graph, independent of ownership/placement.

**July 16, 2026**: Extension Workflows — capture/supervise workflows from the browser, Phases 0–4 (branch `feature/workflows-extension`, **PR #111** → main; P0–P2 smoke-passed live from portal.telnyx.com)

- **Bearer seam** (`/api/integrations/browser-extension/workflows[...]`): chooser list with URL-glob `matchesPage` (shared `graph/url-match.ts` — one matcher for auto-router + chooser), targeted dispatch (`workflowId` → `dispatchCaptureToWorkflowContent`; both paths persist rendered `pageText` via shared `buildCaptureRunData`), compact runs feed (+`workflowNodeId`, engine family normalized from versioned refs), read-only run detail. Gate resolution stays session-authed in the embed by design.
- **Workflow embed viewer**: `workflow` content type renders `EmbedWorkflowClient` (Runs/Edit tabs; extracted `RunDetail` + plug-and-play `WorkflowBuilder`) instead of the fallback; `?run=` deep-links; verified live including the FULL GATE LOOP (dispatch → waiting → Approve in-page → resumed → finished).
- **Extension surfaces**: popup "Run Workflow ▾" chooser (Trellis/n8n engine chips, matches-page hint) + Recent Runs (needs-review pinned, tap → run detail); overlay live status pill (3s poll, engine chip, [View] deep-open); global toolbar badge with urgency precedence (failed !red 30m → waiting !amber → running ●blue → ✓green 10s) where the bookmark dot yields to urgent states; context-menu "Run workflow on this page/selection" via server URL-pattern auto-routing.
- **Retry with same input** on failed runs — re-dispatches the run's stored trigger data (capture note id and all), never re-captures; engine-agnostic (node id from definition slug). **n8n spoke merged mid-build (#107–#109)** — main merged in conflict-free, so n8n workflows dispatch from the browser with zero extension changes.
- Fixes en route: CSP nonce-hiding hydration warning (suppressHydrationWarning on inline scripts), embed toast alignment (`.embed-layout-page` sonner rule), versioned-engine DTO normalization.

**July 16, 2026 (later)**: Auto-context V1.1 — anchored ripple engine + privacy opt-out + manual refresh (commits `0cb910e`/`ca5f697`/+menu)

- **Anchored regeneration** (temperature-noise fix): all metadata-lane calls run at temperature 0 and carry the stored summary under an echo-verbatim contract — the model judges "did this change matter?" inside the call; verbatim echo = damping verdict. Packs group per PARENT folder only (siblings share calls, unrelated branches never mix) with folder orientation headers.
- **Settle gate**: 10-min drain-time debounce (marks reset the clock); **piggyback ripple**: the user's own PATCH traffic drains settled work via `after()` (throttled indexed pre-check) — presence-powered, no timers. **Anchored incremental patching** for folders, used only when single-delta is proven by hash substitution.
- **Privacy opt-out** (`AgenticMetadata.contextOptOut`): toolbar Eye/EyeOff toggle (the eye moved from publishing, whose pill now uses Globe/GlobeLock) + Context panel checkbox. Opted-out content is never generated (manual Generate 409s), never re-dirtied, excluded from roll-up inputs/hashes and folder-chat defaults+assembly; folders shield subtrees.
- **Manual refresh**: file-tree right-click → AI → "Update AI context" (`POST /api/studio/context/refresh`, bypasses settle+mode, keeps model gate + spend caps) — the recovery path for failed ripples.
- **Daily spend ceiling**: `StudioContextSpend` counter (per user, UTC day) + `studio.dailyCallCap` setting (default 200 calls, slider). Engine pre-checks before scanning, stops drains mid-way (leftover stays dirty for tomorrow), records once per drain; explicit refresh 409s honestly; manual Generate uncounted by design.

**July 16, 2026**: Folder Studio auto-context V1 — tree-wide AI context that maintains itself (branch `worktree-folder-studio`, commits `dce7634`/`ef791d8`/+sweep)

- **Dirty-bit cascade**: save/rename/create/move/delete flag the node + ancestor chain (one recursive CTE + indexed `updateMany`); marking is free and always on, spending is gated by the new `studio.autoContextMode` setting (Off / On-access default / On-access + nightly sweep).
- **Efficient refresh engine** (`extensions/studio/server/context-refresh.ts`): output-hash damping (folder staleness now hashes children's `summaryHash` — meaning-free edits stop cascading at the first unchanged output, killing the always-dirty-root problem), compositional roll-ups (folders read children's derived Context only), packed leaf batches (8 docs per `generateObject` call), deepest-first ordering, per-run caps (24 leaves / 12 folders / 200-node scan). Auto-refresh writes AI-owned sections only — role-strategy proposals stay exclusive to explicit Generate.
- **Triggers**: stale-while-revalidate via `after()` on Context tab GET + folder-chat grounding; opt-in nightly cron (`/api/cron/studio-context-sweep`, capped 10 users × 5 roots).
- **Studio settings surface** (`/settings/extensions/studio` + Extensions-rail tile): auto-context mode + artifact defaults (report variant, quiz length, audio brief/standard, slide count) consumed by the prompt composer and run executors; Feature Routing cards deep-link both ways (`FeatureSpec.settingsHref`).
- **Unconfigured banner**: once-per-session (sessionStorage), fires only when an auto-context attempt actually reports `unconfigured`, links to Feature Routing.
- DB: `AgenticMetadata.contextDirty` + `summaryHash` via targeted SQL (drift debt tracked in BACKLOG).

**July 16, 2026**: Folder Studio Phases 0–7 — folders as agentic hubs (branch `worktree-folder-studio`, PR pending)

- **Every shelf wired end-to-end** per `FOLDER-STUDIO-PLAN.md`: Studio + Context sidebar tabs (Tool Surfaces mount, extension-disable filtered), 13-tool registry-rendered grid, agentic metadata layer (`AgenticMetadata` sidecar; ownership-sectioned Context doc — AI summary/structure, proposed Role & Strategy diff, human directives; staleness hashes), grounded folder chat (BFS token-budget source selection, tri-state picker with size bars / NO TEXT / GEN locks, system-prompt injection in the chat route), chat-invocation tools (report/mind-map/glossary/compare/prerequisites/flashcards via composed prompts + existing `createNote`/propose_* conventions), job runs (`StudioGenerationRun` interim table — WorkflowRun declined for its definition FK; `after()` execution survives tab close; `studio.run` inbox kind), heavy artifacts (infographic HTML, single-voice audio overview via existing TTS pipeline, real `.pptx` decks via new `pptxgenjs` dep), and the four Practice sessions (quiz / teach-back / oral exam / FSRS-aware study plan).
- **Two feature-routing entries** (`studio-metadata`, `studio-generation`) give model pickers via the existing Feature Routing settings page — no bespoke settings section needed.
- **Anti-feedback-loop GEN lock**: unedited studio outputs are excluded from sources until their bodyHash diverges (edited ⇒ eligible).
- Deferred (BACKLOG "Folder Studio Followups"): Option A folder-view mount, image vision pass, custom report variants from ChatContext, diffusion infographic, per-conversation selection overrides, browser smoke (surfaces are auth-gated).

**July 13, 2026**: Workflows Builder + Interpreter — Plan 2 complete incl. canvas stretch (branch `feature/workflows-foundation`, PR pending)

- **User-authored automations replace hardened recipes** (post-soak pivot): canvas-ready `WorkflowGraph` Zod schema with client-safe validation/interpolation (`{{nodeId.path}}` templates), 10-node palette (`ai-complete`, `gate`, `branch`, `delay`, `fetch-url`, `http-request`, `get/store-content`, `export-docx`, `notify`) split metadata/executors per the AI-tools convention — `buildConfigSchema` derives Zod from field specs so builder forms and server enforcement can't drift.
- **The interpreter**: one generic WDK workflow executes graph snapshots (snapshot-at-dispatch = replay-safe + in-flight runs immune to edits); gates→superviseGate with ⚠ framing on unresolved templates, delay→sleep, branch→8-operator labeled-edge routing; per-node timeline events; step-section failure semantics; executor coverage asserted at boot.
- **Workflows are content**: + menu "Workflow (Automation)" creates ContentNode+WorkflowPayload (the old stub, activated) seeded with a starter graph; owner-scoped graph GET/PUT (structured issues) + dispatch-from-content (definition slug `content:{nodeId}`).
- **The builder** is the workflow content viewer: step-list editor (add/reorder/remove, generated config forms, inline validation, Save/Run) + **React Flow canvas** (`@xyflow/react`, MIT, attribution kept): drag-to-position persisted, node-click config panel; structural edits stay in list mode by design.
- **Extension capture now dispatches the user's own graph** (auto-creates one from the template on first capture). Hardened `jobApplicationWorkflow` deleted. Proven live end-to-end with real BYOK AI + storage: capture → builder-edited graph → "90% fit" gate → approve → dossier artifact → the browser-click-authored notify step fired ("Builder-added step fired" in the inbox). Per-session commits `3c706c9…`; gates green throughout.

**July 12, 2026**: Workflows Foundation — Plan 1 complete (branch `feature/workflows-foundation`, PR pending; soak pending)

- **Hub-and-spoke workflow subsystem**: app-owned run tables (`WorkflowDefinition`/`WorkflowRun`/`WorkflowRunEvent`/`WorkflowRunArtifact`) + idempotent writer module are the system of record; durable engines are swappable adapters behind a four-verb contract (`start`/effects/`resumeGate`/finish). Product UI reads ONLY app tables.
- **WDK engine live** (workflow@4.6.0, `withWorkflow` + Turbopack): `superviseGate` suspends at `createHook` with deterministic `gate:{runId}:{name}` tokens; dispatch → steps → waiting → resume → succeeded proven end-to-end, plus mid-gate cancel. proxy.ts bypasses `/.well-known/workflow/` (WDK queue transport).
- **Job-application journey**: extension context menu ("Research job posting") captures page text → Bearer-authed dispatch → capture stored as a note ContentNode (pass-IDs rule enforced by a `prepareInput` hook) → AI research/match through `resolveFeatureRoute` BYOK fallback chains (flagged stubs when keyless) → inbox gate notification (`workflow.gate`/`workflow.finished` kinds, actorType `extension`) → approve/decline from GateCard or inline inbox action → DOCX dossier (real `DOCXConverter`, replacing the export stub) into a "Job Applications" folder as a run artifact.
- **Workflows panel** (left-sidebar extension view): status-filtered run list, run detail with event timeline, gate cards, cancel, dispatch menu; polls only while a non-terminal detail is open. Verified by scripted real-browser Playwright run.
- **Error semantics hardened**: step sections try/catch → run marked failed + rethrow (gates never wrapped — suspension is control flow); found via a live stuck-at-running failure. Gates green ×6 sessions; per-session commits babeac9…S6. Soak items: approved run with real BYOK keys + working storage in the primary dev env.

**July 10, 2026**: User Connections + Unified Notifications/Inbox + DMs (branch `worktree-connections-inbox`, PR pending)

- First cross-user feature: mutual-consent connections (invite by exact email/username, **enumeration-safe** — suppressed invites keep `inviteeUserId` null and responses are byte-identical for real/nonexistent/blocked targets; declines render as "pending" to the sender until 14-day expiry), block list with connection/invite cascade, audit-logged, Postgres fixed-window rate limits.
- **ActivityEvent log + NotificationRecipient projection**: string kinds with Zod payload registry (`lib/domain/notifications/kinds.ts`), `actorType user|system|ai|extension`, per-recipient read/archive state, collapse-key coalescing (N rapid DMs → 1 unread row re-pointed at the newest event), publish-time per-kind preference filtering from the new `notifications` settings section.
- **DMs** (`DmThread`/`DmParticipant`/`DmMessage`): `lastReadAt` unread cursors, `lastActiveAt` viewing heartbeat suppresses bell notifications while the thread is open, `markThreadRead ↔ markSubjectRead` keeps badge and thread coherent; soft-delete messages, per-user thread hide.
- **UI**: bell + unread badge in NotesNavBar, glass popover (All/Unread, Today/Earlier, inline invite Accept/Decline, mark-all-read), full `/inbox` page (Notifications / Messages / Connections tabs, `?tab=&thread=` deep links), DM view with optimistic send + 2.5s fast-poll via a swappable `NotificationTransport` abstraction (45s badge poll + focus refresh; deliberately NOT Hocuspocus), `/settings/notifications` preferences.
- **AI**: `notify_user` tool (10/hr rate limit, polite refusal result, sparkles "Assistant" badge). Extension hook: `ExtensionRuntime.notificationKindRenderers`. Maintenance cron (invite expiry + retention). Migration artifact `20260710120000_add_connections_notifications_dms`. Gates green (typecheck/lint/build); 28-check curl smoke suite passed with two seeded users (`scripts/seed-smoke-users.ts`).

**June 11, 2026**: Canonical `bodyHash` save-conflict hotfix — PR #56 (open)

- Fixes a production false-positive: **every** content save tripped the "This note changed elsewhere" conflict banner. Root cause — the `If-Match` optimistic-concurrency hash used `JSON.stringify` (key-order sensitive), but a note body's key order isn't stable across a save round-trip (`sanitizeTipTapJsonWithExtensions` rebuilds the node tree; Postgres JSONB doesn't preserve key order), so the client's echoed hash never matched the server's recompute for identical content.
- Fix: hash a **canonical (deep key-sorted) serialization** so the check compares content, not byte order. Array order preserved. Client echoes the server's hash, so one server function fixes GET baseline + PATCH response + If-Match check together. No migration. Gates green (typecheck/lint/build).

**June 11, 2026**: Audio Subsystem epoch merged via PR #55

- Speech generation (OpenAI / ElevenLabs / Google) + flashcard audio + **TTS read-aloud**: content-type-aware Listen (note text vs file extracted text), BubbleMenu Read-selection, persistent mini-player, draggable **PDF text reader** (extracted text in own DOM → select → right-click → Speak), and a **bearer-auth `/tts` proxy** for the browser extension (provider key never leaves the server) with Web Speech fallback. Session LRU audio cache; speed via `playbackRate`.
- Workplaces chores in the same PR: progressive-disclosure borrow dialog + lazy borrowed-tab expiry badge.

**May 31, 2026**: AI Chat Revamp follow-up polish merged via PR #49 (commit `abaad12`)

**May 31, 2026**: AI Chat Revamp follow-up polish merged via PR #49 (commit `abaad12`)

- Branch `feature/ai-chat-revamp`, 30 commits, +1450/-648 across the loading skeleton, workspace store, right sidebar, AI chat engine, and Vercel build config.
- **Token-capture meters (Phase 2)** fixed: `useChat`'s `onFinish` was capturing a stale `messages` array because the SDK mutates `message.metadata` in place. Fix threads the SDK's `event.message` (fresh assistant with metadata) through `persistRef({ freshAssistant })` so `persistTurns` reads metadata directly instead of via the closure. Token + $ figures now persist on every new turn.
- **Image generation routing** for Vercel AI Gateway: route via `@ai-sdk/gateway` + `experimental_generateImage` instead of raw fetch; detect Gemini image variants (Nano Banana / Nano Banana Pro) and route them through `generateText` with `result.files` since they're language-as-image, not image-API. Capability inference patterns added for Gemini-`*-image*`, Recraft, Seedream, Grok Imagine. Client-safe split of capability helpers (`lib/domain/ai/features/capabilities.ts`) to avoid `next/headers` leaking into client components. `/ai-image` slash command for inline doc image generation.
- **Cold-load hydration races** fixed across three independent surfaces:
  - File-tree double-fetch (`5984435`): tree fetch gated on `useWorkspaceStore.hasLoadedOnce` so the first cold-load request runs once with workspace context, not twice.
  - Right-sidebar tab clobber (`d473777`): auto-correct + block-select effects in `RightSidebar.tsx` gated on `useRightSidebarStateStore.persist.hasHydrated()` to prevent pre-hydration writes from corrupting the persisted saved tab. `useRightSidebarStoreHydrated()` hook added.
  - Workspace active-tab race (`9567695`): `restoreContentWorkspace` honors URL `?content=` when that ID belongs to the workspace's items, so deep-linking to tab 3 loads tab 3 first instead of last. Membership gating preserves the manual workspace-switch path.
- **Loading skeleton flicker** fixed in two commits after a user slow-mo recording: theme-aware tokens replace hardcoded `border-white/10` / `text-gray-400` / `bg-white/5` and drop the fake "Welcome.md" tab title (`635bc9b`); right sidebar omitted from the skeleton entirely (`8293b3e`) since `useRightPanelCollapseStore` defaults to collapsed but the skeleton was painting a 300px sidebar that visibly slid out on hydration.
- **Settings UX**: back button in settings sidebar that returns to the last content route rather than stepping through internal settings history (sessionStorage tracker in `NotesLayoutMarker`).
- **Vercel build OOM** fixed: heap cap lowered from 6144→5120MB in `vercel-build` (`ffe7e31`). `NODE_OPTIONS` is inherited by every Next.js subprocess (page-data worker, static-page generator, trace collector); 6144 was tipping the 8 GB build container into SIGKILL during "Collecting build traces" on two consecutive preview deploys. 5120 still leaves 1 GB above the original 4 GB default and gives ~3 GB headroom for parallel subprocesses.
- Known followups (now logged in BACKLOG): sticky chat drafts don't fully survive tab switches; an additional brief flash between `loading.tsx` and hydrated content remains (likely main-panel SSR/hydration paint sequence — needs DevTools paint capture to characterize).

**May 30, 2026**: AI Chat Revamp epic merged via PR #48 (commit `1801568`)

- Per-conversation persistence (`Conversation` Prisma entity), shared `useConversationEngine` hook + `useConversationBinding`, per-provider theming via `lib/design/system/ai-providers.ts`, sidebar tabbed strip with multi-conversation switching, edit / regenerate flows, attachments + image generation, reasoning-block UX (ChatGPT / Claude / Gemini / generic routers), follow-up prompts, AI Connections + Feature Routing settings pages replacing legacy AIKeyManager, per-Connection usage meters with source provenance pill.
- Plan + session notes in [`work-tracking/AI-CHAT-REVAMP-PLAN.md`](work-tracking/AI-CHAT-REVAMP-PLAN.md) and [`AI-CHAT-REVAMP-SESSION-1-NOTES.md`](work-tracking/AI-CHAT-REVAMP-SESSION-1-NOTES.md).
- Followup polish wave covered in PR #49 entry above.

**May 18, 2026**: Epoch 18 (Multi-Tenancy Foundation) started — plan promoted from Claude scratchpad to canonical doc; foundation worktree provisioned

- Worktree: `/Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/feature+multi-tenancy` on branch `feature/multi-tenancy`, based on `132b3dc` (PR #38 publishing + observability merge).
- Detailed plan promoted to [`work-tracking/MULTI-TENANCY-PLAN.md`](work-tracking/MULTI-TENANCY-PLAN.md); epoch tracker at [`work-tracking/epochs/epoch-18-multi-tenancy.md`](work-tracking/epochs/epoch-18-multi-tenancy.md). Phase 0 (dev DB isolation via Neon branch `dev-david` on `neondb`, `pg_trgm` extension enabled, schema synced via `prisma db push`) ✅. Phase 1 (additive schema + tenancy helper module + backfill script) in progress.
- Note: the `current_epoch: 13` frontmatter and Active Epoch section below are unchanged pending your input on whether to make Epoch 18 the active focus or interleave with Epoch 13. Recommendation: promote Epoch 18 to active since the worktree is live and dev-DB-isolated.

**May 17, 2026**: Phase I.6 — user-intent gate for shrink guard (lets users clear documents intentionally)

Refinement of the Phase I.1 shrink guard. The original guard refused destructive shrinks unless `allowShrink: true` was set on the body — which blocked legitimate user actions like "select all + backspace + auto-save" unless every code path explicitly opted in. The user-intent gate uses **recent input recency** as the signal: the editor tracks `lastUserInputAt` and tags each auto-save with `userInitiated: true` when the gap is < 10 seconds. The server's shrink guard accepts either flag.

- **Phase I.6.1** (commit `315e12a`): Server-side bypass + `content:write:shrink_with_user_intent` event. The shrink-refusal at `/api/content/content/[id]` now accepts `body.userInitiated === true` OR `body.allowShrink === true`. When the shrink WOULD refuse but a flag IS set, an informational warn event records the decision with `prev_char_count`, `new_char_count`, `shrink_ratio`, which-flag-was-set, and `seconds_since_input` for calibration data.
- **Phase I.6.2** (commit `a251194`): MarkdownEditor input-recency tracking. `lastUserInputAtRef` updates on each `onUpdate` callback when the ProseMirror transaction has `docChanged === true` AND is not tagged with `y-sync$`, `remote`, or `addToHistory` (which mark remote/sync/history-merge origin). Auto-save fires include `userInitiated: true` when `now - lastUserInputAt < 10000ms`. `MainPanelContent.handleSave` accepts the meta and forwards it into the PATCH body alongside `tiptapJson`.
- **Phase I.6.3** (commit `6704d9f`): Audit + type passthrough. Verified the editor-driven save path is the only destructive content-write surface; other paths either go through the editor (and inherit recency tracking via TipTap docChanged) or use different routes that don't trigger the shrink guard. ExpandableEditor's `onSave` prop signature extended to accept the optional meta so future consumers can opt in.

Bug-class trace:
  - Editor mounts on existing content → y-sync seed transaction fires → `onUpdate` sees `y-sync$` meta → ref NOT updated → 2s later auto-save fires WITHOUT `userInitiated` → server REFUSES the shrink. ✓
  - User presses Cmd+A → Backspace → real keydown + docChanged transaction → ref updates → 2s later auto-save fires WITH `userInitiated: true` → server ALLOWS the shrink (and logs `content:write:shrink_with_user_intent` for audit). ✓
  - User edited 5 minutes ago then walked away → some background save fires → 5min > 10s window → `userInitiated: false` → server refuses. Client can retry with explicit `allowShrink: true` if appropriate. ✓

Gates at tip: `pnpm typecheck` ✓, `pnpm lint` 159/159 (0 errors), `pnpm build` ✓.

**May 17, 2026**: Phase I — anti-overwrite guards on content PATCH route + archival predev hook (response to live data-loss incident)
- Live data-loss incident on integration branch: opening a daily note in local dev (dev=prod DB) caused the editor to auto-save an empty/template doc over real content. Content recovered via a still-open mobile prod tab's y-indexeddb cache. Root cause is broader than any one trigger — the PATCH route trusted any tiptapJson body unconditionally.
- **Phase I.1** (commit `3d6a7d2`): Shrink-refusal guard on `app/api/content/content/[id]/route.ts` PATCH handler. Refuses with HTTP 422 OVERWRITE_REFUSED when existing.searchText > 200 chars AND new.searchText < 0.5 × existing AND no `allowShrink: true` on body. Emits `content:write:overwrite_refused` structured event. Span attrs `refused`, `refused_via`, `prev_char_count`, `new_char_count` record the decision.
- **Phase I.2** (commit `773bead`): Optional `If-Match: <bodyHash>` precondition. On-the-fly SHA-256 hash of tiptapJson (no schema change). Mismatch → HTTP 409 PRECONDITION_FAILED with `currentBodyHash` in meta. `bodyHash` now exposed in GET and PATCH `note` responses so clients can capture and echo it. Backwards-compatible — clients that don't send the header are unaffected.
- **Phase I.3** (commit `f89276b`): `content:write:overwrite_risk_detected` informational event for shrinks in the 50–70% range (below refuse threshold but still substantial). Allows the write but leaves a forensic breadcrumb so borderline incidents are visible in trace history.
- **Phase I.4** (commit `f2caa3f`): Replaces destructive `rm -rf .local/debug-payloads` predev hook with archival via `scripts/archive-traces.ts`. Prior-session traces move to `.local/debug-payloads/.archive/<ISO timestamp>/` with LRU sweep keeping the most recent 5 session archives. The original wipe-on-start destroyed forensic evidence from this very incident — archival is the durable fix.
- Out of scope (follow-up): client-side adoption of `If-Match` in MarkdownEditor + finding the specific trigger (daily-notes tab click suspect) that fired the destructive PATCH. Server guards are sufficient to *prevent* the data loss regardless of trigger.
- Gates at tip: `pnpm typecheck` ✓, `pnpm lint` 159/159 (0 errors), `pnpm collab:schema:check` ✓.

**May 17, 2026**: Epochs 15 + 17 integrated on branch `feature/observability-and-publishing` (ready for PR)
- Phase B–H of `epochs/epoch-15-17-integration.md` complete. 31 commits ahead of `origin/main` / 0 behind; clean fast-forward.
- Merge commit `71e37a0` absorbed `feature/publishing-system` (40 publishing commits — items/paths CRUD, revision lifecycle, scheduled-publish cron, 23 W2-W10 blocks, public renderer, jsdom-backed SSR, theme variables, polish wave). 8 files had conflicts; resolution log in the integration plan.
- Prisma client regenerated against the merged schema (13 publishing models + workspace + collab + people).
- Phase F aggressive harmonization (commit `d5678a5`): 13 publishing API routes + media upload + Vercel cron + `components/public/TipTapContent.tsx` SSR renderer + `PublishingViewMode.tsx` client component all brought up to observability standards. Each handler wrapped with `withRouteTrace`, named domain spans opened (e.g. `publishing:publish`, `publishing:sync`, `publishing:scheduled_publish_batch` with per-item child spans), `spanPayload` calls for revision bodies + diff summaries + validation reports + batch summaries. Cron handler uses `attrs.cron_run_id` (= `trace_id`) for correlation with Vercel cron history.
- Side cleanup surfaced by strict lint: 5 `@next/next/no-html-link-for-pages` `<a>` → `<Link>` migrations across `app/page.tsx`, `app/(authenticated)/settings/api/page.tsx`, `components/settings/storage/UsageTab.tsx`.
- All gates green at tip: `pnpm typecheck` ✓, `pnpm lint` 159/159 (0 errors, at ratchet), `pnpm collab:schema:check` ✓, `pnpm build` ✓ 132 pages, `pnpm trace:view --list` ✓ (Phase 6 viewer survives merge).
- Branch is pre-flight for `git push -u origin feature/observability-and-publishing` + `gh pr create`.

**May 17, 2026**: Epoch numbering reconciled + integration plan authored
- Registered Epochs 14, 15, 16, 17 explicitly in `docs/notes-feature/work-tracking/epochs/`
- Epoch 14 (Saved Content Workspaces): doc frontmatter corrected from `status: active` (stale) → `status: shipped`. The work shipped via April merge series (`a9c5570 → ... → e7c0beb`); `ContentWorkspace` models + `extensions/workplaces/` + `/api/content/workspaces/*` all on main.
- Epoch 16 (Dark Mode): `feature-dark-mode.md` → `epoch-16-dark-mode.md` (git mv, history preserved); frontmatter updated with `status: shipped`, shipped_at `2026-05-13`, shipped_via PR #37.
- Epoch 15 (Publishing): new wrapper at `epochs/epoch-15-publishing.md`. Branch `feature/publishing-system` is 40 ahead / 22 behind `origin/main`; integration plan authored.
- Epoch 17 (Observability): new wrapper at `epochs/epoch-17-observability.md` pointing at the detailed `OBSERVABILITY-CLEANUP-PLAN.md`.
- Integration plan: `epochs/epoch-15-17-integration.md` — Phases A–H for merging publishing into observability and harmonizing publishing's 12 API routes + 1 media route + cron handler to the observability standards. Integration branch will be `feature/observability-and-publishing`. Phase F is **aggressive**: spans + `spanPayload` for every route.

**May 17, 2026**: Epoch 17 — Observability Cleanup — COMPLETE in branch (worktree `observability-cleanup`, 28 commits ahead of `origin/main`)
- Phases 0–5 produced a complete three-layer observability system: structured logs (closed-set `Layer` + `Marker` enums, scalar-only `Attrs`), span traces with end-of-trace summary blocks, and per-trace payload sidecars under `.local/debug-payloads/`
- Server-side console retirement: ~80+ API routes wrapped with `withRouteTrace`, Prisma `emit: 'event'` bridge silences raw `prisma:query` stdout, every `console.*` outside the logger module is now an ESLint error
- Client-side console retirement: ~60 files, ~300 call sites across `components/`, `state/`, `hooks/`. Triage pattern: delete debug breadcrumbs covered by the trace, escalate state corrections to `clientLogger.warn`, real failures to `clientLogger.error` with scalar attrs
- Phase 5 foundation: `lib/core/logger/client.ts` (client-safe, no `node:async_hooks`), `app/api/logs/client/route.ts` beacon endpoint (auth-gated, 100/min rate limit, error/fatal only), `lib/core/logger/client-fetch.ts` `tracedFetch` wrapper, `Layer` split into `ServerLayer | FrontendLayer` closed unions
- Phase 6 trace viewer: `lib/core/logger/event-recorder.ts` writes every LogEvent to `<trace>.events.jsonl`, `scripts/render-trace.ts` builds a span tree and emits self-contained HTML (`pnpm trace:view [id]`, `pnpm trace:list`)
- ESLint deferral list shrunk: `no-console=error` now enforced in `components/`, `state/`, `hooks/`. Still deferred (with file globs as tracker): `app/**/page.tsx`, TipTap extensions, design integrations, `extensions/**`, lib utilities transitively reachable from `"use client"`
- PII firewall by type: `Attrs = Readonly<Record<string, string | number | boolean>>` makes non-scalar attrs a compile error; bulk data flows through `spanPayload()` → sidecar JSONL instead
- Gates locked at ratchet `--max-warnings 159`. `pnpm typecheck` / `pnpm lint` / `pnpm build` all green on the branch tip
- Plan docs in `docs/notes-feature/work-tracking/`: `OBSERVABILITY-CLEANUP-PLAN.md`, `FRONTEND-LOG-CHARTER.md`, `PII-AUDIT-2026-05.md`

**May 13, 2026**: Dark Mode epoch — COMPLETE
- Foundation: theme provider, `useResolvedTheme()` hook, FOUC-prevention inline script reading `notes:settings` from localStorage, `suppressHydrationWarning` on `<html>` to handle pre-hydration class application
- Settings UI: light/dark/system radio in `/settings/preferences` with live "currently dark/light" indicator
- Editor surface retrofit: `MainPanelWorkspace`, `MainPanelContent`, `MainPanelHeader`, `MainPanelNavigation`, file tree, content toolbar, root node header
- ProseMirror prose CSS: body text, placeholder, headings (muted gold light → neon gold dark), blockquote, all 5 callout types, wiki-links, block system, tables (brand-aligned shale/gold instead of grayscale)
- Block dark mode: section header, card panel, divider, accordion, tabs (gold-primary active tab), list container, periodic summary, unsupported content, habit tracker, stopwatch, calendar block (slate parchment notebook aesthetic)
- Liquid Glass surfaces refactored to CSS variables — `getSurfaceStyles()` now returns `var(--surface-glass-N-bg)` etc., auto-swapping via cascade across all 42 callsites without per-callsite changes
- Defined the previously-undefined `--text-primary`/`--text-secondary`/`--text-tertiary`/`--border-secondary`/`--surface-input` semantic vars in both `:root` and `.dark` — force-multiplier fix covering ~20 block CSS callsites
- Third-party viewer theme propagation: Mermaid, Excalidraw, DiagramsNet (override-beats-global preserved), OnlyOffice all wired to `useResolvedTheme()`
- Long-tail retrofit: dialogs (page template, category move, people profile/create/workspace/mount-picker), sidebar headers, settings pages (preferences, calendar, templates, api, mcp, storage, export), admin pages (users, content, audit-logs, collab-doc), AI surfaces (chat panel, messages, input, snippet/suggestion menus, model picker), flashcards (panel, review overlay, quick add form, settings dialog), common surfaces (confirm dialog, navigation history, left sidebar collapsed, file node, backlinks panel)
- Flashcard polish: flip animation now has easeOutBack rotateY curve with mid-flip scale dip and shadow color shift; edit affordance minimized to a transparent icon-only button revealed via group-hover
- Auth pages: home, sign-in, sign-up retrofitted for both themes
- Playwright e2e harness scaffolded: operational dark-mode coverage (4 signed-out routes, 8 baseline snapshots) + 10 non-operational stubs across 6 regression categories (auth, editor, file-tree, content, search, extensions). `pnpm test:e2e`, `:e2e:update`, `:e2e:report` scripts wired. `tests/e2e/README.md` documents conventions.
- Sprint A.0 dev toggle and Sprint C.6 cleanup: removed `components/dev/DevThemeToggle.tsx` after production toggle confirmed working
- Slash command bug discovered + fixed during dark mode visual QA: missing client registration of `ExcalidrawBlock` and `MermaidBlock` in `extensions-client.ts`, plus restructured to create-then-insert pattern to avoid collab sync race
- Branch: `feature/dark-mode`. `pnpm build`, `pnpm collab:schema:check`, `pnpm typecheck` all pass

**May 4, 2026**: Browser overlay, associated content, and web notes foundation
- Added canonical-first webpage identity with new `WebResource`, `WebResourceContentLink`, and `WebResourceViewState` models plus `ExternalPayload.webResourceId`
- Added a new `/api/integrations/browser-extension/*` API surface for resource context, webpage associations, content-picker tree, note/external overlay editing, and per-install overlay view-state persistence
- Broadened the right-sidebar `Backlinks` affordance into a generalized `Links` panel for notes and external links while preserving the existing sidebar slot and tab compatibility
- Added app-hosted overlay editing routes under `/extension-overlay/note/[id]` and `/extension-overlay/external/[id]` for trusted extension sessions
- Added an in-page extension overlay shell that can resolve webpage context, open associated notes/external links, quick-add current pages into trusted bookmark-sync connections, and reopen saved overlay state on revisit
- `npx prisma generate`, `pnpm typecheck`, and `pnpm build` passed; additive SQL for the new web-resource tables and `ExternalPayload.webResourceId` was applied safely without table drops

**Apr 30, 2026**: Browser bookmarks sync foundation
- Added a new browser-bookmarks integration surface with bearer-token auth, connection management, bootstrap, push/pull sync, and reading-queue API routes
- Expanded external references with normalized/canonical URL metadata, reading status, favicon/domain metadata, capture metadata, dedupe metadata, and preserve-HTML support
- Added persistent bookmark sync models for extension tokens, browser/app root connections, and per-node sync mappings
- Added an in-repo `extensions/browser-bookmarks/` package with a Digital Garden settings page plus a Chromium MV3 extension scaffold for popup, options, capture, bookmark observers, session capture, and rules import/export
- Build gate and typecheck passed; browser-level Chrome/Vivaldi smoke testing remains manual

**Apr 29, 2026**: Stopwatch block prototype
- Added a new document-local `stopwatch` TipTap block with persisted wall-clock timing, lap capture, and multiple visual style variants
- Implemented count-up stopwatch state from saved `startedAt + accumulatedMs`, allowing timers to continue accurately across reloads until explicitly stopped
- Added a dedicated Stopwatch properties panel for title, style variant, accent color, lap visibility, and display toggles
- Wired the block into editor schema/versioning, slash commands, HTML export, Markdown export, and plain-text export
- Build gate passed on branch `codex/habit-tracker-block-prototype`

**Apr 28, 2026**: Habit tracker block prototype
- Added a new document-local `habitTracker` TipTap block with three presets: monthly grid, weekly grid, and streak cards
- Introduced inline boolean and count-based check-ins with computed completion rate, hit-day totals, and current streak rollups
- Added a dedicated Habit Tracker properties panel for tracker settings, habit list management, and mode/target customization
- Wired the block into editor schema/versioning, slash commands, HTML export, Markdown export, and plain-text export
- Build gate passed on branch `codex/habit-tracker-block-prototype`

**Apr 26, 2026**: Unsupported TipTap block safety net
- Added schema-aware TipTap normalization that rewrites unknown/deprecated nodes before editor load, collaboration bootstrap, or server rendering
- Introduced `unsupportedBlock` and `unsupportedInline` safety nodes so deprecated content stays visible and preserved instead of crashing schema bootstrap
- Collaboration bootstrap now seeds through the sanitized schema path, preventing old block definitions from forcing blank documents or false hard-block states
- Note create/update APIs normalize incoming TipTap JSON before persistence so deprecated blocks are gated consistently after save
- Template and snippet insertion now sanitize structured TipTap inserts before applying them to live editors

**Apr 26, 2026**: Collaboration bootstrap fallback hardening
- Narrowed `bootstrap-failed` to true structural/bootstrap invalidity instead of transient collaboration service unavailability
- Added staged collaboration boot messaging: normal boot, "taking longer than expected", and warned local fallback after prolonged canonical-state delays
- Enabled warned local editing from saved note TipTap JSON when canonical collaboration bootstrap is unavailable but durable local persistence is ready
- Kept editing blocked when canonical state is structurally inconsistent, saved note content cannot be transformed safely, or local persistence cannot initialize
- Markdown editor now surfaces runtime-provided collaboration boot warnings instead of a fixed loading banner

**Apr 7, 2026**: Epoch 13 planning initialized
- Created isolated worktree from `origin/main` after PR #22 merge commit `2acc6d9b9fc8bad4a8e7e634f865c19607b0e0ce`
- Documented the People + Collaboration epoch starting at Sprint 58
- Locked the architecture decision to render People groups/subgroups folder-like without adding `ContentType.group`
- Captured collaboration route/access decisions: owners and signed-in grantees use `/content`; public `/share` is view-only for non-users in v1

**Mar 25, 2026**: Sprint 53 Quad Split — COMPLETE
- Added four layout modes: single, dual vertical, dual horizontal, and quad split from the same workspace model
- Shared workspace toolbar now controls the focused pane instead of rendering per pane
- Right-click `Open In Pane` expands the workspace when the requested pane is not currently visible
- Multi-pane debug surfaces are suppressed when pane count is greater than one
- Split orientation remount fix prevents vertical/horizontal mode confusion after repeated toggles
- Pane switching no longer refetches content just because focus changed
- Tab placement now follows persistent horizontal/vertical user preference instead of transient visible-pane merges
- Active tab styling refined with flush underline and conservative lift
- Build gate passed
- Manual smoke passed on port `3001`

**Mar 24, 2026**: Sprint 51 Sidebar Isolation + Workspace Preservation — COMPLETE
- Persisted right-sidebar runtime per content via `state/right-sidebar-state-store.ts`
- Sidebar panels now receive explicit `contentId` scope instead of relying on the global selection singleton
- Outline store now clears invalid active heading/chat-outline selections when content-specific outlines refresh
- Editor instance store now clears stale AI edit runtime when an editor unmounts
- Navigation history remains pane-scoped and filters invalid cleared-content entries
- Workspace restoration now keeps the active tab restorable in URL/localStorage when leaving content and returning
- Repaired Epoch 12 Sprint 50/51 worktree git indirection under `Digital-Garden. nosync/.worktrees/`
- Targeted eslint on changed files passed
- Build gate passed

**Mar 13, 2026**: Sprint 42 AI Image Generation — COMPLETE
- 8-provider image generation system: OpenAI (DALL·E 3, GPT Image 1), Google (Imagen 3), DeepAI, fal.ai (FLUX.1 Dev/Schnell), Together AI (FLUX/SDXL), Fireworks AI, RunwayML (Gen-3), Artbreeder
- `generate_image` chat tool: LLM generates images from text prompts, auto-uploads to storage, creates referenced FilePayload
- GeneratedImageCard in ChatMessage: rendered image with AI badge, provider info, prompt display
- "Insert into document" button: dispatches `insert-ai-image` CustomEvent, MarkdownEditor inserts at cursor
- Drag-and-drop: draggable images from chat to TipTap editor via `application/x-dg-ai-image` data transfer
- Image generation API route: `/api/ai/image` — standalone endpoint for direct generation
- Provider catalog with model metadata (sizes, quality/style support)
- Works in both ChatPanel (side chat) and ChatViewer (content node chat)
- 10 files changed, 5 new files
- Build gate passed

**Mar 12, 2026**: Sprint 41 Chat Content Outlines — COMPLETE
- Chat outline extractor: parses UIMessage[] into navigable entries (user prompts, assistant summaries, tool calls)
- Granularity toggle: "compact" (messages only) vs "expanded" (headers, lists, images from assistant markdown)
- ChatOutlinePanel component with role-based SVG icons (user, assistant, tool) and dot-and-indent sub-items
- Outline tab now available for `chat` content type (tool registry expanded)
- Real-time outline sync: ChatViewer feeds messages into outline store as they stream
- Click-to-scroll: outline entries dispatch `scroll-to-chat-message` CustomEvent, ChatViewer scrolls with gold flash animation
- Outline store extended with chat-specific slice (separate from note outline)
- 6 files changed, 2 new files
- Build gate passed

**Mar 12, 2026**: Sprint 40 AI Edit Highlighting + AI Image Insert — COMPLETE
- `aiHighlight` ProseMirror Mark extension: `inclusive: false`, `source` attribute, `<span class="ai-highlight" data-source="ai">`
- Registered in both client and server extension sets
- AI highlight CSS: indigo tint + bottom border, hover state, `.ai-highlight-hidden` toggle class
- Orchestrator auto-marks all AI-inserted content (both `typeText` and `insertStructuredContent`)
- `replace_document` marks entire document as AI content
- `insert_image` tool (9th editor tool): inserts image from URL with `source: "ai-generated"`
- AI badge on ImageBubbleMenu for AI-generated images
- "Show AI Content Highlights" toggle in AI settings (validation schema + settings page)
- CSS class toggle approach: hides highlights without removing marks from document
- Fixed selection highlight regression: deferred `setEditable(false)` to Phase 3 so native selection renders in Phase 2
- 8 files changed, 1 new extension file
- Build gate passed

**Mar 11, 2026**: Sprint 39 AI Text-Editing Tools — Client-Side Architecture — COMPLETE
- 8 agentic tools: read_first_chunk, read_next_chunk, read_previous_chunk, apply_diff, replace_document, plan, ask_user, finish_with_summary
- Client-side editing architecture: tools return structured payloads, frontend applies to live TipTap editor
- Editor instance Zustand store: shares TipTap editor between editor component and chat panel
- ProseMirror text search utility: finds exact text positions in document for AI edits
- AI edit orchestrator: 4-phase animation (cursor arrival → selection → content insertion → settle)
- Editor lock with 30s timeout failsafe, queued execution, abort on navigation
- Dual insertion strategy: char-by-char typing for inline text, parsed node-by-node for structured content
- Fixed `markdownToTiptap` — added `marked` for proper markdown → HTML → TipTap JSON pipeline
- Dev-only debug toggle in chat tool call bubbles (raw response viewer)
- "AI is editing..." indicator in chat panel
- AI editor behaviors living document: docs/notes-feature/features/ai-editor-behaviors.md
- 10 files changed, 4 new files
- Build gate passed

**Mar 11, 2026**: Sprint 38 Providers + BYOK Persistence + Rich Bot Responses — COMPLETE
- 4 new AI providers: Google Gemini, xAI Grok, Mistral, Groq (6 total)
- BYOK key persistence: encrypted DB storage, CRUD API, verify endpoint
- AIKeyManager settings UI: per-provider key input, masked display, verify button
- ChatMessage rich markdown rendering: react-markdown + remark-gfm + lowlight syntax highlighting
- Code blocks with copy button, tables, lists, blockquotes, inline formatting
- Build gate passed

**Mar 8, 2026**: Sprint 37 Images in TipTap + Referenced Content Lifecycle — COMPLETE
- Image extension with contentId, source, uploading, width attributes
- Upload via slash command (/image), paste (files + image URLs), drag-and-drop from Finder
- Referenced content lifecycle: ContentLink sync on save, orphan soft-delete, cascade move
- Image bubble menu with size presets (S/M/L), alt text, delete
- Vanilla DOM NodeView with drag-to-resize handle
- Deferred: figure/caption, markdown export, lazy loading

**Mar 6, 2026**: Sprint 36 Table Rebuild + Link Fix + Cleanup + Focus Guardrails — COMPLETE
- Console cleanup: removed console.log/console.warn from editor code (kept console.error)
- Focus guardrails: removed `.focus()` from TableBubbleMenu chains, added `preventFocusLoss`
- Focus guardrails: removed `setTimeout` focus hack from slash command table insertion
- Link: documented `inclusive: false` default (cursor adjacent to links doesn't inherit formatting)
- HeadingHardbreakSplit extension: `## ` in paragraph with hardBreak only converts text before break
- BlockquoteLineOnly extension: `> ` in paragraph with hardBreak only quotes text before break
- Table rebuild: removed old CSS, added minimal TipTap-docs-based styles, enabled `resizable: true`
- Registered new extensions in both client and server extension sets
- Build gate passed
- 8 files changed, 2 new extension files

**Mar 6, 2026**: Sprint 35 TipTap Rules Doc + Input Rule Bug Fixes — COMPLETE
- TIPTAP-EDITOR-RULES.md created (living document — expand as features are added)
- Tag autocomplete 2-second delay before popup appears (heading shortcuts get priority)
- `##` in query immediately dismisses tag autocomplete via `allow()` guard
- Space during delay propagates to ProseMirror for heading conversion (`# ` → H1)
- Slash command restricted to first character of empty lines only
- HeadingBackspace extension: empty H1→`#`, H2→`##`, H3→`###` in paragraph
- Removed macOS Finder duplicate `index.d 2.ts` from Prisma generated output
- Build gate passed
- 4 files changed, 1 new extension file

**Mar 1, 2026**: Sprint 34 Chat UI, AI Tools, @ Mentions — COMPLETE
- ChatPanel (right sidebar): transient streaming chat with "Save conversation" to file tree
- ChatViewer (main panel): full-page persistent chat with auto-save to ChatPayload
- ChatPayload CRUD in content API (GET/PATCH/POST)
- AI tools registry (searchNotes, getCurrentNote, createNote) with Prisma execution layer
- ModelPicker component for per-session provider/model override
- Tool settings UI (tool choice, enable/disable individual tools)
- @ file mentions: inline search → system prompt injection → clickable mention pills
- / tool commands: browse AI tools with prompt hints
- ChatSuggestionMenu: shared keyboard-navigable dropdown for both chat surfaces
- Sidebar tab auto-switch when content type changes
- MessageCircle icon for chat nodes in file tree
- Chat export as Markdown from toolbar
- Editor state persistence fix (collapse/reopen no longer loses edits)
- Root page redirect (session-based, replaces legacy AppNav)
- Global error boundary
- 29 files changed, +2,237 lines
- Build gate passed

**Feb 27, 2026**: Sprint 33 AI Foundation + Settings UI — COMPLETE
- AI SDK v6 installed and Zod v4 compatibility confirmed
- Provider registry with dynamic imports (Anthropic + OpenAI)
- Streaming chat API route with auth + middleware
- `/settings/ai` page: provider selection, generation params, feature toggles, usage tracking
- Build gate passed

**Feb 27, 2026**: Sprint 32 Editor Stability & Polish Complete
- BubbleMenu persistence fix (root cause: shared meta key cross-contamination)
- Outline click-to-scroll via CustomEvent bridge
- ExpandableEditor tag/wiki-link callback threading
- Tag/heading `# ` conflict fix
- Build gate passed

**Feb 26, 2026**: Sprint 31 Lossless Export/Import Round-Trip Complete
- Custom two-pass markdown parser → TipTap JSON
- Sidecar reader, Import API, toolbar button
- Pending manual testing (macOS Finder issue)

**Feb 25, 2026**: Sprint 30 Universal Expandable Editor Complete
**Feb 24, 2026**: Sprint 29 Tool Surfaces Architecture Complete

## Up Next

### Epoch 12: Sprint 54 - Tab Drag + Adaptive Pane Reshaping
Direct tab dragging between panes, single-pane split targets, and adaptive layout collapse are in progress. Next checkpoint is manual smoke on port `3001`.

**See**: [Epoch Plans](work-tracking/epochs/) for detailed sprint breakdowns

## Known Issues & Blockers

### Active Blockers
- **macOS Finder**: File picker not opening on dev machine — blocks manual testing of import feature
- **macOS mmap**: `mmap failed: Operation timed out` on `git push` from main working directory — workaround: git bundle → fresh clone → push from /tmp

### Known Editor Bugs
- *(All Sprint 36 targets resolved — see Recent Completions)*

### Known Limitations
- **Sprint 31 Import**: Untested pending Finder fix
- **PDF/DOCX Export**: Stub implementations
- **AI Chat**: Requires user-provided API keys (BYOK configured in /settings/ai)
- **Outline Panel**: Auto-scroll on editor scroll needs intersection observer
- **Chat mentions**: Only injects note `searchText` (max 2000 chars), not full TipTap JSON

### Technical Debt
- [ ] Server-side TipTap extensions missing WikiLink and Tag parsers
- [ ] Metadata sidecar import consumer not yet implemented
- [ ] Chat export only handles plain text messages (no tool call/result rendering)

## Metrics

### Velocity (Last 6 Sprints)
- Sprint 29: ~20 points (Tool Surfaces)
- Sprint 30: ~15 points (Universal Editor)
- Sprint 31: ~20 points (Import System)
- Sprint 32: ~15 points (Editor Stability & Polish)
- Sprint 33: ~18 points (AI Foundation + Settings)
- Sprint 34: ~25 points (Chat UI + Tools + Mentions)
- **Average**: ~19 points/sprint

### Epoch Progress
- **Epoch 7** (AI Integration): ✅ Sprints 33-34 complete; Sprints 35-36 redirected to Epoch 8
- **Epoch 8** (Editor Stabilization): ✅ Complete — Sprints 35-36 complete
- **Epoch 9** (Editor Enhancements): Sprint 37 complete; remaining sprints deferred to Epoch 11
- **Epoch 10** (AI TipTap): ✅ Complete — Sprints 38-42 complete

## Roadmap

### Epoch 10: AI TipTap (✅ Complete — Sprints 38-42)
**Theme**: AI providers, BYOK, agent editing tools, edit highlighting, chat outlines, image generation
**Status**: 5/5 sprints complete ✅

### Epoch 11: Editor Enhancements (Planned — Remaining Epoch 9)
**Theme**: URL/OG embeds, YouTube, drag/reorder, templates, snapshots, context menu

### Future (Unplanned)
- **Collaboration & Sharing** — real-time editing, sharing, security review
- **UI Revisions** — theming, custom styles
- **Main Panel Multiple Tabs** — multi-document editing
- **YouTube Playlists & Summarizing** — video content management

## Quick Links

- [Current Sprint](work-tracking/CURRENT-SPRINT.md) - Sprint 54 details
- [Backlog](work-tracking/BACKLOG.md) - Prioritized work items
- [Epoch Plans](work-tracking/epochs/) - Epoch 8, 9, 10, future stubs
- [TipTap Editor Rules](guides/editor/TIPTAP-EDITOR-RULES.md) - Editor behavior rules
- [AI Development Guide](../CLAUDE.md) - For AI assistants
- [Start Here](00-START-HERE.md) - Documentation index

---

**Last Updated**: Mar 12, 2026
**Next Review**: Sprint 42 kickoff (AI Image Generation)
