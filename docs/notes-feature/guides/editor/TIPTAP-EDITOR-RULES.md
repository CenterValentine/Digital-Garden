# TipTap Editor Rules

**Canonical behavior rules for the Digital Garden TipTap editor.** All editor extensions, input rules, and focus management must follow these rules. This document must be reviewed and approved before any focus or input rule changes are implemented.

---

## 1. Focus Rules

### Single-Gate Principle
The editor has **one gate** that controls focus changes. Only intentional, user-initiated actions pass through the gate. Everything else is blocked.

**Allowed focus changes** (intentional):
- User clicks inside the editor
- User clicks an outline item in the sidebar panel (gated autofocus)
- User triggers a focus-related keyboard shortcut
- A document-level focus feature explicitly requests focus (e.g., search-and-replace "jump to next match")

**Blocked focus changes** (distractions):
- Component re-renders causing focus shift
- State updates from Zustand stores moving focus
- Sidebar interactions (other than outline click) stealing focus
- Auto-save operations triggering focus events
- BubbleMenu, TableBubbleMenu, or toolbar interactions stealing focus (must use `onMouseDown={e => e.preventDefault()}`)
- Suggestion menus (tag, wiki-link, slash command) closing and moving focus away from the editor

### Implementation Guidelines
- Never call `editor.commands.focus()` from BubbleMenu command chains (causes focus/blur cycle)
- All BubbleMenu and toolbar buttons must have `onMouseDown={e => e.preventDefault()}`
- Do NOT use `stopPropagation()` on editor events — TipTap needs event propagation
- Use `contentEditable` container focus, not programmatic `.focus()` calls
- When closing suggestion menus, focus must return to the original cursor position

---

## 2. Input Rule Priority

### Hierarchy (highest to lowest)
1. **Heading conversion** (`# `, `## `, `### `, etc.)
2. **Blockquote** (`> `)
3. **List conversion** (`- `, `1. `)
4. **Task list** (`- [ ] `, `- [x] `)
5. **Code block** (`` ``` ``)
6. **Horizontal rule** (`---`)
7. **Callout** (`> [!type]`)
8. **Autocomplete triggers** (`#` for tags, `[[` for wiki-links, `/` for slash commands)

### Conflict Resolution
When two input rules share the same trigger character:
- **The structural rule always wins** over the autocomplete rule
- Example: `## ` (heading) beats `#` (tag autocomplete) — the heading rule fires on `# ` (with space), tag autocomplete must wait for a delay and confirm no heading is forming

---

## 3. Autocomplete Rules

### Universal Autocomplete Behavior
These rules apply to ALL autocomplete/suggestion triggers (tags, wiki-links, slash commands):

1. **Delay**: Autocomplete must not appear for at least **2 seconds** after the trigger character is typed
2. **Space cancels**: If a space character is typed at any point after the trigger, autocomplete is **immediately cancelled** — no exceptions
3. **Continued typing of trigger character cancels**: If the user types additional trigger characters (e.g., `##`), autocomplete for the first trigger is cancelled
4. **Escape closes**: Pressing Escape always closes autocomplete and returns focus to the editor cursor

### Tag Autocomplete (`#`)
- Trigger: `#` character
- **Must NOT trigger** inside headings (the `#` is part of the heading syntax)
- **Must NOT trigger** when followed by a space — `# ` is a heading, not a tag
- `##` must cancel tag autocomplete from the first `#` (user is typing a heading)
- 2-second delay before showing the suggestion menu
- If no tag match is found after the delay, show "Create new tag" option

### Wiki-Link Autocomplete (`[[`)
- Trigger: `[[` (two characters)
- Space after `[[` still allows autocomplete (spaces are valid in note titles)
- Closing `]]` or pressing Escape cancels

### Slash Commands (`/`)
- Trigger: `/` character
- **Must only trigger on the first character of an empty line** (paragraph with no preceding text)
- If the line has any text before `/`, do NOT trigger slash commands
- If `/` is typed in the middle of existing text, treat as literal character

---

## 4. Header Behavior

### Markdown-to-Header Conversion
- Typing `# ` (hash + space) at the start of a line converts to H1
- Typing `## ` converts to H2, `### ` to H3 (up to H6)
- The conversion only happens when a space follows the hash chain
- **Only the text before a `hardBreak` is converted** — if a paragraph contains a `hardBreak`, text after it stays as-is

### Header Escape (Backspace Behavior)
- Backspace on an **empty header** reverts to a paragraph containing the appropriate `#` chain for that level
  - Empty H1 → paragraph with text `#`
  - Empty H2 → paragraph with text `##`
  - Empty H3 → paragraph with text `###`
- From the `#` chain paragraph, pressing space triggers heading conversion again (re-entering the heading)
- From the `#` chain paragraph, pressing Backspace deletes `#` characters normally

### Header and Tag Interaction
- `# ` (H1 with space) must NEVER trigger tag autocomplete
- The heading input rule fires on space, which must consume the event before tag autocomplete can activate
- `##` typed quickly must cancel any tag autocomplete from the first `#`

---

## 5. Blockquote Rules

### Current Line Only
- Typing `>` as the first character on a line creates a blockquote for **that line only**
- `>` must NEVER affect child content, sibling lines, or nested content
- If the cursor is inside existing content with children (e.g., a list with sub-items), `>` only wraps the current text node

---

## 6. Link/URL Behavior

### Cursor and Formatting
- When the cursor is **immediately adjacent** to a link (before or after), the cursor must NOT inherit the link's text formatting
- The user must click **inside** the link text to edit it
- Clicking adjacent to a link places the cursor in normal (non-link) text

### Link Editing
- Right-clicking a link opens a lightweight URL dialog
- The dialog must be:
  - Small and simple (minimal glass blur / background effects)
  - Centered on the page
  - Always escapable (Escape key, click outside, or close button)
- The dialog allows editing the URL and display text

---

## 7. Extension Registration Order

When registering extensions, ensure the order respects the input rule priority:
1. StarterKit (provides headings, lists, blockquotes, code blocks, horizontal rule)
2. Custom structural extensions (Callout, TaskList, BulletListBackspace)
3. Inline extensions (Link, WikiLink, Tag)
4. Suggestion/autocomplete extensions (SlashCommands, TagSuggestion, WikiLinkSuggestion)

This ensures structural input rules are registered first and take priority over autocomplete triggers.

---

## 8. Console Logging Policy

- **No `console.log` in production code** — remove all debug logging before merging
- `console.warn` is acceptable for genuinely unexpected but non-fatal conditions (e.g., missing handler)
- `console.error` is acceptable for actual errors that should be investigated
- For development debugging, use a debug flag or the existing DebugPanel (Cmd+Shift+T)

---

## References
- [TipTap Input Rules](https://tiptap.dev/docs/editor/api/input-rules)
- [ProseMirror Plugin Priority](https://prosemirror.net/docs/ref/#state.PluginSpec.priority)
- `lib/domain/editor/extensions-client.ts` — extension registration
- `lib/domain/editor/extensions/` — all custom extensions
- `components/content/editor/` — editor components

---

**Last Updated**: Mar 5, 2026
**Status**: Active — living document. Expand as new TipTap features are added.
