---
last_updated: 2026-03-06
current_epoch: 8
current_sprint: 35
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

SPRINT EXECUTION PROTOCOL:
Before commencing any sprint, always ask the user for input on the sprint plan
before planning and executing. There may be additions or modifications.
-->

## Current Work

### Active Epoch: Epoch 8 - Editor Stabilization
**Duration**: 2 sprints (35-36)
**Theme**: Bug fixes, TipTap rules, focus guardrails, table rebuild

**Sprint Plan**:
- Sprint 35: TipTap Rules Doc + Input Rule Bug Fixes (complete)
- Sprint 36: Table Rebuild + Link Fix + Cleanup + Focus Guardrails (planned)

### Next Sprint: Sprint 36 - Table Rebuild + Link Fix + Cleanup + Focus Guardrails
**Status**: Planned — awaiting user input before commencing

## Recent Completions (Last 30 Days)

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

### Epoch 8: Editor Stabilization (Sprints 35-36)
Fix all known editor bugs, establish TipTap rules, implement focus guardrails.

### Epoch 9: Editor Enhancements (Sprints 37-42)
Images, URL/OG embeds, YouTube, drag/reorder, templates, snapshots, context menu.

### Epoch 10: AI TipTap (Sprints 43-47)
Pretty AI responses, agent editing tools, AI edit highlighting, chat outlines, AI image generation.

**See**: [Epoch Plans](work-tracking/epochs/) for detailed sprint breakdowns

## Known Issues & Blockers

### Active Blockers
- **macOS Finder**: File picker not opening on dev machine — blocks manual testing of import feature
- **macOS mmap**: `mmap failed: Operation timed out` on `git push` from main working directory — workaround: git bundle → fresh clone → push from /tmp

### Known Editor Bugs (Sprint 36 targets)
- `>` blockquote affects child content
- Cursor adjacent to URL inherits link formatting
- Header conversion in paragraph with `hardBreak` converts all text
- Table extra column visual bug
- Old console.log statements throughout editor code

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
- **Epoch 8** (Editor Stabilization): In Progress — Sprint 35 complete, Sprint 36 planned
- **Epoch 9** (Editor Enhancements): Planned (Sprints 37-42)
- **Epoch 10** (AI TipTap): Planned (Sprints 43-47)

## Roadmap

### Epoch 8: Editor Stabilization (Active)
**Theme**: Bug fixes, TipTap rules, focus guardrails, table rebuild

### Epoch 9: Editor Enhancements (Planned)
**Theme**: Images, embeds, templates, snapshots, context menu, drag/reorder

### Epoch 10: AI TipTap (Planned)
**Theme**: AI responses, agent tools, edit highlighting, chat outlines, image generation

### Future (Unplanned)
- **Collaboration & Sharing** — real-time editing, sharing, security review
- **UI Revisions** — theming, custom styles
- **Main Panel Multiple Tabs** — multi-document editing
- **YouTube Playlists & Summarizing** — video content management

## Quick Links

- [Current Sprint](work-tracking/CURRENT-SPRINT.md) - Sprint 35 details
- [Backlog](work-tracking/BACKLOG.md) - Prioritized work items
- [Epoch Plans](work-tracking/epochs/) - Epoch 8, 9, 10, future stubs
- [TipTap Editor Rules](guides/editor/TIPTAP-EDITOR-RULES.md) - Editor behavior rules
- [AI Development Guide](../CLAUDE.md) - For AI assistants
- [Start Here](00-START-HERE.md) - Documentation index

---

**Last Updated**: Mar 6, 2026
**Next Review**: Sprint 36 kickoff (user input required before commencing)
