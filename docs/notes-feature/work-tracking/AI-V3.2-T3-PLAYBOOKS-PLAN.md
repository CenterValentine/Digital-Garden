# AI v3.2 T3 — Playbook registry + progressive disclosure

**Branch/worktree:** `feature/ai-v3.2-t3-playbooks` (`ai-v32-t3`), from `origin/main`.
**Gate (from AI-V3.2-PLAN.md):** a user starts a playbook from the registry (no
`@`-mention); phase detail loads **per-phase**, verifiable in the existing token
meter.

## 0. Design principles (decided with owner)

1. **Hand-authoring is the primary use case.** A playbook is just a note the user
   writes, with `##` sections as phases, then **marks as a playbook**. No format
   required to author.
2. **Import is future-proofing.** Adopt **Anthropic Agent Skills (`SKILL.md`)** as
   the first import format, behind a **pluggable adapter** so other frameworks slot
   in later without touching the runtime.
3. **Framework-agnostic internal model.** The runtime (parser, registry, picker,
   progressive disclosure) operates on the **internal playbook note** only.
   Frameworks exist *only* as import adapters that produce that note.
4. **Migration-free.** Playbook state rides `NotePayload.metadata` (like the Run
   Ledger). No schema change.
5. **Progressive disclosure = the Skill mechanism.** Metadata (name/description) in
   the picker; standing rules + the **active phase only** in model context. The
   `[[wiki-link]]` extensions are traced on demand via the existing `getCurrentNote`
   tool (JIT — never pre-loaded).

## 1. The internal playbook model (framework-agnostic)

A **playbook note** = a `contentType:"note"` ContentNode where:
- **`title`** = the skill name.
- **`NotePayload.metadata.playbook = true`** — the discoverable flag.
- **`NotePayload.metadata.playbookDescription = "…"`** — one-liner for the picker.
- **Body** (`tiptapJson`): content before the first (shallowest) heading = **standing
  rules** (always in context); each heading section = a **phase**.
- **`[[wiki-links]]`** in the body = **references** to extension notes (directives,
  guides), traced on demand.

Runtime helpers (built): `parsePlaybook(tiptapJson)` →
`{ standingRules, phases[], phaseLevel }`, each section carrying `content` +
`references[]`. Registry: `isPlaybookMetadata`, `withPlaybookMetadata`,
`listPlaybooks(userId)`.

## 2. Import-adapter abstraction (modularity)

```ts
// lib/domain/ai/playbooks/import/types.ts
export interface SkillImportAdapter {
  id: string;                 // "skill-md" | "fabric" | "mcp-prompt" | …
  label: string;              // "Anthropic SKILL.md"
  detect(raw: string): boolean;               // sniff the format
  parse(raw: string): ImportedPlaybook | null; // → internal shape
}
export interface ImportedPlaybook {
  name: string;               // → note title
  description: string;        // → metadata.playbookDescription
  bodyMarkdown: string;       // → markdownToTiptap → note body (## = phases)
}
```

- **Adapter #1 (T3): `skillMdAdapter`** — YAML frontmatter (`name`, `description`) +
  markdown body. `detect` = leading `---` frontmatter with a `name:`.
- **Registry of adapters** (`import/index.ts`): `ADAPTERS = [skillMdAdapter]`;
  `detectAdapter(raw)` picks the first that matches. New frameworks = append an
  adapter; the import flow + runtime are untouched.
- Import = `adapter.parse(raw)` → create note (`title=name`,
  `withPlaybookMetadata(meta, description)`, `body=markdownToTiptap(bodyMarkdown)`).

### Backlog adapters (future major versions — do NOT build in T3)
| Adapter | Source | Notes |
|---|---|---|
| `fabric` | Daniel Miessler `fabric` patterns | pure-markdown `system.md`; trivial adapter; great seed content |
| `mcp-prompt` | MCP server prompt templates | tool/server-oriented; needs MCP client wiring (ties to MCP epic) |
| `claude-cmd` | Claude Code commands / CLAUDE.md | markdown-ish; low structure |
| `openai-gpt` | OpenAI GPTs/Assistants | not markdown-portable; weakest fit; likely never |

These are documented here as the modularity target; each is a self-contained
adapter behind the same interface. Revisit alongside the MCP epic / next major
AI version.

## 3. Execution pieces

### P1 — Playbook parser ✅ BUILT
`lib/domain/ai/playbooks/parse.ts`. Pure, tsx-tested (phases + standing rules +
`[[refs]]`; phase level = shallowest heading). **Owner-smoke hardening
(2026-07-23):** a pasted SKILL.md can live in ordinary TipTap paragraphs rather
than structured heading nodes. That shape now recognizes literal markdown
headings/frontmatter; useful unsectioned content becomes one implicit phase
instead of `0 phases`.

### P2 — Marker + registry ✅ BUILT
`lib/domain/ai/playbooks/registry.ts` + `GET /api/content/playbooks`. Typecheck
clean (Prisma JSON-path query on `metadata.playbook = true`).

### P3 — `/playbook` picker + attach + client phase tracking ✅ BUILT
- **Composer command:** `/playbook` merges into the SAME `commandItems` list as
  the tool-hint commands (`use-conversation-engine.ts`) — playbooks fetched once
  from `GET /api/content/playbooks` on mount, tagged `contentType: "playbook"`.
  The existing substring filter on label/description already narrows by name, so
  no second-level query syntax was needed. `ChatInput.tsx`'s `handleSelect`
  branches on `contentType === "playbook"` → calls `onAttachPlaybook` instead of
  inserting text (the trigger text is still deleted, same as any command). The
  slash integration was NOT fiddly — the footer-chip fallback was not needed.
- **Attach:** `attachPlaybook`/`detachPlaybook` in the engine set
  `activePlaybookId`/`activePlaybookTitle`; a small dismissable indigo chip
  renders above the composer (mirrors the attachment-chips row).
- **Phase tracking (client) — DEVIATION from plan:** rather than manually
  incrementing on approval (which needs threading a callback through
  `ChatMessage.tsx` → `PhaseCheckpointCard`), `activePhaseIndex` is **derived** —
  a `useMemo` counting resolved (`output-available`/`output-error`)
  `tool-phase_checkpoint` parts in `messages`, mirroring `ChatViewer.tsx`'s
  existing `phaseTokens` bucketing exactly. No new state to desync, survives
  reload for free. Threaded into `handleSend`, the transport's baseline
  `chatBodyResolvers` (so approval-resumes carry it), and `reRunBody`.

### P4 — Progressive-disclosure injection (the load-bearing edit) ✅ BUILT
- **`app/api/ai/chat/route.ts`**: reads `body.playbookId`/`body.activePhaseIndex`,
  fetches the note (`notePayload: { tiptapJson, metadata }`, ownership-scoped),
  guards with `isPlaybookMetadata`, `parsePlaybook`s it, clamps the phase index to
  `[0, phases.length-1]`, and builds a **`playbookContext`** string = standing
  rules + the active phase + a **"Linked extensions"** manifest (title-resolved
  `[[refs]]`, since wikiLink nodes carry no id) with a `getCurrentNote`-on-demand
  instruction. Injected as its own `buildSystemPrompt` field, separate from
  `mentionedContext`.
- **Explicit attachment wins deterministically (owner-smoke fix, 2026-07-23):**
  once the ownership-scoped marked note resolves, the turn cannot use
  `search_playbooks`; discovery and execution are mutually exclusive. A valid
  empty attachment stays named in context and reports that it needs content
  rather than silently searching for another playbook.
- **Renderer — DEVIATION from plan:** the plan called for the export
  `MarkdownConverter`'s wikiLink case; that lives in
  `lib/domain/content/markdown-serialize.ts` (AI v3.2 T2, PR #125), which is
  **NOT merged** — this worktree branched before it landed. Built a small local
  one-way renderer instead: `lib/domain/ai/playbooks/render.ts`
  (`renderPlaybookSection`) — plain text preserving `[[Target]]`/`[[Target|Display]]`
  verbatim plus basic block structure (headings/lists/quotes/code). Scoped
  correctly: this is read-only model context, not a round-trip surface, so full
  markdown fidelity wasn't required — traceable links were. **Follow-up once
  #125 merges:** consider upgrading to `tiptapToMarkdownRich` for richer
  formatting; not required for correctness today.
- **Sub-playbook awareness:** a `[[ref]]` whose target is itself
  `isPlaybookMetadata` is tagged in the manifest as
  **"SUB-PLAYBOOK: has its own standing rules/phases; follow its directives once
  read."**
- **System prompt** (`system-prompt.ts`): checkpoint paragraph now instructs
  `Done when:` as a phase's stop condition, JIT-only `[[extension]]` tracing,
  sub-playbook hand-off semantics, and that outputs default to the run's target
  folder. New `playbookContext` field placed after `mentionedContext` (stable
  within a phase — cache-friendly — so it sits with the other trusted sections,
  not at the very end with untrusted page content).
- **Sub-playbook output routing — confirmed already true, no code needed:**
  `ctx.targetFolderId` (route.ts) is already threaded into `create_folder`/
  `createNote`/`create_docx`, so sub-playbook-authored artifacts land in the same
  run folder as everything else, by construction.
- **Token meter:** unchanged — it already reports per-phase tokens; the shrunk
  context is the visible proof. **Gate met here.**

### P5 — Hand-author mark action + minimal SKILL.md import
- **Mark as Playbook (hand-author, PRIMARY) ✅ BUILT — integration point
  DEVIATION:** not a new toolbar tool (`MainPanelContent.tsx` is large/sensitive;
  wiring a toolbar icon + dialog was disproportionate to a secondary piece).
  Instead added to the existing editor right-click menu
  (`components/content/context-menu/editor-actions.tsx`), using
  `ContextMenuAction.inlineInput` (an existing mechanism — inline text field +
  submit, no new dialog component) to capture the one-line description.
  `POST /api/content/playbooks/mark` (new, small, direct
  `notePayload.metadata` update via `withPlaybookMetadata` — deliberately NOT
  routed through the generic `PATCH /api/content/content/[id]`, which carries
  anti-overwrite/If-Match guards built for full-document saves, not sidecar
  metadata flags). No "unmark" affordance yet — fast-follow if needed.
- **Import (future-proofing) — NOT built this pass (see §6 sequencing):** an
  "Import Skill" affordance (paste a `SKILL.md`,
  or upload `.md`) → `detectAdapter → parse` → create a marked playbook note.
  Adapter-based (§2), so fabric/MCP land later as append-only adapters.

### Sub-playbooks (hierarchical playbooks) — output capability review
The output plumbing **already exists** (AI v3 core + Folder Studio): `create_folder`
(explicitly "playbook destinations like `job-search/{Company}`"), `createNote`,
`create_docx` (files a doc in the target folder), `search_web`/`read_page`. So "a
sub-playbook does its research and files a document in folder X" is buildable today.
T3 adds three bounded enhancements, all reusing pieces already built:
1. **Awareness** — sub-playbook `[[refs]]` tagged in the P4 manifest (above).
2. **Output routing** — sub-playbook artifacts land in the *run's* target folder
   (thread the active-run folder through `create_folder`/`createNote`), co-located
   with the Run Ledger.
3. **Mint-and-mark** — a phase can *author* a sub-playbook for a later phase via
   `createNote` + `withPlaybookMetadata` (P2). Closes the loop: phase 2 writes it,
   phase 5 consumes it.

## 4. Gates
`pnpm typecheck` / `pnpm lint` / `pnpm build`. Unit: `parsePlaybook` +
`skillMdAdapter.parse` round-trip (tsx probe → promote to a check if time). In-app
smoke: mark a note as a playbook → `/playbook` it → confirm only the active phase
is in context (token meter) → approve a checkpoint → next phase loads → a
`[[reference]]` is read via `getCurrentNote`.

## 5. Sequencing for budget efficiency
P3 → P4 gets the **gate** (start-from-registry + per-phase disclosure). P5's
**mark action** is required for the demo (playbooks must exist) — build it with P3.
P5's **import** is the future-proofing bonus — build last; safe to defer if budget
runs short (the adapter abstraction is already specified, so it's append-only).
Backlog adapters are documented, not built.

## 6. Resource discipline

Governed by the durable reference:
**[guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md](../guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md)**
(principles + the maintained implementation-state table). What T3 does with it:

**Fold into T3 now (cheap, high-leverage):**
- **`Done when:` per phase** — a one-line convention in the SKILL.md phase format +
  one system-prompt instruction (P4). Makes *termination* authored: the agent
  stops on a satisfied criterion, not on exhaustion.
- **Lean on what exists** — `phase_checkpoint` (completion signal), Run Ledger
  (externalized state), token meter (observability). No new code.
- **Sub-playbook enhancements** — the three items under §3 (awareness, output
  routing, mint-and-mark); they reuse P2/P4, near-zero new surface.

**Defer to a dedicated "resource governance" task (T4):** enforced token/step
budgets (decrement + stop), **sub-agent isolation** for sub-playbooks (isolate
context, return conclusion + artifact pointer — the biggest lever for long runs),
per-run compaction, self-critique / no-progress loop guards, difficulty-based
effort allocation. Each is a subsystem; keeping them out of T3 protects the gate.
Tracked in the state table (§4 of the reference).

## 7. Owner-smoke fix — per-artifact output override was inexpressible (2026-07-23)

**Observed:** Test 14 selected `underContent` as the run-wide output preference,
then instructed Phase B to place only `"Between the Lines - …"` under the chat.
The note still landed under the rooted content with every other artifact.

**Root cause:** the prompt promised that an explicit destination overrides the
preset, but the write-tool schema only exposed `parentId`. That field accepts a
folder UUID; `"under the chat"` is a referenced-content ownership relationship,
not a folder. The model therefore called `createNote` with no placement field,
and the runtime correctly—but undesirably—applied the run-wide preset. The
contract described a capability the tool could not express.

**Correction:** note and Word-document writes now accept a symbolic,
per-artifact `outputLocation` (`under_chat`, `under_content`, or
`beside_content`). The server resolves those aliases from ownership-validated
chat/rooted-content IDs; the model never handles internal IDs. Omitting both
`outputLocation` and `parentId` still applies the selected preference, while a
resolved folder UUID remains the mechanism for a specifically named folder.

**Regression guard:** `output-targets:check` covers symbolic overrides in both
directions (under-content preset → one under-chat artifact, and under-chat
preset → one under-content artifact), plus beside-content placement and prompt
wording. This is the durable rule: **preferences govern omitted placement;
explicit per-artifact instructions govern only that artifact.**

## 8. Owner-smoke fix — promoted chat target visibly reset (2026-07-23)

**Observed:** a transient side chat displayed `Under this content` before its
first send, but displayed `Under this chat` immediately after promotion.

**Trace evidence:** the promoted turn's server payload still contained
`{"mode":"underContent"}` and the resulting artifact used the correct rooted
content owner. The regression was therefore in the client preference state,
not the server routing contract.

**Root cause:** promotion copied the target only through `localStorage`, then
the still-mounted conversation engine re-keyed from the transient content key
to the new conversation key. That made a browser-storage read responsible for
an in-flight React state transfer. When that read missed or raced, the generic
conversation-switch fallback reset the visible selection to `Under this chat`.

**Correction:** the conversation engine now owns an explicit in-memory
promotion handoff keyed to the new conversation ID. The handoff has precedence
at that one key transition; storage is still written for reload/remount
durability. Ordinary conversation switches remain isolated and hydrate only
their own saved preference.

**Regression guard:** `output-targets:check` now verifies that a promoted target
survives even when persisted storage is unavailable. The durable rule is:
**state required to complete an in-flight promotion must travel through the
promotion transaction itself; persistence is a recovery mechanism, not the
transaction.**

## 9. Owner-smoke fix — understood placement was omitted from the tool call (2026-07-23)

**Observed:** Test 14 selected `underContent` as its run-wide preference and
instructed the `"Between the Lines - …"` document to go `under the chat`. The
document still appeared under Test 14.

**Trace evidence:** the provider received the updated `create_docx` schema and
the assistant repeated the Phase B destination as “under the chat” in its
checkpoint. Its eventual `create_docx` arguments nevertheless contained only
`title` and `markdown`; `outputLocation` was omitted. The tool runtime therefore
applied the selected preset exactly as designed.

**Contributing gaps:**

1. A legacy system-prompt sentence still told the model that every explicit
   destination should use `parentId`, conflicting with the newer relative
   `outputLocation` contract.
2. “Execute this file as a playbook” left the rooted note as generic context
   instead of validating and binding it as the requested procedure.
3. Correct placement still depended on the model serializing an optional field
   after understanding the natural-language instruction.

**Correction:** relative placement vocabulary is now canonical in the system
prompt (`under_chat`, `under_content`, `beside_content`; `parentId` only for a
resolved folder). An explicit request to execute the rooted file validates and
loads that file as the Active Playbook without requiring metadata or a picker
attachment. Trusted output directives are extracted from its text and bound to
matching artifact-title prefixes. If the model omits placement, note/Word write
tools use the matching directive before the run-wide preference; explicit tool
placement still wins.

**Regression guard:** `playbooks:check` uses the exact Test 14 wording,
including the missing closing quote/stray `*`, and proves only
`"Between the Lines - Company Research - …"` resolves to `under_chat` while
`"Surface Facts - …"` remains on the preset. It also distinguishes “execute
this file as a playbook” from an ordinary question about the open file.

Durable rule: **natural-language playbook directives that affect system state
must be compiled into trusted runtime intent; model-generated tool arguments
are an override channel, not the sole enforcement mechanism.**

## 10. Owner-smoke fix — generic write receipts did not refresh the tree (2026-07-23)

**Observed:** chat receipts showed newly created Word documents, cached pages,
and Run Ledger writes in real time, but the file tree did not show those nodes
until a later reload.

**Root cause:** the receipt UI had moved to the generic `__contentWrites`
contract, while the conversation freshness hook still gated tree refreshes on
the older `__notePayload` envelope. Receipt-only outputs such as
`create_docx` and checkpoint ledger writes therefore rendered successfully but
never dispatched `dg:tree-refresh`. The hook also marked an unrecognized tool
call as seen before checking it, preventing the completion backstop from
recovering it.

**Correction:** freshness dispatch now derives from validated generic write
receipts. Every persisted write refreshes the tree; note/folder and workflow
receipts additionally dispatch their surgical live-view events. Legacy
`__notePayload` results remain supported for older persisted conversations, and
tool calls are deduplicated only after a recognized write.

**Regression guard:** `output-targets:check` verifies a mixed receipt set
(Run Ledger note, Word file, workflow) produces one tree refresh requirement
and the correct type-specific content IDs.

Durable rule: **the visible receipt contract and the freshness contract must
share the same parser; adding a new persisted output type must not require a
second envelope-specific refresh path.**

## 11. Post-ship fix — OpenAI could checkpoint before doing the phase (2026-07-23)

**Observed:** GPT-4o immediately requested approval for Phase 1 and summarized
company research, job-description analysis, and an employer-needs hypothesis
as completed. No research, linked-context reads, analysis output, or other
phase work had actually run.

**Root causes:**

1. Model-facing instructions and reference manifests named a nonexistent
   `read_note` tool while the registered tool is `getCurrentNote`. Models that
   adhere strictly to the provided tool schema had no callable tool matching
   the instruction.
2. Rooted-file playbooks loaded their text but did not receive the resolved
   linked-extension manifest that picker-attached playbooks received.
3. `phase_checkpoint` trusted the provider's completion claim. Its approval
   affordance could surface without any runtime proof that checkable research
   or linked-context work had completed.

**Correction:** all model-facing note-read instructions now use the registered
`getCurrentNote` name and `contentId` argument. Explicitly attached and
rooted-file playbooks share the same ownership-scoped linked-extension
manifest. A request-scoped checkpoint gate derives checkable requirements from
the active phase: research language requires a completed `search_web` or
`read_page` call, and resolved phase references require a completed
`getCurrentNote` call. A premature checkpoint executes without approval,
returns a structured rejection naming the missing work, and lets the tool loop
continue. Approval resumes rebuild proof from persisted UI tool parts so the
gate survives the HTTP boundary.

**Regression guard:** `playbooks:check` covers the reported employer-research
phase, verifies each missing requirement independently, verifies approval
resume hydration, and proves pure writing phases or user-disabled tools are not
forced into impossible gates.

Durable rule: **a model-authored completion summary is a claim, not proof.
Whenever a phase requirement has observable system evidence, checkpoint
eligibility must derive from that evidence and use the exact registered tool
contract across every provider.**
