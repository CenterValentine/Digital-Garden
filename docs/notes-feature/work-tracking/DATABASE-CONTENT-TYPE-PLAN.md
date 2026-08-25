---
title: Database content type — row-as-JSONB tables with lazy row promotion
status: draft (pre-build; master consistency review applied 2026-08-17 — one fork open, O17)
last_updated: 2026-08-17
owner: centervalentine
branch: planned — `feat/data-content-type` off origin/main (own branch; do not stack on integration/workspace-tab-filters)
verified_against: origin/main @ 37b788cc (re-anchored 2026-08-17 after ~20 commits landed —
  Note Window block + canonical ContentTreePicker + pane tab "+" (b42ad4ca), workspace layout
  intent/projection P1–P3, tab-membership schema (f93fa1b6). TIPTAP_SCHEMA_VERSION is now 1.15.0.
  Re-verified: WorkspaceTabState still lacks a viewId dimension (B8 holds); DataPayload stub
  unchanged; the + menu stub unchanged. One claim invalidated — see B7.)
related:
  - prisma/schema.prisma (DataPayload stub → meta-schema; ContentType.data)
  - components/content/menu-items/new-content-menu.tsx (the `+` menu stub being unstubbed)
  - components/content/LeftSidebar.tsx (commented-out handleCreateData)
  - components/content/content/LeftSidebarContent.tsx (createTrigger consumer)
  - components/content/content/MainPanelContent.tsx (data payload read path — already live)
  - lib/domain/ai-context/source-resolver.ts (the `data` ingestion seam)
  - lib/domain/ai-context/context-refresh.ts (uncovered-node discovery)
  - lib/domain/ai/tools/metadata.ts (tool classification — ai:drift:check)
  - app/api/content/search/route.ts (search OR-branch surface)
  - docs/notes-feature/work-tracking/FOLDER-CONTEXT-CAPSULE-PLAN.md (capsule pattern this mirrors)
---

# Database Content Type Plan

Replace the `data` / `DataPayload` stub with a real user-defined database: **row-as-JSONB**
storage under a **relational meta-schema**, with rows lazily promoted to `ContentNode`s only
when they earn a page. Rejects the Notion model of every-row-is-always-a-page, because a
`ContentNode` here is expensive (tags, links, publishing, trash, history, paths, collab docs,
grants) in a way a Notion block is not.

The differentiator is not the grid — it's `mode: "query"`: a table whose rows *are*
`ContentNode`s selected by a saved query. That makes this interoperate with the existing
knowledge graph instead of sitting beside it as a walled garden.

---

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Cells in `DataRow.data` JSONB; meta-schema (columns, views, links) in real Prisma models | User tables are small (design for 10k rows); `(tableId, sortKey)` + GIN covers the query surface. Physical DDL per user table is rejected — it breaks the `migration-drift` gate and forces `$queryRaw` everywhere. |
| D2 | Lazy promotion: `DataRow.contentId String?`, null until earned | Pay `ContentNode` cost only for rows that need identity. |
| D3 | `DataColumn.key` is an opaque nanoid; select options store option **ids** | Rename is metadata-only, touches zero rows. |
| D4 | Relations live **only** in `DataRowLink`, never mirrored into `data` | One source of truth; both directions indexed; no dual-write drift. |
| D5 | Per-cell last-write-wins, server-authoritative. No Y.js for cells | Grids don't need character-level merge. CRDT stays for promoted-row bodies only. |
| D6 | Formula / rollup columns store nothing; computed on read | Materialization needs a dependency graph + cycle detection — out of scope. |
| D7 | Fractional string `sortKey`, not `Int displayOrder` | A drag in a 5k-row grid rewrites one row. Deliberate divergence from the `ContentNode` tree convention — documented so it doesn't read as an accident. |
| D8 | Core content type, not an extension | `data` is already in `ContentType` with a payload relation. The CLAUDE.md extension gating ladder does not apply. |
| D9 | User-authored `description` on both `DataColumn` and `DataPayload`, capped at 280 chars, hidden by default | Highest value-per-byte in the plan: `Status` tells a model nothing; *"pipeline stage; set 'blocked' only when waiting on someone else"* makes `query_database` usable. Also supplies the capsule's `purpose` without an LLM call. |
| D10 | Database blocks: **register the TipTap node this pass, defer the rich UI** | A node added later is an unknown type to every collab doc created in between, which serializes to `unsupportedBlock` and corrupts documents. Registration is forward-compatibility insurance; the block UI is not. |
| D11 | **Declare `DataColumnType` and `DataView.mode` exhaustively in Phase 0**, including values with no implementation yet | The precondition for the schema-stability goal (B10). A Postgres enum value added later is a migration; declared up front it is free. `DataView.mode` stays `VarChar`, not an enum, for the same reason. |
| D12 | Match Notion's *experience* (peek, full page, view types, property vocabulary) while keeping non-Notion *storage* (D2) | The two are independent. Users get the familiar surface; we do not pay Notion's every-row-is-a-page cost. |

---

## Non-goals for this build

Materialized formulas · cross-table formulas · row-level collaborative undo · realtime
multi-user cursor presence in the grid · database templates · row-level comments ·
API/webhook access to tables · "graduate to note" (detaching a page from its table).

**Named future — the inverse of promotion.** Promotion runs one way: row → page. There is no
way to take an *existing note* and make it a row of a table. In a knowledge base that is the
more natural direction ("this note about Kent belongs in my reading list"), and Notion handles
it poorly too. It is deliberately out of scope, but it is cheap to add later precisely because
`DataRow.contentId` is nullable and settable — the operation is "create a `DataRow` pointing at
an existing node", not a schema change. `mode: "query"` (Phase 3) covers a good share of the
same need in the meantime.

---

## Budgeted cross-cutting work

These are **built for real**, not deferred. Each is scheduled inside a phase rather than
left as a follow-up, because every one of them is cheaper now than retrofitted.

### B1 — Keep the self-healing context engine off databases

**The actual failure mode** (corrected from initial analysis): row mutations live on new
routes that never call `markContextDirty`, so cell-edit thrash is avoided by omission. The
real bug is discovery-by-absence. [context-refresh.ts:318](../../../lib/domain/ai-context/context-refresh.ts#L318)
selects `n.contentType !== "folder" && (!n.meta.exists || n.meta.contextDirty)` — a `data`
node with no `AgenticMetadata` row is permanently "uncovered". The sweep picks it up every
cycle, calls the resolver, and [source-resolver.ts:97](../../../lib/domain/ai-context/source-resolver.ts#L97)
returns `empty(node.id, "Unsupported source type: data")`. Result: a node that burns a
generation slot forever and never resolves.

**Fix — three parts, no new machinery:**

1. Add `case "data":` to the source resolver returning a **deterministic schema digest**:
   table title, table description, column names + types + **descriptions**, select-option
   vocabularies, row count, view names. **Never row content.**

   Because descriptions are user-authored (D9), the digest is a genuinely good context
   document with **zero LLM spend**. The cached/generated half of the capsule becomes
   optional enrichment rather than the primary source — a database with well-written column
   descriptions may never need a generation pass at all.
2. `contextDirty` is computed as `sourceHashAtWrite !== sourceHashAtRead`
   ([metadata.ts:863](../../../lib/domain/ai-context/metadata.ts#L863)). Because the resolver
   now returns schema-only text, **cell edits cannot dirty context structurally** — not by
   convention, by construction — while **editing a description does** dirty it, which is
   correct since a description is semantic. Both behaviours fall out of routing the fix through
   the resolver rather than through sweep exclusions.
3. Seed `AgenticMetadata` at table-create time with `contextMode: REFERENCE`. Covered, cheap,
   resolves on first pass, never re-enters the uncovered set.

**Route discipline:** row mutation routes never call `markContextDirty`. Schema mutation
routes (column add/rename/delete) do. View changes do not — they carry no semantics.

### B2 — Search consistency

Today [search/route.ts:86-110](../../../app/api/content/search/route.ts#L86-L110) ORs over
`title` plus per-payload `searchText`. `DataPayload` has neither, so rows are invisible and
users will search for a row they know exists and get nothing.

- `DataRow.searchText String @default("")` — text-ish cell values concatenated, maintained
  on write. Same pattern as `NotePayload.searchText`.
- `DataPayload.searchText String @default("")` — column names + table title, so the table
  itself is findable by its schema.
- New OR branch: a table matches if any of its non-deleted rows match.
- **v1 presentation: roll up to the table** with a "3 matching rows" affordance. Surfacing
  rows as first-class search results would require a result type that isn't a `ContentNode`
  — deferred deliberately.

**Friction (owner, 2026-08-23, B9 log):** the result card for a database shows title +
description + date but no MATCH context — a note result shows a highlighted excerpt, the
database result doesn't say why it matched. The v1 spec's "3 matching rows" affordance was
never built. Fix when search returns: include the best-matching row's text as the excerpt
(server: `rows.take(1)` on the match + count; client: the data-type result card renders it).

Not solved here: `contains` + `mode: insensitive` is a sequential scan. Pre-existing across
all payload types; this makes it no worse. Trigram indexing is a separate piece of work.

### B3 — Permissions divergence

`ViewGrant(contentId, userId, accessLevel)` is per-node and unique per pair. Un-promoted rows
have no node, so they are necessarily covered by the table's grant. Promoted rows have their
own node and can therefore **diverge** — receive a grant the table doesn't have, or miss one
the table does.

**Rule to establish now:** row access derives from the table's grant. A promoted row's own
grants are **additive only, never subtractive**.

- Single authorization helper `resolveDataRowAccess(rowId, userId)` — checks the table first,
  then unions any row-level grant. **No route may touch `DataRow` without going through it.**
- Publishing guard: a promoted row cannot be `isPublished` unless its table is. Cheap to add
  now, a leak if added later.
- **Verification task (not yet confirmed):** whether `ViewGrant` is hierarchical — i.e.
  whether a grant on a folder implies access to descendants. If it is, promoted rows as
  `role: referenced` children need an explicit exclusion so a folder grant can't independently
  reach rows of a table that grant doesn't cover. Confirm before Phase 5.

### B4 — Undo

**Resolved 2026-08-17 — build it.** In-session undo for real; durable and collaborative undo
stubbed.

**What is actually at stake, both ways:**

*If we skip it,* the work does not disappear — it **relocates into a worse feature.**
`DataRow.deletedAt` is already in the schema, so soft-delete exists regardless; what is missing
is the *affordance*. Delete a row with no undo and the only recovery path is a row-level
trash-and-restore UI, which has to be built, discovered, and navigated. Undo is the same
capability with a keystroke instead of a screen — and it also covers cell edits and pasted
ranges, which a trash UI never will. You are building one of the two.

The second cost is tonal and specific to this app: **note editing gets full history free from
TipTap.** A grid with no undo, one pane over, reads as broken rather than as unfinished.

*If we build it,* the honest risks are two. An undo that is subtly wrong is worse than none —
the user believes they reverted and did not — so a failed inverse mutation must surface
visibly, never silently. And **collaboration is the sharp edge**: with per-cell LWW (D5), if
someone else edits a cell between your write and your undo, a naive inverse clobbers their
work. Mitigation: undo only your own most recent ops, and if the cell's value changed since,
skip that op and say so rather than overwriting.

Scope stays as planned — client-side stack, server authoritative, ops serializable from day one
so a durable log is a later addition rather than a rewrite.

**Hardening — the safety design, not a list of good intentions.** Each item below closes one of
the two risks above.

1. **Compare-and-swap inverses.** Every op carries the value it expects to find, not just the
   value to write: `{ rowId, colKey, expect: <what I wrote>, to: <prior value> }`. The server
   applies the inverse **only if the current value still equals `expect`**. This is optimistic
   concurrency at cell granularity, and it structurally prevents the collaboration clobber —
   a naive inverse cannot overwrite someone else's later edit, because the precondition fails.

2. **Three outcomes, never two.** `applied` · `skipped-stale` · `failed`. A silent no-op is the
   failure mode that makes undo worse than nothing, so it is not a representable state.
   - `applied` — normal.
   - `skipped-stale` — the value moved under us. Name the cell and who changed it; consume the
     entry rather than retrying, and offer an explicit **"undo anyway (overwrite)"**.
   - `failed` — network or server error. **Push the op back onto the stack** so a retry is
     possible; a consumed-but-unapplied op is a lie about state.

3. **Batch atomicity.** A pasted range is **one** undo entry, not forty, applied in a
   transaction. Partial undo of a paste is the worst available outcome — if any cell is stale,
   the whole batch is skipped with a report of which cells drifted.

4. **Ownership scoping at push time.** Only ops this client issued this session enter the
   stack. Another user's edit is never undoable, even when it is the most recent change to the
   cell. A rule about what goes *in* is more reliable than a check on the way out.

5. **Deletes and edits have different risk profiles, so they get different mechanisms.**
   Restores (row un-delete, column un-delete) are `deletedAt = null` — idempotent and safe, no
   CAS needed. Edits need CAS. Row-*create* inverses need CAS on `updatedAt`, since someone may
   have filled in the row you are about to remove.

6. **Redo invalidation.** A new local edit clears redo. A **remote** change touching any cell in
   the redo stack invalidates that entry specifically — otherwise redo re-applies a stale write
   that CAS would have caught on the undo side but not here.

7. **Promotion is not undoable by this stack.** If a cell edit triggered a row's promotion, the
   row now has a `ContentNode`, a title-sync, backlinks and possibly a body. Silently demoting
   it would orphan real references. Cell undo reverts the *cell*; un-promotion is a separate
   explicit action or it does not happen. This is the subtle one.

8. **Bounded and cleared deliberately.** Cap ~100 ops; clear on navigating away from the table.
   A view change does **not** clear it — same data, different projection. Column soft-delete
   (D-decisions) means ops referencing a deleted column still resolve, so schema edits do not
   invalidate the stack either. Another payoff of soft-delete.

9. **Visible, not just a keystroke.** Destructive ops get a toast with an Undo action
   ("3 rows deleted · Undo") alongside `Ctrl+Z`. An invisible affordance is one most users
   never learn they had.

10. **Every op stamps `clientId`, `seq`, `at`** — the minimum for a durable or collaborative log
    later to reconstruct ordering without a rewrite.

**Op set:** `setCell` · `addRow` · `deleteRows` · `addColumn` · `deleteColumn` · `reorder` ·
`pasteRange`. Bound to `Ctrl+Z` / `Ctrl+Shift+Z`. Explicitly out of scope: undoing another
user's edit, and cross-session undo.

### B5 — CI gates

| Gate | Impact | Action |
|---|---|---|
| `ai:drift:check` | Every new AI tool must be classified user-configurable (settings metadata) or listed in `HARNESS_INTERNAL_TOOL_IDS`, or [validate-ai-drift.ts:368](../../../scripts/validate-ai-drift.ts#L368) fails. Prompt/description tool references must resolve. | Phase 6, per tool added |
| `migration-drift` | Schema change requires the migration committed alongside `schema.prisma`. `prisma/` is human-owned — canonical SQL surfaced, human commits. | Phase 0 |
| `publishing:schema:check` | Registering a half-finished publishing block **fails the gate**. | Do **not** register a block while publishing is stubbed (B6) |
| `collab:schema:check` | **In scope now** (O16/B7). No new node — `noteWindow` gains `targetViewId` / `targetRowId`, mirrored into `ServerNoteWindow`, plus a `TIPTAP_SCHEMA_VERSION` MINOR bump (**1.15.0 → 1.16.0**) and a `SCHEMA_HISTORY` entry, in the same commit. Post-merge **Hocuspocus redeploy required** — Cloud Run does not redeploy with Vercel. | Phase 1b |
| `blockid:hygiene:check` | New on main (b42ad4ca). **Higher risk than first assessed:** `noteWindow` *does* own per-block state — retarget history lives in the host note's Y.Doc keyed by `blockId`. Extending it means the new targets must survive copy/paste/duplicate re-identification too. Treat as a real gate, not a formality. | Phase 1b |
| `note-edit:check` | New on main. Verify whether a database view surface falls under its remit before Phase 2. | Phase 2 |
| `lint` (`--max-warnings 175`) | Zero new warnings. | Every phase |
| `extensions:check` | N/A — core type, not an extension (D8). | — |

### B6 — Stubbed seams (publishing, import, export)

Reserve the shape, build nothing behind it.

- **Publishing** — **no exclusion list is needed; the question dissolves.** Publishing is
  allowlist-by-construction, not filter-by-construction: nothing is public unless someone
  explicitly creates a `PublicItem`, which requires a `PublicItemType`
  (`blog_post | project | profile_section | case_study | bookmark | page | media_item`) and
  stores a *snapshot* in `PublicItemRevision.bodyJson`. There is no `contentType` filter
  anywhere in the publishing surface because there has never needed to be one. A database has
  no `PublicItemType`, so it is structurally unpublishable. Reserve `DataView.publicConfig
  Json?` for later; **register no publishing block** (a half-registered block hard-fails
  `publishing:schema:check`).

  Two residual leak paths, both closed here:
  1. A **promoted row** is `contentType: note` and could otherwise be given a `PublicItem`.
     B3's guard covers it, and since a table cannot be published at all in v1 the guard
     reduces to "promoted rows are not publishable."
  2. A database **embedded in a published note** — the note's body snapshot would carry a
     `noteWindow` node pointing at a private table. **Already solved, inherited not built:**
     `ServerNoteWindow.renderHTML` deliberately emits only the human-readable title, with the
     "target UUID must never reach published HTML" rationale written into the file. The only
     task is *verifying* the new `targetViewId` / `targetRowId` attrs inherit that treatment
     (B7 item 4). **There is no new publishing work in this plan.**
- **Import** — `DataPayload.mode: "external"` already reserved by the original stub. Define
  the type-inference module's signature and the `source` provenance shape; no implementation.
- **Export** — add a `data` case to the export converter switch that emits CSV of the default
  view, and reserve the `.meta.json` sidecar shape (column types, relation targets) so
  round-trip is possible later. Relations and rollups documented as CSV-lossy.
  *Note:* real CSV export is ~an hour of work and high value. Planned as a stub per
  instruction; flagged as a cheap upgrade if you want it in v1.

### B7 — Database blocks and nested referenced content

**Required this pass** (the rich block UI is not; D10). The machinery already exists and is
proven by the visualization embed path.

**What exists:**
- [content/route.ts:762-786](../../../app/api/content/content/route.ts#L762-L786) — "Path A"
  ownership claim: validates the host note exists and belongs to the caller, then sets
  `ownedByNoteId` + `role: "referenced"`. Silently drops a forged claim rather than trusting it.
- [tree/route.ts:300-333](../../../app/api/content/content/tree/route.ts#L300-L333) — two-tier
  ownership resolution nests owned referenced content under its owner in the file tree
  (explicit `ownedByNoteId`, or inferred via the `ContentLink` embed graph).
- [content/[id]/route.ts:1725-1730](../../../app/api/content/content/[id]/route.ts#L1725) —
  breadth-first cascade soft-delete down the ownership chain.
- `isReadOnly = !!viz.ownedByNoteId` in the visualization fullscreen route — existing
  precedent for embedded-vs-standalone behavior differences.

**Work:**
1. **Hoist the Path-A ownership claim out of the `visualization` branch.** It is currently
   nested inside that one content-type branch, so every new embeddable type would copy-paste
   it — including its security validation. Make it generic across creation. Small refactor,
   removes a standing footgun.
2. Accept `ownedByNoteId` on `data` creation → a database created from inside a note becomes
   `role: "referenced"`, nested under that note in the tree, individually openable, and
   cascade-deleted with its host. This is exactly the behavior requested.
3. **Extend `noteWindow`'s attr spec — do NOT register a new node.**

   > **Superseded, recorded so it is not re-derived:** earlier drafts of this item said "register
   > `DatabaseBlock` + `ServerDatabaseBlock`, renders as a link card." **That is cancelled by
   > O16.** No new node type is created by this plan. If you are reading a `DatabaseBlock`
   > reference anywhere else in this document, it is stale text — the node is `noteWindow`.

   Add `targetViewId` and `targetRowId` to `noteWindowAttrSpec()`. Requires, in the same commit:
   the attrs mirrored into `ServerNoteWindow`, a `TIPTAP_SCHEMA_VERSION` **MINOR** bump
   (1.15.0 → 1.16.0) with a `SCHEMA_HISTORY` entry, `pnpm collab:schema:check` green, and a
   **post-merge Hocuspocus redeploy** (Cloud Run does not redeploy with Vercel; an
   un-redeployed collab server rewrites unknown attrs and node types to `unsupportedBlock`).

   **Both attrs ship in the first commit even though nothing reads either yet** — adding a
   TipTap attr later costs a second schema bump plus a second redeploy. One node, four targets:

   | Attrs | Renders |
   |---|---|
   | `targetContentId` → a note | today's note window (unchanged) |
   | `targetContentId` → a database | the database at its default view |
   | `+ targetViewId` | one saved view — the linked-view case (B8) |
   | `+ targetRowId` | one row page, embedded |

   `targetRowId` earns its place on a narrow argument: a **promoted** row is a note, so
   `noteWindow` already embeds it today with zero new work. An **un-promoted** row has no node
   and cannot be windowed at all — and un-promoted rows are the majority. That case is what the
   attr is for.

   **Why extending beats adding.** Reading its attr spec
   ([note-window.tsx:107-121](../../../lib/domain/editor/extensions/blocks/note-window.tsx#L107-L121)),
   the target is `targetContentId` — **a plain `ContentNode` id, already kind-agnostic.** A
   database *is* a `ContentNode`. It also already carries `height` and `showBorder`, which are
   exactly the generic embed chrome a view embed needs.

   More importantly it has already solved the hard parts, all of which a separate
   `DatabaseBlock` would have to duplicate or ship without: nested-window depth limits and cycle
   detection, `blockId` hygiene under copy/paste/duplicate (its own CI gate), other-session
   presence gating with read-only snapshot fallback, counting as a backlink, feeding AI context
   refs, and — directly relevant to B6's leak path — a `renderHTML` that **deliberately emits
   only the human-readable title so the target UUID never reaches published HTML**, with the
   rationale written into the file.

   Duplicating that surface is how a codebase ends up with two subtly different cycle detectors.

   **The proposed split: one node, many affordances.**
   - **One node type** — node types are the expensive thing (schema bump, collab registration,
     Hocuspocus redeploy). Add `targetViewId` and `targetRowId` to the existing spec.
   - **A polymorphic node view** — a note target renders today's window; a database target
     renders the grid/board/gallery; a row target renders the row page.
   - **Several slash commands producing the same node pre-configured** — `/window`, `/database`,
     `/board`. Discoverability without node proliferation.
   - **Retarget across kinds for free**, since the picker is already `ContentTreePicker` and the
     retarget flow already exists. A slot that shows a note today can show a board tomorrow.

   This deletes a node type from Phase 1 rather than adding one.

   **The gate is closed — `NoteWindowNodeView` already has a mode machine.** Its structure
   (line refs against `origin/main`): a shared chrome layer — height persistence (325), retarget
   via `ContentTreePicker` (636), history menu (202), header rename of the real target (705),
   label self-heal (559) — wrapping a **content area that already branches by mode** (423),
   with distinct paths for `editable-note` (462), `editable-plain` REST save (570), the inert
   cycle/depth chip (757), and unassigned-shows-the-picker (772).

   So this is **extending an existing mode machine, not retrofitting polymorphism onto a
   monolith.** Adding `database` / `view` / `row` modes means one new branch at the data load
   (351) and one new render branch. Two of the note-specific paths are simply *skipped* by a
   database target — the Y.js collaboration runtime acquisition (462) does not apply, since
   cells are per-cell LWW (D5), not CRDT. The database mode is the *simpler* mode.

   *Verified structurally (symbol map + section comments), not by reading all 1,033 lines —
   "extend the mode machine" remains an estimate, though a well-evidenced one.*

   **Pre-configured slash commands are a requirement, not an option** (owner, 2026-08-17).
   `/window`, `/database`, `/board`, `/table` all insert the same node with different initial
   attrs. This is what keeps one node type from costing discoverability: users find features
   through the slash menu, and a single generic `/window` would bury three of the four.

   **Embedded views are the destination, and they change one Phase 2 requirement.** The
   `contentId + viewId` case is not just a link card — the intent is a real embedded board,
   gallery or list inside a note. That is cheaper than it sounds, because the renderer *is* the
   view renderer already being built in Phase 2 — but only if it is built to be embeddable:

   > **Phase 2 constraint:** every view renderer must be a standalone component taking
   > `(view, rows)` and making **no assumption that it owns the page** — no full-height
   > layout, no page-level scroll ownership, no reading route params for its own state.

   Built that way, an embedded kanban is "render the existing board at block width" plus a
   height cap. Built the other way, embedding is a refactor of all four renderers. This is the
   same decide-now-or-pay-later shape as the attrs, and it costs nothing to honour up front.
4. **Public-render safety — verify, do not build.** `ServerNoteWindow.renderHTML` already emits
   only the human-readable title, with an in-file rationale that the target UUID must never
   reach published HTML. The new attrs must inherit that: **confirm `targetViewId` /
   `targetRowId` are not serialized into public output.** This closes B6's leak path 2 by
   inheritance rather than by new work.

**Why the attrs ship now even though the renderers don't:** an attr added later is unknown to
every collaborative document created in the interim, and an un-redeployed collab server
rewrites unknown content to `unsupportedBlock`. Landing the attrs early makes the schema
forward-compatible for free; landing them late is a data-repair job.

### B8 — View access and information architecture

A view nobody can reach in one action is a view nobody uses. **Notion's own answer is weak
here, and this codebase already owns better primitives** — but only if `viewId` becomes a
first-class navigation dimension in Phase 2 rather than a control inside the database page.

**How Notion does it:**

| Surface | Notion |
|---|---|
| View tabs above the database | ✅ one click — *once you have navigated to the database* |
| Sidebar | ❌ views never appear; a database is one entry, its views invisible until opened |
| Quick Find (⌘P) | ❌ finds pages and rows, not views |
| URL | ✅ `?v=<viewId>` is addressable and copyable, but barely surfaced |
| Favorites | ✅ the main "stop navigating repeatedly" escape hatch |
| Linked views (`/linked view of database`) | ✅ **the real answer** — embed any view in any page; dashboards are built this way |

Notion's model in one line: **views are second-class in navigation, and the workaround is to
embed linked views into a hub page.** You bring the view to where you work because you cannot
navigate to it directly.

**What we do instead** — five surfaces, in dependency order:

1. **`?view=<viewId>` in the URL.** Everything below depends on this. Do it in Phase 2 or none
   of the rest is possible. Also: opening a database with no `?view=` lands on
   `DataPayload.defaultViewId` (already in the Phase 0 schema) — the baseline "don't
   reconfigure every time."
2. **View tabs above the grid.** Notion parity, table stakes.
3. **Views as workspace tabs — the real win.** `WorkspaceTabState`
   ([content-store.ts:41-50](../../../state/content-store.ts#L41-L50)) is keyed by `contentId`
   with no view dimension, so two views of one database cannot currently be two tabs. **Add
   `viewId: string | null` and key tabs by `contentId + viewId`.** A view then inherits
   everything tabs already do: `isPinned`, `isTemporary`, per-pane placement, session
   restore, and drag-from-tree (shipped on main in 61e7d3f5). A pinned "Reading Now" tab is
   **zero** navigation actions. Notion's tabs are page-level only and cannot do this.
4. **Views as file-tree children.** Render `DataView`s as *virtual* children of the database
   node — the tree route already performs synthetic nesting for referenced content
   ([tree/route.ts:300-333](../../../app/api/content/content/tree/route.ts#L300-L333)), so the
   pattern exists. Virtual, **not** real `ContentNode`s (O9). One click from the sidebar,
   which Notion does not offer at all.
5. **`[[Books#Reading Now]]` wiki-links to a view.** `ContentLink.targetFragment` exists in
   the schema with **zero consumers in application code** — reserved and never used. This
   would be its first. Notion has no equivalent.

6. **A dedicated left-panel rail view for databases.** The file tree answers "where does this
   live"; it does not answer "show me my tables." `LeftPanelView` is already an open union
   (`"files" | "search" | "people" | "extensions" | string` —
   [left-panel-view-store.ts:11](../../../state/left-panel-view-store.ts#L11)), so adding
   `"databases"` needs no type surgery.

   The rail lists every database, expanding to **two separate groups** — views and promoted
   pages. That separation is also the fix for the mixed-children problem B7 raised: in the
   dedicated rail they are visibly distinct groups with distinct affordances, rather than one
   undifferentiated child list. Recent views pin to the bottom.

   This is the surface that makes a database with four views and a dozen row pages navigable
   without expanding anything in the file tree.

   **Scoping: none of its own** (O17). The rail applies whatever filter the file tree applies,
   because a database is a `ContentNode` and inherits its workspace assignment from there. No
   database-specific scoping is built, now or later.

   **Rail search — build it, it is small.** One field filtering three name-spaces at once:
   database names, view names, and promoted-page titles. Deliberately **client-side over the
   rail's already-loaded list** — no new endpoint. The counts make this safe: databases are
   few, views per database are single digits, and promoted pages are the rows that earned a
   body. Promote to a server query only if a real vault disproves that.

   It cannot reuse `ContentTreePicker`'s search, which hits the server and returns
   `ContentNode`s — **views are virtual and have no node**, so they would be structurally
   unfindable. This is the one genuinely new piece of the rail.

   **Quick add — reuse `ContentTreePicker`, do not build a picker.** Its header is explicit:
   *"Reuse THIS — do not build new pickers"* (owner decision 2026-08-15,
   [ContentTreePicker.tsx:1-38](../../../components/content/pickers/ContentTreePicker.tsx#L1-L38)).
   It already ships everything the rail's "+" needs, including the placement behaviour that
   makes a user file the new database deliberately: a scope row with the workspace view-scope
   switcher, and **insertion gaps between every sibling slot** marking the exact position the
   new content will occupy.

   One extension is required: the create affordance is currently hardcoded to *"+ New Note"*.
   It needs a create-kind parameter so the same gaps can produce a database. **The component
   already has two consumers** (Note Window retarget, pane tab-strip "+"), so the change must
   be additive and default to the existing behaviour — this is a shared component now, not a
   local one.

Plus the `noteWindow` attrs from B7: `targetViewId` = Notion's linked-view feature,
`targetRowId` = an embedded row page. Both ship in Phase 1b even though nothing reads them
until Phase 2.

**Out of scope but worth recording:** there is no global command palette. The `cmdk` primitive
exists at `components/client/ui/command.tsx`, and ⌘K is currently bound only inside
`MarkdownEditor` for link insertion. If a quick-switcher is ever built, **views should be
first-class entries in it** — the surface where Notion is weakest.

### B8b — The `file` column type and gallery images

**We already have this, and it is better than the minimum bar.** `FilePayload`
([schema.prisma:353-381](../../../prisma/schema.prisma#L353)) carries `mimeType`, `fileSize`,
`checksum` (content-hash dedup), `storageProvider` / `storageKey` / `storageUrl`,
`uploadStatus`, and — the part that matters for gallery — **`thumbnailUrl`, `width`, `height`,
and `blurDataUrl`**. That trio is exactly what a gallery grid needs to lay out without jank:
aspect ratio known before the image loads, and a blur placeholder while it does. Someone
already built for image display.

Behind it: `lib/infrastructure/storage/` (R2 / S3 / Vercel Blob behind a factory, two-phase
presigned upload) and `lib/infrastructure/media/` (`image-processor`, `heic-convert`,
`file-validation`, plus pdf/video/document processors).

**Decision — the `file` column stores `contentId`s of `file` `ContentNode`s**, not raw storage
keys in the JSONB cell. Uploads go through the existing path and are created with
`ownedByNoteId` = the database node, exactly like note-embedded media.

Storing raw keys would be marginally cheaper and would bypass **all** of the above: no dedup,
no permission model, no trash, no thumbnails, no processing pipeline, and orphaned blobs when
a cell is cleared. Reference semantics get every one of those for free, and reuse the
`role: referenced` nesting already established in B7.

**Gallery cover resolution:** the first `file` column, else the first `url` column with an
image extension, else a generated cover from the primary column — configurable per view in
`DataView.config`.

### B8c — Data contracts (cell encoding, filters, ordering)

Previously settled in discussion and never written down — which is how it becomes two
implementations that disagree.

**Cell encoding in `DataRow.data`.** JSON-native types throughout, so `->>` casts cheaply and
JSONB comparison sorts correctly.

| Type | Stored as |
|---|---|
| `text` · `longText` · `url` · `email` · `phone` | string |
| `number` | JSON number (never a string) |
| `checkbox` | JSON boolean |
| `date` | ISO-8601 string — lexical sort **is** chronological sort |
| `select` · `status` | option **id**, never the label (D3) |
| `multiSelect` | array of option ids, **order-significant** (it is the display order) |
| `person` | `userId` string |
| `file` | array of `contentId`s of `file` `ContentNode`s (B8b) |
| `relation` | **nothing** — lives in `DataRowLink` (D4) |
| `formula` · `rollup` · `lookup` | **nothing** — computed on read (D6) |
| `createdAt` · `updatedAt` · `createdBy` · `updatedBy` · `autoNumber` | **nothing** — read from the row's own columns |

**Empty is absent.** A cleared cell **deletes its key** rather than writing `null`. "Never set"
and "explicitly cleared" collapse into one state deliberately — it removes a whole class of
three-valued-logic bug from filters, and no product surface distinguishes them.

**Filter tree.** One recursive shape, because it has **two consumers that must agree** — the
view layer and `query_database` (Phase 6). Divergence here is a silent correctness bug.

```
Filter  = Group | Condition
Group   = { op: "and" | "or", children: Filter[] }
Condition = { columnId, operator, value? }
```

Operators are per-type and closed: `isEmpty` / `isNotEmpty` on everything; `is` / `isNot` on
scalars and selects; `contains` / `notContains` / `startsWith` on text; `gt` / `gte` / `lt` /
`lte` on number and date; `hasAny` / `hasAll` / `hasNone` on multiSelect; `isWithin` on date
(relative windows — today, last 7 days, this month). Anything not in that list is rejected at
the API rather than silently ignored.

**`sortKey`.** Use the **`fractional-indexing` package** rather than hand-rolling midpoint
arithmetic — per CLAUDE.md's "prefer a reputable, maintained library." Collisions (two clients
inserting into the same slot) resolve by appending a jitter suffix, which the library supports;
identical keys are legal and break ties on `id` for a total order.

**JSONB comparison for undo CAS (B4.1)** compares **canonicalised JSON** — object keys sorted,
arrays order-significant. `multiSelect` reordering therefore counts as a change, which is
correct: order is user-visible.

### B8d — Runtime model (sync, freshness, virtualization)

**The gap this closes:** D5 locks per-cell LWW, server-authoritative, but nothing said how a
client learns about another client's edit. That is not cosmetic — **B4's compare-and-swap
assumes the client knows the current value**, so without a freshness channel CAS either fails
constantly or operates on stale reads.

**Decision — a shared poller, not SSE and not Y.js.** `noteWindow` already established this
exact pattern on main: a shared 10-second presence poller that drops a window to a read-only
snapshot when another session holds it. Reuse the pattern rather than introducing a third
concurrency mechanism into the codebase (Y.js for notes, LWW for cells, and now a stream).

- The grid polls its current view on an interval while focused, and once immediately on window
  refocus. Suspended when the tab is hidden.
- Responses carry a per-row `updatedAt`; the client reconciles only changed rows.
- **Cells being actively edited are never overwritten by a poll** — the local edit wins until
  it is committed, then reconciles.
- Undo CAS failures are therefore rare and meaningful rather than constant and noisy.

SSE is the upgrade path if polling proves inadequate under real multi-user use (B9 will show
it); nothing in this design forecloses it.

**Virtualization is a Phase 1a requirement, not an optimization.** D1 designs for 10k rows, and
rendering even 1k DOM rows is untenable. The grid, board and list renderers are windowed from
the first commit — retrofitting virtualization into a built grid means rewriting its scroll,
selection and keyboard-navigation model.

**Pagination contract:** cursor-based on `(sortKey, id)`, not offset — offset pagination breaks
under concurrent insertion, which is exactly what a shared table has. Default page 100 rows.

### B9 — Use-case development track

**Smoke testing proves the grid renders. It cannot tell you the configuration surface is
right.** "I need a status that groups To-do / Doing / Done, not a flat select" is invisible
until someone builds a real board and tries to work in it. So use cases are a **parallel
track that gates each phase**, not a validation step appended at the end.

Each use case is a **seeded fixture** (script under `scripts/fixtures/`, reproducible, and
later reusable as a Playwright fixture once the auth fixture lands), plus a checklist of the
configuration surface it must express.

| # | Use case | Configuration surface it validates | Gates |
|---|---|---|---|
| U1 | **Reading list** — title, author, status, rating, URL, finished-date | The baseline: select, number, url, date, text. Smallest thing that must feel right. | Phase 1a |
| U2 | **Project tracker** — status (grouped), stage dates, priority | Grouped `status` vs flat `select`; kanban group-by; card composition. The board is the test. **`person` and `contentLink` deliberately dropped from this fixture** — neither type exists until Phase 4, so requiring them would make U2 unable to gate Phase 2. They join U3 instead. | Phase 2 |
| U3 | **Job application tracker** — pipeline stage, company, dates, external links, per-application notes | Promoted rows with real bodies; long-lived pipeline; rollups. Pairs with the existing job-application workflow starter. | Phase 4–5 |
| U4 | **Everything tagged `#book`** — a query table over existing notes | `mode: "query"`: projection columns, read-only semantics, "these are my actual notes" | Phase 3 |
| U5 | **Media / recipe library** — cover image, tags, source, rating | Gallery view; `file` column; visual density; the non-grid layout path | Phase 2 |
| U6 | **Contacts** — deliberately overlapping the `people` extension | **Boundary test.** Where does a user-built table stop and a first-party extension start? If U6 feels better than `people`, that is a finding worth having early. | Phase 4 |

**Rules for the track:**

- A use case is not done when it renders. It is done when **it has been used for real work for
  a week** and the friction list is empty or explicitly accepted.
- Every friction item gets recorded in this doc under the phase that owns it. Tweaks are
  expected (D-decisions are revisable; the storage model is not).
- U1 and U2 exist before Phase 2 ships, because view design without a populated realistic
  table produces view design that only works on demo data.
- Fixtures double as demo content and as the eventual Playwright corpus, so build them to be
  presentable.

### B10 — Migration surface (why the schema can stay stable)

The stability goal is achievable, and D11 is the precondition. What the design buys, stated
precisely so nothing is a surprise later:

**Migration-free forever** (the payoff of row-as-JSONB + meta-schema-as-rows):
new columns · column renames · column configs and select-option vocabularies · descriptions ·
all cell data · new views · filters, sorts, grouping · relations between rows · row and column
ordering · view-level publishing config. All of it is either JSONB or rows in existing models.

**Still requires a migration:**
1. **A new `DataColumnType` enum value** — a Postgres enum `ALTER`. This is the single most
   likely source of future migrations, and D11 removes it by declaring the vocabulary
   exhaustively up front. Values may ship unimplemented; the UI simply does not offer them.
2. **A new model** — row comments, a durable undo log, import jobs, per-row revision history.
   Genuinely new capability, genuinely a migration. Expected and fine.
3. **A newly *queryable* field** — anything that must be filtered or sorted in SQL rather than
   read from JSONB.

**Action in Phase 0:** declare `DataColumnType` with the full Notion- and Airtable-equivalent
vocabulary even where unimplemented — `text · longText · number · checkbox · date · select ·
multiSelect · status · person · createdBy · updatedBy · createdAt · updatedAt · relation ·
contentLink · file · url · email · phone · autoNumber · formula · rollup · **lookup**`.
Roughly nine of these have no Phase 1–5 implementation. Declaring them costs one line each now
and one migration each later. (`lookup` added per V1-1 in the linked-databases appendix — it is
distinct from `rollup`: lookup pulls a value through a link, rollup aggregates values.)

---

## Phases

### Phase −1 — Surface preview (design before build)

**Runs before Phase 0.** Static, high-fidelity mockups of every surface the build will
produce, reviewed and revised until the configuration decisions are settled. The goal is to
spend the tweak budget on HTML that costs minutes to change rather than on a wired grid that
costs days.

Surfaces to preview:

| Surface | What it settles |
|---|---|
| Grid + view tab bar | Column header affordances, description `ⓘ`, density, add-column, primary-column treatment |
| Kanban board | `status` grouping, card composition, what a card shows when columns are many |
| Gallery | Cover source, card density, U5's viability |
| Row peek | Field layout, where descriptions live, promoted vs un-promoted difference |
| Column config popover | Type picker, description entry, select-option editing |
| Workspace tab strip | A pinned view tab beside a note tab — does `contentId + viewId` read clearly? |
| File tree | Views as virtual children; nested (referenced) database under a note |
| Query-mode table | That it reads as the *same* surface with different column provenance |
| Form view | Label/help layout, required and hidden affordances |
| Databases rail | Search across three name-spaces; quick-add placement via `ContentTreePicker` |
| View access | That personal / collaborative / locked reads clearly on a view |
| Embedded view | A board rendered inside a note at block width |

**Exit:** the plan's D-decisions and open decisions are resolved against something visible, and
B9's U1/U2 fixtures are designed against a settled layout rather than guessed at.

**Master consistency review — RUN 2026-08-17, findings applied.** Resolved in that pass:

- **Four contradictions.** B7 work-item 3 instructed registering `DatabaseBlock` *and*
  extending `noteWindow` in the same item (O16 had superseded the former); B5's two block gates
  named the wrong node, with `blockid:hygiene` risk assessed backwards; B6's leak path called
  for work already inherited; Phase 5 stated `role: referenced` as a constant while its own
  file-tree table makes it trigger-dependent.
- **Undocumented decisions written down** — cell encoding per type, empty-is-absent, the filter
  tree shape, `sortKey` library choice, CAS comparison semantics (now **B8c**).
- **A real hole closed** — nothing specified how clients learn of each other's edits, which
  quietly undermined B4's compare-and-swap. Now **B8d**, plus virtualization and the pagination
  contract, neither of which had appeared anywhere.
- **Phase 1 split into 1a/1b** — it had accreted nine work items across passes.
- **U2 could not gate Phase 2** — its fixture required `person` and `contentLink`, which do not
  exist until Phase 4. Those moved to U3.
- **Staleness** — frontmatter dates, superseded O7/O8/O10, enum count, duplicated B1 and B4
  prose, the preview-surfaces table.

**Re-run this review before Phase 0 begins** — `origin/main` moved 20+ commits during planning
alone, so re-verify every file anchor and line number. The preview
([previews/database-surfaces.html](previews/database-surfaces.html)) drifts from this prose
independently and is checked separately.

### Phase 0 — Meta-schema and migration

`DataColumnType` enum — **declared exhaustively per D11/B10**, nine values shipping with no
implementation · `DataPayload` reworked (drop `schema Json`; add `defaultViewId`, `rowCount`,
`searchText`, `description`) · `DataColumn` (incl. `description String? @db.VarChar(280)`,
`deletedAt`) · `DataRow` (with `searchText`, `contentId`, `deletedAt`) · `DataRowLink` ·
`DataView` · `ContentNode.promotedFromRow` back-relation.

`DataView` carries, beyond the earlier sketch:
- **`ownerId String @db.Uuid`** — required by O14's personal views; a personal view needs an
  owner to be personal to. Missing from the original sketch.
- **`access String @default("collaborative") @db.VarChar(20)`** — `personal | collaborative |
  locked` (O14). `VarChar` not an enum, per D11.
- **`section String? @db.VarChar(80)`** — view sections for the rail. A nullable label rather
  than a `DataViewSection` model until the label proves insufficient; a model is a migration,
  a label is not.
- `publicConfig Json?` — reserved (B6).

**`DataRowLink.column` is `onDelete: Restrict`, not `Cascade`** (V1-2). `DataColumn`
soft-deletes, so cascading on the FK would hard-delete every link the moment a relation column
is soft-deleted — and "undo" would then restore a column with all its relationships gone. Links
are hard-deleted only when the column itself is.

Migration is purely additive — `data` is an unshipped stub, so no production rows exist.
`scripts/test-phase2-types.ts` and `scripts/verify-phase2.ts` construct `DataPayload` rows and
will need updating.

**Exit:** `npx prisma migrate dev` clean against local Docker Postgres, migration reviewed and
committed with `schema.prisma`, `pnpm typecheck` green.

### Phase 1 — Unstub the `+` menu, grid v1 (split into 1a / 1b)

The menu is wired further than it looks. `NewContentCallbacks.onCreateData` already exists at
[new-content-menu.tsx:81](../../../components/content/menu-items/new-content-menu.tsx#L81);
the item at [new-content-menu.tsx:405-411](../../../components/content/menu-items/new-content-menu.tsx#L405-L411)
carries `disabled: true`; [LeftSidebar.tsx:224-226](../../../components/content/LeftSidebar.tsx#L224-L226)
has `handleCreateData` commented out already using the `createTrigger` mechanism;
[LeftSidebarContent.tsx:431-450](../../../components/content/content/LeftSidebarContent.tsx#L431-L450)
consumes it and `data` falls through to the generic `handleCreate(null, type)` branch;
[MainPanelContent.tsx:636-638](../../../components/content/content/MainPanelContent.tsx#L636-L638)
already reads the payload.

**Split into 1a and 1b.** This phase accreted nine work items across successive planning passes
— a shared-component refactor, a TipTap extension with a Hocuspocus redeploy, an AI-context
change, a search change, an auth helper, an undo subsystem, *and* the grid. That is not one
shippable phase. 1a is schema-to-screen; 1b is the integrations that hang off it.

#### Phase 1a — schema to screen

1. Drop `disabled: true`; uncomment `handleCreateData`; add `"data"` to the `createTrigger`
   type union; pass `onCreateData` through. Label reads **"Database"** (O1).
2. Content viewer for `contentType: "data"` in `MainPanelContent`.
3. Grid: `text · longText · number · checkbox · date · select · multiSelect · status`. Cell
   edit, add/delete row and column, one implicit default view. No relations, no promotion.
   **`status` ships here, not in Phase 2** — kanban group-by depends on it, and adding a column
   type mid-phase is worse than starting with it.
4. **Virtualized from the first commit** (B8d) — windowed rows, cursor pagination on
   `(sortKey, id)`.
5. Routes under `app/api/content/data/` — every read and write through `resolveDataRowAccess`
   (**B3**). Cell encoding and filter shapes per **B8c**.
6. **B8d** poller wired: refresh on focus, reconcile by row `updatedAt`, never clobber a cell
   being edited.
7. Column + table description editing: hidden by default, `ⓘ` on the header once set, tooltip
   on hover (D9).

**Empty-state default:** a new database gets one `text` primary column named **Name** and
nothing else. Not Notion's Name/Tags/Date — extra columns a user did not ask for are noise they
must delete before they can start, and `status`/date are one click away.

**Validation:** type violations are **rejected at the API** with a typed field error, never
coerced and never stored as-is. A `number` column holding `"abc"` would poison every sort,
filter and rollup downstream of it. Lossless coercions (numeric string → number, ISO-ish date
string → ISO-8601) are performed silently; everything else errors.

**Exit:** create a database from `+`, add columns and rows, reload, virtualized scroll is smooth
at 5k seeded rows, two browser tabs converge within one poll interval. Browser smoke test
required.

#### Phase 1b — integrations

8. **B1** resolver case + `AgenticMetadata` seeding at create.
9. **B2** `searchText` maintenance on write + the search OR branch.
10. **B4** undo stack with the full hardening set.
11. **B7** ownership-claim hoist, `ownedByNoteId` accepted on `data` creation, `noteWindow`
    attr extension (`targetViewId` / `targetRowId`), schema 1.15.0 → 1.16.0, public-render
    inheritance verified, **Hocuspocus redeploy after merge**.

**Exit:** search finds a database by column name and by cell value, `Ctrl+Z` survives a
concurrent edit without clobbering it, no context-generation churn in the studio logs, and
`collab:schema:check` + `blockid:hygiene:check` green.

### Phase 2 — Views and row peek

Notion conflates two things this plan keeps separate:

- **View** = how the row *set* is displayed (grid, gallery, kanban, calendar, timeline).
- **Row page** = what you see when you open *one* row. That is Phase 5.

`DataView` CRUD, filter tree / sorts / group-by, column visibility and width, view switcher.

**Modes this pass: grid + kanban + gallery + list + split + form** (D12, O12, O13). Kanban is
the one that earns the phase — it forces group-by, the hardest test of the abstraction, and it
is what makes the `status` type (shipped in Phase 1a) pull its weight over flat `select`.
Gallery and list are close to free once grid and kanban exist, and U5 needs gallery. Split is
list + the row peek, both of which ship here anyway. Form is the only mode that writes.
**Calendar and timeline deferred** — both need date-range reasoning that grid/board do not.

All renderers are **windowed** (B8d) and **standalone** — see the Phase 2 constraint in B7.

Mode names align with the existing `FolderViewMode` vocabulary
(`list | gallery | kanban | dashboard | canvas`) rather than inventing a parallel one.
`DataView.mode` stays `VarChar`, not an enum (D11), so adding any of the below is never a
migration — only a renderer.

**The full option space**, ranked by value-to-a-knowledge-base ÷ cost:

| Mode | Notion | Airtable | Cost | Verdict |
|---|---|---|---|---|
| **Grid** | Table | Grid | — | Phase 1a |
| **Board** | Board | Kanban | Medium — forces group-by | Phase 2; earns the phase |
| **Gallery** | Gallery | Gallery | Low | Phase 2; U5 needs it |
| **List (flat)** | List | — | Low | Phase 2 |
| **Split / master-detail** | ❌ | ❌ | **Very low — list + the existing row peek** | **Recommended (O12).** A desktop idiom, not a database-app one. |
| **Form** | Forms | Form | **Low–medium** | **Recommended addition (O13).** The biggest thing both prior passes missed. |
| **List (hierarchical)** | ❌ | List — up to 10 levels | Medium; needs relations | Phase 4+, supersedes flat list |
| **Calendar** | Calendar | Calendar (month/2wk/week/3day/day) | Medium | Scope as `calendar`-extension interop, not a mode |
| **Chart** | Charts | Charts (app) | Medium — reuse `VisualizationPayload` engines | Candidate |
| **Timeline** | Timeline | Timeline — Gantt is a *layout* of it since 2026 | High | Defer; if built, one mode with a layout switch, not two |
| **Graph** | ❌ | ❌ | High | Distinctive; `canvas` in `FolderViewMode` reserves the name |
| **Pivot / matrix** | ❌ | ❌ | Medium | Niche here |
| **Map** | ❌ | Map (app) | High — needs a geo column type | Skip |

**Form view is the real find.** Every other mode is a way of *reading* rows; a form is a view
that **writes** them. That makes it orthogonal to the whole list rather than one more entry in
it, and it lands unusually well here for two reasons: quick-capture is the core gesture of a
knowledge base, and **this app already has a publishing surface** — so a published form view is
a public intake form (contact, submissions, reading recommendations) with no new infrastructure.
It also gives column descriptions (D9) a third home, as field help text.

Note it inverts one B6 assumption: publishing was scoped as "databases are structurally
unpublishable." A *form* view is the one thing you would want public while the data stays
private. Worth deciding deliberately rather than discovering later.

**Form field labelling — a three-step fallback, resolved per view.**

```
label = view.config.fields[colId].label  ??  column.name
help  = view.config.fields[colId].help   ??  column.description  ??  (none)
```

Defaults mean a form is usable the moment it is created, with zero configuration. The override
exists because **a grid header and a form label are under different pressure**: a header is
terse because a column is narrow (`Est. hrs`), while a form label can afford a sentence
(*"Roughly how long do you think this will take?"*). No humanizer is needed on the default —
`column.name` is already human-authored and already user-facing in the grid.

**Why the override is necessary rather than polish:** `column.description` is written for the
*AI* (D9's example: *"pipeline stage; set 'blocked' only when waiting on someone else"*) — that
is internal phrasing, addressed to a model that maintains the table. Form help text is
*external* phrasing, addressed to whoever is filling the form in, possibly a stranger.
Defaulting one to the other is a good convenience and a bad universal, and any **public** form
will need the override. Same reason the overrides live on the **view**, not the column: one
table can carry a public submission form and an internal intake form whose wording must differ.

**The whole of form configuration fits in `DataView.config`** — which is already `Json`. Field
order (a form's order is not the grid's), required-per-form (a column optional in the table can
be mandatory in the form), hidden fields, prefills, submit-button text, confirmation message.
**No schema change beyond `DataView.mode = "form"`.**

**One real gap to scope before building it:** a *published* form accepts writes from someone
with no account. That raises `createdBy` on the resulting row, rate limiting, spam handling, and
the size of the write surface a public endpoint exposes. Private-only forms have none of these
problems, which is a reason to ship those first and publish second.

Column types that cannot be filled in — `formula`, `rollup`, `autoNumber`, `createdAt`,
`updatedAt`, `createdBy`, `updatedBy` — are ineligible for form fields and must be filtered out
of the field picker rather than rendered disabled.

**Airtable's list view is not our list view.** Theirs is hierarchical — up to 10 nesting levels,
and the only view that shows fields from multiple tables at once. Ours in Phase 2 is flat.
Hierarchy is native to this app (`ContentNode` is already a tree), so a hierarchical list over
relation columns is very on-brand — but it depends on Phase 4 relations, so flat first.

**Split view is the sleeper pick.** A row list on the left, the selected row's peek or page on
the right — how mail clients and Obsidian work, and how people actually read through a
reference table. It costs almost nothing because **both halves already exist**: the list mode
and the row peek from this same phase. Notion has no equivalent. If a fifth mode goes in, it
should be this one rather than calendar (O12).

**Two Airtable ideas that are not view modes at all, and are worth more than most of them:**

1. **A view access model — personal / collaborative / locked.** Airtable puts this on every
   view: *collaborative* (anyone can change the config), *personal* (only the owner adjusts
   filters, grouping, field visibility, sorts, row height — and it is hidden from everyone
   else's sidebar), *locked* (nobody can change the config, but records stay editable). This is
   a well-designed three-state model and it costs **one enum column on `DataView`**.

   It also **supersedes O10**. Rather than hiding per-user view preference in localStorage, a
   personal view is a first-class object the user can name, keep, and share later. Notion
   charges for this; Airtable made it a property. Adopt Airtable's.

2. **View sections.** Airtable groups views into collapsible sections in its sidebar. The
   databases rail (B8) needs exactly this once a database has a dozen views — otherwise the
   rail becomes the flat list the rail exists to replace. `DataView.sectionId` plus a small
   `DataViewSection` model, or a nullable `section` label if that proves sufficient.

**Calendar is the strongest *next* mode**, and for an unusual reason: this app already ships a
`calendar` extension, so the interesting version is not "a calendar inside the database" but a
database with a date column **feeding the existing calendar surface**. That is an interop
question, not a view-mode question, and it deserves its own scoping pass rather than being
smuggled in as a `DataView.mode`.

**Row open — peek and full page** (Notion parity, D12):

- **Peek** — side panel, cells as a form, **no `ContentNode`, no promotion**, works for every
  row from day one. Notion's default row-click behavior, and what makes a wide table usable
  long before Phase 5. Natural home for column descriptions (D9) as inline help text.
- **Full page** — same content, full-width route. Un-promoted rows render read-write cells
  with no body; promoted rows gain the TipTap body in Phase 5. The user-visible difference
  between promoted and un-promoted is therefore *only* "does it have a body and an identity" —
  not two different screens.

This is the D12 split working: the experience is Notion's, the storage is not.

**B8 view access ships in this phase** — `?view=` URL addressability, view tabs above the
grid, `viewId` added to `WorkspaceTabState`, views as virtual file-tree children, and
`targetFragment` wiki-links to views. This is not polish deferred to later: a view reachable
only by navigating to the database and clicking through is a view nobody uses, and every one
of these surfaces is cheap **only** while the view read path is being built.

**Critical:** the read path must take a `DataView` as its input rather than hardcoding
`DataRow` access. Phase 3 depends entirely on this decoupling.

### Phase 3 — `mode: "query"` (linked databases)

*Promoted ahead of relations* — this is a change from the initial sketch's ordering. Rationale:
it's the differentiator versus Notion, it's the feature that connects databases to the
existing knowledge graph, and it validates Phase 2's view/source decoupling while that work is
still fresh. Flagged as open decision O2 if you'd rather have relations first.

**In one sentence: a normal table owns its rows; a query table owns nothing — it is a saved
search rendered as a table.**

- Normal table: you type rows into it. They live in `DataRow`. They exist because you made
  them there.
- Query table: you declare *"every note tagged #book."* The rows **are** your existing notes.
  Nothing is copied. Tag a new note `#book` and it appears. Delete the query table and not one
  note is harmed.

**Is the difference only backend?** No — though the frontend similarity is the point.

*Same:* the grid, sorting, filtering, grouping, and view switching are pixel-identical. A user
should not have to learn a second interface.

*Different, and visible:* columns are node properties (title, tags, type, dates, path) rather
than arbitrary cells; you cannot type a brand-new row into it (you create a note, and it shows
up); and opening a row opens the real note, not a row page.

*Different, under the hood:* a separate read path querying `ContentNode` instead of `DataRow`,
behind the same view layer — which is exactly what Phase 2's decoupling buys.

**Why Notion cannot do this.** Notion's "linked database" can only point at another Notion
database. This points at the whole knowledge graph — notes, files, bookmarks, anything
carrying a tag. Notion structurally cannot, because in Notion there is no content *outside*
databases to point at. This is the Obsidian Dataview / Tana capability, and it is the reason
this phase moved ahead of relations.

**v1 is read-only.** Writing back through a projection (edit a cell → mutate the underlying
node) is where this gets genuinely hard, and it is out of scope.

### Phase 4 — Relations and rollups

`DataRowLink` CRUD, symmetric backlink columns, relation-cell picker, read-time rollups
(count, sum, min, max, join). `contentLink` column type pointing at arbitrary `ContentNode`s
— **click opens the target in a workspace tab** (owner, 2026-08-23), and the backlinks
dual-write uses a distinct `linkType: "data-cell"` (verified safe: the tree's
embed-ownership inference only reacts to `image-ref` / `audio-ref`).

**Relation targets are immutable (owner question → locked, 2026-08-26).**
`config.relationTableId` is set at creation and the columns PATCH rejects any
change — same doctrine as O4's frozen types. Retargeting would leave existing
`DataRowLink`s pointing into the old table while new links land in the new one
(a mixed bag no renderer or rollup can interpret), and purging on retarget
would be mass link destruction with no undo op. New target = new column; the
old column soft-deletes recoverably with its links intact (V1-2).

**People columns (owner, 2026-08-23).** The enum's `person` type is specced `→ User`, which
in a mostly-single-user knowledge base points at nearly nothing. The valuable referent is the
**people extension's Person entities** — the contact graph. Resolution requiring **no
migration**: `person` cells keep storing an id string; `DataColumn.config.personSource:
"user" | "person"` (default `"person"`) declares which id-space, since config is Json.
People are already first-class in the content graph (`ContentNode.personId`,
`person-profile` type), so the picker is the people surface, redaction runs through the same
`resolveLinkTargets` shape, and U6 (Contacts) becomes the gating fixture for this column.

### Phase 5 — Lazy promotion and row pages

Three levels of "open a row"; **this pass scopes to levels 1–2.**

| Level | What | Where |
|---|---|---|
| 1 | **Row peek** — side panel, cells as a form, no `ContentNode` | Phase 2, works for every row |
| 2 | **Row page** — promoted; cells as a property header above a real TipTap body | This phase — the Notion row-page experience |
| 3 | **Row templates** — new rows pre-fill a body | Deferred |

Promotion triggers: open row as page · wiki-link targets the row · row gains tags, a body, or
publication · row dragged into the tree.

**Where a promoted row is reachable from.** Promotion makes a row a real `ContentNode`, so it
inherits every content access surface at once — *except* the file tree, and that exception is
already correct by the tree's own documented reasoning.

| Surface | Un-promoted row | Promoted row |
|---|---|---|
| Its table (grid, board, peek, full page) | ✅ always — the primary path | ✅ |
| Global search | ✅ via `DataRow.searchText`, rolled up to the table (B2) | ✅ as its own result, via title sync |
| Backlinks panel | ❌ | ✅ |
| `[[wiki-link]]` autocomplete | ✅ offered — selecting promotes | ✅ resolves directly |
| AI chat `@`-mention | ✅ offered — selecting promotes | ✅ |
| Workspace tab / pane | ✅ as `?row=` | ✅ as its own node |
| Navigation history, recents | ❌ | ✅ via `lastViewedAt` |
| Direct URL | ✅ `?row=` | ✅ canonical node URL |
| **File tree** | ❌ | **✅ when promotion was deliberate** (see below) |

**File-tree visibility — revised.** An earlier draft of this plan hid all promoted rows from
the tree, reasoning by analogy to the existing note-owned-embed rule (*"a note with 10 images
shouldn't spray 10 tree children"*). **That analogy was wrong.** A table's 500 rows are not 500
tree candidates, because promotion is itself the filter — only rows someone deliberately gave a
body or a page ever become nodes at all. Hiding those is the *"where did my resume go?"* failure
that [tree/route.ts:130-160](../../../app/api/content/content/tree/route.ts#L130-L160) exists to
prevent, not an instance of the rule that motivated it.

**The distinction that matters is not promoted vs. un-promoted — it is deliberate vs.
incidental promotion**, and `ContentRole` already encodes exactly that (`primary` = "shown in
file tree by default", `referenced` = "hidden by default"). So:

| Promotion trigger | Role | In tree |
|---|---|---|
| Opened as a page and given a body · dragged to tree · explicit "Add to tree" | `primary` | ✅ nested under the database |
| Targeted by a `[[wiki-link]]` · selected in an AI `@`-mention · gained a tag | `referenced` | ❌ until the existing toggle |

**No schema change and no new surfacing rule** — the tree's `OR`-list already includes
`{ role: "primary" }` unconditionally. This is the `ContentRole` vocabulary being used as
designed rather than a new mechanism.

**What actually made me hesitate** — three real problems, none of which is cardinality:

1. **Passive promotion is the genuine spray risk.** A single note containing `[[Book A]]` …
   `[[Book Z]]` would silently promote 26 rows. Under a naive "promoted rows appear in the
   tree" rule that is 26 new tree children nobody asked for. The `primary` / `referenced` split
   above is precisely the fix: link-driven promotion lands in `referenced` and stays quiet.
2. **Ordering has no single right answer.** Rows carry `sortKey`, which is fractional *and
   per-view* — the same row sits in different positions in different views. Tree children carry
   `displayOrder` (Int). There is no order the tree can show that is correct in every view.
   **Resolution:** `displayOrder` is stamped once at promotion time from the default view, then
   the two are independent. The tree is its own ordering, exactly as it is for every other node.
   Reordering the table does *not* reorder the tree (O11).
3. ~~Drag-out is undefined.~~ **Resolved — rows are freely movable, and it costs nothing.**
   Tree position and table membership live in *different places*: `ContentNode.parentId` versus
   `DataRow.tableId`. Moving a row page in the tree changes only the former, so **the row stays
   a row of its table** while its page gets filed wherever it is most useful. The breadcrumb
   still resolves; the grid still lists it. This orthogonality is a free property of the
   two-table design, and it is what makes moving *add* value rather than raise a question.

   The move route already handles the ownership half —
   [move/route.ts:230-245](../../../app/api/content/content/move/route.ts#L230-L245) re-homes or
   detaches `ownedByNoteId` on an explicit folder/root drop, with a documented snap-back for
   still-embedded references.

   **One rule this forces:** cascade delete for row pages must key off **`DataRow`, not
   `ownedByNoteId`** — otherwise a row filed elsewhere in the tree detaches its ownership edge
   and survives its own table's deletion as an orphan. Deleting a `DataRow` soft-deletes its
   promoted node wherever that node sits.

   Still deferred: **detaching a page from its table entirely** ("graduate to note" — keep the
   body, drop the cells, delete the `DataRow`). That is a genuine data operation rather than a
   move, and it stays out of this build.

A lesser one, worth naming: the database node now has **mixed children** — virtual view nodes
and real row nodes. They need visibly different affordances (a view has no context menu entries
for move/delete-to-trash; a row does), or the tree teaches the wrong mental model.

**The one genuinely new requirement: a breadcrumb.** A user arriving at a promoted row from
search or a backlink has no way to know it is a row of anything. The row page must show its
table and originating view, and offer "open in table". Notion does this and it is load-bearing;
without it, promoted rows read as orphan notes with strange titles.

**Canonical URLs** — one address per state, no ambiguity:

- In-table and peek: `/content/<tableId>?view=<viewId>&row=<rowId>`
- Un-promoted full page: the same URL, expanded layout
- Promoted full page: `/content/<rowNodeId>` — what wiki-links, backlinks and mentions resolve
  to. `?row=` **redirects here** once the row is promoted, so a link captured before promotion
  keeps working.

Promoted node: `contentType: note`, `parentId` = table node, `ownedByNoteId` = table node
(reusing the existing `ContentOwnedByNote` ownership edge). **`role` is set by the promotion
trigger** — `primary` for deliberate promotion, `referenced` for incidental, per the table
above. It is not a constant.

- Title sync: primary column is canonical, writes through to `ContentNode.title` and
  `searchText`. One direction — page-header title edits write the cell, and the cell write
  does the mirroring.
- Deletion: row soft-delete → node soft-delete → `TrashBin`, restored together.
- **The hard part:** the wiki-link resolver must offer un-promoted rows (primary-column values
  as a second suggestion source) and promote on selection. Chat `@`-mentions of rows share
  this exact code path — one resolver, two callers. **Prototype this first within the phase;
  if it's ugly, lazy promotion is worse than it looks and D2 deserves re-litigation.**
- Confirm the B3 hierarchical-grant verification task before shipping.

### Phase 6 — Chat integration

Databases already appear in `@`-mention search for free — a `data` node is a `ContentNode`,
and [ChatInput.tsx](../../../components/content/ai/ChatInput.tsx) plus
`ConversationAssociation` need no changes.

**`DataCapsule`** mirrors [capsule.ts](../../../lib/domain/ai-context/capsule.ts)'s volatility
split, with one rule added:

- **LIVE (never cached):** column names, types, option vocabularies, row count, view names.
- **CACHED:** purpose, notable patterns, one-liner — via the same `AgenticMetadata` path.
- **NEVER INJECTED: rows.** A folder injects its child index because folders are small. A
  5,000-row table cannot. The capsule carries *schema*; rows arrive through a tool. That
  asymmetry is the design.

**Tools** (each needs B5 classification):

| Tool | Tier |
|---|---|
| `query_database` — server-side filter/sort/limit so the model never pages to find three rows | read |
| `describe_database` — full schema when the capsule was truncated | read |
| `insert_rows` / `update_rows` / `delete_rows` | write |
| `add_column` / `alter_column` | **schema — separate, higher tier.** A bad `update_rows` damages cells; a bad `alter_column` can invalidate every row. Not the same bucket. |

**Jurisdiction.** `Conversation.targetFolderId` is documented in-schema as "the folder this
conversation operates in — page-node creation, document-tool destinations, and grounding
follow it." A database is not a folder. Two options: widen to `targetContentId` (cleaner, but
load-bearing across the AI stack) or use `ConversationAssociation` with `source: explicit`
(zero-risk, less expressive). **Start with the association; widen later if it chafes.**

Sidechat then falls out: chat open while a `data` node is selected → auto-associate → **bind
the tools to that table**. `query_database` needs no id, and mutations cannot reach another
table. Jurisdiction means what the tools can *reach*, not just what's in the prompt — a chat
scoped to Books should be structurally unable to write to Contacts.

**v1 scope: read-only.** `query_database` alone is most of the value and none of the risk
(open decision O3).

### Phase 7 — Remaining stub seams

B6's import and export reservations. (Publishing needs no exclusion work — see B6 — and the
block seam landed in Phase 1b per B7.)

---

## Open decisions

| # | Decision | Recommendation |
|---|---|---|
| O1 | Menu label "Data Table" vs "Database" | **Database** — it will have views, relations, and rollups, and it's what users will search for. The stub's wording may have been deliberate. |
| O2 | Phase 3 (`mode: "query"`) before Phase 4 (relations)? | **Yes** — differentiator, and it validates the Phase 2 decoupling while it's fresh. |
| O3 | Chat write-tools in v1? | **No** — read-only first. |
| O4 | Column type changes: coerce-with-preview, or forbid and require a new column? | **Forbid** — much cheaper and arguably more honest. |
| ~~O5~~ | ~~B4's undo split~~ | **Resolved 2026-08-17 — build in-session undo, stub durable/collaborative.** Skipping it does not save the work, it relocates it into a row trash-and-restore UI that covers less. |
| O6 | Real CSV export in v1 instead of the B6 stub? | Cheap (~1h) and high value; planned as stub per instruction. |
| ~~O7~~ | ~~Register the inert `DatabaseBlock` node?~~ | **Superseded by O16** — no new node is registered. The forward-compatibility argument survives and now applies to `noteWindow`'s new attrs instead. |
| ~~O8~~ | ~~Phase 2's second view mode: kanban or gallery?~~ | **Moot** — Phase 2 ships grid, kanban, gallery, list, split and form. The question assumed a budget of one. |
| O9 | Views in the file tree: virtual children, or real `ContentNode`s? | **Virtual** — the tree route already synthesizes nesting. Real nodes would give views tags/links/trash/grants nobody asked for, and multiply the promotion problem. |
| ~~O10~~ | ~~Per-user view memory in localStorage~~ | **Superseded by O14.** A personal view is a first-class object with an owner, not a hidden client preference. |
| O11 | Tree order for promoted rows: stamped once from the default view, or kept in sync with it? | **Stamped once.** `sortKey` is per-view, so no continuous sync is even well-defined. Reordering the table will not reorder the tree — confirm that is acceptable, since it is the one place this reads as inconsistent. |
| O12 | A fifth view mode in Phase 2 — split/master-detail? | **Yes if any.** Both halves (list mode, row peek) already ship in the same phase, so it is close to free, and it is the mode a reference table actually wants. Calendar is the strongest sixth but should be scoped as `calendar`-extension interop, not as a `DataView.mode`. |
| O13 | **Form view** — in scope, and if so when? | **In scope, confirmed 2026-08-17** (owner has immediate uses). Private forms in Phase 2; **published** forms deferred behind their own scoping pass — anonymous writes need `createdBy` semantics, rate limiting and spam handling that private forms simply do not have. |
| O15 | Where do form labels/help live — column or view? | **View** (`DataView.config.fields[colId]`), falling back to `column.name` / `column.description`. One table can host a public submission form and an internal intake form whose wording must differ; column-level storage makes that impossible. |
| ~~O16~~ | ~~Extend `noteWindow`, or ship a separate `DatabaseBlock`?~~ | **LOCKED 2026-08-17 — extend it.** Gate closed: the node view already runs a mode machine with shared chrome over branching content, so this extends it rather than retrofitting it. Pre-configured slash commands (`/window`, `/database`, `/board`, `/table`) are **required**, not optional — they are what keeps one node type from costing discoverability. |
| O14 | View access model — adopt Airtable's personal / collaborative / locked? | **Yes**, and it **replaces O10**. One column on `DataView` beats a localStorage preference: a personal view becomes a nameable, keepable, later-shareable object. Brings `DataView.ownerId` with it. |
| ~~O17~~ | ~~Workspace / tenant scoping for databases~~ | **Resolved 2026-08-17 — skip it.** No database-specific scoping is built. This costs nothing later *because the scoping lives on `ContentNode`, not on `DataPayload`* — a database is a `ContentNode`, so it inherits whatever workspace assignment that table already participates in, now and in future, with no migration. The rail filters exactly as the file tree filters; consistency is the default rather than a feature. |

---

## Appendix — V2 horizon: linked databases

**Not v1.** Recorded because thinking it through surfaced four things v1 must get right, listed
at the end. Everything above the line is speculative.

### What "linked databases" could actually mean — seven distinct things

| # | Shape | Status |
|---|---|---|
| 1 | **Relation column** — table A points at rows of table B | Already Phase 4 (`DataRowLink`) |
| 2 | **Rollup** — aggregate B's values into A (count, sum, max) | Already Phase 4 |
| 3 | **Lookup** — pull a *field value* through the link, not an aggregate | **Missing from the enum — see V1-1** |
| 4 | **Junction table** — a third table that *is* the relationship, carrying its own columns | The interesting one; see below |
| 5 | **Shared option vocabulary** — two tables whose `status` options stay in sync | Neither Notion nor Airtable does this |
| 6 | **Multi-table view** — one view whose rows come from two tables | Airtable's hierarchical list does a version of this |
| 7 | **Cross-base sync** — mirror another workspace's table, read-only or two-way | Airtable ships it; heavy |

### The one worth designing for: junction tables

Many-to-many *with attributes on the relationship itself*. Person ↔ Project is not just a link —
the link has a role, an allocation, a date range. Notion and Airtable both handle this poorly:
you end up with a third table and two relation columns, and nothing in the UI tells you it is a
junction rather than an ordinary table.

A knowledge base could do better, because `DataRowLink` **already carries an identity**
(`id`, plus its own row). Giving it optional attributes — or marking a table as "this table *is*
the edge between A and B" and rendering it as a matrix — is a genuinely differentiated feature
rather than a port of someone else's. Not v1, but the storage does not preclude it.

### What linked browsing could look like

Relation cells as title chips → click peeks the linked row inline without leaving the table.
A linked-records sub-grid inside row peek. Two-pane linked browse (select in A, see its B rows) —
which is Surface 02's split view pointed at a relation instead of a table.

### V1 implications — act on these now

**V1-1 · `lookup` is missing from `DataColumnType`.** D11 declares the enum exhaustively
precisely so later additions are not migrations, and `lookup` is a real Airtable type distinct
from `rollup` (lookup pulls a value; rollup aggregates values). Any linked-database direction
wants it. **Add `lookup` to the Phase 0 enum**, unimplemented like the other eight.

**V1-2 · `DataRowLink` cascade must respect column *soft*-delete.** The sketch has
`column DataColumn @relation(..., onDelete: Cascade)`, but D-decisions give `DataColumn` a
`deletedAt` so an accidental column delete is recoverable (it is what makes undo of a column
delete a metadata flip). **Those two are inconsistent:** if a relation column is soft-deleted,
its links must survive, or "undo" restores a column with every relationship gone. Links may only
be hard-deleted when the column is. This is a bug in the current sketch, not a v2 concern.

**V1-3 · Links crossing a permission boundary must not leak.** B3's `resolveDataRowAccess` has
to handle a link whose *target* the viewer cannot see — render it as a restricted placeholder,
never as the row's title. Cheap now, a disclosure bug if discovered after sharing ships.

**V1-4 · Relations into query-mode tables go through `contentLink`, not `relation`.** A query
table's rows are `ContentNode`s, not `DataRow`s, so `DataRowLink(fromRowId, toRowId)` cannot
express the link at all. `contentLink` already covers it. Stating this now prevents someone
building a broken `relation`-to-query-table path in Phase 4.

**Also noted, not acted on:** select options live in `DataColumn.config` Json. If shared
vocabularies (#5) are ever wanted, extracting them into their own rows is a migration — one of
the few B10 predicts. Acceptable; recorded so it is not a surprise.

**One design note that is free:** `DataRowLink` is stored direction-agnostically, so
**symmetry is a property of the columns, not the storage.** Two-way relations create a column on
both tables reading the same rows; one-way relations simply omit the reverse column. No schema
difference between them — which means one-way relations cost nothing to support.

---

## Verification per phase

**Three gates, in order. A phase is not done until all three pass.**

1. **Mechanical** — `pnpm typecheck` → `pnpm lint` → `pnpm build`. Phase 6 additionally
   requires `pnpm ai:drift:check`; Phase 0 requires the migration replayed into a shadow DB
   (`pnpm preflight` with `SHADOW_DATABASE_URL` set).
2. **Smoke** — exercise the feature in a browser. Proves it renders and does not crash.
3. **Use case (B9)** — the phase's gating use cases are seeded, populated with realistic data,
   and **used for real work**. Proves the *configuration surface* is right, which is the thing
   neither gate above can tell you.

Gate 3 is the one that will actually change the design, and it is the reason tweaks are
expected. Friction found there is recorded in this doc under the owning phase; D-decisions are
revisable in response, the storage model (D1–D4) is not.

Playwright: the grid is authenticated surface, so visual coverage stays stubbed until the
auth fixture lands (existing known gap in `tests/e2e/`). Add a stub spec under
`tests/e2e/content/` per the stub convention rather than leaving the surface undocumented. The
B9 fixtures are built to become that corpus when the auth fixture arrives.
