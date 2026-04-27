---
last_updated: 2026-04-26
current_epoch: 13
current_sprint: 58
sprint_status: planned
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

SPRINT EXECUTION PROTOCOL:
Before commencing any sprint, always ask the user for input on the sprint plan
before planning and executing. There may be additions or modifications.
-->

## Current Work

### Active Epoch: Epoch 13 - People + Collaboration
**Duration**: 6 sprints (58-63)
**Theme**: People/domain tree mirroring, person mentions, safe sharing, and Hocuspocus-backed collaboration

**Sprint Plan**:
- Sprint 58: Foundations (planned)
- Sprint 59: People View + Mount UX (planned)
- Sprint 60: Tree Policy Hardening (planned)
- Sprint 61: Person Mentions (planned)
- Sprint 62: Hocuspocus Collaboration (planned)
- Sprint 63: Share + Media Prototype (planned)

**Worktree**: `/Users/davidvalentine/Documents/Digital-Garden/.worktrees/epoch-13-people-collab`
**Branch**: `codex/epoch-13-people-collab`
**Detailed Plan**: `docs/notes-feature/work-tracking/epochs/epoch-13-people-and-collaboration.md`

## Recent Completions (Last 30 Days)

**Apr 26, 2026**: Collaboration bootstrap fallback hardening
- Narrowed `bootstrap-failed` to true structural/bootstrap invalidity instead of transient collaboration service unavailability
- Added staged collaboration boot messaging: normal boot, "taking longer than expected", and warned local fallback after prolonged canonical-state delays
- Enabled warned local editing from saved note TipTap JSON when canonical collaboration bootstrap is unavailable but durable local persistence is ready
- Kept editing blocked when canonical state is structurally inconsistent, saved note content cannot be transformed safely, or local persistence cannot initialize
- Markdown editor now surfaces runtime-provided collaboration boot warnings instead of a fixed loading banner

**Apr 7, 2026**: Epoch 13 planning initialized
- Created isolated worktree from `origin/main` after PR #22 merge commit `2acc6d9b9fc8bad4a8e7e634f865c19607b0e0ce`
- Documented the People + Collaboration epoch starting at Sprint 58
- Locked the architecture decision to render People groups/subgroups folder-like without adding `ContentType.group`
- Captured collaboration route/access decisions: owners and signed-in grantees use `/content`; public `/share` is view-only for non-users in v1

**Mar 25, 2026**: Sprint 53 Quad Split — COMPLETE
- Added four layout modes: single, dual vertical, dual horizontal, and quad split from the same workspace model
- Shared workspace toolbar now controls the focused pane instead of rendering per pane
- Right-click `Open In Pane` expands the workspace when the requested pane is not currently visible
- Multi-pane debug surfaces are suppressed when pane count is greater than one
- Split orientation remount fix prevents vertical/horizontal mode confusion after repeated toggles
- Pane switching no longer refetches content just because focus changed
- Tab placement now follows persistent horizontal/vertical user preference instead of transient visible-pane merges
- Active tab styling refined with flush underline and conservative lift
- Build gate passed
- Manual smoke passed on port `3001`

**Mar 24, 2026**: Sprint 51 Sidebar Isolation + Workspace Preservation — COMPLETE
- Persisted right-sidebar runtime per content via `state/right-sidebar-state-store.ts`
- Sidebar panels now receive explicit `contentId` scope instead of relying on the global selection singleton
- Outline store now clears invalid active heading/chat-outline selections when content-specific outlines refresh
- Editor instance store now clears stale AI edit runtime when an editor unmounts
- Navigation history remains pane-scoped and filters invalid cleared-content entries
- Workspace restoration now keeps the active tab restorable in URL/localStorage when leaving content and returning
- Repaired Epoch 12 Sprint 50/51 worktree git indirection under `Digital-Garden. nosync/.worktrees/`
- Targeted eslint on changed files passed
- Build gate passed

**Mar 13, 2026**: Sprint 42 AI Image Generation — COMPLETE
- 8-provider image generation system: OpenAI (DALL·E 3, GPT Image 1), Google (Imagen 3), DeepAI, fal.ai (FLUX.1 Dev/Schnell), Together AI (FLUX/SDXL), Fireworks AI, RunwayML (Gen-3), Artbreeder
- `generate_image` chat tool: LLM generates images from text prompts, auto-uploads to storage, creates referenced FilePayload
- GeneratedImageCard in ChatMessage: rendered image with AI badge, provider info, prompt display
- "Insert into document" button: dispatches `insert-ai-image` CustomEvent, MarkdownEditor inserts at cursor
- Drag-and-drop: draggable images from chat to TipTap editor via `application/x-dg-ai-image` data transfer
- Image generation API route: `/api/ai/image` — standalone endpoint for direct generation
- Provider catalog with model metadata (sizes, quality/style support)
- Works in both ChatPanel (side chat) and ChatViewer (content node chat)
- 10 files changed, 5 new files
- Build gate passed

**Mar 12, 2026**: Sprint 41 Chat Content Outlines — COMPLETE
- Chat outline extractor: parses UIMessage[] into navigable entries (user prompts, assistant summaries, tool calls)
- Granularity toggle: "compact" (messages only) vs "expanded" (headers, lists, images from assistant markdown)
- ChatOutlinePanel component with role-based SVG icons (user, assistant, tool) and dot-and-indent sub-items
- Outline tab now available for `chat` content type (tool registry expanded)
- Real-time outline sync: ChatViewer feeds messages into outline store as they stream
- Click-to-scroll: outline entries dispatch `scroll-to-chat-message` CustomEvent, ChatViewer scrolls with gold flash animation
- Outline store extended with chat-specific slice (separate from note outline)
- 6 files changed, 2 new files
- Build gate passed

**Mar 12, 2026**: Sprint 40 AI Edit Highlighting + AI Image Insert — COMPLETE
- `aiHighlight` ProseMirror Mark extension: `inclusive: false`, `source` attribute, `<span class="ai-highlight" data-source="ai">`
- Registered in both client and server extension sets
- AI highlight CSS: indigo tint + bottom border, hover state, `.ai-highlight-hidden` toggle class
- Orchestrator auto-marks all AI-inserted content (both `typeText` and `insertStructuredContent`)
- `replace_document` marks entire document as AI content
- `insert_image` tool (9th editor tool): inserts image from URL with `source: "ai-generated"`
- AI badge on ImageBubbleMenu for AI-generated images
- "Show AI Content Highlights" toggle in AI settings (validation schema + settings page)
- CSS class toggle approach: hides highlights without removing marks from document
- Fixed selection highlight regression: deferred `setEditable(false)` to Phase 3 so native selection renders in Phase 2
- 8 files changed, 1 new extension file
- Build gate passed

**Mar 11, 2026**: Sprint 39 AI Text-Editing Tools — Client-Side Architecture — COMPLETE
- 8 agentic tools: read_first_chunk, read_next_chunk, read_previous_chunk, apply_diff, replace_document, plan, ask_user, finish_with_summary
- Client-side editing architecture: tools return structured payloads, frontend applies to live TipTap editor
- Editor instance Zustand store: shares TipTap editor between editor component and chat panel
- ProseMirror text search utility: finds exact text positions in document for AI edits
- AI edit orchestrator: 4-phase animation (cursor arrival → selection → content insertion → settle)
- Editor lock with 30s timeout failsafe, queued execution, abort on navigation
- Dual insertion strategy: char-by-char typing for inline text, parsed node-by-node for structured content
- Fixed `markdownToTiptap` — added `marked` for proper markdown → HTML → TipTap JSON pipeline
- Dev-only debug toggle in chat tool call bubbles (raw response viewer)
- "AI is editing..." indicator in chat panel
- AI editor behaviors living document: docs/notes-feature/features/ai-editor-behaviors.md
- 10 files changed, 4 new files
- Build gate passed

**Mar 11, 2026**: Sprint 38 Providers + BYOK Persistence + Rich Bot Responses — COMPLETE
- 4 new AI providers: Google Gemini, xAI Grok, Mistral, Groq (6 total)
- BYOK key persistence: encrypted DB storage, CRUD API, verify endpoint
- AIKeyManager settings UI: per-provider key input, masked display, verify button
- ChatMessage rich markdown rendering: react-markdown + remark-gfm + lowlight syntax highlighting
- Code blocks with copy button, tables, lists, blockquotes, inline formatting
- Build gate passed

**Mar 8, 2026**: Sprint 37 Images in TipTap + Referenced Content Lifecycle — COMPLETE
- Image extension with contentId, source, uploading, width attributes
- Upload via slash command (/image), paste (files + image URLs), drag-and-drop from Finder
- Referenced content lifecycle: ContentLink sync on save, orphan soft-delete, cascade move
- Image bubble menu with size presets (S/M/L), alt text, delete
- Vanilla DOM NodeView with drag-to-resize handle
- Deferred: figure/caption, markdown export, lazy loading

**Mar 6, 2026**: Sprint 36 Table Rebuild + Link Fix + Cleanup + Focus Guardrails — COMPLETE
- Console cleanup: removed console.log/console.warn from editor code (kept console.error)
- Focus guardrails: removed `.focus()` from TableBubbleMenu chains, added `preventFocusLoss`
- Focus guardrails: removed `setTimeout` focus hack from slash command table insertion
- Link: documented `inclusive: false` default (cursor adjacent to links doesn't inherit formatting)
- HeadingHardbreakSplit extension: `## ` in paragraph with hardBreak only converts text before break
- BlockquoteLineOnly extension: `> ` in paragraph with hardBreak only quotes text before break
- Table rebuild: removed old CSS, added minimal TipTap-docs-based styles, enabled `resizable: true`
- Registered new extensions in both client and server extension sets
- Build gate passed
- 8 files changed, 2 new extension files

**Mar 6, 2026**: Sprint 35 TipTap Rules Doc + Input Rule Bug Fixes — COMPLETE
- TIPTAP-EDITOR-RULES.md created (living document — expand as features are added)
- Tag autocomplete 2-second delay before popup appears (heading shortcuts get priority)
- `##` in query immediately dismisses tag autocomplete via `allow()` guard
- Space during delay propagates to ProseMirror for heading conversion (`# ` → H1)
- Slash command restricted to first character of empty lines only
- HeadingBackspace extension: empty H1→`#`, H2→`##`, H3→`###` in paragraph
- Removed macOS Finder duplicate `index.d 2.ts` from Prisma generated output
- Build gate passed
- 4 files changed, 1 new extension file

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
- BubbleMenu persistence fix (root cause: shared meta key cross-contamination)
- Outline click-to-scroll via CustomEvent bridge
- ExpandableEditor tag/wiki-link callback threading
- Tag/heading `# ` conflict fix
- Build gate passed

**Feb 26, 2026**: Sprint 31 Lossless Export/Import Round-Trip Complete
- Custom two-pass markdown parser → TipTap JSON
- Sidecar reader, Import API, toolbar button
- Pending manual testing (macOS Finder issue)

**Feb 25, 2026**: Sprint 30 Universal Expandable Editor Complete
**Feb 24, 2026**: Sprint 29 Tool Surfaces Architecture Complete

## Up Next

### Epoch 12: Sprint 54 - Tab Drag + Adaptive Pane Reshaping
Direct tab dragging between panes, single-pane split targets, and adaptive layout collapse are in progress. Next checkpoint is manual smoke on port `3001`.

**See**: [Epoch Plans](work-tracking/epochs/) for detailed sprint breakdowns

## Known Issues & Blockers

### Active Blockers
- **macOS Finder**: File picker not opening on dev machine — blocks manual testing of import feature
- **macOS mmap**: `mmap failed: Operation timed out` on `git push` from main working directory — workaround: git bundle → fresh clone → push from /tmp

### Known Editor Bugs
- *(All Sprint 36 targets resolved — see Recent Completions)*

### Known Limitations
- **Sprint 31 Import**: Untested pending Finder fix
- **PDF/DOCX Export**: Stub implementations
- **AI Chat**: Requires user-provided API keys (BYOK configured in /settings/ai)
- **Outline Panel**: Auto-scroll on editor scroll needs intersection observer
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

### Epoch Progress
- **Epoch 7** (AI Integration): ✅ Sprints 33-34 complete; Sprints 35-36 redirected to Epoch 8
- **Epoch 8** (Editor Stabilization): ✅ Complete — Sprints 35-36 complete
- **Epoch 9** (Editor Enhancements): Sprint 37 complete; remaining sprints deferred to Epoch 11
- **Epoch 10** (AI TipTap): ✅ Complete — Sprints 38-42 complete

## Roadmap

### Epoch 10: AI TipTap (✅ Complete — Sprints 38-42)
**Theme**: AI providers, BYOK, agent editing tools, edit highlighting, chat outlines, image generation
**Status**: 5/5 sprints complete ✅

### Epoch 11: Editor Enhancements (Planned — Remaining Epoch 9)
**Theme**: URL/OG embeds, YouTube, drag/reorder, templates, snapshots, context menu

### Future (Unplanned)
- **Collaboration & Sharing** — real-time editing, sharing, security review
- **UI Revisions** — theming, custom styles
- **Main Panel Multiple Tabs** — multi-document editing
- **YouTube Playlists & Summarizing** — video content management

## Quick Links

- [Current Sprint](work-tracking/CURRENT-SPRINT.md) - Sprint 54 details
- [Backlog](work-tracking/BACKLOG.md) - Prioritized work items
- [Epoch Plans](work-tracking/epochs/) - Epoch 8, 9, 10, future stubs
- [TipTap Editor Rules](guides/editor/TIPTAP-EDITOR-RULES.md) - Editor behavior rules
- [AI Development Guide](../CLAUDE.md) - For AI assistants
- [Start Here](00-START-HERE.md) - Documentation index

---

**Last Updated**: Mar 12, 2026
**Next Review**: Sprint 42 kickoff (AI Image Generation)
