---
last_updated: 2026-10-03
status: built (branch `feat/wikilink-views`) — owner smoke pending
---

# Wiki-link views — one reference, four displays

**What this is.** A `[[link]]` and a Note Window were two features that
pointed at the same thing — another note — through two unrelated code paths.
This plan joins them *underneath* (one attribute spec, one resolver, one
markdown grammar, one conversion module, one chooser component) while keeping
the two UI seams the owner asked to preserve: the `[[` autosuggest stays the
way you *author* a link, and the Note Window's tree picker stays the way you
*aim* a window. Neither surface changed. What changed is that a link can now
be *displayed* four ways, and the display is chosen in place.

Reference points: Confluence's link display switcher (inline / card / embed),
Notion's mention / page-link / synced block, Obsidian's `[[…]]` / `![[…]]`.

---

## 1. The four displays

| View | What it is | Node | Markdown |
|---|---|---|---|
| **Link** (default) | the text link | `wikiLink` | `[[Title]]{#id}` |
| **Chip** | icon + title pill, inline | `wikiLink` `view="chip"` | `[[Title]]{#id .chip}` |
| **Card** | title + two-line excerpt, inline-block | `wikiLink` `view="card"` | `[[Title]]{#id .card}` |
| **Window** | the note itself, editable, in place | `noteWindow` block | `![[Title]]{#id block=…}` |

The first three are one attribute on the inline node. The window is a
different node (a block with its own height, border and an editable body),
so choosing it is a **conversion**, not an attr write — and choosing any
inline view on a window converts back. `lib/domain/editor/link-views.ts`
owns both directions (`applyLinkView`) so every surface agrees on what
"display as" means:

- **Hover** (`wiki-link-hover.tsx`): rest on a link for 350 ms → a compact
  chooser (Link · Chip · Card · Window · Open) above it. Editable surfaces only.
- **Window header** (`NoteWindowNodeView`): a "Display as…" button opens the
  same chooser with Window selected.
- **Context menu** (`editor-actions.tsx`): "Display as" submenu on a link and
  on a window's header — the keyboard/touch-reachable copy of the hover.

Link → window splits the paragraph around the link (text before stays, the
window takes its own block, text after starts a new paragraph); a link alone
in its paragraph replaces it. Window → link leaves a paragraph holding the
link. A window needs a real ContentNode id: a hand-typed link without one is
resolved by title first (the click rule) and healed, then converted.
Heading links (`[[#H]]`), anchored links and virtual targets cannot become
windows; the chooser says why.

**Card content** comes from one preview cache (`lib/domain/editor/
link-preview.ts`): type, live title, first ~200 chars of visible text (private
content stripped — it goes through `extractSearchTextFromTipTap`). Forty links
to one note fetch it once; `content-updated` drops the entry. The card's
chrome lives in the NodeView (vanilla DOM, no React root per link) and never
in `renderHTML`, so nothing leaks into a paste.

---

## 2. What was merged in the code

| Before | After |
|---|---|
| Two hand-written attribute specs (`wiki-link.ts`, `wiki-link-server.ts`) that had already drifted in comments | `wiki-link-attrs.ts` — one `wikiLinkAttrSpec()`, one `wikiLinkDisplayText`, one `wikiLinkRenderAttrs`, one `wikiLinkSourceText`; both nodes import it (the `noteWindowAttrSpec()` pattern) |
| Note Window resolved its target only by id | A `![[Title]]` with no id resolves by exact title through `resolveWikiLinkTarget` — the same function the link click uses — and stamps the id |
| No markdown form for either; a paragraph with a link fell to the raw-HTML tier | `wiki-link-markdown.ts` — one grammar for both, used by the turndown rules (write) and the codec reTags (read) |
| `ServerNoteWindow.renderHTML` was deliberately lossy (title only) for public safety | Symmetric renderHTML; the public renderer strips every attr but the title at its seam (`publicSafeNoteWindows`, the private-content pattern) |
| The context menu acted on "the first editor in the store" | `editorForContext` — the editor whose DOM contains the click (nested windows, split panes) |

Not merged, deliberately: the `[[` suggestion menu and the Note Window picker.
They answer different questions (*which note is this sentence about* vs.
*browse to the note I want to work in here*) and the owner declared the picker
canonical for tree-browse picking. Also unchanged: the window's `targetContentId`
attr name (a rename is a MAJOR schema bump for no user-facing gain).

---

## 3. The markdown grammar

Markdown cannot carry what the editor must remember — the rename-durable
UUID, the display, a window's height — so those ride in a pandoc-style brace
immediately after the link, the grammar heading folds already use
(`## Title {.collapsed}`):

```
[[Roadmap]]{#3f2a…}                       plain link; the id is always written when known
[[Roadmap|the plan]]{#3f2a… .card}        alias + display
[[Roadmap]]{.chip .no-context}            no id (hand-typed), context opt-out
[[#Setup]]                                heading link (slug derived from the text)
[[#Setup]]{slug=setup-2}                  …only when the stored slug differs
[[Pride#^annotation:abc]]{#… label="…"}   anchored link, label quoted
![[Meeting notes]]{#3f2a… block=blk-…}    window (Obsidian's transclusion syntax)
![[Meeting notes]]{#… .no-border block=… height=300 view=… row=…}
```

Defaults are omitted. The self-verify decides whether the form is used: a
title with `[`, `]`, `{`, `}`, `|` or a newline makes the grammar *decline*,
and the paragraph falls to the HTML tier as before — lossless, less pretty.
Inline metacharacters (`* _ \` ~ \`) are backslash-escaped on the way out and
un-escaped by marked on the way in. Literal `[[x]]` in prose re-parses as a
link, fails self-verify and fences (the `%%` precedent). The reTag runs
outside `<pre>/<code>` and outside tags, so a title that happens to sit in an
accordion's `data-header` is left alone.

`pnpm markdown:blocks:check` asserts the shapes above (not just losslessness)
plus the decline cases, and the inline-attr sweep covers `view` automatically.

---

## 4. Move the selection to a note

Right-click a selection → **Move to Note** › **Leave link** or
**No link**. One item, two choices (owner, 2026-10-03; an
earlier "Send to New Note" with an inline title was folded in — the picker's
"+ New Note" is the one way to make a new note for the selection). Both
open the shared tree picker (`ContentTreePicker`, the Note Window's flavor —
collapsed tree, view-scope row, "+ New Note" on folders and insertion gaps)
hosted by the editor that was right-clicked (`MoveSelectionPicker`,
addressed by editor instance so split panes and nested windows do not each
open one). A note created from the picker is named from the selection's
first heading or line, so it is named before it has content. The picker
lists notes only.

Context-menu only, by design: it is an act of reorganisation, not
formatting. From there the hover chooser turns the trace link into a card
or windows the note back in.

The selected blocks are appended to the **end** of the target with one empty
paragraph of buffer when the target already has content (none when it is
empty). The target is written through its live editor when it is open in
this session, otherwise through the new `POST /api/content/content/[id]/append`,
which goes through `writeNoteContent` — the one collaboration-safe server
writer — so an open editor elsewhere sees the blocks. The host is always
edited through its own editor. Positions are re-checked after the round-trip;
a changed selection leaves the host alone and says so.

**The trace link's display is the one the user chose most recently**
(`lastUsedLinkView`, recorded by every `applyLinkView`; per browser), so the
feature never asks for a view; the hover chooser changes it afterwards. A
remembered "window" makes the trace a Note Window block.

**Provenance stamp.** With Leave link, the moved blocks are followed by a
`From [[Host]]` paragraph in the target, so the two notes point at each
other and the moved text says where it came from. No link means no trace
either way: nothing stays here and nothing points back.

---

## 5. Decisions

- **D1 — `view` is an attr, `window` is a node.** Rejected: a block-level
  `wikiLink` (inline/block cannot be one node type) and a `view` attr on
  `noteWindow` (a window *is* a view). The conversion module is the seam.
- **D2 — pandoc braces, not HTML comments or sidecars.** Already in use for
  folds; readable; one grammar for both nodes.
- **D3 — the UUID is written in markdown.** The id is the link, the title is
  the label; dropping it on round-trip would silently re-orphan every link
  after a rename. Noise accepted.
- **D4 — public safety moves to the seam.** Symmetric renderHTML is what makes
  the window's pretty form provable; the public renderer strips ids the way it
  strips private content.
- **D5 — chip/card are vanilla DOM.** A React root per inline link does not
  scale; the node view is a decorated copy of renderHTML's own span.
- **D6 — the hover appears only where the suggestion does** (editing
  surfaces); viewers and embeds get neither.

---

## 6. Follow-ups

- Card excerpt for non-note targets (folders, databases, files) shows the type
  word; a per-type summary (row count, file size) is a later nicety.
- The window → link conversion drops `targetViewId` / `targetRowId` (database
  windows); re-windowing picks the default view. Revisit with DATABASE Phase 2.
- `Send to New Note` creates at the host's folder; a picker-driven destination
  ("send to… ") would reuse `ContentTreePicker` as a flavor — not built,
  because the sibling placement is the structurally sound default.
- The inline input rule still accepts only bare `[[Title]]` / `[[Title|alias]]`
  when typing; pasting the braced form goes through paste-as-markdown.
- Hocuspocus redeploy after merge (schema 1.20.0 adds `wikiLink.view`).
