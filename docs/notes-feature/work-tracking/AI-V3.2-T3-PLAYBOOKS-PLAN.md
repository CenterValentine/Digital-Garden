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
   `[[wiki-link]]` extensions are traced on demand via the existing `read_note`
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
`[[refs]]`; phase level = shallowest heading).

### P2 — Marker + registry ✅ BUILT
`lib/domain/ai/playbooks/registry.ts` + `GET /api/content/playbooks`. Typecheck
clean (Prisma JSON-path query on `metadata.playbook = true`).

### P3 — `/playbook` picker + attach + client phase tracking
- **Composer command:** extend `commandItems`/command handling so `/playbook <q>`
  fetches `GET /api/content/playbooks` and lists them (name + description) in
  `ChatSuggestionMenu`. Integration points from recon:
  `use-conversation-engine.ts` (`commandItems` ~543, `handleSelect` in
  `ChatInput.tsx` ~285 — extend the existing `"mention"`-style attach branch,
  NOT the text-insert branch).
- **Attach:** on select, set client state `{ activePlaybookId, activePlaybookTitle,
  activePhaseIndex: 0 }` and show a small **playbook chip** in the composer
  (dismissable). Do NOT reuse `@`-mentions (people).
- **Phase tracking (client):** `activePhaseIndex` starts 0; **+1 when a
  `phase_checkpoint` is approved** (the checkpoint UI already exists — increment
  there). Send `{ playbookId, activePhaseIndex }` in the request body
  (`use-conversation-engine.ts` send, ~1023-1034).
- **Fallback if the slash integration is fiddly:** a footer **PlaybookPicker chip**
  (clone `ChatContextPicker.tsx`, mount in `ChatPanel.tsx` `footerLeading` ~846).
  Same body plumbing. Pick this if `/playbook` costs >~1 build cycle.

### P4 — Progressive-disclosure injection (the load-bearing edit)
- **`app/api/ai/chat/route.ts`** (~601-654): if `body.playbookId`, fetch that note
  (`notePayload: { tiptapJson, metadata }`), `parsePlaybook`, clamp
  `activePhaseIndex` to `[0, phases.length-1]`, and build a **`playbookContext`**
  string = standing rules + the active phase (rendered to markdown **preserving
  `[[links]]`** — use the export `MarkdownConverter` (`case "wikiLink"`), NOT the
  crude converter) + a **"Linked extensions"** manifest listing the phase's
  `[[refs]]` (title → note id via a title lookup) with an instruction to
  `read_note` them on demand. Inject as its own section (distinct from generic
  `mentionedContext`), so eviction can "never drop playbook."
- **System prompt** (`system-prompt.ts` ~152 checkpoint paragraph + a new
  `playbookContext` slot ~182): tell the model "only the current phase is loaded;
  advance with `phase_checkpoint`; trace `[[extensions]]` via `read_note`."
- **Token meter:** unchanged — it already reports per-phase tokens; the shrunk
  context is the visible proof. **Gate met here.**

### P5 — Hand-author mark action + minimal SKILL.md import
- **Mark as Playbook (hand-author, PRIMARY):** a note action (context menu /
  command) → prompt for a one-line description → PATCH `metadata` via
  `withPlaybookMetadata`. The note's `##` sections are already phases. This is
  what makes P3's picker have content and satisfies the owner's first use case.
- **Import (future-proofing):** an "Import Skill" affordance (paste a `SKILL.md`,
  or upload `.md`) → `detectAdapter → parse` → create a marked playbook note.
  Adapter-based (§2), so fabric/MCP land later as append-only adapters.

## 4. Gates
`pnpm typecheck` / `pnpm lint` / `pnpm build`. Unit: `parsePlaybook` +
`skillMdAdapter.parse` round-trip (tsx probe → promote to a check if time). In-app
smoke: mark a note as a playbook → `/playbook` it → confirm only the active phase
is in context (token meter) → approve a checkpoint → next phase loads → a
`[[reference]]` is read via `read_note`.

## 5. Sequencing for budget efficiency
P3 → P4 gets the **gate** (start-from-registry + per-phase disclosure). P5's
**mark action** is required for the demo (playbooks must exist) — build it with P3.
P5's **import** is the future-proofing bonus — build last; safe to defer if budget
runs short (the adapter abstraction is already specified, so it's append-only).
Backlog adapters are documented, not built.
