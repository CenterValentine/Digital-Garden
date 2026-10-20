---
title: Comments & Annotations Plan
status: Phases 0–2 built 2026-10-16 on `feat/comments-annotations` (headless two-user smoke green; owner smoke + Hocuspocus redeploy pending); Phases 3–4 in BACKLOG.md
last_updated: 2026-10-15
owner: centervalentine
related:
  - lib/domain/editor/extensions/private-content.ts   (the mark + server-twin + seam pattern)
  - extensions/reader/components/MarkPopover.tsx       (the selection popover and color vocabulary to reuse)
  - extensions/reader/components/AnnotationsPanel.tsx  (the side-panel list to reuse)
  - lib/domain/editor/extensions/wiki-link-hover.tsx   (the hover-card plumbing to extract and share)
  - components/content/editor/BubbleMenu.tsx           (the entry surface)
  - docs/notes-feature/guides/editor/PRIVATE-CONTENT.md
  - docs/notes-feature/guides/editor/LOSSLESS-MARKDOWN-SYSTEM.md
---

# Comments & Annotations — talk about the text, in the text

**What this is.** Collaborators on a note (the owner and anyone holding a
`ViewGrant` on it) can select a passage, attach a comment thread to it, reply,
@mention each other, and resolve it. The passage is marked in the note so the
discussion stays attached through everyone's edits; the discussion itself lives
beside the note so it can be listed, counted, notified about and permissioned
without touching the document. Hovering a marked passage shows a hint; clicking
it opens the thread for editing; a **Comments** tab in the right-sidebar rail
lists every thread in document order.

**Vocabulary used throughout.** An *annotation* is the marked span in the text.
A *comment* is one message. A *thread* is the annotation plus its comments. A
*highlight* is an annotation with a color and no thread (reader-style; Phase 3).

Reference points: Google Docs (anchor-in-document, threads beside it, ⌘⌥M),
Notion (comments pinned to a block), the reader's `MarkPopover` + `AnnotationsPanel`
(this repo), CriticMarkup (the markdown convention for inline comments).

---

## 0. What exists, and what gets reused

The owner's note pointed at "formatting we use as a feature from the browser
extension." The Chrome extension (`extensions/browser-bookmarks/browser-extension/`)
has **no text-markup feature of its own** — it hover-outlines page elements
(`.dg-target-highlight`, `.dg-qc-highlight`) and anchors a note panel to a CSS
selector. The highlight/underline/note vocabulary the owner is thinking of is the
**Reader** module, which runs inside the side panel because the panel embeds the
whole app. That is the thing to reuse.

| Existing piece | Where | How this plan uses it |
|---|---|---|
| Mark + `Server*` twin, faithful rendering, ONE strip predicate at each egress seam | `private-content.ts`, `lib/domain/content/private-content.ts`, `scripts/validate-private-content.ts` | The `comment` mark copies this shape exactly. A sibling predicate `stripCommentMarks` is called at the markdown/HTML seams (§4.3). |
| Selection toolbelt with per-mark active state from one `nodesBetween` sweep | `BubbleMenu.tsx` `getSelectionFormattingState` | One new field (`comments: CommentSegment[]`) in the sweep, one entry in each of the icon / command / active / title maps. Same recognition logic as bold. |
| Link editor row under the toolbelt buttons (input + ✓ + ✕, `preventFocusLoss`) | `BubbleMenu.tsx` `linkEditorTarget` | The comment composer is the same second row with a textarea. |
| Five-color highlight/underline palette, light and dark tones, swatch chips | `extensions/reader/lib/marks.ts`, `READER_HIGHLIGHT_COLORS` | Phase 3 highlights reuse the palette and the swatch row from `MarkPopover` verbatim; the palette moves to `lib/domain/content/mark-palette.ts` so both import one module. |
| Hover plugin: delegated mouseover, 350 ms show / 220 ms hide, one tippy instance per editor, dismissal on outside mousedown / keydown / scroll | `wiki-link-hover.tsx` | Extracted into `lib/domain/editor/hover-card.ts`; the wiki-link hover and the comment hover both consume it (§5.3). No second hover implementation. |
| Side-panel list card: quote with colored left bar, body, hover-revealed actions, inline edit, "go to" | `AnnotationsPanel.tsx`, `MarkQuote` | The `ThreadCard` component borrows the card layout and the quote treatment; the reader is not changed. |
| Sidebar tab registration (registry entry + tab key union + icon/title maps + content switch) | `registry.ts`, `RightSidebarHeader.tsx`, `RightSidebarContent.tsx`, `right-sidebar-state-store.ts` | A `comments` tab, order 25, directly after Context (links · tags · AI). |
| Programmatic "jump to sidebar" | `extensions/reader/lib/sidebar.ts` `revealReaderSidebar` | Generalised into `revealRightSidebarTab(contentId, tab)` in `state/right-sidebar-state-store.ts`; the reader's helper calls it. |
| Link anchors `[[Title#…]]` with pluggable kinds | `lib/domain/content/link-anchor.ts`, `state/content-anchor-store.ts` | New core kind `comment:<threadId>` (like `column`), so a thread can be linked from any note and a notification can deep-link to it. |
| Notification kinds (string-keyed Zod registry, collapsible per key, polling transport) | `lib/domain/notifications/kinds.ts` | `comment.new` / `comment.reply` / `comment.mention` / `comment.resolved`, collapsed per thread. |
| Content access ladder (owner / edit / view via `ViewGrant`) | `lib/domain/collaboration/access.ts` | Every comments route resolves access with it. View-level access can read and reply (§6). |
| Write THROUGH the Y.Doc from the server | `lib/domain/content/write-note-content.ts`, Hocuspocus `/internal/apply` | Phase 4: lets a view-only collaborator anchor a comment without a writable editor. |
| Editor instance registry | `state/editor-instance-store.ts` | The Comments tab asks `getEditor(contentId)` for mark positions and scroll-to. |
| Optimistic-until-the-server-agrees, roll back on failure | flashcard selection mark, link editor | Thread id minted client-side; mark applied immediately; POST; removed on failure with a toast. |

**Why not a library.** TipTap's Comments extension is Pro (paid, closed). The
open-source `@sereneinserenade/tiptap-comment-extension` is a ~100-line mark
with no server twin, no attr spec, and none of the seam/markdown plumbing this
repo requires; adopting it would still mean writing everything below except the
`Mark.create` call. The mark itself is the cheapest part, so it is written in
the house pattern. The markdown form **does** adopt a standard: CriticMarkup
(§4.2), which Obsidian plugins, iA Writer, Ulysses and Marked already read.

---

## 1. The user's experience

### 1.1 Create

1. Select text in a note → the toolbelt appears → a **Comment** button sits in the
   link group (beside Link). Keyboard: **⌘⌥M** (Google Docs' chord; nothing in
   this repo binds it, and Chrome's ⌘⇧M profile switcher is avoided). Context
   menu: **Comment on selection** (the keyboard- and touch-reachable copy, the
   "Display as" precedent).
2. Pressing it does **not** write to the document yet. The selection gets a
   *provisional* decoration (dashed amber underline) and the toolbelt grows its
   second row — the same row the link editor uses — holding a one-line-that-grows
   textarea, **Comment** and **✕**. Enter posts; Shift+Enter is a newline; Esc
   cancels and the provisional decoration disappears. The decoration is a
   ProseMirror decoration, so it maps across collaborators' edits while the
   user types.
3. On post: a thread id is minted client-side, the `comment` mark is applied to
   the (mapped) range, and `POST /api/content/comments/:contentId` creates the
   thread with its first comment. Failure removes the mark and shows a toast.
   Collaborators see the mark arrive through Y.js and fetch the thread (§7).

On a phone the toolbelt already sits below the selection; the composer row
appears there too. If the keyboard would cover it, the composer instead opens in
the Comments drawer (§1.4) with the provisional decoration still showing.

### 1.2 See

A commented passage is marked **lightly**: a translucent gold fill at ~12 % and
a 2 px gold underline, nothing that competes with the text. Hover deepens the
fill; the thread being viewed gets the full fill and a 1 px ring. Resolved
threads have no decoration unless "Show resolved" is on. Overlapping threads
stack their fills (two × 12 %), which reads naturally as "more than one".

### 1.3 Hint, then edit

- **Hover** (mouse only, 350 ms): a compact card above the passage — avatar
  initial + name · relative time · the latest comment clamped to two lines ·
  "3 replies" · a ✓ **Resolve** button. ≤ 280 px wide, `top-start`, 6 px offset:
  the same geometry as the link-view chooser, so it never covers the line it
  describes. It is read-only; moving onto it keeps it open, moving away hides it.
- **Click / tap**: the same card expands in place into the **thread**: every
  comment, a reply composer focused and ready, Resolve, and an "Open in sidebar"
  link that jumps to the Comments tab. ≤ 320 px, dismissed by Esc, outside
  click or scroll. The passage gets the active ring while it is open. On a
  coarse pointer there is no hover; a tap opens the thread in the Comments
  drawer instead (a popover under a software keyboard is unusable).

The hover card, the click popover and the sidebar row are **one component**,
`ThreadCard`, in `collapsed` / `expanded` / `list` modes. One place to style,
one place to fix.

### 1.4 The Comments tab

A new rail icon after Context. The tab lists threads in **document order**
(positions come from the live editor's marks), filtered **Open · Resolved ·
All**, with an unresolved count in the rail badge. Each row is a `ThreadCard`
in list mode: quote (gold left bar, two lines), author · time, latest comment,
reply count, hover-revealed Resolve / Delete. Clicking the quote scrolls the
editor to the mark and flashes it (the outline's `scroll-to-heading` pattern,
addressed to the editor instance). Threads whose mark no longer exists are
grouped at the bottom under **Original text removed**, with *Re-anchor to
selection* and *Delete*. A **Comment on note** composer at the top creates an
unanchored thread (a thread with no mark) for remarks about the whole note.

On mobile the tab is reached through the existing right `MobileDrawer`.

### 1.5 Reply, edit, resolve, delete

Reply from the popover or the tab. Authors edit or delete their own comments
(a deleted comment with replies becomes a "Comment deleted" placeholder so the
thread stays readable). Anyone who can comment may resolve or reopen; the note
owner may delete any thread. Resolving keeps the mark in the document (the
decoration goes quiet) so reopening restores the anchor; deleting a thread
removes its mark through the editor.

### 1.6 Mentions and notifications

`@` in a composer suggests the note's collaborators (owner + grantees) by
username. A new thread notifies the other collaborators; a reply notifies the
thread's participants; a mention notifies the mentioned user; a resolve notifies
the thread author. Notifications coalesce per thread and open the note with the
`comment:<threadId>` anchor, which scrolls to and opens the thread.

---

## 2. Architecture

```
          ┌──────────── document (Y.Doc, CRDT) ─────────────┐
          │  …text <comment threadId="t1">passage</comment>… │   ← the ANCHOR
          └──────────────────────────────────────────────────┘
                              │ threadId
          ┌──────────── Postgres (beside the note) ──────────┐
          │  CommentThread t1 { contentId, anchor quote,     │   ← the DISCUSSION
          │     resolvedAt } ── Comment* { author, body }    │
          └──────────────────────────────────────────────────┘
```

**The anchor lives in the document; the discussion lives beside it.** The
reader keeps annotations entirely beside the text because the text is not the
user's to edit. A note is edited by everyone in the thread, so the only anchor
that survives concurrent edits is one inside the CRDT: a mark. Everything else
— who said what, when, resolved or not, who is mentioned — is relational data
that wants listing, counting, permissions and notifications, and must not bloat
or churn the document. Resolution is therefore a row flag, rendered as a
decoration, never a mark attribute.

Three consequences shape the rest:

- A mark with attributes has to clear every seam a mark clears in this repo
  (§4): registration in three extension sets, a schema bump, the lossless
  markdown round trip, the egress strips, the Hocuspocus redeploy.
- The editor is the source of truth for *where* a thread is; the server is the
  source of truth for *what* it says. The Comments tab joins the two through
  `state/editor-instance-store.ts`.
- A mark can outlive its thread (thread deleted while an editor was closed) and
  a thread can outlive its mark (passage deleted, or ⌘Z after commenting). Both
  are handled, neither is an error (§7.3).

---

## 3. Data model

```prisma
/// A comment thread anchored to a passage of a note (the `comment` mark whose
/// threadId is this row's id) or to the note as a whole (no mark). Threads are
/// visible to everyone who can view the note; the document anchor is in the
/// Y.Doc, this row holds the discussion.
model CommentThread {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId    String    @db.Uuid
  createdById  String    @db.Uuid
  // { quote, before, after } captured at creation — shown when the mark is
  // gone, and the re-anchoring hint. Null for a note-level thread.
  anchor       Json?
  resolvedAt   DateTime? @db.Timestamptz(6)
  resolvedById String?   @db.Uuid
  createdAt    DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime  @updatedAt @db.Timestamptz(6)
  content      ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  createdBy    User        @relation("CommentThreadsCreated", fields: [createdById], references: [id], onDelete: Cascade)
  comments     Comment[]

  @@index([contentId, resolvedAt])
}

model Comment {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threadId  String    @db.Uuid
  authorId  String    @db.Uuid
  body      String    // plain text, ≤ 10 000 chars; @mentions as @username
  mentions  Json      @default("[]")   // userIds resolved at write time
  editedAt  DateTime? @db.Timestamptz(6)
  deletedAt DateTime? @db.Timestamptz(6)   // placeholder when replies exist
  createdAt DateTime  @default(now()) @db.Timestamptz(6)
  thread    CommentThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  author    User          @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([threadId, createdAt])
}
```

The thread id **is** the mark's `threadId` and is minted client-side
(`crypto.randomUUID()`) so the mark can be applied before the server answers;
the create route accepts the id and refuses a duplicate. `prisma/` is
owner-protected: the PR ships the migration via `prisma migrate dev` per the
Database Change Checklist, and the agent hands the owner the exact steps.

Comment bodies are plain text in Phase 1. A rich body (links, code) is a
Phase-4 question; plain text keeps the composer a `<textarea>`, keeps the
notification preview trivial, and matches the reader's note bodies.

---

## 4. The mark and its seams

### 4.1 `lib/domain/editor/extensions/comment-mark.ts`

```ts
export const COMMENT_MARK = "comment";            // lib/domain/content/comments.ts
// attrs via ONE spec shared by client and server twins (the wiki-link-attrs pattern)
threadId: { default: null, parseHTML: el => el.getAttribute("data-comment"),
            renderHTML: a => a.threadId ? { "data-comment": a.threadId } : {} }
excludes: ""        // two threads may overlap the same text
inclusive: false    // typing at the edge of a commented run is NOT part of it
                    // (the opposite of privateText — a comment is about what was selected)
parseHTML: [{ tag: "span[data-comment]" }]
renderHTML: ["span", mergeAttributes(attrs, { class: "comment-mark" }), 0]
```

Commands: `setComment(threadId)` on the current range, `unsetComment(threadId)`
across the whole document (delete / re-anchor), `selectComment(threadId)` (scroll
+ flash). Keyboard: `Mod-Alt-m` → starts the composer (dispatches to the
BubbleMenu through the editor-addressed CustomEvent pattern, never a bare
window event — see the reference_tiptap_block_traps note on multi-instance
editors).

`ServerCommentMark` is the same name, attrs, `parseHTML`, `renderHTML` and
nothing else. **Rendering is faithful on the server** (the private-content
choice, not the cloze choice): the public page strips the mark at its seam, so
`generateJSON(generateHTML(node))` stays symmetric and the markdown codec can
round-trip. The literal `name: "comment"` is required — `validate-collaboration-schema.ts`
discovers marks by regex and cannot see a constant-named one (a real gap it
found for `privateText`; fixing that regex is a one-line follow-up in this PR).

A ProseMirror plugin in the same file owns the view state: the provisional
composer decoration (mapped across transactions), the `comment-mark--active` /
`--resolved` / `--hover` decorations keyed by `threadId` from the comments
store, and click handling on `[data-comment]`. Decorations never touch the
document, so resolution and selection state cost no CRDT traffic.

Registration: `extensions-client.ts`, `extensions-server.ts`,
`lib/domain/collaboration/extensions.ts`; `TIPTAP_SCHEMA_VERSION` 1.21.0 →
**1.22.0** (MINOR, additive) with the changelog entry and its "Hocuspocus
redeploy required" line; the `getCurrentSchemaSnapshot()` mark list; the
collab-schema fixture gains a `comment`-marked paragraph.

### 4.2 Markdown: CriticMarkup, lossless

The source view and every markdown seam go through `tiptapToMarkdown`. Today an
inline mark with attributes and no turndown rule drops its **whole top-level
block** to raw HTML (or a base64 fence if unknown). A commented sentence turning
its paragraph into `<p>…<span data-comment=…>` in the source view is not
acceptable, so the mark gets the §5a treatment from the lossless-markdown guide:

```
{==passage==}{>>#8f2c…<<}        CriticMarkup: highlight + comment, the comment body is the thread id
```

- `lib/domain/content/comment-markdown.ts` — the pure grammar (write + read),
  the `wiki-link-markdown.ts` shape.
- A turndown rule `dgComment` in `markdown-serialize.ts` keyed on
  `span[data-comment]`.
- A `commentCodec` in `markdown-block-codecs.ts` whose `toMarkdown` returns
  `null` and whose `reTag` wraps the form back into the span, running
  `outsideCode` + `outsideTags`.
- Decline cases: a passage containing `==}` or `{>>`, or a thread id that is
  not a UUID, makes the grammar decline → the paragraph falls to the HTML tier,
  lossless as before. Literal `{==x==}{>>#y<<}` in prose fails self-verify and
  fences (the `%%` precedent).
- Fixtures in `validate-markdown-block-safety.ts`: a paragraph, a list item, a
  table cell, overlapping threads, a thread spanning a bold run. The sweep has
  **no mark-attr coverage today**, so the fixtures are the gate.

### 4.3 Egress: strip the mark, keep the text

`stripCommentMarks(json)` in `lib/domain/content/comments.ts` — pure JSON,
removes `comment` marks from every inline node, never drops text. It is
called **after** `stripPrivateContent` at every seam whose output is markdown
or HTML (plain-text seams are unaffected by marks and need nothing):

| Seam | File |
|---|---|
| chunked AI reads | `lib/domain/ai/tools/chunking.ts` |
| mentions / attachments | `lib/domain/ai-context/source-resolver.ts` |
| charter bodies | `lib/domain/ai/charters/render.ts` |
| browser-extension reads | `lib/domain/browser-extension/service.ts` |
| MCP note reads | `lib/domain/mcp/read.ts` |
| public render | `components/public/TipTapContent.tsx` (before `generateHTMLServer`) |
| markdown / HTML export | `lib/domain/export/converters/{markdown,html}.ts` |

Never inside `tiptapToMarkdown` (the source view must show `{==…==}`). The CSS
net `.public-prose [data-comment]{ all: unset }` backs the public seam the way
`[data-private]{display:none}` does. `scripts/validate-comments.ts` pins the
seam list with the same regex-presence check `validate-private-content.ts`
uses, and is mutation-tested before it lands.

AI reads strip comments by default because a thread is discussion *about* the
note, not the note. "Address the comments on this note" is a Phase-4 tool
(§10), not a leak through the default read.

### 4.4 Paste, duplicate, undo, history

- `transformPasted` drops `comment` marks whose `threadId` is not a thread of
  the destination note (so cut-and-paste **within** a note keeps its anchor,
  paste **into another** note does not carry a foreign thread). Internal drag
  moves are untouched.
- Duplicating a note strips comment marks in the copy (threads are not copied).
- ⌘Z after commenting removes the mark; the thread remains and shows under
  *Original text removed* with *Re-anchor* (§7.3).
- Note history snapshots contain the marks as they were; restoring an old
  version may revive marks for deleted threads — they render nothing (§7.3).

### 4.5 Hocuspocus

`unsupported-content.ts` **drops** an unknown mark (it wraps only unknown
nodes). Until the collaboration server is redeployed with the new schema, every
server-side sanitize — `/internal/apply` for AI writes, payload catch-up,
reseed — would silently strip comment marks. Rollout order is therefore:
merge → redeploy Hocuspocus from a tree matching `origin/main` (five `/readyz`
probes) → smoke. The window between the Vercel deploy and the redeploy is the
same one private content accepted; the mitigation is doing the redeploy
immediately, not a flag.

---

## 5. UI surfaces, concretely

### 5.1 Toolbelt (`BubbleMenu.tsx`, `registry.ts`)

- Registry: `{ id: "comment", label: "Comment", iconName: "MessageSquarePlus",
  surfaces: ["toolbelt"], contentTypes: ["note"], order: 55, group: "link",
  shortcut: "Cmd+Alt+M", isToggle: true }`.
- `SelectionFormattingState.comments: CommentSegment[]` (`threadId, from, to`),
  gathered in the existing `nodesBetween` sweep exactly as links are. Active
  when ≥ 1. Click with no thread → open the composer; with exactly one → open
  that thread; with several → open the Comments tab filtered to them.
- Composer: a second-row block mirroring the link editor (`onMouseDown`
  preventDefault + stopPropagation on the row, autofocus via the same
  `setTimeout(0)`), `shouldShow` returns true while a composer target exists.
  The provisional range is held by the mark plugin, not by React state, so it
  survives collaborator edits.

### 5.2 Context menu (`editor-actions.tsx`)

"Comment on selection" next to "Move highlight to note", gated on
`hasSelection`; it dispatches the same editor-addressed start-composer event
the chord uses.

### 5.3 Hover card and thread popover

`lib/domain/editor/hover-card.ts` is extracted from `wiki-link-hover.tsx`:
`createHoverCardPlugin({ selector, showDelay, hideDelay, render(el) → ReactNode,
editableOnly })` owning the timers, the single tippy instance, the
`getReferenceClientRect` re-anchor, the own-React-root mount and the three
dismissal rules. The wiki-link hover becomes a ~40-line consumer; the comment
hover is another. The click popover is the same tippy instance promoted to
`interactive` with `trigger: "manual"` and the expanded card.

`components/content/comments/ThreadCard.tsx`: `mode: "collapsed" | "expanded" |
"list"`. Chrome follows the link-view chooser (8 px radius, `rgba(0,0,0,.1)`
border, `#fff` / `#1a1a1a`, `0 8px 24px` shadow) rather than the bubble menu's
black glass, because it sits **on** the page and must read as part of it, not as
a tool. `CommentComposer.tsx` is one textarea + mention suggestion + Post, used
by the toolbelt row, the popover and the tab.

### 5.4 Comments tab

- Registry: `{ id: "comments-tab", label: "Comments", iconName: "MessageSquare",
  surfaces: ["sidebar-tab"], contentTypes: ["note"], order: 25, tabKey: "comments" }`.
- `RightSidebarTab` union + `TAB_SVG_PATHS` + `TAB_TITLES` + the
  `RightSidebarContent` switch → `<CommentsTab contentId />`.
- Rail badge: `RightSidebarHeader` gains an optional per-tab count (the reader
  rail's badge pattern); only Comments uses it for now.
- `use-comment-anchors.ts`: subscribes to the editor's `transaction` events and
  returns `Map<threadId, {from, to, quote}>` from a doc walk, debounced; the tab
  sorts by `from`.
- `revealRightSidebarTab(contentId, "comments", { threadId })` replaces the
  reader's local helper and is what notifications, link anchors and the
  "Open in sidebar" link call.

### 5.5 Styling (`app/globals.css`, `.ProseMirror` scope)

```css
.comment-mark            { background: color-mix(in srgb, var(--gold-primary) 12%, transparent);
                           border-bottom: 2px solid color-mix(in srgb, var(--gold-primary) 55%, transparent);
                           border-radius: 2px; cursor: pointer; transition: background 150ms var(--ease-smooth); }
.comment-mark--hover     { background: …22%; }
.comment-mark--active    { background: …30%; box-shadow: 0 0 0 1px color-mix(…gold 60%); }
.comment-mark--resolved  { background: none; border-bottom: none; }
.comment-mark--pending   { background: none; border-bottom: 2px dashed …gold 55%; }   /* composer open */
.dark .comment-mark      { /* gold reads on dark; raise fill to 16% */ }
.public-prose [data-comment] { all: unset; }
```

Gold is the app's accent (`--gold-primary`, the collaboration-caret default,
the active rail tab), so a commented passage reads as "the app is pointing at
this", not as a highlighter. The reader's five colors are reserved for Phase-3
highlights, where color *is* the information.

---

## 6. Permissions

| Actor | Read threads | Create anchored | Create note-level / reply | Resolve | Edit / delete own | Delete any thread |
|---|---|---|---|---|---|---|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ViewGrant` edit | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `ViewGrant` view | ✓ | Phase 4 (§10) | ✓ | ✓ | ✓ | — |
| no access | — | — | — | — | — | — |

Every route resolves `resolveContentAccess(prisma, { contentId, userId, require: "view" })`
first and checks the row's author or the note's owner for edits and deletes.
A view-level collaborator's Hocuspocus connection is read-only, so their client
cannot apply a mark; in Phase 1 the Comment button is hidden for them and the
tab's "Comment on note" composer is their way in. Phase 4 anchors their
comments server-side (§10).

---

## 7. Sync, staleness and orphans

### 7.1 Marks travel with Y.js; threads travel over REST

A new mark reaching a collaborator through Hocuspocus **is** the new-thread
signal: `use-comment-anchors` sees a `threadId` the comments store does not
know and triggers one fetch. No polling is needed to learn about new threads.
Replies and resolves do not touch the document, so while the Comments tab or a
thread popover is open **and the tab is visible**, the store polls
`GET /api/content/comments/:contentId?since=` every 30 s under the polling
discipline (engagement-gated, paused when hidden). Own actions refetch
immediately. A Hocuspocus stateless "comments changed" message is the Phase-4
upgrade if 30 s feels slow in practice.

### 7.2 Store

`state/comments-store.ts` (not persisted): `threadsByContentId`, `activeThreadId`,
`showResolved`, `composer: { contentId, threadId?, mode }`, `fetchedAt`. The
editor plugin reads it for decorations; the tab and cards read it for content.

### 7.3 Orphans, both directions

- **Thread without a mark** (passage deleted, ⌘Z, version restore): listed under
  *Original text removed* with the captured quote. *Re-anchor to selection*
  applies a mark with the existing thread id to the current selection.
- **Mark without a thread** (thread deleted while this editor was closed; a
  foreign mark that survived paste; a restored old version): renders with **no**
  decoration — an unknown thread id is invisible, never an error. The deleting
  client removes the mark through the editor at delete time, so the common case
  leaves nothing behind. Marks are never auto-deleted on a fetch *failure*; only
  an explicit 404 for that thread id lets an editable client clean one up.

---

## 8. API

| Verb + path | Body / query | Does |
|---|---|---|
| `GET /api/content/comments/[contentId]` | `?since=`, `?resolved=all\|open\|resolved` | threads with comments, authors (`id, username`), for the viewer |
| `POST /api/content/comments/[contentId]` | `{ id, body, anchor?, mentions? }` | create thread + first comment; `id` is the client-minted thread id |
| `POST /api/content/comments/threads/[threadId]` | `{ body, mentions? }` | reply |
| `PATCH /api/content/comments/threads/[threadId]` | `{ resolved: boolean }` | resolve / reopen |
| `DELETE /api/content/comments/threads/[threadId]` | — | delete thread (owner or thread author) |
| `PATCH /api/content/comments/items/[commentId]` | `{ body }` | edit own comment |
| `DELETE /api/content/comments/items/[commentId]` | — | delete own comment (placeholder if replies exist) |

Logic in `lib/domain/comments/server/` (`threads.ts`, `notify.ts`,
`mentions.ts`); routes are thin. Zod schemas: body 1–10 000 chars, mentions ≤ 20
user ids that must be collaborators of the note. Rate limit through the
existing Postgres fixed-window counter (60 comments / hour / user).
`GET /api/content/comments/[contentId]/collaborators` serves the mention picker.

---

## 9. Notifications and links

- `lib/domain/notifications/kinds.ts`: `comment.new`, `comment.reply`,
  `comment.mention`, `comment.resolved`, each `{ threadId, contentId,
  contentTitle, actorUsername, preview ≤ 140 }`, collapsible on `threadId`.
  Renderers registered in `lib/features/notifications/`; the click target is
  `setSelectedContentId(contentId)` + `useContentAnchorStore.request(contentId,
  "comment:<threadId>")`.
- `lib/domain/content/comment-link-anchors.ts`: core lister for the `comment`
  kind (installed beside `column-link-anchors.ts` in `MainPanelContent`), items
  labelled by quote with the first comment as detail. Markdown form
  `[[Note#^comment:<id>]]` is already handled by the anchored-link grammar.
- `MarkdownEditor` takes a pending `comment:` anchor on open (and while open,
  through the store subscription the reader uses) → `selectComment(threadId)` +
  open the thread.

---

## 10. Phases

**Phase 0 — the mark and its seams** (foundation, no UI beyond rendering)
`comment-mark.ts` + twin + registration + 1.22.0; CSS; `comments.ts`
(`stripCommentMarks`, `collectCommentThreadIds`); CriticMarkup grammar, turndown
rule, codec, fixtures; strip at the seven seams; `validate-comments.ts`
(seams + jsdom editor smoke of set/unset/overlap, the `validate-private-content-editor.ts`
pattern) wired into `build`; collab fixture; collab-schema regex fix.
*Gates:* typecheck, lint, `markdown:blocks:check`, `collab:schema:check`,
`private:content:check`, `comments:check`.

**Phase 1 — threads, in the text and in the rail**
Prisma + migration; service + routes; `comments-store`; toolbelt button,
composer row, chord, context-menu item; mark plugin (provisional, active,
resolved decorations, click); `hover-card.ts` extraction (wiki-link hover
migrated onto it); `ThreadCard`, `CommentComposer`, `CommentsTab`; rail tab
registration + badge; `use-comment-anchors`; `revealRightSidebarTab`; paste
hygiene; orphan handling. *Smoke:* two users (the `seed-smoke-users.ts`
harness) on one note in two browsers.

**Phase 2 — people**
Mentions (collaborator picker); the four notification kinds + renderers;
`comment:` link anchor + deep link; duplicate-note strip; mobile drawer path
for tap-to-open and the keyboard-covered composer.

**Phase 3 — annotations (highlights)**
`highlight` mark `{ color }` with the reader's five-color vocabulary moved to
`lib/domain/content/mark-palette.ts` (reader imports it from there); the
swatch row from `MarkPopover` in the toolbelt's comment composer ("Highlight
only" vs "Comment"); markdown `==text==` (Obsidian's standard; color in the
pandoc brace `==text=={.yellow}`); listed in the Comments tab under a filter.
Owner decision pending (§11 Q4).

**Phase 4 — later**
View-only anchoring through `/internal/apply` with a new `mark` op that finds
the range by text match (`position-anchor.ts`); Hocuspocus stateless
comment-changed signal; AI tools `read_comments` / `resolve_comment` and an
"address the comments" charter line; MCP `garden://note/{id}/comments`;
file-tree unresolved badge; rich comment bodies.

---

## 11. Design questions for the owner

**Decided 2026-10-15 (owner): every recommended default below is adopted.**
Adjustments, if any, come out of the Phase-1 smoke rather than up front.
The questions stay here as the record of what was considered.

1. **Click behaviour.** *Recommended:* click opens the compact thread popover in
   place (composer focused), with "Open in sidebar" for the full list. *Alternative:*
   click only jumps to the Comments tab. The popover keeps editing where the text
   is and stays under 320 px; the sidebar-only path is less code but moves the
   eye away from the passage every time.
2. **Rail placement.** *Recommended:* a dedicated **Comments** tab at order 25,
   right after Context. *Alternative:* a fourth sub-tab inside Context (links ·
   tags · AI · comments). A dedicated tab earns a badge and an activity-stream
   layout; a sub-tab keeps the rail shorter.
3. **Mark color.** *Recommended:* gold accent at 12 % fill + 2 px underline
   (reads as "the app is pointing here"). *Alternative:* the reader's yellow
   highlight tone. Gold keeps yellow free for Phase-3 highlights.
4. **Highlights (Phase 3).** Ship color highlights without a thread at all? If
   yes, do they belong in the comment composer as "Highlight only" (one entry
   surface) or as their own toolbelt button beside Comment?
5. **Who can resolve.** *Recommended:* anyone who can comment. *Alternative:*
   the thread author and the note owner only.
6. **Chord.** *Recommended:* ⌘⌥M (Google Docs). *Alternative:* ⌘⇧M (Notion;
   collides with Chrome's profile switcher on macOS).
7. **View-level collaborators in Phase 1.** Hide the Comment button and offer
   note-level comments only (recommended, honest about the read-only doc), or
   defer their access entirely until Phase 4's server-side anchoring?

---

## 12. Verification

- `pnpm typecheck` → `pnpm lint` (ratchet holds) → `NODE_OPTIONS=… pnpm build`
  with `set -o pipefail`.
- New gate `pnpm comments:check` in `build` and `quality.yml`; mutation-tested
  (remove one seam call, break the codec's reTag, rename the mark → each must
  fail).
- `pnpm markdown:blocks:check` with the five comment fixtures;
  `pnpm collab:schema:check` with the fixture mark.
- Migration: `prisma migrate dev` locally, drift gate green.
- Browser smoke (two smoke users, two browsers, one note): comment → mark
  arrives in the other browser and its thread appears; reply → appears within
  the poll; resolve → decoration goes quiet both sides; delete → mark gone
  both sides; ⌘Z → orphan listed, re-anchor works; source view shows
  `{==…==}{>>#…<<}` and round-trips; public page shows plain text; AI read of
  the note shows no span; paste into another note carries no mark; phone:
  toolbelt composer below the selection, tap opens the drawer.
- Hocuspocus redeploy verified by five `/readyz` probes; then the same smoke
  on production.
