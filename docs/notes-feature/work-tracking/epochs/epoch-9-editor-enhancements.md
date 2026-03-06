---
epoch: 9
title: Editor Enhancements
duration: 6 sprints (37-42)
status: planned
theme: Images, embeds, templates, snapshots, context menu, drag/reorder
---

# Epoch 9: Editor Enhancements

## Goal
Transform the TipTap editor from a functional text editor into a full-featured content IDE with images, embeds, templates, document history, and rich interaction patterns.

## Prerequisites
- Epoch 8 (Editor Stabilization) complete — all bugs fixed, rules documented
- TIPTAP-EDITOR-RULES.md approved and implemented

## Key Decisions
- **Images**: Reuse FilePayload with `contentRole=REFERENCED` (no schema migration)
- **Referenced content lifecycle**: follows parent on move, deleted when removed from document
- **Templates**: Full TipTap features, replace on new notes, insert at cursor on existing
- **Snapshots**: 30-day retention with auto-prune, pinnable snapshots

---

## Sprint 37: Images in TipTap + Referenced Content Lifecycle

- [ ] Enable `@tiptap/extension-image` (already installed, not configured)
- [ ] Image upload via slash command + bubble menu button
- [ ] Image paste handling → creates FilePayload REFERENCED content in same folder
- [ ] Image URL paste → creates ExternalPayload REFERENCED content
- [ ] Image resize (drag handles or image-specific bubble menu)
- [ ] Lazy loading for images
- [ ] **Update move API** (`app/api/content/content/move/route.ts`): REFERENCED content follows parent
- [ ] **Delete referenced content** when removed from document (onChange/save hook detects orphans)
- [ ] Image caption support (custom figure node)
- [ ] **AI image prep**: image node schema includes `source` attribute (user-uploaded vs ai-generated)

### Key Files
- `lib/domain/editor/extensions-client.ts` — add Image extension
- `app/api/content/content/move/route.ts` — referenced content follow logic
- `components/content/editor/MarkdownEditor.tsx` — paste handling, orphan detection

---

## Sprint 38: URL/OG Embeds + YouTube + Bubble Menu Enhancements

- [ ] URL paste with OG metadata: 3 display modes (inline/hyperlinked, small card block, full preview block)
- [ ] YouTube URL auto-converts to full embed block with fullscreen (custom iframe node)
- [ ] Add missing formatting options to bubble menu: text color, highlight, subscript, superscript, strikethrough, text alignment
- [ ] Note: YouTube playlists and summarizing deferred to much later epoch

### Key Files
- `components/content/editor/BubbleMenu.tsx` — new formatting buttons
- `lib/domain/tools/registry.ts` — new tool definitions
- New: custom iframe/embed node extension

---

## Sprint 39: Gated Autofocus + Outline + Drag/Reorder

- [ ] Outline click → autofocus to document position with CSS flash animation
- [ ] Tasks show up in outline sidebar panel
- [ ] Agentic edits update outlines in real-time
- [ ] **Drag and reorder** (Notion-style via TipTap drag handle):
  - Drag handle: subtle grip icon on hover at left edge of block nodes
  - Reorderable: entire paragraphs, headings, OL/UL (whole blocks), task lists, images, code blocks, callouts, tables, blockquotes
  - List items reorderable within their parent list
  - NOT reorderable: partial text within a paragraph
  - **UI**: ghost preview while dragging, drop indicator line between blocks
  - Drop zones: between sibling blocks, or into list containers

### Key Files
- `components/content/OutlinePanel.tsx` — autofocus, tasks in outline
- `state/outline-store.ts` — outline updates
- New: drag handle extension or TipTap drag handle configuration

---

## Sprint 40: Templates / Forced Content Structure (full sprint)

- [ ] **Template builder UI in settings**: full TipTap editor instance (same as note editor)
- [ ] Templates support ALL TipTap features — wiki-links become `[[Untitled]]` placeholders
- [ ] Templates are flat (no templates within templates)
- [ ] **Apply behavior**: replace on new/blank notes, insert at cursor on existing
- [ ] Two categories:
  - **App-wide templates**: pre-built, imported in bulk, distinct UI section
  - **User-created templates**: via settings editor or "save selection as template"
- [ ] Block forced content: deletable via "x" button (top-right)
- [ ] "Recommend a template" → links to repo customer feedback
- [ ] Underlying code enables future template import

### Key Files
- New: `components/settings/TemplatesPage.tsx`
- New: `lib/domain/templates/` — template storage, schema
- `prisma/schema.prisma` — Template model (if needed)

---

## Sprint 41: Snapshots / Document History (full sprint, may expand)

- [ ] **Research spike first**: lowest-resource implementation
  - Diff-based storage (deltas only)
  - Time-based debouncing (every N minutes, not every keystroke)
  - Size-capped retention (last 50 snapshots)
  - Compression of TipTap JSON
  - **Decision: 30-day retention** with auto-prune; users can pin snapshots
- [ ] Document history: rollback, audit, branch from any point
- [ ] AI/agentic changes tracked as snapshots
- [ ] Safe DB migration (additive only, production data preserved)
- [ ] **Regression risks**:
  - Auto-save performance degradation
  - Database bloat
  - Content ID conflicts on branch
  - Migration failures on existing content
  - Restore overwriting unsaved edits (must warn)
- [ ] **UI**: snapshot browser in content toolbar + universal editor toolbar
- [ ] Applies to both content node notes and universal editor

### Key Files
- `prisma/schema.prisma` — Snapshot model
- `components/content/toolbar/ContentToolbar.tsx` — snapshot browser UI
- `app/api/content/` — snapshot API endpoints

---

## Sprint 42: Editor Context Menu + Syntax Highlighting + Drawing

- [ ] Editor-specific context menu: browser inspect, select all, copy, paste, image insert, AI tools, autocorrect
- [ ] Explore wrapping browser context menu (app items above browser items)
- [ ] Spell check: browser spellcheck + AI proofreader (TipTap's linting is unmaintained)
- [ ] Enhanced syntax highlighting for code blocks (more languages via lowlight)
- [ ] Drawing: Excalidraw integration (already installed) rather than TipTap's experimental Vue-only drawing

### Key Files
- `components/content/context-menu/` — existing context menu system
- `lib/core/menu-positioning.ts` — positioning utilities
- New: editor context menu provider

---

**Last Updated**: Mar 5, 2026
