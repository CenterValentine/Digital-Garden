# AI Editor Behaviors — Living Document

> Sprint 39-40 | Last updated: 2026-03-12

This document tracks all behaviors, edge cases, and decisions for the AI-powered document editing system.

## Architecture

**Model:** Client-side editing. The AI reads the document and returns edit instructions (`before`/`after` pairs). The frontend applies edits to the live TipTap editor instance. No server-side DB writes for edits — auto-save handles persistence.

**Why:** Avoids lossy markdown round-trip. TipTap's ProseMirror engine handles node structure natively. Undo (Cmd+Z) works through ProseMirror's transaction history.

## Tool Behavior Summary

| Tool | Server Action | Client Action |
|------|--------------|---------------|
| `read_first_chunk` | Read TipTap JSON from DB, convert to markdown, return chunk | None |
| `read_next_chunk` | Return next chunk from cached document | None |
| `read_previous_chunk` | Return previous chunk | None |
| `apply_diff` | Validate before/after, return edit payload | Find text, animate selection, stream replacement |
| `replace_document` | Return new markdown content | `editor.commands.setContent()` with full replacement |
| `insert_image` | Validate URL, return image payload | Insert image node with `source: "ai-generated"` |
| `plan` | Return plan text | Display in chat |
| `ask_user` | Return question | Display in chat |
| `finish_with_summary` | Return summary | Display in chat, release editor lock |

## Read Consistency

- **Problem:** AI reads from DB, but editor may have unsaved changes.
- **Solution:** Send editor's current text content in chat request body. Read tools use client-provided content when available, fall back to DB.

## Edit Animation Sequence

### Phase 1: Cursor Arrival (~0.5s)
- Scroll target text into view
- AI cursor (distinct colored bar, not normal text cursor) appears at start of `before` text
- Cursor blinks 2-3 times

### Phase 2: Selection Highlight (~1-2s)
- AI cursor sweeps across `before` text
- Uses AI-specific highlight color (distinct from browser selection)
- Brief pause with full selection visible

### Phase 3: Deletion + Typing (varies)
- Selected text removed
- New text appears character-by-character
- Base speed: 20-40ms per character
- Randomized micro-pauses (50-150ms) every 5-15 characters
- Longer pauses (~200-300ms) at sentence boundaries for long text
- Each inserted character gets `source: 'ai'` mark

### Phase 4: Settle (~0.3s)
- AI cursor fades out
- AI highlight mark persists on new text
- Auto-save fires on normal 2-second debounce

### Multiple Diffs
- Diffs execute sequentially (queue)
- ~500ms pause between diffs
- Each diff plays full animation

## Edge Cases & Failure Modes

### Text Search Fails
- **Cause:** `before` text doesn't match editor content (stale read, user edits, whitespace)
- **Behavior:** Animation aborts. Error shown in chat: "Could not locate the text to edit."
- **Recovery:** User can manually apply or ask AI to retry.

### Editor Lock During AI Edits
- **Strategy:** Deferred lock — editor stays editable during Phases 1-2 (cursor arrival + selection highlight) so the browser renders native text selection. Locked via `setEditable(false)` at Phase 3 when actual modifications begin.
- Show "AI is editing..." indicator overlay from Phase 1 onward.
- Disable all auto-focus behaviors while locked (prevents focus stealing from chat panel or other UI).
- **Timeout failsafe:** If the animation doesn't complete within 30 seconds, force-unlock the editor and abort remaining edits. Prevents user from being permanently locked out.
- **Unlock trigger:** Animation complete, timeout, or document navigation.

### User Clicks During Animation
- Editor is locked, so clicks are intercepted.
- If user somehow gains access (edge case): abort all pending edits immediately, force-unlock editor, apply any in-progress edit instantly.
- The AI should NOT continue editing after user interaction — abort is the ultimate failsafe.

### User Types During Animation
- Blocked by editor lock. Keystrokes ignored.
- If somehow bypassed: same abort behavior as click.

### User Presses Undo (Cmd+Z) During Animation
- Blocked by editor lock.
- After animation completes and editor unlocks: undo works normally on the completed edit(s).

### Multiple Rapid Diffs
- **Queue system:** Tool text executions are queued. Each animation must fully complete before the next starts.
- Queue order matches the order the AI called the tools.
- If abort triggered mid-sequence: current edit completes instantly, remaining diffs in queue are dropped.
- Chat shows which edits were applied vs skipped.

### Document Navigated Away
- User switches to another note mid-animation.
- Abort all pending edits immediately.
- No partial writes (edits are client-side, so switching just discards the in-progress animation).

### Document Deleted
- Similar to navigation — abort pending edits.

### Auto-Save During Animation
- Auto-save debounce timer should NOT fire during active AI editing.
- Reset debounce timer when animation completes. Save fires 2s after last edit lands.
- Prevents partial state from being persisted.

### Long Documents
- `before` text must be unique in the document. AI is instructed to include enough context.
- If multiple matches found: abort with error "Found N matches, please be more specific."

### Empty Replacement (Deletion)
- `after` is empty string → treated as delete operation.
- Animation: selection highlight → text fades out (no typing phase).

## AI Content Marking (Sprint 40) — IMPLEMENTED

- All AI-inserted text receives a ProseMirror mark: `{ type: 'aiHighlight', attrs: { source: 'ai' } }`
- Visual: subtle indigo background tint + bottom border (`rgba(99, 102, 241, 0.12)`)
- Toggleable in settings: `/settings/ai` → "Show AI Content Highlights"
- CSS class toggle: `.ai-highlight-hidden` on ancestor hides all highlights without removing marks
- Mark applied post-insertion via `tr.addMark()` over the full insertion range
- `inclusive: false` prevents mark from spreading when user types at boundaries
- Both `typeText` and `insertStructuredContent` return end position for accurate range marking
- `replace_document` marks entire document content
- AI-generated images: `source: "ai-generated"` attribute, "AI" badge in image bubble menu
- Deferred: strip on external copy, "Paste as AI" option

## Security Model

- AI edits go through the same ProseMirror transaction system as user edits
- No direct API write access for edits — always through the editor instance
- Server-side tools are read-only for edit operations (validate + return payload)
- Authentication still enforced for read operations (userId ownership check)

## Shared Editor Access

- **Mechanism:** Zustand store holding the TipTap editor instance ref
- **Set by:** Editor component on mount
- **Read by:** Chat panel when intercepting `apply_diff` / `replace_document` tool results
- **Cleared on:** Editor unmount, document navigation

## Auto-Focus Prevention

- While editor is locked for AI edits, all auto-focus behaviors are suppressed:
  - Content selection changes should not steal focus to the editor
  - Sidebar tab switches should not refocus the editor
  - Any `editor.commands.focus()` calls are gated behind an `isAiEditing` check
- The chat input should remain focusable during AI edits (user may want to type next message)
- Focus is restored to the editor only after unlock + animation settle

## Open Questions

- [ ] Should `replace_document` also animate, or just instant swap?
- [ ] Should AI edits be grouped into a single undo step, or one undo per diff?
- [ ] Should there be a "reject AI edit" button that undoes the last AI change?
- [ ] How to handle code blocks — should AI typing respect language syntax highlighting in real-time?
- [ ] Should the animation speed be configurable in settings?
