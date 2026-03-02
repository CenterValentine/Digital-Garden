---
last_updated: 2026-03-01
current_epoch: 7
current_sprint: 34
sprint_status: complete
---

# Digital Garden Content IDE - Status

**Single source of truth for current development status**

<!--
MAINTENANCE INSTRUCTIONS (for AI assistants & developers):

ALWAYS UPDATE when:
- Completing a work item -> Move to "Recent Completions"
- Starting work -> Change Planned to In Progress
- Significant progress -> Update percentages
- Encountering blockers -> Add to "Active Blockers"

WHAT TO UPDATE:
1. Frontmatter: Change `last_updated` to current date (YYYY-MM-DD)
2. Work Items: Update status emoji
3. Recent Completions: Add new entry at TOP (keep last 30 days)
4. Progress: Recalculate (Completed Points / Total Points) * 100
5. Known Issues: Add/remove/update blockers

SYNC WITH: work-tracking/CURRENT-SPRINT.md (detailed tracking)
FULL GUIDE: STATUS-MAINTENANCE-GUIDE.md
-->

## Current Work

### Last Completed Sprint: Sprint 34 - Chat UI, AI Tools, @ Mentions
**Duration**: Feb 28 - Mar 1, 2026
**Branch**: `epoch-7/sprint-34`
**Status**: ✅ COMPLETE — merged to main via PR

### Active Epoch: Epoch 7 - AI Integration
**Duration**: Feb-Apr 2026 (8 weeks, 4 sprints)
**Theme**: AI chat, AI tools, agents, speech, BYOK, RAG

**Sprint Plan**:
- Sprint 33: AI Foundation + Settings UI ✅
- Sprint 34: Chat UI & AI Tools + Tool Settings ✅
- Sprint 35: Planning (BYOK, Speech, Agent, or new priorities)
- Sprint 36: Planning

## Recent Completions (Last 30 Days)

**Mar 1, 2026**: Sprint 34 Chat UI, AI Tools, @ Mentions — COMPLETE
- ChatPanel (right sidebar): transient streaming chat with "Save conversation" to file tree
- ChatViewer (main panel): full-page persistent chat with auto-save to ChatPayload
- ChatPayload CRUD in content API (GET/PATCH/POST)
- AI tools registry (searchNotes, getCurrentNote, createNote) with Prisma execution layer
- ModelPicker component for per-session provider/model override
- Tool settings UI (tool choice, enable/disable individual tools)
- @ file mentions: inline search → system prompt injection → clickable mention pills
- / tool commands: browse AI tools with prompt hints
- ChatSuggestionMenu: shared keyboard-navigable dropdown for both chat surfaces
- Sidebar tab auto-switch when content type changes
- MessageCircle icon for chat nodes in file tree
- Chat export as Markdown from toolbar
- Editor state persistence fix (collapse/reopen no longer loses edits)
- Root page redirect (session-based, replaces legacy AppNav)
- Global error boundary
- 29 files changed, +2,237 lines
- Build gate passed

**Feb 27, 2026**: Sprint 33 AI Foundation + Settings UI — COMPLETE
- AI SDK v6 installed and Zod v4 compatibility confirmed
- Provider registry with dynamic imports (Anthropic + OpenAI)
- Streaming chat API route with auth + middleware
- `/settings/ai` page: provider selection, generation params, feature toggles, usage tracking
- Build gate passed

**Feb 27, 2026**: Sprint 32 Editor Stability & Polish Complete
- ✅ BubbleMenu persistence fix — root cause was TipTap React wrapper's shared `"bubbleMenu"` meta key causing cross-contamination between text and table BubbleMenu instances; stabilized shouldShow callbacks to module-level functions
- ✅ Removed `.focus()` from BubbleMenu command chains (prevents focus/blur cycle exhausting preventHide flag)
- ✅ Removed invalid `tippyOptions` prop (TipTap v3 uses Floating UI, not tippy.js)
- ✅ Outline click-to-scroll via CustomEvent bridge pattern (text+level matching)
- ✅ ExpandableEditor tag/wiki-link callback threading (fetchTags, createTag, fetchNotesForWikiLink, onWikiLinkClick)
- ✅ Keyboard event scoping — `stopPropagation` on ExpandableEditor container
- ✅ Tag/heading `# ` conflict fix — Space with empty query propagates to ProseMirror heading input rule
- ✅ tag-suggestion `component.ref` runtime error guard

**Feb 26, 2026**: Sprint 31 Lossless Export/Import Round-Trip Complete
- ✅ Custom two-pass markdown parser (block + inline) → TipTap JSON
- ✅ Semantic extensions: tags, wiki-links, callouts, task lists, tables
- ✅ Sidecar reader (.meta.json consumption for lossless restoration)
- ✅ Import API endpoint (POST /api/content/import, multipart/form-data)
- ✅ Import button in toolbar (Tool Surfaces registry)
- ✅ Round-trip verification utility (dev console tool)
- ✅ syncContentTags extracted to shared module
- **Pending manual testing** (macOS Finder issue blocking file picker)

**Feb 25, 2026**: Sprint 30 Universal Expandable Editor Complete
- ✅ ExpandableEditor component (collapsible TipTap for all content types)
- ✅ Centralized integration in MainPanelContent
- ✅ MarkdownEditor compact mode
- ✅ API upsert for notePayload (any content type can now have notes)
- **Known issue**: BubbleMenu focus-theft regression (pre-existing)

**Feb 24, 2026**: Sprint 29 Tool Surfaces Architecture Complete
- ✅ Declarative tool registry (ToolDefinition, queryTools)
- ✅ ToolSurfaceProvider context + handler registration
- ✅ ContentToolbar component (toolbar surface)
- ✅ BubbleMenu wired to registry (module-level, no hooks)
- ✅ RightSidebarHeader wired to registry (dynamic tabs)
- ✅ ToolDebugPanel (dev-only, Cmd+Shift+T)

**Feb 18, 2026**: Sprint 27 Core Folder Views Complete
- ✅ List view component (sort controls, file type icons, keyboard navigation)
- ✅ Grid view component (responsive layout, thumbnails, hover effects)
- ✅ Kanban view component (drag-and-drop, status columns)
- ✅ Folder organization system operational

## Up Next (Sprint 35+)

**Planning in progress** — original Epoch 7 plan had BYOK/Speech/Agent for Sprint 35
and RAG/Polish for Sprint 36, but new priorities may redirect.

**See**: [Backlog](work-tracking/BACKLOG.md) for prioritized items

## Known Issues & Blockers

### Active Blockers
- **macOS Finder**: File picker not opening on dev machine — blocks manual testing of import feature
- **macOS mmap**: `mmap failed: Operation timed out` on `git push` from main working directory — workaround: git bundle → fresh clone → push from /tmp

### Known Limitations
- **Sprint 31 Import**: Untested pending Finder fix — parser, API, and toolbar button built but not manually verified
- **PDF/DOCX Export**: Stub implementations (need Puppeteer/docx library integration)
- **AI Chat**: Requires user-provided API keys (BYOK configured in /settings/ai)
- **External Links**: Some sites have SSL certificate errors (require dev-mode bypass)
- **Outline Panel**: Auto-scroll on editor scroll needs intersection observer (click-to-scroll works)
- **Chat mentions**: Only injects note `searchText` (max 2000 chars), not full TipTap JSON

### Technical Debt
- [ ] Server-side TipTap extensions missing WikiLink and Tag parsers
- [ ] Metadata sidecar import consumer not yet implemented
- [ ] Chat export only handles plain text messages (no tool call/result rendering)

## Metrics

### Velocity (Last 6 Sprints)
- Sprint 29: ~20 points (Tool Surfaces)
- Sprint 30: ~15 points (Universal Editor)
- Sprint 31: ~20 points (Import System)
- Sprint 32: ~15 points (Editor Stability & Polish)
- Sprint 33: ~18 points (AI Foundation + Settings)
- Sprint 34: ~25 points (Chat UI + Tools + Mentions)
- **Average**: ~19 points/sprint

### Epoch 7 Progress
- **Sprint 33**: ✅ Complete (AI Foundation)
- **Sprint 34**: ✅ Complete (Chat UI & Tools)
- **Sprint 35**: Planning
- **Sprint 36**: Planning

## Roadmap

### Epoch 6: Collaboration (Future)
**Theme**: Real-time collaboration, sharing, permissions

### Epoch 7: AI Integration (Active)
**Theme**: AI chat, embeddings, semantic search, BYOK, tools, agents, speech

### Epoch 8: Mobile & Performance (Future)
**Theme**: PWA, offline support, performance optimization

## Quick Links

- [Current Sprint](work-tracking/CURRENT-SPRINT.md) - Sprint 34 details
- [Backlog](work-tracking/BACKLOG.md) - Prioritized work items
- [AI Development Guide](../CLAUDE.md) - For AI assistants
- [Start Here](00-START-HERE.md) - Documentation index

---

**Last Updated**: Mar 1, 2026
**Next Review**: Sprint 35 planning
