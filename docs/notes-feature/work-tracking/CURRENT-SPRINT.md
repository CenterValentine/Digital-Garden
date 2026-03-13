---
sprint: 41
epoch: 10 (AI TipTap)
duration: 1 session
branch: epoch-8/sprint-36
status: complete
---

# Sprint 41: Chat Content Outlines

## Sprint Goal
Add a navigable outline sidebar for chat conversations in ChatViewer (persistent chat nodes). Compact and expanded views with role-based icons and click-to-scroll.

**Status**: ✅ Complete

## Success Criteria
- [x] `pnpm build` passes
- [x] Outline tab appears when viewing a chat content node
- [x] Compact mode: one entry per message (user prompt summary, assistant summary, tool name)
- [x] Expanded mode: assistant sub-items (headers, lists, images) with dot-and-indent
- [x] Granularity toggle between compact and expanded
- [x] Click outline entry → scroll to message with animation
- [x] Real-time outline updates as messages stream in
- [x] Role-based icons (user, assistant sparkle, tool wrench)

## Work Items

### Chat Outline Extractor (~3pts)
- [x] **CO-041-001**: `extractChatOutline()` utility (2 pts) ✅
  - Parses `UIMessage[]` into `ChatOutlineEntry[]`
  - Two modes: `"compact"` (messages only) and `"expanded"` (with sub-items)
  - User entries: first line truncated to 60 chars
  - Assistant entries: summary from first heading or first line
  - Tool entries: tool name from `dynamic-tool` parts
  - Sub-item extraction: headings (with level), list items (max 8), images
  - **File**: `lib/domain/ai/chat-outline.ts` (new)

- [x] **CO-041-002**: Outline store extension (1 pt) ✅
  - Added `chatOutline`, `activeChatEntryId`, `chatOutlineGranularity` to store
  - `toggleChatOutlineGranularity()` toggles between compact/expanded
  - `clearOutline()` now clears both note and chat outline state
  - **File**: `state/outline-store.ts`

### ChatOutlinePanel Component (~5pts)
- [x] **CO-041-003**: ChatOutlinePanel with role icons (3 pts) ✅
  - Role-based SVG icons: user (person), assistant (sparkle), tool (wrench)
  - Granularity toggle button in header ("Expand" / "Compact")
  - Active entry highlighted with gold accent (matches note outline)
  - Empty states for no content selected and no messages
  - **File**: `components/content/ChatOutlinePanel.tsx` (new)

- [x] **CO-041-004**: Expanded mode sub-items (2 pts) ✅
  - Heading sub-items: dot-and-indent with size based on level (same as note outline)
  - List sub-items: bullet indicator, indented under parent
  - Image sub-items: image icon with caption text
  - Indentation: `24 + (level - 1) * 12` px padding-left
  - **File**: `components/content/ChatOutlinePanel.tsx`

### Integration (~4pts)
- [x] **CO-041-005**: Tool registry update (0.5 pt) ✅
  - Outline tab `contentTypes` expanded from `["note"]` to `["note", "chat"]`
  - Tab automatically appears when viewing chat nodes
  - **File**: `lib/domain/tools/registry.ts`

- [x] **CO-041-006**: RightSidebarContent conditional rendering (0.5 pt) ✅
  - Checks `selectedContentType` — renders ChatOutlinePanel for chat, OutlinePanel for notes
  - Dispatches `scroll-to-chat-message` CustomEvent on entry click
  - **File**: `components/content/content/RightSidebarContent.tsx`

- [x] **CO-041-007**: ChatViewer outline sync (2 pts) ✅
  - Feeds messages into outline store via `extractChatOutline()` on every messages/granularity change
  - Clears chat outline on unmount
  - Listens for `scroll-to-chat-message` event — finds `data-message-index` element, smooth scrolls
  - Gold flash animation on scroll target (1.5s ease-out)
  - Added `data-message-index` wrapper divs around ChatMessage components
  - **File**: `components/content/viewer/ChatViewer.tsx`

- [x] **CO-041-008**: Flash animation CSS (0.5 pt) ✅
  - `@keyframes chat-outline-flash` — gold tint fading to transparent
  - **File**: `app/globals.css`

## Estimated Points: ~12 pts

## Technical Notes

### Separate Store Slice
Chat outline data lives in the same `outline-store.ts` but in separate fields (`chatOutline`, `activeChatEntryId`, `chatOutlineGranularity`). This avoids type conflicts with the existing `OutlineHeading[]` used for notes and keeps both systems independent.

### Real-Time vs Static
Outline updates in real-time as messages stream — the `useEffect` watching `messages` re-extracts on every change. For the `experimental_throttle: 100` used in ChatViewer, this means outline refreshes at most every 100ms, which is smooth without being wasteful.

### CustomEvent Pattern
Follows the same `CustomEvent` bridge pattern used for note outline click-to-scroll (`scroll-to-heading`). The ChatViewer listens for `scroll-to-chat-message` and uses `data-message-index` attributes on wrapper divs to find the target element. This avoids tight coupling between the outline panel and the chat viewer.

## Files Changed

| File | Action |
|------|--------|
| `lib/domain/ai/chat-outline.ts` | **New** — Chat outline extraction utility |
| `components/content/ChatOutlinePanel.tsx` | **New** — Chat outline panel component |
| `state/outline-store.ts` | Extended with chat outline slice |
| `components/content/viewer/ChatViewer.tsx` | Outline sync + scroll listener |
| `components/content/content/RightSidebarContent.tsx` | Conditional panel rendering |
| `lib/domain/tools/registry.ts` | Outline tab contentTypes expanded |
| `app/globals.css` | `.chat-outline-flash` animation |

---

## Previous Sprint: Sprint 40 (✅ Complete)

Key deliverables:
- `aiHighlight` ProseMirror Mark with indigo CSS tint
- Orchestrator auto-marking of AI-inserted content
- `insert_image` tool (9th editor tool)
- AI badge on image bubble menu
- "Show AI Content Highlights" settings toggle
- Selection highlight regression fix (deferred lock)

## Previous Sprint: Sprint 39 (✅ Complete)

Key deliverables:
- 8 agentic tools with client-side editing architecture
- Edit orchestrator with 4-phase animation
- ProseMirror text search utility
- Editor instance Zustand store

---

**Last Updated**: Mar 12, 2026
