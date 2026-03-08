---
sprint: 36
epoch: 8 (Editor Stabilization)
duration: 1 session
branch: epoch-8/sprint-36
status: complete
---

# Sprint 36: Table Rebuild + Link Fix + Cleanup + Focus Guardrails

## Sprint Goal
Fix remaining editor bugs, remove debug logging, implement focus guardrails, and rebuild the table from TipTap documentation. This is the second and final sprint of Epoch 8 (Editor Stabilization).

**Status**: ✅ Complete

## Success Criteria
- [x] `pnpm build` passes
- [x] Console.log/console.warn removed from editor code (console.error kept)
- [x] TableBubbleMenu buttons don't call `.focus()` — use `preventFocusLoss` pattern
- [x] Slash command table insert has no `setTimeout` focus hack
- [x] Link extension documents `inclusive: false` default behavior
- [x] `## ` in paragraph with hardBreak only converts text before break to heading
- [x] `> ` in paragraph with hardBreak only quotes text before break
- [x] Table CSS rebuilt from TipTap docs (minimal, clean)
- [x] Table configured with `resizable: true`
- [x] New extensions registered in both client and server extension sets

## Work Items

### Console Cleanup (~1pt)
- [x] **CL-036-001**: Remove WikiLink console.log fallback (1 pt) ✅
  - **Fix**: Changed fallback handler to no-op `() => {}`
  - **File**: `lib/domain/editor/extensions-client.ts`

- [x] **CL-036-002**: Remove MarkdownEditor console.warn (0.5 pt) ✅
  - **Fix**: Removed `console.warn` from cross-document save guard; kept guard logic
  - **File**: `components/content/editor/MarkdownEditor.tsx`

### Focus Guardrails (~3pts)
- [x] **FG-036-001**: TableBubbleMenu focus violation (2 pts) ✅
  - **Fix**: Removed `.focus()` from all 7 button chains, added `preventFocusLoss` (`onMouseDown={e => e.preventDefault()}`)
  - **File**: `components/content/editor/TableBubbleMenu.tsx`

- [x] **FG-036-002**: Slash command setTimeout focus hack (1 pt) ✅
  - **Fix**: Removed `setTimeout(() => { editor.chain().focus().run() }, 0)` after table insertion
  - **File**: `lib/domain/editor/commands/slash-commands.tsx`

### Link Configuration (~1pt)
- [x] **LK-036-001**: Document Link `inclusive: false` default (1 pt) ✅
  - **Fix**: TipTap's Link mark already defaults to `inclusive: false` — added comment documenting this. The `inclusive` option is a ProseMirror Mark schema property, not a TipTap extension config option.
  - **File**: `lib/domain/editor/extensions-client.ts`

### Heading + HardBreak Split (~3pts)
- [x] **HB-036-001**: HeadingHardbreakSplit extension (3 pts) ✅
  - **Fix**: New `appendTransaction` plugin that splits heading nodes at hardBreaks. Content before the break stays as heading; content after becomes a new paragraph.
  - **File**: `lib/domain/editor/extensions/heading-hardbreak-split.ts` (new)

### Blockquote Line-Only (~3pts)
- [x] **BQ-036-001**: BlockquoteLineOnly extension (3 pts) ✅
  - **Fix**: New `appendTransaction` plugin that splits blockquotes at hardBreaks. Content before the break stays in blockquote; content after becomes a sibling paragraph outside the blockquote.
  - **File**: `lib/domain/editor/extensions/blockquote-line-only.ts` (new)

### Table Rebuild (~5pts)
- [x] **TB-036-001**: Remove old table CSS (1 pt) ✅
  - **Fix**: Deleted existing gold-tinted table styles from `globals.css`
  - **File**: `app/globals.css`

- [x] **TB-036-002**: Write new minimal table CSS (2 pts) ✅
  - **Fix**: New styles based on TipTap docs — neutral borders, subtle header bg, gold accent for selection/resize only, `.tableWrapper` overflow, resize cursor
  - **File**: `app/globals.css`

- [x] **TB-036-003**: Configure Table extension (1 pt) ✅
  - **Fix**: `Table.configure({ resizable: true })`
  - **File**: `lib/domain/editor/extensions-client.ts`

- [x] **TB-036-004**: Register new extensions (1 pt) ✅
  - **Fix**: Added HeadingHardbreakSplit and BlockquoteLineOnly to both client and server extension sets
  - **Files**: `lib/domain/editor/extensions-client.ts`, `lib/domain/editor/extensions-server.ts`

## Estimated Points: ~17 pts

## Technical Notes

### appendTransaction Pattern
Both HeadingHardbreakSplit and BlockquoteLineOnly use ProseMirror's `appendTransaction` hook. This fires after every transaction (including input rule conversions from StarterKit). The plugins scan the document for heading/blockquote nodes containing hardBreaks and split them reactively. This approach avoids overriding StarterKit's deeply integrated input rules.

### Focus Guardrails (Single-Gate Principle)
Per TIPTAP-EDITOR-RULES.md section 1, only user-initiated actions should cause focus changes. BubbleMenu/toolbar buttons are NOT user-initiated focus events — they supplement an existing focus. The `preventFocusLoss` pattern (`onMouseDown={e => e.preventDefault()}`) prevents the browser from shifting focus to the button before the click handler runs.

### Link `inclusive` Property
TipTap v3's Link extension TypeScript types don't expose `inclusive` as a config option — it's a ProseMirror Mark schema property set internally. The extension already defaults to `inclusive: false`, which means cursor at a link boundary won't extend the link mark to new text.

## Files Changed

| File | Action |
|------|--------|
| `app/globals.css` | Removed old table CSS, added new minimal table CSS |
| `lib/domain/editor/extensions-client.ts` | Link docs, Table config, imports, WikiLink no-op |
| `lib/domain/editor/extensions-server.ts` | Added imports for new extensions |
| `components/content/editor/TableBubbleMenu.tsx` | Focus guardrails |
| `components/content/editor/MarkdownEditor.tsx` | Console cleanup |
| `lib/domain/editor/commands/slash-commands.tsx` | Removed setTimeout focus hack |
| `lib/domain/editor/extensions/heading-hardbreak-split.ts` | **New** |
| `lib/domain/editor/extensions/blockquote-line-only.ts` | **New** |

---

## Previous Sprint: Sprint 35 (✅ Complete)

See Sprint 35 details. Key deliverables:
- TIPTAP-EDITOR-RULES.md (living document)
- Tag/heading conflict fixes (2-second delay, allow() guards)
- Slash command empty-line restriction
- HeadingBackspace extension

---

**Last Updated**: Mar 6, 2026
