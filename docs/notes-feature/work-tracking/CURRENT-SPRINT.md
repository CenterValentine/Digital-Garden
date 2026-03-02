---
sprint: 34
epoch: 7 (AI Integration)
duration: Feb 28 - Mar 1, 2026
branch: epoch-7/sprint-34
status: complete
---

# Sprint 34: Chat UI, AI Tools, @ Mentions

## Sprint Goal
Ship the full AI chat experience: streaming ChatPanel in the right sidebar, persistent ChatViewer in the main panel, AI tools with Prisma execution, @ file mentions for context injection, and / tool commands.

**Status**: ✅ COMPLETE — merged to main via PR

## Success Criteria
- [x] `pnpm build` passes
- [x] ChatPanel in right sidebar streams responses
- [x] "Save conversation" creates ChatPayload ContentNode in file tree
- [x] ChatViewer loads saved conversations with full history
- [x] AI tools (searchNotes, getCurrentNote, createNote) execute via tool registry
- [x] Tool settings section in `/settings/ai`
- [x] @ mentions search content nodes and inject into system prompt
- [x] / commands show available AI tools with prompt hints
- [x] Chat icon (MessageCircle) appears for chat nodes in file tree
- [x] Sidebar tabs auto-switch when content type changes
- [x] Chat export as Markdown from toolbar

## Completed Work Items

### Sprint 34 Core — Chat UI & Persistence

| File | Purpose |
|------|---------|
| `components/content/ai/ChatPanel.tsx` | Right sidebar streaming chat with save-to-tree |
| `components/content/ai/ChatViewer.tsx` | Full ChatViewer rewrite with auto-save to ChatPayload |
| `components/content/ai/ChatInput.tsx` | Shared input with @ mention and / command detection |
| `components/content/ai/ChatMessage.tsx` | Message rendering with mention pills, code blocks, inline formatting |
| `components/content/ai/ModelPicker.tsx` | Per-session provider/model override dropdown |
| `components/content/ai/ChatSuggestionMenu.tsx` | Shared keyboard-navigable dropdown for mentions + commands |
| `lib/domain/ai/tools/registry.ts` | AI tool definitions (searchNotes, getCurrentNote, createNote) with Prisma |
| `lib/domain/ai/tools/metadata.ts` | Client-safe tool metadata (no Prisma imports) |
| `lib/domain/ai/tools/types.ts` | BaseToolId, BaseToolMetadata types |
| `lib/domain/ai/tools/index.ts` | Barrel export |

### Sprint 34 Core — API & Data Layer

| File | Change |
|------|--------|
| `app/api/ai/chat/route.ts` | Added AI tools execution, mentioned content injection |
| `app/api/content/content/[id]/route.ts` | ChatPayload GET + PATCH (messages, metadata) |
| `app/api/content/content/route.ts` | ChatPayload POST support |
| `lib/domain/content/api-types.ts` | ChatPayload API types |
| `lib/domain/ai/types.ts` | StoredChatMessage, ChatMetadata updates |
| `components/settings/AISettingsPage.tsx` | Tool settings section (tool choice, enabled tools) |
| `lib/features/settings/validation.ts` | toolChoice, enabledTools schema fields |

### Sprint 34 Core — UI Integration

| File | Change |
|------|--------|
| `components/content/LeftSidebar.tsx` | Tree refresh event listener, chat creation handler |
| `components/content/content/LeftSidebarContent.tsx` | Chat content type in create request |
| `components/content/headers/LeftSidebarHeader.tsx` | onCreateChat prop |
| `components/content/menu-items/new-content-menu.tsx` | Chat in new content menu |
| `components/content/content/RightSidebarContent.tsx` | ChatPanel replaces placeholder |
| `app/page.tsx` | Session-based redirect (replaces legacy AppNav) |
| `app/global-error.tsx` | Global error boundary |

### Sprint 34B — Polish & Mentions

| File | Change |
|------|--------|
| `components/content/RightSidebar.tsx` | Tab auto-switch on content type change |
| `components/content/FileNode.tsx` | MessageCircle icon for chat content type |
| `components/content/content/MainPanelContent.tsx` | Editor state persistence fix + chat export handler |
| `components/content/headers/RightSidebarHeader.tsx` | "AI Chat" tab title (was "Coming Soon") |
| `lib/domain/tools/registry.ts` | export-chat toolbar tool registration |

## Technical Notes

### AI SDK v6 useChat + tool() API Discoveries
1. `useChat()`: NO `api`/`body` props — use `transport: new DefaultChatTransport({ api, body })` from `ai`
2. `useChat()`: NO `initialMessages` — field is just `messages` in `ChatInit`
3. `useChat()`: NO `input`/`setInput`/`handleSubmit` — use `sendMessage({ text })`, manage input via local `useState`
4. `ChatStatus` type: `'ready' | 'submitted' | 'streaming' | 'error'` (replaces boolean `isLoading`)
5. `UIMessage` has `parts[]` array, not `content` string
6. `tool()`: uses `inputSchema` (NOT `parameters`), import `z` from `zod/v4` for type compat
7. Dynamic `body` in transport: use function `body: () => ({ key: ref.current })` + ref pattern

### @ Mention Architecture
- ChatInput inserts clean `@Title` in textarea (user-friendly display)
- Parent (ChatPanel/ChatViewer) tracks mentions in `trackedMentionsRef`
- On send: reconstructs `@[Title](id)` tokens for API + ChatMessage rendering
- Server: fetches mentioned ContentNodes, injects searchText (max 2000 chars) into system prompt
- ChatMessage: parses `@[Title](id)` tokens → renders as clickable `MentionPill` components

## Stats
- **29 files** changed | **+2,237** | **-141**
- 1 commit (Sprint 34 + 34B combined)
- New directory: `components/content/ai/` (5 components)
- New directory: `lib/domain/ai/tools/` (4 files)

---

**Last Updated**: Mar 1, 2026

## Previous Sprint: Sprint 33 (✅ Complete)

See [Sprint 33 archive](history/) for details. Key deliverables:
- AI SDK v6 installed (ai@6, @ai-sdk/react, @ai-sdk/anthropic, @ai-sdk/openai)
- Provider registry with dynamic imports (`resolveChatModel`)
- Streaming chat API route (`POST /api/ai/chat`)
- `/settings/ai` page (provider, generation, toggles, usage)
