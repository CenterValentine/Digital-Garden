---
last_updated: 2026-03-05
---

# Sprint Backlog

**Prioritized work items for upcoming sprints, organized by epoch.**

**Sprint Execution Protocol**: Before commencing any sprint, always ask the user for input before planning and executing — there may be additions or modifications.

---

## Epoch 8: Editor Stabilization (Sprints 35-36)

**Goal**: Fix all known editor bugs, establish rules, implement focus guardrails.
**Detailed plan**: [epoch-8-editor-stabilization.md](epochs/epoch-8-editor-stabilization.md)

### Sprint 35: TipTap Rules Doc + Input Rule Bug Fixes
- [ ] Create TIPTAP-EDITOR-RULES.md (focus rules, input priorities, autocomplete conventions)
- [ ] Tag/heading conflict: `#` triggers tag autocomplete instead of heading
- [ ] `## ` triggers tag autocomplete, sometimes fails to convert to H2
- [ ] `##` shows persistent tag autocomplete after continued typing
- [ ] Tag autocomplete: 2-second delay, space breaks autocomplete
- [ ] Slash command: only on first character of empty line
- [ ] Header escape: backspace on empty header → `#` chain
- [ ] `# ` (H1 with space) must never trigger tag autocomplete

### Sprint 36: Table Rebuild + Link Fix + Cleanup + Focus Guardrails
- [ ] **Table rebuild**: remove ALL CSS + logic, rebuild from TipTap docs (user approves before moving on)
- [ ] URL/link escape: cursor adjacent to link must not inherit formatting; lightweight URL dialog
- [ ] `>` blockquote: only affects current line, never child content
- [ ] Header in paragraph with `hardBreak`: only convert text before hardBreak
- [ ] Remove old console.log/console.warn from editor code
- [ ] Implement focus guardrails per approved rules doc

---

## Epoch 9: Editor Enhancements (Sprints 37-42)

**Goal**: Full-featured content editor with images, embeds, templates, snapshots, rich interactions.
**Detailed plan**: [epoch-9-editor-enhancements.md](epochs/epoch-9-editor-enhancements.md)

### Sprint 37: Images in TipTap + Referenced Content Lifecycle ✅
- [x] Enable `@tiptap/extension-image` with custom EditorImage/ServerImage extensions
- [x] Image upload via slash command + bubble menu
- [x] Image paste → FilePayload REFERENCED content in same folder
- [x] Image URL paste → inline image with source tracking
- [x] Image resize (drag handles + bubble menu size presets)
- [x] Move API: REFERENCED content follows parent on move
- [x] Delete REFERENCED content when removed from document (orphan detection on save)
- [ ] **Deferred:** Image caption (custom figure/figcaption node) → future sprint
- [ ] **Deferred:** Image export to markdown (`![alt](src)`) → future sprint
- [ ] **Deferred:** Lazy loading → future sprint
- [ ] Image node `source` attribute prep for AI image generation (Sprint 45/47)

#### Known Bugs (backlogged from Sprint 37)
- [ ] **Image bubble menu: viewport positioning** — When a large image is selected and its top is above the viewport, the menu isn't visible. Adding Floating UI `options` (`flip`, `shift`) caused cross-contamination with the table bubble menu. Needs investigation into why `options` prop disrupts other BubbleMenu instances.
- [ ] **Image bubble menu: stale size indicator** — When clicking between two images of different sizes, the S/M/L buttons briefly show the prior image's size before updating. `editor.getAttributes("image")` lags behind the selection change. Reading from `NodeSelection.node.attrs` directly also caused regressions. May need a different approach (e.g., `useEffect` on selection change).

### Sprint 38: URL/OG Embeds + YouTube + Bubble Menu
- [ ] URL paste with OG metadata: 3 display modes (inline, small card, full preview)
- [ ] YouTube auto-embed with fullscreen (custom iframe node)
- [ ] Bubble menu: text color, highlight, subscript, superscript, strikethrough, text alignment

### Sprint 39: Gated Autofocus + Outline + Drag/Reorder
- [ ] Outline click → autofocus with CSS flash animation
- [ ] Tasks in outline sidebar panel
- [ ] Agentic edits update outlines in real-time
- [ ] Notion-style drag/reorder: whole blocks only (paragraphs, headings, lists, images, code, callouts, tables)
- [ ] List items reorderable within parent list
- [ ] UI: grip icon on hover, ghost preview, drop indicator line

### Sprint 40: Templates / Forced Content Structure (full sprint)
- [ ] Template builder UI in settings (full TipTap editor instance)
- [ ] All TipTap features supported; wiki-links become `[[Untitled]]` placeholders
- [ ] No templates within templates (hard rule)
- [ ] Apply: replace on new notes, insert at cursor on existing
- [ ] App-wide templates (pre-built) + user-created templates
- [ ] Block forced content with "x" delete button
- [ ] "Save selection as template" from any editor
- [ ] "Recommend a template" → repo feedback link

### Sprint 41: Snapshots / Document History (full sprint, may expand)
- [ ] Research spike: diff-based vs full snapshot, compression, retention
- [ ] 30-day retention with auto-prune; user can pin snapshots
- [ ] Document history: rollback, audit, branch
- [ ] AI/agentic changes tracked
- [ ] Safe DB migration (additive only, no data loss)
- [ ] Guard regressions: save perf, DB bloat, ID conflicts, restore warnings
- [ ] UI: snapshot browser in content toolbar + universal editor toolbar

### Sprint 42: Editor Context Menu + Syntax Highlighting + Drawing
- [ ] Editor context menu: inspect, select all, copy, paste, image insert, AI tools, autocorrect
- [ ] Explore wrapping browser context menu (app items above browser items)
- [ ] Spell check: browser spellcheck + AI proofreader approach
- [ ] Enhanced syntax highlighting (more languages via lowlight)
- [ ] Drawing: Excalidraw integration (not TipTap's experimental Vue drawing)

---

## Epoch 10: AI TipTap (Sprints 43-47)

**Goal**: Deep AI integration into the editor experience.
**Detailed plan**: [epoch-10-ai-tiptap.md](epochs/epoch-10-ai-tiptap.md)

### Sprint 43: Pretty Bot Response Enhancements
- [ ] Visual parity with OpenAI/Claude across ALL AI experiences (chat, side panel, inline)
- [ ] Rich rendering: headers, code blocks with syntax highlighting, lists, tables, inline code
- [ ] Model-agnostic formatting

### Sprint 44: AI Text-Editing Tools — GATED BUILD
- [ ] 8 tools, each built and tested individually before proceeding:
  - Gate 1: `read_first_chunk`, Gate 2: `read_next_chunk`, Gate 3: `read_previous_chunk`
  - Gate 4: `apply_diff`, Gate 5: `replace_document`
  - Gate 6: `plan`, Gate 7: `ask_user`, Gate 8: `finish_with_summary`
- [ ] Built-in commands: summarize, rephrase, translate (streaming)
- [ ] Tab-triggered autocompletion
- [ ] Bubble menu AI tools button
- [ ] Meld with existing `lib/domain/ai/` — no duplication

### Sprint 45: AI Edit Highlighting + AI Image Insert
- [ ] Human vs machine content marking (background/highlighting)
- [ ] Copy outside app: AI formatting stripped; within app: preserved (if enabled)
- [ ] Settings toggle + CSS retroactive enable/disable
- [ ] "Paste as AI" special paste
- [ ] No overlap: typing in AI paragraph = human content
- [ ] AI image icon flag
- [ ] Insert AI-generated images into TipTap (uses Sprint 37 infra + `source: 'ai-generated'`)

### Sprint 46: Chat Content Outlines
- [ ] Outline sidebar for ChatPayload nodes
- [ ] Compact prompt outline (first line + "...")
- [ ] Agent content: header/list previews
- [ ] Click → autofocus with Sprint 39 animations

### Sprint 47: AI Image Generation
- [ ] AI image generation in chat + side panel
- [ ] Generated images → REFERENCED FilePayload
- [ ] Referenced content follows parent (Sprint 37)
- [ ] Drag AI content to file tree (new copy) or TipTap note (referenced)

---

## Future Epochs (Unplanned)

**Detailed stubs**: [future-epochs.md](epochs/future-epochs.md)

### Collaboration & Sharing
- Real-time editing (TipTap collaboration), content sharing, security review required
- Mentions, annotations, commenting layers
- Session validation for AI features, editor session limits

### UI Revisions
- Default themes + custom user themes, editor styling, font/color customization

### Main Panel Multiple Tabs
- Multi-document editing, Obsidian-like tabs, collaboration-friendly

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
- [ ] BYOK key management UI
- [ ] Speech-to-text / text-to-speech
- [ ] RAG / embeddings / semantic search
- [ ] Agent mode (may be addressed in Sprint 44)
- [ ] Chat history search

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

**Last Updated**: Mar 5, 2026
**Next Review**: Sprint 35 kickoff
