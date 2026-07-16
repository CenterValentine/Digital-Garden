---
title: Folder Studio Plan — folders as LLM/agentic hubs
status: built (Phases 0–7 + auto-context V1; PR pending)
last_updated: 2026-07-16
owner: centervalentine
branch: worktree-folder-studio (worktree `.claude/worktrees/folder-studio`, off origin/main which already has mobile-compat #102 + workflows #103 merged)
design_stubs: https://claude.ai/code/artifact/ab4a9965-6b58-457b-9566-8c264a2f815b
related:
  - extensions/ (new: extensions/studio/)
  - lib/domain/ai/
  - lib/domain/tools/ (Tool Surfaces registry — sidebar mount)
  - components/content/folder-views/
  - prisma/schema.prisma (new: AgenticMetadata)
  - lib/infrastructure/media/document-extractor.ts
  - lib/features/office/blank-document-generator.ts
---

> **Addendum (2026-07-16): auto-context V1 BUILT on top** — dirty-bit cascade
> on content mutations, output-hash-damped refresh engine (packed leaf
> batches, compositional roll-ups, deepest-first), on-access
> stale-while-revalidate triggers + opt-in nightly sweep cron, Studio
> settings surface (`/settings/extensions/studio`: autoContextMode +
> artifact defaults), Feature Routing cross-links, once-per-session
> unconfigured-model banner. Folder staleness is now OUTPUT-based (children's
> summaryHash), not input-based. Details: STATUS.md 2026-07-16 entry.
>
> **Status (2026-07-16): Phases 0–7 BUILT** on branch `worktree-folder-studio`
> (all gates green per phase; one commit per phase). Option B (sidebar Studio
> tab) is the shipped mount; Option A (folder view) is the remaining Phase 8
> half — deferred with the other intentional gaps to BACKLOG.md → "Folder
> Studio Followups (2026-07-16)". Deviations of record from this plan:
> per-FOLDER source selection (not per-conversation), interim
> `StudioGenerationRun` table (WorkflowRun declined — hard `definitionId` FK),
> study plan lands as a folder note (not daily notes), bottom-nav chat stays
> global. Browser smoke pending (auth-gated surfaces).
>
> **Status (2026-07-12):** Direction approved off the round-1 design stub board.
> Layout decision of record: **Option B first** (chat-first right-sidebar Studio tab),
> **Option A second** (Studio as a folder view), **Option C deferred** (main-panel
> studio tab as a future "expand" affordance). Reordering is cheap if priorities
> shift — every phase below is mount-agnostic except 1 and 8.

# Folder Studio Plan

Make folders NotebookLM-style agentic hubs. Three coupled subsystems, built slow-phase
so each lands as a small, independently shippable PR:

1. **Folder side-chat** with a compact, hidden-by-default source picker (checkboxes,
   size-aware) — grounded in the folder's contents.
2. **Studio tools** — generation affordances whose outputs are *real ContentNodes* in
   the folder (unlike NotebookLM's side-panel ghetto), organized in three shelves:
   **Create** (files), **Practice** (graded sessions, not files), **Analyze**
   (insight artifacts).
3. **Agentic metadata** — a per-node "Context" doc (restricted TipTap), LLM-generated,
   sectioned by ownership. This is simultaneously the chat's ingestion layer, the
   provenance record for generated artifacts, and the prototype for future autonomous
   metadata management.

## Goals

- Chat with any folder, sources selectable via tri-state checkbox picker with size
  bars; selection persists perconversation.
- Every studio output is a normal file: openable, editable, exportable, collaborative.
- Metadata generated for **all** content (it's the ingestion layer); caps apply only
  to full-content inclusion in chat context.
- Generation runs survive tab close, report progress, and notify via the inbox.
- Extension-packaged (`extensions/studio/`), disabled ⇒ invisible via registry filters.

## Non-goals (v1)

- **Video overview** — stub card only.
- **Data table tool** — skipped; owner is consolidating related work elsewhere.
- **Two-host audio** — postponed. Single-voice narration ships first. Gap-filler
  candidates when resumed: Gemini multi-speaker TTS (one call, two voices — erases
  the stitching problem), ElevenLabs Text-to-Dialogue, PlayAI PlayDialog.
- **Web search** — separate plan. Only the `SourceContentResolver` seam lands here;
  provider-native tools (Anthropic `web_search`, OpenAI Responses `web_search`,
  Gemini `google_search` grounding, xAI Live Search) mean that plan is "wire provider
  tool + citations UI," not "build a scraper."
- **Metadata collaboration** — never, by design. REST autosave, last write wins.
  Never registered in publishing, export, or collab schema. Visible only in core
  file-tree contexts, mobile, and the browser-extension embed.
- **Autonomous metadata management** — the in-place generator is the prototype for
  it, but no background auto-regeneration loops in v1.
- **Option C** main-panel studio tab — deferred (see status callout).
- **Bespoke interactive mind-map block** — v1 maps are Mermaid files; a custom block
  (double-click node → chat) is v2 and triggers the full new-TipTap-node protocol.

## What already exists (do NOT rebuild)

| Capability | Where | Studio use |
|---|---|---|
| Conversation engine + persistence | `use-conversation-engine`, `Conversation`/`ConversationMessage`/`ConversationAssociation` | Folder chat IS a conversation; source selection = new association `source` kind |
| ChatContext presets | `ChatContext` model, chat contexts feature | Custom report definitions |
| Tool Surfaces registry | `lib/domain/tools/` (`sidebar-tab` + contentType filter) | Option B mount |
| Flashcard proposal convention | `propose_*` tools + `FlashcardCardProposalList` | Studio flashcards entry |
| TTS / STT / image gen | `lib/domain/ai/speech/`, `transcribe/`, `image/` | Audio overview, oral exam, infographic |
| Document text extraction (+ OCR behind `enableOCR`) | `lib/infrastructure/media/document-extractor.ts` | Source resolver for files; images via vision pass |
| Office generator (docx/xlsx → OnlyOffice) | `lib/features/office/blank-document-generator.ts` | Slides = add pptx generation |
| Mermaid / Excalidraw / diagrams.net | `lib/domain/visualization/`, editor blocks | Mind map v1 target |
| Unsupported-content sanitizer | `lib/domain/editor/unsupported-content.ts` | Hard gate on ALL generated TipTap |
| Canonical hashing | `stableStringify` (PR #56) | GEN-lock + metadata staleness |
| Inbox / notifications | connections-inbox feature | Run-completion notifications |
| AI rate limiting + undo | PR #97 | Metadata fan-out safety |
| Workflow subsystem plan | WORKFLOWS-FOUNDATION-PLAN.md | Studio runs = proving case #2 for `WorkflowRun` |

## Decisions of record

- **Tool routing rule:** text/TipTap artifacts that benefit from refinement (reports,
  flashcards, maps, glossary, compare, all Practice modes) run as **chat invocations**
  (reuse engine, proposal flow, rate limiting, undo). Multi-step/binary artifacts
  (audio, pptx, infographic) run as **jobs** (survive tab close, structured output,
  step retry). Both share prompt assembly, `SourceContentResolver`, and provenance.
- **Meta-prompting:** every tool's "canned" prompt is composed by a pre-step that
  reads folder metadata — dynamically optimal, and viewable/editable by power users.
  v1 is **deterministic assembly** (tool template + slotted metadata + directives —
  cheap, cacheable, debuggable). An optional **LLM pre-pass** that drafts the prompt
  (follow-ups-style small call, the `app/api/ai/follow-ups/` pattern) is a v2
  upgrade behind a setting.
- **Registry-driven visual modularity:** the studio grid renders purely from the
  tool registry — shelves are data (a fourth shelf is an insert, not a redesign);
  **one tile per tool**; sub-tools/variants surface in a flyout/sheet on the tile so
  adding a variant never reflows the grid; variants may be **dynamic** (user-defined
  custom reports resolve at runtime). Other extensions contribute tools via
  `registerStudioTool()` (Tool Surfaces pattern) — e.g. the flashcards tile ships
  from `extensions/flashcards/`, so disabling that extension removes its tile
  through the same registry filters as everything else.
- **Default source selection:** breadth-first — unnested files first, then each
  nesting level (2nd, 3rd, …) until the **token budget** fills. Size-based cap, not
  count-based. Unlimited depth so long as budget allows. Cap-hit ⇒ one warning
  tooltip explaining how defaults were chosen + CTA into the picker.
- **Generated outputs are always excluded from sources** and locked in the picker
  until their content hash diverges from the generation-time hash (human edited ⇒
  "EDITED — eligible").
- **Empty extraction is honest:** files whose resolver yields no text get a
  `NO TEXT` flag in the picker — the file is moot in the studio, visibly.
- **Metadata doc sections by ownership:** Summary + Structure (AI-owned, freely
  regenerable) · Role & Strategy — the operation the content serves, its end
  strategy, sibling relationships (AI **proposes a diff**, human confirms) ·
  Directives (human-owned; AI reads every time, never writes). Staleness =
  `sourceContentHash` drift, badged on AI sections only.
- **Hierarchy direction:** children roll **up** into folder metadata at generation
  time; parent context flows **down** only as prompt input — never stored.

## Mobile alignment (`feat/mobile-compat`, in progress on a parallel worktree)

The mobile branch collapses to single-pane under 768px with a bottom tab bar, turns
the left sidebar into a drawer, and hides the right sidebar behind a "panel" icon in
the tab bar. Studio-specific consequences, folded into the phases below so the two
branches don't fight:

- **The sheet is a feature, not a constraint.** On mobile the right sidebar presents
  as a panel sheet — near-full-width. That *solves* Option B's ~250px risk on mobile.
  Requirement: the Studio tab renders **width-fluid** (container-relative sizing, no
  fixed-rail assumptions) so one component serves the desktop rail and the mobile sheet.
- **Touch targets from day one.** Source-picker rows, tri-state checkboxes, tool
  chips, and flags get ≥44px hit areas in the Phase 1 stubs — cheaper than
  retrofitting after the mobile branch's touch-target rule lands in `globals.css`.
- **Picker is adaptive:** anchored popover on desktop (portaled to `document.body`
  per the menu-positioning convention), **bottom sheet on mobile**. Use `dvh` +
  safe-area vars; the chat input consumes the mobile branch's `web:keyboard-height`
  value rather than inventing a parallel mechanism.
- **Context menus:** studio context-menu items ("Open studio", "Generate context")
  register through the existing context-menu store so the mobile branch's
  long-press pathway picks them up for free — no bespoke handlers.
- **Context editor on mobile:** metadata must be editable on mobile (decision of
  record). The restricted TipTap set should reuse the mobile branch's simplified
  floating toolbar; **no BubbleMenu** in the Context editor v1, which sidesteps
  their touch-anchoring fix entirely.
- **Merge-surface discipline:** the mobile branch is rewriting `ResizablePanels`,
  right-sidebar chrome, and `globals.css`. Studio deliberately touches **none of
  the panel chrome** (registry-driven sidebar-tab mount — one more argument for the
  B-first ordering) and keeps its CSS in extension-scoped files or one
  clearly-delimited `globals.css` block. If timing allows, land Phase 1 after
  mobile Phase 2 merges; otherwise rebase over it.
- **Open coordination question (cross-branch decision needed):** the mobile bottom
  nav includes an **AI chat** icon. When a folder is the active context on mobile,
  does that button open the folder-scoped studio chat or the global chat? One answer
  should win before both surfaces ship — two competing chat entries on a phone
  screen is the failure mode.
- **Synergy note:** the Practice shelf's oral exam (TTS asks, STT grades) is a
  mobile-first feature in disguise — the phone is the natural voice device, and the
  WebView bridge work (keyboard, safe-area, back-navigation) is exactly its
  substrate. No scope change now; remember it when Phase 7 lands.

## Contracts (frozen in Phase 0, everything stubs against them)

```ts
// extensions/studio/types.ts (sketch — final shapes in Phase 0)
type StudioShelf = "create" | "practice" | "analyze";
interface StudioToolVariant {
  id: string; label: string; description?: string;
  custom?: boolean;                     // user-defined (e.g. ChatContext custom report)
}
interface StudioToolDefinition {
  id: string; shelf: StudioShelf; label: string;
  execution: "chat" | "job";           // routing rule above
  // Static list OR runtime resolver (custom reports resolve from ChatContext).
  // UI contract: one tile per tool; variants render in a flyout/sheet on the
  // tile — adding a variant never changes the grid.
  variants?: StudioToolVariant[] | (() => Promise<StudioToolVariant[]>);
  stub?: boolean;                       // video
}
// Contribution point (Tool Surfaces pattern): studio owns the surface,
// extensions contribute tools. Registry filters give the disable story for free.
declare function registerStudioTool(def: StudioToolDefinition): void;
interface SourceSelection {             // persisted via ConversationAssociation
  conversationId: string;
  includedNodeIds: string[];            // tri-state derived client-side
  tokenBudget: number; estimatedTokens: number;
  capApplied: boolean;                  // drives the one-time tooltip
}
interface SourceContentResolver {       // the web-search plan fills the external stub
  resolve(node: ContentNodeRef): Promise<{ text: string; tokens: number; empty: boolean }>;
}
type MetadataSectionOwner = "ai" | "ai-proposed" | "human";
interface GenerationRun {
  id: string; toolId: string; folderId: string; sourceNodeIds: string[];
  status: "idle" | "running" | "failed" | "done";
  step?: { index: number; total: number; label: string };
  outputNodeId?: string; error?: string;
  promptSnapshot: string; model: string;   // provenance
}
```

## Schema changes

One additive sidecar table (follows the payload/`searchText` pattern; run
`DATABASE-CHANGE-CHECKLIST.md`; `db push` in dev):

```prisma
model AgenticMetadata {
  id                String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nodeId            String      @unique @db.Uuid
  tiptapJson        Json                          // restricted extension set — existing nodes only
  derivedText       String      @default("")      // prompt-assembly form (searchText pattern)
  sectionsMeta      Json        @default("{}")    // per-section owner + generatedAt
  sourceContentHash String?                       // staleness (stableStringify)
  model             String?     @db.VarChar(100)
  generatedAt       DateTime?   @db.Timestamptz(6)
  updatedAt         DateTime    @updatedAt @db.Timestamptz(6)
  node              ContentNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
}
```

`GenerationRun` persistence is a Phase 5 decision: `WorkflowRun` (preferred, if the
workflows foundation has merged) vs. an interim table shaped to migrate into it.

No new TipTap nodes in v1 ⇒ no `TIPTAP_SCHEMA_VERSION` bump, no Hocuspocus redeploy.

## Settings inventory

Phase 2 lands the section skeleton; later phases add their toggles to it. Every
entry below is subject to the **four-registration rule** (schema + `DEFAULT_SETTINGS`
+ setter + `saveToBackend` field list — missing #4 = silently reverting toggle).
Mounts under `/settings/extensions/studio` per the settings-reorg IA
(`feat/settings-reorg`, unmerged — coordinate; if studio lands first, follow the old
IA and move with the reorg).

| Setting | Default | Phase | Notes |
|---|---|---|---|
| Metadata generation model | settings-default chat model | 2 | `FEATURE_REGISTRY` route (`studio.metadata`) + `executeWithFallback` |
| Studio generation model | settings-default chat model | 3 | Route `studio.generate`; per-tool overrides deferred |
| Source token budget | fixed default (e.g. 64k) | 3 | Advanced; per-conversation override lives in the picker, not settings |
| Image ingestion (vision pass) | on | 2 | `enableOCR` Tesseract fallback toggle alongside |
| **Agentic recommendations** | **off** | 4+ | Opt-in + configurable, per original spec — mirrors the autoreply prompt-suggestions pattern (`app/api/ai/follow-ups/`); when on, the studio tab surfaces suggested next tools/reports based on folder metadata |
| Meta-prompt LLM pre-pass | off | v2 | Deterministic assembly is v1; this upgrades it per the meta-prompting decision |

## Phases

Each phase = one small PR, sprint-format body, preflight checklist. Extension ships
`enabledByDefault: false` until Phase 3 completes.

### Phase 0 — Extension scaffold + contracts ✅ (2026-07-15, gate-green)
`extensions/studio/` registered in `lib/extensions/installed.ts`
(`enabledByDefault: false`). Shipped: `types.ts` (frozen contracts),
`registry.ts` + `builtin-tools.ts` (13 tools across 3 shelves, all seeded through
the public `registerStudioTool()` path), `tokens.ts` (shared estimator),
`server/source-resolver.ts` (note→markdown, file/html→searchText, code→fenced,
external→**OG-only stub** = web-search seam, folder→empty), `manifest`/`client`/
`server-runtime`/`module`, and a client-safe `index.ts` barrel that deliberately
omits the Prisma resolver. Gate: typecheck clean · lint 151/175 (0 new) · build 0.
No visible UI.

### Phase 1 — Stubbed surfaces (the in-app design round)
Sidebar **Studio** tab (Tool Surfaces, contentType folder): three-shelf grid
**rendered from the registry from the first stub** (no hardcoded tiles — modularity
is proven here, not promised later), all tools disabled-with-state-mocks including
one variant flyout; collapsed source chip showing **real** counts/sizes from the
tree; **Context** sidebar tab stub. Playwright stub specs per
convention. This is where the stub-board design gets pressure-tested in real chrome.
Mobile alignment baked in: width-fluid tab layout (rail ↔ sheet), ≥44px touch
targets, extension-scoped CSS.
**Gate:** build · browser smoke both themes · smoke at <768px (drawer/sheet mode if
mobile Phase 2 has merged, narrow-viewport otherwise).

### Phase 2 — Agentic metadata layer
`AgenticMetadata` table + owner-scoped GET/PUT (last-write-wins). Context tab editor
(restricted TipTap set, REST autosave). Single-node generator using the
settings-default model: sectioned prompt, Role & Strategy as proposed diff, staleness
hash. Image sources get a vision-model pass (decide `enableOCR` flip as fallback);
PDFs ride the existing extractor. Folder roll-up (children → folder summary).
Settings section (default model, toggles) — **all FOUR registrations**.
**Gate:** build · smoke · reviewer assertion that nothing in publishing/export/collab
queries the sidecar.

### Phase 3 — Folder chat + source picker
Conversation with folder-scope associations; BFS default selection under token
budget; cap tooltip + CTA; picker with tri-state, size bars, `NO TEXT` and `GEN`
locks. Picker presents as popover on desktop, bottom sheet on mobile; chat input
respects `web:keyboard-height`. Context assembly = metadata `derivedText` first + a
fetch-full-text tool for drill-down. Resolve the bottom-nav AI-chat routing question
with the mobile branch before enabling. Flip `enabledByDefault: true` at the end of
this phase.
**Gate:** build · smoke (desktop + mobile viewport) · prompt-size logging sanity
(Neon/BYOK cost).

### Phase 4 — First tools (chat-invocation path)
Report (built-ins: study guide, briefing, FAQ, timeline + custom via ChatContext) ·
Flashcards entry (**includes the captured fixes:** remove studio-path card cap —
approval flow is the safety valve; pronunciation defaults OFF, opt-in click, affordance
disabled post-approval — `flashcard-tools.ts`, `FlashcardCardProposalList.tsx`,
`AudioCardGenGate.tsx`) · Mind map (Mermaid; concept/explanation/argument/process
frames) · Glossary (wiki-linked) · Compare. Sanitizer gate on all generated TipTap;
every artifact wiki-links its sources.
**Gate:** build · per-tool smoke.

### Phase 5 — GenerationRun infrastructure
Job execution path, four run states in UI, inbox notification on completion/failure,
provenance persisted, GEN hash-lock enforcement, `Studio outputs/` subfolder
convention. **Decision point:** WorkflowRun vs. interim table.
**Gate:** build · smoke incl. tab-close survival mid-run.

### Phase 6 — Heavy artifacts
Audio overview (single-voice; deep-dive/brief/critique/debate as script prompts) ·
Slides (pptx generator → opens in OnlyOffice) · Infographic (HTML/SVG mode first;
diffusion mode behind the same tool as a format option — both stay on the table).
**Gate:** build · per-tool smoke.

### Phase 7 — Practice shelf
Quiz (MCQ, graded) · Teach-it-back (Feynman) · Oral exam (TTS asks, STT grades) ·
FSRS study plan (due-card data + sources → plan written into daily notes).
**Gate:** build · per-mode smoke.

### Phase 8 — Second mount + polish
Option A: Studio as a folder view in `FolderViewContainer`. Outputs listing, empty
states, docs, STATUS/BACKLOG updates. Revisit Option C ("expand" affordance) with
usage evidence.
**Gate:** full quality-gate sweep · Playwright snapshots for the new view.

## Risks

- **Context cost** — folder chat on big folders is token-hungry; budget enforcement
  + prompt-size logging land in Phase 3, before any heavy tool.
- **Metadata fan-out** — generating a large tree = many LLM calls; batch + ride
  PR #97 rate limiting; never auto-regenerate in v1.
- **Feedback loop** (AI summarizing its own outputs) — mitigated by the GEN
  hash-lock; watch for laundering via trivial edits.
- **Picker complexity** — tri-state × budget × warnings is the densest new
  component; it's why Phase 1 stubs it against real tree data first.
- **Sidebar width** — if Option B's ~250px proves too tight in practice, promote
  Option A earlier; phases were ordered so that swap is cheap. (On mobile the sheet
  presentation makes this a desktop-only concern.)
- **Parallel mobile branch** (`feat/mobile-compat`) — rewrites `ResizablePanels`,
  right-sidebar chrome, `globals.css`, and BubbleMenu behavior. Mitigations in
  "Mobile alignment": registry-only mount, extension-scoped CSS, no BubbleMenu in
  the Context editor, rebase Phase 1 after mobile Phase 2 where possible. The one
  unresolved coupling is the bottom-nav AI-chat routing question.

## Deferred (post-v1)

Video overview · two-host audio (see Non-goals for providers) · data table ·
web-search plan (own doc) · Option C expand tab · interactive mind-map block ·
autonomous metadata management (cron/agentic regeneration, cross-folder inference).
