# Chat Outputs & References — enhancement plan

**Origin:** surfaced testing AI v3.2 T3 playbooks (2026-07-22). A folder-hosted
playbook wasn't discoverable, bot output landed loose in a folder instead of
under the chat, and there was no move/lock story for generated content.

**Branch/worktree:** continues on `feature/ai-v3.2-t3-playbooks` (`ai-v32-t3`)
unless split out. Related: `AI-V3.2-T3-PLAYBOOKS-PLAN.md`,
`guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md`.

## 0. The key realization (recon, 2026-07-22)

The "referenced content nested under a chat" model **already exists** in the
schema — this is mostly policy + wiring, not new architecture:

- **`ContentNode.role: ContentRole`** = `primary | referenced | system`
  (`prisma/schema.prisma:120`). `referenced` = "hidden by default (toggle to
  show) — embedded/linked content." This IS the reference badge/status.
- **`ContentNode.ownedByNoteId`** self-relation (`schema.prisma:135,160`,
  `@relation("ContentOwnedByNote")`) = *what a node is nested under*. This is the
  nesting spine.
- **Folders can already carry a `notePayload`** — `notePayload NotePayload?` sits
  on `ContentNode` with no `contentType` constraint (`schema.prisma:142`); the
  folder "Notes" editor writes it.

### What's actually missing (the gaps)
| Area | Current state | Gap |
|---|---|---|
| Folder playbooks | folders can hold notes | 4 guards hard-code `contentType:"note"`: `playbooks/registry.ts:55`, `playbooks/mark/route.ts:43`, `tools/registry.ts:456` (read_note), and `parse` reads a note's json only |
| Bot output nesting | `createNote`/`create_docx` set only `parentId` (`tools/registry.ts:561-582`) | never set `role:"referenced"` or `ownedByNoteId` → output lands as a *primary* node in the folder, not a referenced child of the chat |
| Move lock | move endpoint reconciles referenced moves (`move/route.ts:103-289`); no drag lock found in file-tree | there is **no lock** — referenced content moves freely today |
| Bot-vs-pulled marker | — | nothing distinguishes bot-generated from user-pulled references (the axis the whole move/lock rule turns on) |
| Duplicate | `duplicateNode` copies neither `role` nor `ownedByNoteId` (`duplicate/route.ts:148-180`) → duplicate is a plain primary copy | **matches the decision below — no change needed** |
| Output-target UI | `TargetFolderChip` sets `conversation.targetFolderId` (`TargetFolderChip.tsx`) | need a second affordance for the output *owner*; reword the folder chip |

## 1. Decisions (locked with owner 2026-07-22)

1. **Movability (REFINED 2026-07-22 — the lock axis changed):** the lock is about
   **reference integrity of content EMBEDDED within a note/chat body** — an image
   (or file/embed) that a note's rich text points at is **locked to that note**:
   it cascade-moves *with* its owner and can't be dragged out independently. This
   holds regardless of who created the container — a bot-generated document that
   embeds an image locks that image to the document too. **Standalone bot
   artifacts** (a whole note/docx/link the bot produces as a distinct item) are
   NOT caught by this lock — they stay user-movable. So the lock axis is *"is this
   an embedded reference inside its owner's content?"*, **not** bot-vs-pulled
   provenance. Owner: *"it's really all about what note content references (an
   image, etc.); anything else, locking isn't as significant."*
2. **Duplicate semantics:** *plain independent copy* — a duplicate becomes a
   normal `primary` node with no reference status (today's behavior). This is how
   you relocate a locked pulled-in reference. **Supersedes** the brain-dump's
   "retain reference status."
3. **Two affordances (from the owner's spec):**
   - *Operating context* — the existing folder chip: where the chat lives/works.
     Reword tooltip to say it overrides the default file the chat operates in.
   - *Output target (owner)* — NEW: where generated content lands **by default**.
     Default = **the chat itself** (`ownedByNoteId = chat node`). Only a default —
     the bot still places dynamically wherever the user specifies, and may always
     override. Tooltip: "default landing spot when you don't specify."
4. **Folder content is a legitimate playbook source.** A folder you're viewing
   that carries playbook notes should resolve as "this playbook."

## 2. Workstreams

### WS1 — Legitimize folder playbooks ✅ BUILT (Sonnet, 2026-07-22)
- Relaxed the four `contentType:"note"` guards to `{ in: ["note", "folder"] }`:
  `playbooks/registry.ts` (list query), `playbooks/mark/route.ts` (mark — also
  switched `notePayload.update` → `upsert`, since a folder's notePayload is
  created lazily by its Notes editor and may not have a row yet),
  `tools/registry.ts` `getCurrentNote`/read_note, and the playbook-context fetch
  in `app/api/ai/chat/route.ts`. `parsePlaybook` confirmed payload-agnostic — no
  change needed (pure `JSONContent` in, no contentType assumptions).
- **Active-context resolution ✅ BUILT:** `route.ts`'s playbook fetch now falls
  back `body.playbookId ?? contentId` — if the client didn't explicitly attach a
  playbook but the user is chatting FROM a note/folder that's itself marked as
  one, it resolves as the playbook. Harmless no-op when `contentId` isn't a
  playbook (same `isPlaybookMetadata` guard as an invalid id). This is the direct
  fix for "it couldn't figure out to look at the content I am actively looking
  at."
- **Mark-as-Playbook reachable from folder Notes editor ✅ VERIFIED, no code
  needed:** the folder Notes editor is the same `MarkdownEditor` component (same
  `editorInstanceStore` registration, same `onContextMenu` → "main-editor"
  provider) used everywhere else — "Mark as Playbook" already fires there for
  free.

### WS2 — Reference-integrity lock ✅ ALREADY IMPLEMENTED (verified 2026-07-22, no code needed)
Recon (Sonnet) found this is a complete, existing system — not a gap:
- **Signal:** `ContentLink` rows (`linkType: "image-ref" | "audio-ref"`,
  `lib/domain/content/image-refs.ts`) maintained by `syncImageReferences`, called
  generically from the content PATCH route (`app/api/content/content/[id]/
  route.ts:970`) for ANY notePayload save — note, folder-notes, or chat-notes
  alike. This IS the "embedded in a body" signal; no new marker needed.
- **Cascade-with-owner:** `move/route.ts:268` ("Sprint 37: Cascade move for
  referenced images") already moves embedded media's `parentId` when its owning
  note moves.
- **Lock (visual, non-breaking):** dragging an embedded reference out
  independently is NOT rejected outright — the drop lands, the server updates
  storage `parentId`, but the tree's ownership resolution
  (`tree/route.ts:273-311`, two-tier: explicit `ownedByNoteId` then the
  `ContentLink` embed-graph) always re-derives display parentage from the live
  embed edge. `move/route.ts:241-258` detects this case and returns
  `stillReferencedBy: {id, title}`; the client
  (`LeftSidebarContent.tsx:889-901`) lets the drop land visibly, waits 2.5s,
  refetches the tree (snapping it back), and shows
  `toast.warning("Unable to move referenced content", { description: 'This
  content is still embedded in "<owner>"' })`. This is precisely "locked to
  maintain reference integrity, visually — the reference doesn't break in our
  architecture" (owner's words) — already built, with thoughtful UX (no
  "remove the embed to move it freely" advice, since removing the last embed
  ref-count-triggers trash, which isn't "freeing" it).
- **NOT locked:** standalone bot artifacts (WS3) and everything outside
  note/chat-embedded references — untouched by this system, exactly as scoped.
- **Duplicate:** no change — already produces a plain primary copy (decision #2).

### WS3 — Output ownership (bot output nests under the chat) ✅ BUILT (Sonnet, 2026-07-22)
- `createNote` and `create_docx` now set `role:"referenced"` + `ownedByNoteId =
  ctx.outputOwnerId` **when** the model didn't pass an explicit `parentId` (the
  only signal that counts as "the user named a destination" — matches each tool's
  own description). `createDocxDocument` (`lib/domain/ai/documents.ts`) gained
  optional `role`/`ownedByNoteId` fields on `CreateDocxInput`, applied to the
  `contentNode.create` call. Storage `parentId` is UNCHANGED either way (still
  `targetFolderId` / chat's-own-parent-folder fallback) — only the
  reference/ownership tagging is new. These are standalone artifacts: nested
  under the chat but user-movable (WS2's embedded-in-body lock does not apply to
  a whole artifact, only to media embedded *inside* one).
- **Output-owner resolution ✅ RESOLVED (sub-decision #2):** new `ToolExecuteContext.outputOwnerId`
  (`lib/domain/ai/tools/types.ts`), computed in `route.ts` as `isChatContent ?
  contentId : archivedChatNodeId` — full-page chat owns as itself; a sidebar chat
  owns as its `conversation.archivedToContentNode.id` IF the conversation has
  been archived/saved to the tree. A transient/unsaved sidebar chat has no node
  to own under, so `outputOwnerId` is `undefined` and output falls back to
  today's plain-primary-in-folder placement — no chat materialization needed, no
  new machinery. Reused the existing `archivedToContentNode` relation already
  fetched for `targetFolderId` (just added `id: true` to its select) — zero new
  queries.
- **Explicit destination wins:** confirmed — an explicit `parentId` skips the
  referenced-owner tagging entirely (plain primary node in that folder, exactly
  today's pre-WS3 behavior).
- **Tool descriptions updated** (`createNote`, `create_docx`, `updateNote`): each
  now states "do NOT act on your own initiative" + the explicit-destination rule,
  in the tool's own contract (not just the system prompt).

### WS4 — The two affordances (UI) — PARTIAL (Sonnet, 2026-07-22)
- `TargetFolderChip` tooltip + header comment reworded to "operating context"
  framing ✅ BUILT — makes clear this chip governs input filing / storage
  fallback, NOT whether output nests as a reference under the chat (that's WS3,
  independent of this chip).
- **New OutputTargetChip — NOT built.** Requires resolving sub-decision #3 (a new
  persisted field, e.g. `conversation.outputOwnerId`) — a schema/migration
  decision. Per this repo's convention (`prisma/` changes are migration-first and
  owner-reviewed, not something an agent should unilaterally decide), this is left
  for explicit owner sign-off rather than built speculatively. WS3's default
  (chat-as-owner) works correctly without it — the new chip would only add a way
  to REDIRECT that default without repeating a destination in every message.

### WS5 — Prompt + tool contract ✅ BUILT (Sonnet, 2026-07-22)
- **Don't act unsolicited:** new unconditional `system-prompt.ts` section
  ("Content targeting: never write to a note (updateNote) or create output
  (createNote/create_docx) on your own initiative...") plus matching lines added
  directly to the `updateNote`/`createNote`/`create_docx` tool descriptions —
  belt-and-suspenders (prompt-level + tool-contract-level).
- **Write-to-note vs. output content:** stated as "no default rule — read what the
  user asked for" per the owner's own framing; not prescribed further.
- **Targeting conventions:** documented in both the system prompt and the three
  tool descriptions — explicit destination always wins, otherwise the tool's own
  default applies (chat-referenced-child for output tools).

## 3. Sequencing — as actually executed
WS1 → **WS2 (verified already built, no code)** → WS3 → WS5 (tool descriptions +
prompt, built alongside WS3 since they're one contract) → WS4 (tooltip only; new
chip deferred to a schema decision).

## 4. Open sub-decisions
1. **The "embedded in a body" signal — RESOLVED, no new marker needed.** It's the
   existing `ContentLink` graph (`image-ref`/`audio-ref`, `image-refs.ts`),
   already synced generically for every notePayload save (note/folder/chat
   alike). See WS2.
2. **Sidebar-chat ownership — RESOLVED.** Uses `conversation.archivedToContentNode`
   when present; `undefined` (graceful fallback, no materialization) otherwise.
   See WS3.
3. **Output-owner persistence — OPEN, deferred.** A new `conversation.outputOwnerId`
   field (migration) needed for WS4's redirect-without-repeating-yourself chip.
   Requires an explicit schema decision — flagged for owner/Opus review, not
   built.
4. **Move-lock UX — RESOLVED, pre-existing.** Already a toast
   ("Unable to move referenced content… still embedded in X"), not a silent
   no-op. See WS2.

## 5. Post-review fixes (Opus review of `bcb4b78`, 2026-07-22)

**Finding 1 (critical) — bot deliverables were invisible in the tree.** WS3 tags
output `role:"referenced"`, but the tree fetch excludes ALL referenced content
unless the global "show referenced" toggle is on (default off), with no
owner-scoped reveal — so "make me a resume" produced a file that vanished from
the tree (only `hiddenReferencedCount` incremented). **Fixed** in
`app/api/content/content/tree/route.ts`: when the toggle is off, the fetch now
`OR`s in referenced nodes whose **owner is a chat** (`ownedByNote: { contentType:
"chat" }`) — i.e. WS3 deliverables — so they show under their chat by default,
while embedded media (referenced, owned via the embed graph / by a NOTE, no
chat owner) stays hidden until toggled (that's why it's hidden — a note with 10
images shouldn't spray 10 tree children). `hiddenReferencedCount` adjusted to
exclude the now-shown deliverables. The distinction is clean because WS3
deliverables get an EXPLICIT `ownedByNoteId = chat`, whereas embedded media
never does.

**Finding 2 (medium) — ambient playbook hijacked every turn.** The WS1
`playbookId ?? contentId` fallback meant any chat anchored on a playbook-marked
note/folder injected the full playbook + flipped the checkpoint cadence on EVERY
message. **Fixed** in `route.ts` + `system-prompt.ts`: split explicit vs
ambient. Explicit `/playbook` attach keeps full progressive disclosure. Ambient
(chatting from a playbook-marked note) now only adds a one-line **awareness**
hint (`playbookAwareness`) — "the content you're in is a playbook; run it only
if asked; read_note id X to follow it" — which does NOT inject phase detail or
change the cadence. Still fixes the original "couldn't see what I'm viewing"
complaint (the model gets the id + knows it's runnable) without hijacking casual
chat.

**Still to smoke-test (needs auth fixture — not automatable here):** confirm the
file-tree UI renders a chat node as an expandable parent showing its deliverable
children (the data layer is correct; the UI affordance is unverified).

## 6. Side-chat foundation + output-target chip (owner testing, 2026-07-22)

Testing in a SIDE chat surfaced the real gap: **a sidebar chat is a
`Conversation`, not a `ContentNode`** (`createConversation` — no tree node
unless "opened in page"). So WS3's "outputs nest under the chat" **can't work
in a side chat** — `outputOwnerId` resolves to `archivedChatNodeId`, which is
null. This is the foundation the owner is asking for. Migration-free; the
materialization primitive already exists.

### WS6 — Side chats are referenced ContentNodes under their origin
- **Materialize:** extend `ensureConversationContentNode`
  (`lib/features/conversations/service.ts:491` — already creates a
  `contentType:"chat"` node with an empty payload shell + links
  `archivedToContentNodeId`) to accept an owner: set `role:"referenced"` +
  `ownedByNoteId = originContentId` + `parentId = origin's folder`.
- **Trigger:** `createConversation` gains `originContentNodeId?`; the sidebar
  POST (`ChatPanel.tsx:421`) passes the panel's `contentId`. So every side chat
  bound to content materializes as a referenced chat node under it.
- **Tree visibility:** extend the Finding-1 fetch to also surface referenced
  nodes that ARE chats (`contentType:"chat"`), not only chat-OWNED deliverables
  — so the side chat itself shows nested under its origin.
- **Output ownership:** now works for side chats for free — `outputOwnerId`
  resolves to the materialized chat node (WS3, unchanged).
- **Cascade delete (app-level, no FK migration):** in the content DELETE
  handler, soft-delete a node's owned chats (`ownedByNoteId` children of
  `contentType:"chat"`) + their `Conversation`s (`softDeleteConversation`) +
  those chats' owned outputs; deleting a chat soft-deletes its owned outputs.

### WS7 — Output-target chip (the affordance next to the folder chip)
Migration-free: the selection rides per-turn in the send body (like
`playbookId`/`activeContextId`) + persists client-side (localStorage per
conversation) — no `Conversation` column. Options: **this chat** (owner = chat
node), **next to this chat** (owner = origin, sibling reference), **origin's
folder** (primary in the origin's parent), **a folder/file…** (pick any).
Route reads `body.outputTarget` → resolves `ctx.outputOwnerId` + storage
parent. Default when the user says nothing to the bot = whatever the chip is
set to (default: this chat).

**One model decision for the owner:** materialize the chat node **eagerly**
(every side chat that binds to content becomes a tree node — matches "every
side-chat should appear," but a throwaway 2-message chat also leaves a node) vs
**lazily** (materialize on first output OR first real turn — less tree clutter).
Owner's words say eager; flagged because it's a visible product tradeoff.
