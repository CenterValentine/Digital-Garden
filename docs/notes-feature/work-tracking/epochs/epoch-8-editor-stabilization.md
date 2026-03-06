---
epoch: 8
title: Editor Stabilization
duration: 2 sprints (35-36)
status: planned
theme: Bug fixes, TipTap rules, focus guardrails, table rebuild
---

# Epoch 8: Editor Stabilization

## Goal
Fix all known TipTap editor bugs, establish canonical editor behavior rules, and implement focus guardrails. The editor must be crisp and bug-free before adding new features.

## Prerequisites
- TIPTAP-EDITOR-RULES.md reviewed and approved by user (before Sprint 36 focus guardrails)

## Success Criteria
- All 11 known editor bugs resolved
- TipTap Editor Rules document approved and implemented
- Focus guardrails prevent unintentional focus changes
- Tables rebuilt from scratch with no visual bugs
- Zero old console.log statements in editor code
- `pnpm build` passes

---

## Sprint 35: TipTap Rules Doc + Input Rule Bug Fixes

**Theme:** Establish editor behavior rules, fix input rule conflicts

### Documentation
- [ ] Create `docs/notes-feature/guides/editor/TIPTAP-EDITOR-RULES.md`
  - Focus Rules: single gate for intentional focus changes
  - Input Rule Priority: headings > autocomplete
  - Autocomplete Rules: 2s delay, space cancels, `##` cancels tag autocomplete
  - Slash Command Rules: `/` only on first char of empty line
  - Blockquote Rules: `>` only modifies current line
  - Header Behavior: backspace → `#` chain → space → re-enter header

### Bug Fixes
- [ ] Tag/heading conflict: `#` triggers tag autocomplete instead of heading conversion
- [ ] `## ` typed quickly triggers tag autocomplete, sometimes fails to convert to H2
- [ ] `##` typed quickly shows persistent tag autocomplete even after continued typing
- [ ] Tag autocomplete needs 2-second delay; space after `#` must break autocomplete
- [ ] Slash command should only trigger on first character of an empty line
- [ ] Header escape: backspace on empty header → revert to appropriate `#` chain
- [ ] `# ` (H1 with space) should never trigger tag autocomplete

### Key Files
- `lib/domain/editor/extensions/tag-suggestion.tsx` — tag autocomplete trigger logic
- `lib/domain/editor/extensions/tag.ts` — tag auto-convert plugin
- `lib/domain/editor/commands/slash-commands.tsx` — slash command trigger
- `lib/domain/editor/extensions-client.ts` — extension registration order

---

## Sprint 36: Table Rebuild + Link Fix + Cleanup + Focus Guardrails

**Theme:** Rebuild tables, fix remaining bugs, implement focus system

### Bug Fixes
- [ ] **Table rebuild** (user must approve before moving on):
  - Remove ALL table CSS from `app/globals.css` (lines 568-614)
  - Remove any custom table logic
  - Rebuild following TipTap docs only
  - Simple, clean CSS
  - Fix extra column visual bug
  - TableBubbleMenu stays, same functionality
- [ ] URL/link escape: cursor adjacent to link should not inherit link formatting
  - Right-click → lightweight URL dialog (smaller, simpler LinkDialog)
  - Center on page, always escapable
- [ ] `>` blockquote: should only update current line, never child content
- [ ] Header in paragraph with `hardBreak`: `##` converts ALL paragraph text to header
  - Fix: only convert text before the hardBreak
- [ ] Remove old console.log/console.warn:
  - `extensions-client.ts` lines 149-150
  - `MarkdownEditor.tsx` lines 168-170, 182
  - `tag.ts` line 356
  - Sweep all `components/content/` and `lib/domain/editor/`
- [ ] Implement focus guardrails per approved TIPTAP-EDITOR-RULES.md

### Key Files
- `app/globals.css` — table CSS to remove
- `components/content/editor/MarkdownEditor.tsx` — focus management, console logs
- `components/content/editor/BubbleMenu.tsx` — focus prevention
- `lib/domain/editor/extensions-client.ts` — extension config, console logs
- `lib/domain/editor/extensions/tag.ts` — console log

---

**Last Updated**: Mar 5, 2026
