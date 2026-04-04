---
last_updated: 2026-04-02
---

# Sprint Backlog

**Prioritized work items for upcoming sprints, organized by epoch.**

**Sprint Execution Protocol**: Before commencing any sprint, always ask the user for input before planning and executing — there may be additions or modifications.

---

## Epoch 8: Editor Stabilization (Sprints 35-36) ✅ COMPLETE

**Goal**: Fix all known editor bugs, establish rules, implement focus guardrails.
**Detailed plan**: [epoch-8-editor-stabilization.md](epochs/epoch-8-editor-stabilization.md)

### Sprint 35: TipTap Rules Doc + Input Rule Bug Fixes ✅
- [x] Create TIPTAP-EDITOR-RULES.md (focus rules, input priorities, autocomplete conventions)
- [x] Tag/heading conflict: `#` triggers tag autocomplete instead of heading
- [x] `## ` triggers tag autocomplete, sometimes fails to convert to H2
- [x] `##` shows persistent tag autocomplete after continued typing
- [x] Tag autocomplete: 2-second delay, space breaks autocomplete
- [x] Slash command: only on first character of empty line
- [x] Header escape: backspace on empty header → `#` chain
- [x] `# ` (H1 with space) must never trigger tag autocomplete

### Sprint 36: Table Rebuild + Link Fix + Cleanup + Focus Guardrails ✅
- [x] **Table rebuild**: remove ALL CSS + logic, rebuild from TipTap docs (user approves before moving on)
- [x] URL/link escape: cursor adjacent to link must not inherit formatting; lightweight URL dialog
- [x] `>` blockquote: only affects current line, never child content
- [x] Header in paragraph with `hardBreak`: only convert text before hardBreak
- [x] Remove old console.log/console.warn from editor code
- [x] Implement focus guardrails per approved rules doc

---

## Epoch 9: Editor Enhancements (Sprint 37 complete; Sprints 38-42 deferred to Epoch 11)

**Goal**: Full-featured content editor with images, embeds, templates, snapshots, rich interactions.
**Detailed plan**: [epoch-9-editor-enhancements.md](epochs/epoch-9-editor-enhancements.md)

> **Note**: Epoch 10 (AI TipTap) was injected after Sprint 37, taking sprint slots 38-42.
> Remaining Epoch 9 sprints (URL embeds, drag/reorder, templates, snapshots, context menu)
> are deferred to Epoch 11.

### Sprint 37: Images in TipTap + Referenced Content Lifecycle ✅
- [x] Enable `@tiptap/extension-image` with custom EditorImage/ServerImage extensions
- [x] Image upload via slash command + bubble menu
- [x] Image paste → FilePayload REFERENCED content in same folder
- [x] Image URL paste → inline image with source tracking
- [x] Image resize (drag handles + bubble menu size presets)
- [x] Move API: REFERENCED content follows parent on move
- [x] Delete REFERENCED content when removed from document (orphan detection on save)
- [ ] **Deferred:** Image caption (custom figure/figcaption node) → Epoch 11
- [ ] **Deferred:** Image export to markdown (`![alt](src)`) → Epoch 11
- [ ] **Deferred:** Lazy loading → Epoch 11

#### Known Bugs (backlogged from Sprint 37)
- [ ] **Image bubble menu: viewport positioning** — When a large image is selected and its top is above the viewport, the menu isn't visible. Adding Floating UI `options` (`flip`, `shift`) caused cross-contamination with the table bubble menu. Needs investigation into why `options` prop disrupts other BubbleMenu instances.
- [ ] **Image bubble menu: stale size indicator** — When clicking between two images of different sizes, the S/M/L buttons briefly show the prior image's size before updating. `editor.getAttributes("image")` lags behind the selection change.

### Remaining Epoch 9 Sprints → Deferred to Epoch 11

The following sprints were originally 38-42 in Epoch 9 but are deferred to Epoch 11 now that Epoch 10 (AI TipTap) has taken those sprint slots:

- [ ] URL/OG Embeds + YouTube + Bubble Menu enhancements
- [ ] Gated Autofocus + Outline + Drag/Reorder
- [ ] Templates / Forced Content Structure
- [ ] Snapshots / Document History
- [ ] Editor Context Menu + Syntax Highlighting + Drawing

---

## Epoch 10: AI TipTap (Sprints 38-42) — Injected Before Remaining Epoch 9

**Goal**: Deep AI integration into the editor experience.
**Detailed plan**: [epoch-10-ai-tiptap.md](epochs/epoch-10-ai-tiptap.md)

> **Renumbering**: Original backlog had Epoch 10 as Sprints 43-47.
> It was injected after Sprint 37, renumbered to Sprints 38-42.

### Sprint 38: Providers + BYOK Persistence + Rich Bot Responses ✅
- [x] 4 new AI providers: Google Gemini, xAI Grok, Mistral, Groq (6 total)
- [x] BYOK key persistence: encrypted DB storage, CRUD API, verify endpoint
- [x] AIKeyManager settings UI: per-provider key input, masked display, verify button
- [x] ChatMessage rich markdown rendering: react-markdown + remark-gfm + lowlight syntax highlighting
- [x] Code blocks with copy button, tables, lists, blockquotes, inline formatting

### Sprint 39: AI Text-Editing Tools — Client-Side Architecture ✅
- [x] 8 agentic tools: read_first_chunk, read_next_chunk, read_previous_chunk, apply_diff, replace_document, plan, ask_user, finish_with_summary
- [x] Client-side editing architecture: tools return structured payloads, frontend applies to live TipTap editor
- [x] Editor instance Zustand store: shares TipTap editor between editor component and chat panel
- [x] ProseMirror text search utility: finds exact text positions in document for AI edits
- [x] AI edit orchestrator: 4-phase animation (cursor arrival → selection → content insertion → settle)
- [x] Editor lock with 30s timeout failsafe, queued execution, abort on navigation
- [x] Dual insertion strategy: char-by-char typing for inline text, parsed node-by-node for structured content
- [x] Fixed `markdownToTiptap` — added `marked` for proper markdown → HTML → TipTap JSON pipeline
- [x] Dev-only debug toggle in chat tool call bubbles (raw response viewer)
- [x] "AI is editing..." indicator in chat panel

### Sprint 40: AI Edit Highlighting + AI Image Insert ✅
- [x] `aiHighlight` ProseMirror Mark: `inclusive: false`, `source` attr, indigo CSS tint
- [x] Orchestrator auto-marks all AI-inserted content (text + structured)
- [x] `insert_image` tool (9th editor tool): image from URL with `source: "ai-generated"`
- [x] AI badge on ImageBubbleMenu for AI-generated images
- [x] "Show AI Content Highlights" toggle in AI settings
- [x] CSS class toggle: `.ai-highlight-hidden` hides marks without removing from document
- [x] Fixed selection highlight regression (deferred lock to Phase 3)

### Sprint 41: Chat Content Outlines ✅
- [x] Chat outline extractor: UIMessage[] → ChatOutlineEntry[] (compact + expanded modes)
- [x] ChatOutlinePanel: role-based SVG icons (user/assistant/tool), granularity toggle
- [x] Outline tab registered for `chat` content type in tool registry
- [x] Real-time outline sync: ChatViewer → outline store (updates as messages stream)
- [x] Click-to-scroll with gold flash animation via `scroll-to-chat-message` CustomEvent
- [x] Expanded mode: dot-and-indent sub-items for headers, lists, images in assistant responses

### Sprint 42: AI Image Generation ✅
- [x] 8-provider image generation (OpenAI DALL·E 3/GPT Image 1, Google Imagen 3, DeepAI, fal.ai FLUX, Together AI, Fireworks, RunwayML, Artbreeder)
- [x] `generate_image` chat tool: LLM calls providers, auto-uploads to storage, creates referenced FilePayload
- [x] GeneratedImageCard component: image preview, AI badge, prompt display, provider info
- [x] "Insert into document" button: `insert-ai-image` CustomEvent → MarkdownEditor at cursor
- [x] Drag-and-drop: chat images draggable to TipTap editor via `application/x-dg-ai-image`
- [x] `/api/ai/image` standalone endpoint for direct generation + storage upload
- [x] Image provider catalog with model metadata (sizes, quality/style support)
- [x] Works in both ChatPanel and ChatViewer

---

## Epoch 11: Block Builder + Templates + Snippets + Resume (Sprints 43-47)

**Goal**: Block system, content templates, snippets, page templates, resume/cover letter.
**Detailed plan**: See plan file (federated-leaping-widget.md)

### Sprint 43: Block Infrastructure ✅
- [x] ReusableCategory + SavedBlock database tables, full CRUD API routes
- [x] Block schema framework: `createBlockSchema()` (Zod v4), `registry.ts`, `types.ts`, `json-schema.ts`
- [x] NodeView factory: shared block chrome (drag handle, type badge, +/- insert buttons, properties menu)
- [x] Properties Panel: auto-generated from Zod schemas, CustomEvent bridge for attrs sync
- [x] Block focus plugin + block store (Zustand)
- [x] SavedBlockPicker component
- [x] Slash commands: `/block` and individual block types from registry

### Sprint 44: Block Extensions + Refinements ✅
- [x] SectionHeader: `inline*` content, level(1-3), divider styles
- [x] Card/Panel: `block+` container, border styles (none/subtle/solid/dashed), background toggle
- [x] Divider: atom, 4 line styles, spacing, optional label
- [x] Accordion: custom NodeView, inline-editable title with `#` heading-level shorthand, chevron toggle, collapsible body
- [x] Columns: parent+child NodeViews, CSS Grid (2-4 cols), Tab key navigation, border/background/container settings
- [x] Tabs: parent+child NodeViews, 3 tab styles, cursor-jump plugin, double-click rename, tab delete
- [x] All registered in extensions-client.ts and extensions-server.ts (Server* versions)
- [x] Block CSS with light-theme colors, compact block chrome

### Sprint 44b: Block Builder — DEFERRED
- User rejected modal builder approach in favor of inline insertion + right-panel properties
- Slash commands insert blocks directly, properties edited via side panel
- SavedBlockPicker handles block library

### Sprint 45: Content Templates + Snippets ✅
- [x] ContentTemplate + Snippet database tables
- [x] API routes for both
- [x] Editor context menu (right-click selected text → save as template/snippet)
- [x] `/template` and `/snippet` slash commands
- [x] AI snippet integration (tool + auto-injection into system prompt)
- [x] Chat area snippet menu
- [x] Zustand stores + settings pages

### Sprint 46: Page Templates ✅
- [x] PageTemplate database table + CRUD API
- [x] "New > Note" submenu with page templates (recursive 3-level submenus)
- [x] Save as Template toolbar button + dialog
- [x] Inline create from template (placeholder + name confirm)
- [x] Page template settings (category + template management)
- [x] Page template Zustand store

### Sprint 47: Input Blocks ✅
- [x] 7 input block extensions: text, select, checkbox, date, number, rating, prompt (AI)
- [x] All blocks registered in extensions-client.ts and extensions-server.ts
- [x] Input block CSS in globals.css
- [x] Properties panel: character limits, auto-expanding input size
- [x] Input blocks work inside layout blocks (columns, tabs, accordion, card)
- [x] Prompt input: AI-powered input with snippet category selection, output response limits
- [x] Export: strip input chrome, convert to plain text values (plaintext + markdown converters)

### Sprint 48: UI Cleanups + Tech Debt (PLANNED)
Adhoc tech debt sprint. Gated: resolve one issue before moving to next. Skip if blocked.

- [ ] **Logo GIF not showing**: Fix the animated tree logo inside the gold medallion (NotesNavBar → CompactLogo). Desktop renders the ring but SVG tree is invisible.
- [ ] **Favicon + tab metadata**: Copy logo for favicon. Update tab title to "Digital Garden". Review/update OG metadata.
- [ ] **Neon formatting removal**: Replace neon/debug styling (JSON viewer, debug panels) with glass-ui design system tokens.
- [ ] **Double scroll fix**: File tree requires two separate scrolls to view bottom content. Single scroll should cover the full tree even when folders are expanded. Scroll alignment breaks on folder expansion.
- [ ] **Panel header toggle cutoff**: Left and right sidebar headers clip the panel toggle buttons. User can correct manually but shouldn't have to.
- [ ] **"+" button repositioning**: Move the "+" action button to the left of the extensions/calendar icons. Horizontal overflow scrollable, but expansion toggle must persist outside the scroll.
- [ ] **Root pseudo-selectable**: Make "Root" feel like part of the file tree (clickable, highlights). Selecting Root shows total file count in status bar.
- [ ] **Status bar file count**: Selecting a file shows "1 file selected" in the bottom status bar. Multi-select shows count.
- [ ] **Inline file rename via H1**: Clicking the H1 document header enters rename mode. Changing the name updates the file tree in real-time, and vice versa.
- [ ] **Content scroll issue**: Document content can't scroll to the bottom without moving cursor to end via keyboard. Should be scrollable naturally.

### Sprint 49: Error Handling + Auth Redirects (PLANNED)
- [ ] **Auth error redirects**: All authorization/authentication errors (401, 403, session expired) redirect to login page instead of showing "Failed to load content" errors.
- [ ] **Graceful signed-out handling**: User should never see raw error states from being signed out. Detect auth failures at fetch/API layer and redirect.

---

## Deferred: Resume/Cover Letter (Unscheduled)

**Goal**: Pre-curated page templates for career documents with PDF export and public sharing.

- [ ] System seed data (Career category, Resume + Cover Letter page templates)
- [ ] PDF export via html2pdf.js (client-side)
- [ ] Public sharing at /resume/[slug] (read-only, no auth)
- [ ] AI resume enhancement prompts (context-aware system prompt)

---

## Deferred: Editor Enhancements (Remaining Epoch 9 — Unscheduled)

**Goal**: Complete the editor enhancements deferred from Epoch 9.

- [ ] URL/OG Embeds + YouTube + Bubble Menu (text color, highlight, subscript, superscript, strikethrough, alignment)
- [ ] Outline click → autofocus with CSS flash animation
- [ ] Notion-style drag/reorder: blocks, list items
- [ ] Snapshots / Document History (diff-based or full snapshot, 30-day retention)
- [ ] Editor context menu, enhanced syntax highlighting, Excalidraw drawing

---

## Future Epochs (Unplanned)

**Detailed stubs**: [future-epochs.md](epochs/future-epochs.md)

### Collaboration & Sharing
- Real-time editing (TipTap collaboration), content sharing, security review required
- Mentions, annotations, commenting layers
- Session validation for AI features, editor session limits

### UI Revisions
- Default themes + custom user themes, editor styling, font/color customization

### Main Panel Multiple Tabs + Workspace Preservation
- Multi-document editing, Obsidian-like tabs (file name as tab label), collaboration-friendly
- **Workspace preservation**: Navigating away (e.g., to Settings) and back restores the full tab state — all open tabs, active tab, scroll positions
- Tabs show file names; the existing title header in the content area remains as-is
- User can view multiple content nodes simultaneously via tabs

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
- [ ] Speech-to-text / text-to-speech
- [ ] RAG / embeddings / semantic search
- [ ] Chat history search

### Settings Improvements
- [ ] **Settings: back arrow navigation** — Add a back arrow at the top of the Settings page to navigate back to the content IDE. Should return to the last viewed note (or once tabs exist, restore the full workspace state). (2 pts)
- [ ] **Storage Settings: show existing providers** — The Providers tab should list all currently configured storage providers (with status, type, default indicator) and allow editing/removing them. Currently only shows "+ Add Provider" with no visibility into what's already configured. (3 pts)

### Bug Fixes
- [x] **Desktop logo missing in content layout** — Moved to Sprint 48 (UI Cleanups)

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

**Last Updated**: Apr 2, 2026
**Next Review**: Sprint 48 kickoff
