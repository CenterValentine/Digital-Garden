---
title: AI Authorship Signal — one provenance stamp for every AI write, and a view the user can switch
status: 🔭 PLANNED (preparatory PR for MCP-DATABASE-REACH-PLAN; design of record)
created: 2026-10-12
last_updated: 2026-10-12
owner: davidvalentine
prepares: MCP-DATABASE-REACH-PLAN.md
---

# AI Authorship Signal

**Status: 🔭 Planned.** The owner's direction (2026-10-12): every piece of content the assistant
helped produce should say so to the user, whatever its type, with a highlight view that can be
switched on and off. Not for published pages yet. An earlier implementation was believed lost or
never integrated; this plan records what the audit found and what is left to build, so the MCP
server's writes carry the same signal as chat's from their first day.

---

## 1. What exists today (audit, 2026-10-12)

The signal exists, and it is wired end to end **for one path only**: edits that run through an
open editor.

| Layer | Where | State |
|---|---|---|
| Mark | `lib/domain/editor/extensions/ai-highlight.ts` — mark `aiHighlight`, attr `source` (default `"ai"`), renders `<span class="ai-highlight" data-source="ai">`; commands `setAiHighlight` / `unsetAiHighlight` | shipped (Epoch 10, PR #18) |
| Registration | client, server and collaboration extension sets; `schema-version.ts` | shipped |
| Stamping | `lib/domain/editor/ai/edit-orchestrator.ts` `applyAiHighlight(editor, from, to)` on apply-diff, replace-document, insert-block, append-to-document, update-block | shipped, **client only** |
| Image provenance | `source: "ai-generated"` attr on image nodes; "AI" badge in `ImageBubbleMenu.tsx` | shipped, separate mechanism |
| CSS | `app/globals.css` `.ProseMirror .ai-highlight` (indigo tint) and `.ai-highlight-hidden .ProseMirror .ai-highlight` | shipped |
| Setting | `ai.showAiHighlight` (default on) in `lib/features/settings/validation.ts`; switch in `components/settings/AISettingsPage.tsx` "Show AI content highlights" | shipped, global |
| Applied | `components/content/editor/MarkdownEditor.tsx` adds `ai-highlight-hidden` to the wrapper when the setting is off | shipped |

**Gaps.** These are why the signal feels absent:

1. **Server-side AI writes never stamp it.** `create_note`, `update_note`, `create_docx`,
   reply-to-note, run ledgers, quests, charters, workflow documents and studio runs all write
   through `writeNoteContent` or Prisma without touching the mark. Only edits made while the note
   is open in the user's editor are highlighted, which is a minority of what the assistant writes.
2. **`update_note` wipes existing marks.** It re-parses markdown through `markdownToTiptapResult`,
   and `markdown.ts` has no codec for `aiHighlight`, so a replace drops every mark already in the
   note. The serializer that is lossless for blocks is lossy for this one mark.
3. **Nothing at the node, row or file level.** `ContentNode`, `NotePayload` and `DataRow` carry
   no AI provenance. `DataRow.createdBy` is the user's id even when the assistant inserted the
   row. The only per-record AI provenance is on AI-owned sidecars (`DataRowDigest`,
   `AgenticMetadata`), which are not user content.
4. **The toggle is global only.** No per-note or per-view control in the toolbar.
5. **Not visible outside the editor.** Published pages output the span unstyled (fine for now,
   per the owner), exports drop it, the file tree and headers show nothing.

Git history holds no abandoned attempt: no branch, commit or deleted file matches provenance,
authorship or ai-mark. The earlier implementation is this one; it shipped partially.

---

## 2. Design

Two layers, because two questions are being answered.

**Layer A, the inline mark: "which words did the AI write?"** Keep `aiHighlight` as is. Extend
its `source` attr vocabulary from `"ai"` to `"ai" | "ai:chat" | "ai:mcp" | "ai:workflow" |
"ai:studio"`, with `"ai"` kept for existing content. Stamp it on every server-side write, not only
the orchestrator's.

**Layer B, the node stamp: "did the AI touch this thing at all?"** A small provenance record on
the node, independent of content type, so a database row, an uploaded file, a code node or a
folder context can carry it even though they have no marks:

```
ContentNode.metadata.ai = {
  touchedAt: ISO,            // last AI write of any kind
  by: "chat" | "mcp" | "workflow" | "studio" | "charter",
  conversationId?: uuid,     // chat writes
  tokenId?: uuid,            // MCP writes
  count: number,             // AI writes over the node's life
}
DataRow.data["__ai"] = { touchedAt, by, count }     // rows are not nodes (see §4)
```

Why metadata rather than columns: `ContentNode.metadata` is already a merge-preserved JSON bag
(`writeNoteContent` keeps unrelated keys), the stamp is additive, and no migration is needed for
nodes. Rows get a reserved key in `data` for the same reason; `__ai` is outside the column-key
namespace (`DataColumn.key` is a short id), and `cellToText`/`deriveRowSearchText` skip keys
with that prefix so it never leaks into search or CSV.

**One stamping seam per write path.** The stamp is written by the write service, never by the
caller:

| Write path | Seam | Stamps |
|---|---|---|
| notes | `writeNoteContent` gains `actor: { kind: "ai", by, conversationId?, tokenId? } \| { kind: "user" }` | A (marks on the written range) + B |
| note create | the create-document service, same `actor` | A + B |
| rows | `createRows` / `writeCells` gain `actor` | B |
| files | the simple-upload service gains `actor` | B |
| folders | `create_folder`'s service gains `actor` | B |
| AI context | the `AgenticMetadata` writer already records `model` / `generatedAt` | already B-equivalent |

Every AI caller (chat tools, charters, quests, ledgers, workflows, studio, reply-to-note, and the
MCP server when it lands) passes `actor`. A gate scans the AI write sites and fails if one calls
a write service without it.

**Markdown round trip.** Add an `aiHighlight` codec to `lib/domain/content/markdown-block-codecs.ts`
so the mark survives `tiptapToMarkdown` → `markdownToTiptapResult`. Syntax: a span with a
data attribute is the lossless system's existing escape for marks it cannot express, so
`<span data-ai="chat">…</span>` round-trips without inventing syntax; `pnpm markdown:blocks:check`
pins it. With this in place `update_note` in `append` mode stamps only the new blocks and
`replace` preserves old marks and stamps the changed range.

**The view (owner direction, 2026-10-12).** Two layers, not three, so the user never has to
reason about precedence:

1. **The default lives under Settings → Editor**, not Settings → AI. The existing key
   `ai.showAiHighlight` moves to `editor.showAiHighlight` with a settings-store version bump that
   carries the old value forward (four registrations, per the settings convention). It is the
   value a document uses when it has no override.
2. **The note toolbar toggle is the per-document override, and the rail shows the same value.**
   The toggle in `ContentToolbar` (a generalizable tool, so it belongs there per the toolbar rule)
   writes `metadata.ai.showHighlights: true | false` on the node through the content PATCH, which
   is merge-preserved. The AI context view in the right rail shows the same three-state control,
   Inherit / Show / Hide, with "Inherit" clearing the key. Toolbar and rail are one setting seen
   from two places, never two settings. Resolution in `MarkdownEditor` is one line:
   `node.metadata.ai?.showHighlights ?? settings.editor.showAiHighlight`.

   **How hard a per-document override is:** small. One metadata key, the PATCH the content
   route already serves, a three-state control in the rail's AI context view, and the one-line
   resolution. Under a day on top of the toolbar toggle, and no schema change, because
   `ContentNode.metadata` is a merge-preserved bag.
3. A node badge: a small "AI" dot on the file-tree row, the tab and the content header when
   `metadata.ai` exists, with the `by` and date on hover. Rows get the same dot in the grid's row
   gutter when `__ai` exists. Published pages: nothing yet, as directed.

**Off means off, including on copy.** When highlights are hidden for a document, no stamping
appears anywhere the content goes: the editor adds `ai-highlight-hidden`, and the clipboard
extension (`lib/domain/editor/extensions/clipboard.ts`, which today does not handle the mark)
strips `aiHighlight` from copied slices, so a paste into another note, an email or a document
carries no span. Two rules make this predictable:

- **External clipboard never carries the mark**, on or off. The HTML and text written to the
  system clipboard are stripped of `aiHighlight` always; a highlight is a reading aid inside the
  garden, not a watermark on text that leaves it. This closes the "strip on external copy" item
  the docs list as deferred.
- **In-garden paste keeps the mark only when the source document shows it.** Moving AI text
  between notes keeps its provenance when the user is looking at provenance, and drops it when
  they have turned it off for that document. The node stamp (layer B) on the *source* is
  unaffected by copying; on the *destination*, a user paste is a user write.

**Clearing.** A user edit inside a highlighted range removes the mark on the edited text (the
mark is already `inclusive: false`, so typing at its edge does not extend it). The node stamp is
never cleared automatically; "AI touched this once" stays true. A "Clear AI marks" action in the
same toolbar menu removes all marks in the note and is itself a user write.

---

## 3. MCP carries the same signal

This is the reason the plan is a prerequisite. Every MCP write tool in MCP-DATABASE-REACH-PLAN §2
calls the same services with `actor: { kind: "ai", by: "mcp", tokenId }`, so a note appended from
Claude Code is highlighted exactly like one appended from chat, and a row inserted from a Codex
session carries `__ai.by = "mcp"`. The token id in the stamp is what makes "which agent did this"
answerable later from the audit view on the settings page. Nothing in the MCP layer stamps
anything itself, which is the "MCP never talks to Prisma" rule applied to provenance.

---

## 4. Decisions

| # | Question | Recommendation |
|---|---|---|
| S1 | Stamp rows in `data["__ai"]` or add a `DataRow.aiTouchedAt` column? | The reserved key. No migration, and rows are read as a bag everywhere already; the search and CSV skips are two one-line guards. Revisit if a filter on "AI-written rows" is wanted in views. |
| S2 | Should a user's edit clear the inline mark on the edited text? | Yes. The mark answers "did the AI write these words"; once the user rewrote them, it did not. |
| S3 | Toolbar toggle: a session glance, or the per-document setting itself? | **The per-document setting itself**, persisted on the node and mirrored in the rail (owner direction 2026-10-12). One value, two places; no third layer. |
| S5 | Does the in-garden clipboard keep the mark? | Only when the source document shows highlights; the system clipboard never carries it. |
| S4 | Show the badge on published pages? | Not now (owner). The stamp is there when wanted; it is one CSS rule and one conditional. |

---

## 5. Build plan (one preparatory PR, before the MCP server)

1. `actor` parameter on `writeNoteContent`, the create-document service, `createRows`,
   `writeCells`, the upload service and the folder service; stamping inside each.
2. `aiHighlight` codec in the markdown system; `markdown:blocks:check` fixture.
3. Pass `actor` at every AI write site (list in §1 gap 1); gate `ai:provenance:check` scans
   those sites and the write services, mutation-tested at introduction.
4. Row stamp guards in `cellToText`, `deriveRowSearchText`, `exportDatabaseCsv`.
5. Settings move (`ai.showAiHighlight` → `editor.showAiHighlight`, store version bump, Editor
   settings page); toolbar toggle writing `metadata.ai.showHighlights`; the rail's three-state
   control on the AI context view; clipboard stripping; node badge (tree row, tab, header, grid
   gutter).
6. Docs: `ai-editor-behaviors.md` corrected (the deferred "strip on external copy" claim; the
   commented-out border), STATUS and this plan flipped.

Out of scope here: public-page styling, export of marks to DOCX/markdown files, back-filling
stamps on content written before the PR.

---

## 6. Gates

`pnpm typecheck`, `pnpm lint`, `pnpm build`; `markdown:blocks:check` with the new codec;
`ai:provenance:check` (new, in `build` and in `ai-drift.yml`), mutation-tested; `private:content:check`
unaffected; `collab:schema:check` unaffected (no new node or mark); browser smoke: chat `update_note`
on a closed note shows highlights when the note is opened; an `insert_rows` row shows the gutter dot;
the pane toggle hides highlights in one pane and not the other.
