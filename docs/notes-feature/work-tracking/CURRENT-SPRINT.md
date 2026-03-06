---
sprint: 35
epoch: 8 (Editor Stabilization)
duration: 1 session
branch: fix/cross-document-save-race
status: complete
---

# Sprint 35: TipTap Rules Doc + Input Rule Bug Fixes

## Sprint Goal
Establish canonical editor behavior rules (TIPTAP-EDITOR-RULES.md) and fix all input rule conflicts between tag autocomplete and heading conversion. The rules document must be reviewed and approved before Sprint 36 implements focus guardrails.

**Status**: ✅ Complete

## Success Criteria
- [x] `pnpm build` passes
- [x] TIPTAP-EDITOR-RULES.md created (living document — expand as features are added)
- [x] Tag autocomplete does not trigger when typing heading syntax (`#`, `##`, `###`).  It only triggers when typing `#` followed by text without a space.
- [x] Tag autocomplete has 2-second delay before appearing
- [x] Space after `#` cancels any prior tag autocomplete and triggers heading conversion
- [x] `##` cancels any tag autocomplete from the first `#`
- [x] Slash command only triggers on first character of an empty line
- [x] Backspace on empty header reverts to `#` chain in paragraph

## Work Items

### Documentation
- [x] **DOC-001**: Create TIPTAP-EDITOR-RULES.md (3 pts) ✅
  - Living document — expand as new TipTap features are added
  - **File**: `docs/notes-feature/guides/editor/TIPTAP-EDITOR-RULES.md`

### Bug Fixes
- [x] **BF-035-001**: Tag/heading conflict fix (5 pts) ✅
  - **Fix**: 2-second `setTimeout` delay in `onStart`; popup hidden via `showOnCreate: false`
  - **Files**: `lib/domain/editor/extensions/tag-suggestion.tsx`

- [x] **BF-035-002**: `## ` triggers tag autocomplete instead of H2 (3 pts) ✅
  - **Fix**: `allow()` guard checks query for `#` prefix → returns false → `onExit()` fires
  - **Files**: `lib/domain/editor/extensions/tag-suggestion.tsx`

- [x] **BF-035-003**: Persistent tag autocomplete on `##` (2 pts) ✅
  - **Fix**: Same `allow()` guard + defense-in-depth `onUpdate` `##` check
  - **Files**: `lib/domain/editor/extensions/tag-suggestion.tsx`

- [x] **BF-035-004**: Tag autocomplete delay + space-break (3 pts) ✅
  - **Fix**: During 2s delay, `isVisible=false` → `onKeyDown` returns false for all keys → ProseMirror handles space normally → `allowSpaces: false` causes suggestion exit
  - **Files**: `lib/domain/editor/extensions/tag-suggestion.tsx`

- [x] **BF-035-005**: Slash command empty line restriction (2 pts) ✅
  - **Fix**: `allow()` guard checks `$from.parentOffset !== 0` and `parent.textContent !== suggestionText`
  - **Files**: `lib/domain/editor/commands/slash-commands.tsx`

- [x] **BF-035-006**: Header backspace escape (3 pts) ✅
  - **Fix**: New `HeadingBackspace` extension: empty heading → paragraph with `#` chain
  - **Files**: `lib/domain/editor/extensions/heading-backspace.ts` (new), `lib/domain/editor/extensions-client.ts`

- [x] **BF-035-007**: H1 space must not trigger tag autocomplete (1 pt) ✅
  - **Fix**: Covered by 2-second delay — popup never shown before space causes suggestion exit
  - **Files**: `lib/domain/editor/extensions/tag-suggestion.tsx`

## Estimated Points: ~22 pts

## Technical Notes

### Root Cause Analysis
The tag autocomplete trigger (`#`) at `tag-suggestion.tsx` fires on a single character with no delay, racing against StarterKit's heading input rules (`## `). This is an architectural overlap — two features competing for the same keystrokes.

### Fix Strategy
1. Add 2-second `setTimeout` delay to tag suggestion's `onStart` handler
2. In tag suggestion's `allow` guard (lines 157-179): reject when preceded by additional `#` chars
3. In tag suggestion's space handler: dismiss suggestion and let event propagate to heading input rules
4. Slash commands: check `$from.parentOffset === 0 && $from.parent.textContent === '/'` in allow guard

---

## Previous Sprint: Sprint 34 (✅ Complete)

See [Sprint 34 archive](history/) for details. Key deliverables:
- ChatPanel + ChatViewer with streaming
- AI tools (searchNotes, getCurrentNote, createNote)
- @ mentions, / commands, ModelPicker
- Chat export, sidebar auto-switch, chat icon

---

**Last Updated**: Mar 6, 2026
