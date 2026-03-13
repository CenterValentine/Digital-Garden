---
epoch: 10
title: AI TipTap
duration: 5 sprints (38-42, injected before remaining Epoch 9)
status: in_progress (4/5 sprints complete)
theme: AI providers, BYOK, agent tools, edit highlighting, chat outlines, image generation
---

# Epoch 10: AI TipTap

## Goal
Integrate AI deeply into the TipTap editing experience — expanded providers with BYOK, agent-powered text editing tools, human/AI content distinction, chat content outlines, and AI image generation.

## Prerequisites
- Epoch 8 (Editor Stabilization) complete ✅
- Sprint 37 from Epoch 9 (Images in TipTap) complete ✅
- Existing AI infrastructure: `lib/domain/ai/` (providers, tools, middleware)

## Injection Note
This epoch was injected after Sprint 37, taking sprint slots 38-42 (originally numbered 43-47 in the backlog). The remaining Epoch 9 sprints (URL embeds, drag/reorder, templates, snapshots, context menu) are deferred to Epoch 11.

## Sprint Execution Protocol
**Before commencing any sprint**, always ask the user for input before planning and executing — there may be additions or modifications.

---

## Sprint 38: Providers + BYOK Persistence + Rich Bot Responses ✅ COMPLETE

**Completed**: Mar 11, 2026

- [x] **4 new AI providers**: Google Gemini, xAI Grok, Mistral, Groq (6 total)
  - Packages: `@ai-sdk/google`, `@ai-sdk/xai`, `@ai-sdk/mistral`, `@ai-sdk/groq`
  - Catalog entries, registry switch cases, type union expansion
- [x] **BYOK key persistence**: Encrypted DB storage via `AIProviderKey` model
  - CRUD API routes: `app/api/ai/keys/`
  - Verify endpoint tests key with minimal API call
  - `resolveChatModel()` falls back to stored key when no `body.apiKey` provided
- [x] **AIKeyManager settings UI**: Per-provider key input, masked display (`sk-...xxxx`), verify button
- [x] **Rich chat message rendering**: `react-markdown` + `remark-gfm` + `lowlight` syntax highlighting
  - Code blocks with copy button, tables, lists, blockquotes, inline formatting

### Key Files
- `lib/domain/ai/providers/catalog.ts` — 6 provider entries
- `lib/domain/ai/providers/registry.ts` — 6 switch cases + BYOK loading
- `lib/domain/ai/keys/` — BYOK encryption, CRUD, types
- `app/api/ai/keys/` — API routes
- `components/settings/AIKeyManager.tsx` — Key management UI
- `components/content/ai/ChatMessage.tsx` — Rich markdown rendering

---

## Sprint 39: AI Text-Editing Tools — Client-Side Architecture ✅ COMPLETE

**Completed**: Mar 11, 2026

- [x] **8 agentic tools**, each built and tested:
  - Reading: `read_first_chunk`, `read_next_chunk`, `read_previous_chunk`
  - Editing: `apply_diff` (targeted replacement), `replace_document` (full rewrite)
  - Workflow: `plan`, `ask_user`, `finish_with_summary`
- [x] **Client-side editing architecture**: Tools return structured JSON payloads (`__editPayload: true`), frontend applies to live TipTap editor with animation. No server-side DB writes for edits.
- [x] **Editor instance Zustand store**: Bridge sharing TipTap editor ref between editor component and chat panel
- [x] **ProseMirror text search utility**: Walks document tree building flat text + position map
- [x] **AI edit orchestrator**: 4-phase animation engine
  - Phase 1: Cursor arrival (~400ms), Phase 2: Selection highlight (~800ms)
  - Phase 3: Content insertion (dual strategy), Phase 4: Settle (~250ms)
  - Editor lock, 30s timeout failsafe, FIFO queue, abort on navigation
- [x] **Dual insertion strategy**: char-by-char typing for inline text, parsed node-by-node for structured content
- [x] **Fixed `markdownToTiptap`**: Added `marked` for proper markdown → HTML → TipTap JSON pipeline
- [x] Dev-only debug toggle in chat tool call bubbles
- [x] "AI is editing..." indicator in chat panel

### Key Files
- `lib/domain/ai/tools/editor-tools.ts` — 8 tool definitions
- `lib/domain/ai/tools/editor-metadata.ts` — Client-safe metadata
- `lib/domain/ai/tools/chunking.ts` — Document chunking for reading
- `lib/domain/editor/ai/edit-orchestrator.ts` — Animation engine
- `lib/domain/editor/ai/text-search.ts` — ProseMirror text search
- `state/editor-instance-store.ts` — Shared editor ref
- `docs/notes-feature/features/ai-editor-behaviors.md` — Living behaviors doc

---

## Sprint 40: AI Edit Highlighting + AI Image Insert ✅ COMPLETE

**Completed**: Mar 12, 2026

- [x] **`aiHighlight` ProseMirror Mark**: Custom mark with `inclusive: false`, `source` attribute
  - Renders as `<span class="ai-highlight" data-source="ai">`
  - Indigo CSS tint + bottom border, hover effect
  - Registered in both client and server extension sets
- [x] **Orchestrator auto-marking**: `applyAiHighlight()` method applies mark to full insertion range post-insertion
  - Both `typeText` and `insertStructuredContent` return end positions
  - `replace_document` marks entire document
- [x] **`insert_image` tool** (9th editor tool): Accepts URL + alt text, returns `InsertImagePayload`
  - Image inserted with `source: "ai-generated"` attribute
- [x] **AI badge on ImageBubbleMenu**: Indigo "AI" badge for AI-generated images
- [x] **Settings toggle**: "Show AI Content Highlights" in AI settings
  - CSS class toggle (`.ai-highlight-hidden`) — instant, no mark removal
- [x] **Selection highlight regression fix**: Deferred `setEditable(false)` to Phase 3 so native selection renders in Phase 2
- [ ] **Deferred**: Strip AI marks on external copy, "Paste as AI" option

### Key Files
- `lib/domain/editor/extensions/ai-highlight.ts` — Mark extension (new)
- `lib/domain/editor/ai/edit-orchestrator.ts` — AI marking, image insertion, deferred lock
- `lib/domain/ai/tools/editor-tools.ts` — `insert_image` tool
- `components/content/editor/ImageBubbleMenu.tsx` — AI badge
- `components/settings/AISettingsPage.tsx` — Highlight toggle
- `lib/features/settings/validation.ts` — `showAiHighlight` schema

---

## Sprint 41: Chat Content Outlines ✅ COMPLETE

**Completed**: Mar 12, 2026

- [x] **Chat outline extractor**: `extractChatOutline()` parses UIMessage[] into `ChatOutlineEntry[]`
  - Two modes: "compact" (one entry per message) and "expanded" (sub-items for headers, lists, images)
  - User entries: first line of prompt, truncated with "..."
  - Assistant entries: summary from first heading or first line; children from parsed markdown
  - Tool entries: tool name
- [x] **ChatOutlinePanel component**: Role-based SVG icons (user, assistant sparkle, tool wrench)
  - Granularity toggle button ("Expand" / "Compact") in panel header
  - Expanded sub-items use dot-and-indent pattern (same as note outline)
  - Gold highlight on active entry, gold flash on scroll-to target
- [x] **Tool registry**: Outline tab `contentTypes` expanded from `["note"]` to `["note", "chat"]`
- [x] **RightSidebarContent**: Renders ChatOutlinePanel when `selectedContentType === "chat"`, OutlinePanel otherwise
- [x] **Real-time sync**: ChatViewer feeds messages into outline store on every message/granularity change
- [x] **Click-to-scroll**: `scroll-to-chat-message` CustomEvent → `data-message-index` attribute lookup → `scrollIntoView({ behavior: "smooth", block: "center" })` + CSS flash animation

### Key Files
- `lib/domain/ai/chat-outline.ts` — Extractor utility (new)
- `components/content/ChatOutlinePanel.tsx` — Panel component (new)
- `state/outline-store.ts` — Extended with chat outline slice
- `components/content/viewer/ChatViewer.tsx` — Outline sync + scroll listener
- `components/content/content/RightSidebarContent.tsx` — Conditional panel rendering
- `lib/domain/tools/registry.ts` — `contentTypes` expanded
- `app/globals.css` — `.chat-outline-flash` animation

---

## Sprint 42: AI Image Generation ✅ COMPLETE

**Completed**: Mar 13, 2026

- [x] 8-provider image generation system (OpenAI, Google, DeepAI, fal.ai, Together AI, Fireworks, RunwayML, Artbreeder)
- [x] `generate_image` chat tool: LLM generates images, auto-uploads to storage, creates referenced FilePayload
- [x] GeneratedImageCard in ChatMessage: rendered image with AI badge, provider info, prompt display
- [x] "Insert into document" button: `insert-ai-image` CustomEvent → MarkdownEditor at cursor position
- [x] Drag-and-drop: draggable chat images → TipTap editor via `application/x-dg-ai-image` data transfer
- [x] `/api/ai/image` standalone API endpoint
- [x] Image provider catalog with model metadata (sizes, quality/style support)
- [x] Works in both ChatPanel and ChatViewer

### Key Files
- `lib/domain/ai/image/types.ts` — ImageProviderId, ImageModelId, ImageGenRequest/Response (new)
- `lib/domain/ai/image/catalog.ts` — Image provider catalog with model metadata (new)
- `lib/domain/ai/image/generate.ts` — Multi-provider image generation dispatch (new)
- `lib/domain/ai/image/index.ts` — Barrel export (new)
- `app/api/ai/image/route.ts` — Image generation API route (new)
- `lib/domain/ai/tools/registry.ts` — Added `generate_image` tool
- `lib/domain/ai/tools/metadata.ts` — Added tool metadata
- `components/content/ai/ChatMessage.tsx` — GeneratedImageCard component
- `components/content/editor/MarkdownEditor.tsx` — `insert-ai-image` listener + AI image drop handler
- `lib/domain/ai/index.ts` — Extended barrel with image exports
- `lib/domain/ai/providers/types.ts` — Added `image-generation` capability
- `app/api/ai/chat/route.ts` — Updated system prompt + step count

---

## Epoch 10 Summary

**Duration**: Sprints 38-42 (5 sprints)
**Status**: ✅ Complete
**Theme**: AI-powered document editing, provider expansion, rich chat rendering

### Deliverables
- **Sprint 38**: 6 AI providers, BYOK key management, rich bot responses (markdown, code blocks, mentions)
- **Sprint 39**: 8 agentic editor tools, client-side editing architecture, edit orchestrator with 4-phase animation
- **Sprint 40**: AI edit highlighting (indigo tint marks), `insert_image` tool, AI badge on image bubble menu
- **Sprint 41**: Chat content outlines (compact/expanded), real-time sync, role-based icons, click-to-scroll
- **Sprint 42**: 8-provider AI image generation, `generate_image` tool, insert-to-document, drag-and-drop

---

**Last Updated**: Mar 13, 2026
