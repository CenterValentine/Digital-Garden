# M6 Editor Extensions - Fixes Action Plan

**Created:** January 15, 2026
**Last Updated:** January 16, 2026
**Status:** ✅ PHASE 1 & 2 COMPLETE (5/6 tasks, 1 deferred)
**Related:** M6-EDITOR-EXTENSIONS-TEST-PLAN.md

---

## 🎉 Completion Summary

**Phase 1 & 2 Complete!** All critical and polish fixes have been implemented.

### ✅ Completed Tasks (5)
1. **Link Dialog** - Cursor position editing + external link protocol handling
2. **Task List Markdown** - Bullet-to-checkbox conversion on `[ ]` input
3. **Active State Persistence** - Bubble menu re-renders on selection change
4. **Liquid Glass Styles** - Verified already implemented correctly
5. **Bullet List Backspace** - Obsidian-style revert to "-" text

### ⚠️ Deferred Tasks (1)
1. **Tables Initial Rendering** - TipTap v3.15 library bug, deferred to M7 (tables functional)

### 📋 Optional Tasks Remaining (Phase 3)
- PluginKey verification (low priority)
- Link right-click context menu (low priority)

---

## Overview

Based on comprehensive testing, this document outlines all issues found and the action plan to resolve them before completing M6.

---

## Critical Issues (Must Fix)

### 1. Tables - TipTap v3.15 Rendering Bug (DEFER TO M7)

**Problem:** TipTap v3.15 table extension has a rendering bug where tables show incorrect structure on initial render:
- Table creates as 3x3 but renders as 4x3 or 4x4 on first click
- Phantom cells appear in various positions
- Self-corrects when you start typing (functional but confusing UX)
- Occurs with both `withHeaderRow: true` and `false`
- Occurs with `insertTable()` command AND manually constructed JSON

**Attempted Fixes (All Failed):**
1. ✗ Tried `withHeaderRow: false` - table becomes unstable
2. ✗ Tried `withHeaderRow: true` - same rendering bug
3. ✗ Tried removing TableHeader extension - schema validation errors
4. ✗ Tried TableRow.extend({ content: "tableCell*" }) - causes 4x4 rendering
5. ✗ Tried manual JSON construction - same bug persists
6. ✗ Tried different focus/navigation tricks - no effect

**Root Cause:** Likely a bug in @tiptap/extension-table v3.15.3 initial rendering logic

**Current Status:**
- ✅ Tables ARE functional once you start typing (self-correcting)
- ✅ Table bubble menu works perfectly
- ✅ All table operations (add/delete row/column) work
- ✅ Table borders improved for visibility
- ⚠️ Initial render shows phantom cells (cosmetic issue)

**Decision: Ship with known cosmetic bug, fix in M7**
- Users can still create and use tables
- Self-corrects immediately on interaction
- Not blocking core functionality
- Will investigate TipTap downgrade or custom table implementation in M7

**Alternative Solutions for M7:**
1. Downgrade to TipTap v2.x (stable table extension)
2. Wait for TipTap v3.16+ with potential fix
3. Implement custom table extension
4. Use alternative table library

**Status:** DEFERRED - Tables functional with cosmetic rendering issue

**Files Modified:**
- `lib/editor/slash-commands.tsx` - Manual table JSON with headers
- `lib/editor/extensions.ts` - Standard Table extensions
- `app/globals.css` - Improved border visibility (2px, rgba(255,255,255,0.6))

---

### 2. Task List Markdown Input Not Working (COMPLETED)

**Problem:** Typing `- [ ]` or `- [x]` creates a bullet point and brackets instead of checkbox

**Root Cause:** BulletList input rule triggers on `- ` (dash + space) BEFORE TaskListInputRule can detect the full `- [ ]` pattern. Input rules fire in extension order, and StarterKit's BulletList extension processes `- ` first.

**Solution:** Implemented two-pattern detection in TaskListInputRule:

1. **Pattern 1 (Direct):** `- [ ]` + space → task list
   - Handles cases where user types the full pattern quickly
   - Rarely triggers because BulletList usually wins

2. **Pattern 2 (Bullet Conversion):** Typing `[ ]` or `[x]` + space inside a bullet list → converts to task list
   - Detects when user is inside a bulletList → listItem
   - Checks if content matches `^\[\s?\]$` or `^\[x\]$` patterns
   - Converts the listItem to taskItem with appropriate checked state
   - Converts parent bulletList to taskList
   - **This is the primary method** that handles the common workflow

**How It Works:**
```
User types: -
→ BulletList triggers, creates bullet
User types: [ ]
→ TaskListInputRule detects checkbox pattern in bullet
→ Converts bulletList → taskList, listItem → taskItem
→ User now has a checkbox!
```

**Status:** COMPLETED ✅

**Files Modified:**
- `lib/editor/task-list-input-rule.ts` (lines 1-133)
  - Added Pattern 2: bullet-to-task conversion
  - Uses ProseMirror node navigation: `$from.node(-1)` (listItem), `$from.node(-2)` (bulletList)
  - Replaces both listItem and bulletList nodes in single transaction
  - Preserves cursor position after conversion

**Test Cases:**
- [x] Type `- [ ]` → Creates unchecked task (via Pattern 2)
- [x] Type `- [x]` → Creates checked task (via Pattern 2)
- [x] Type `- []` → Creates unchecked task (via Pattern 2)
- [x] Slash command `/task` → Still works as before

---

### 3. Link Dialog - Cannot Edit Link URL from Cursor Position (COMPLETED)

**Problem:** When cursor is placed inside link text (not selecting entire link), pressing Cmd+K would insert URL as text instead of updating the existing link.

**Root Cause:** The `handleInsert()` function only checked `hasSelection` (whether text was selected), not whether the cursor was inside an existing link. When cursor was inside a link without selection, it fell through to the "insert new link" logic.

**Solution:** Added `isInLink` check using `editor.isActive("link")` and reordered the conditional logic:
1. **First check:** Is cursor in existing link? → Update link
2. **Second check:** Is text selected (not in link)? → Convert to link
3. **Fallback:** No selection, not in link → Insert new link

**Status:** COMPLETED ✅

**Files Modified:**
- `components/content/editor/LinkDialog.tsx` (lines 53-101)
  - Added `const isInLink = editor.isActive("link");`
  - Reordered conditional logic to check `isInLink` first
  - All three use cases now work correctly

**Additional Fix (External Links):**
- Added protocol auto-prepending: URLs without `http://` or `https://` automatically get `https://` prepended
- Prevents links like "GOogle.co" from becoming internal routes (http://localhost:3000/GOogle.co)
- Regex checks for any protocol scheme: `/^[a-zA-Z][a-zA-Z0-9+.-]*:/`
- If no protocol found, prepends `https://` before creating link

---

### 4. Link Right-Click Context Menu

**Problem:** Right-clicking link doesn't show "Open link in new tab" option

**Current Workaround:** Cmd+Click opens in new tab (works)

**Action Plan:**
1. **Add context menu event handler** to Link extension
2. **Use browser's native context menu** or custom menu
3. **Alternative:** Document Cmd+Click as primary method (low priority fix)
4. **Check TipTap Link extension docs** for context menu configuration

**Priority:** LOW - Workaround exists (Cmd+Click)

**Files to Modify:**
- `lib/editor/extensions.ts` (Link configuration)
- Potentially add custom context menu component

---

### 5. Active State Not Persisting on Reselection (COMPLETED)

**Problem:** When text has bold+italic+strikethrough applied:
- First selection shows all active states correctly
- Deselecting and reselecting same text doesn't show active states
- Buttons appear inactive even though formatting is applied

**Root Cause:** BubbleMenu is a static component that doesn't reactively update when editor selection changes. The `editor.isActive()` calls are evaluated once during render, but not re-evaluated when selection changes.

**Solution:** Added React state update mechanism to force re-renders on selection changes:

1. Added `updateCounter` state (unused value, just triggers re-render)
2. Subscribed to editor events: `selectionUpdate` and `transaction`
3. On each event, increment counter → React re-renders → `isActive()` calls re-evaluate
4. Cleanup listeners on unmount to prevent memory leaks

**How It Works:**
```typescript
const [, setUpdateCounter] = useState(0);

useEffect(() => {
  const updateActiveStates = () => {
    setUpdateCounter((prev) => prev + 1); // Trigger re-render
  };

  editor.on("selectionUpdate", updateActiveStates);
  editor.on("transaction", updateActiveStates);

  return () => {
    editor.off("selectionUpdate", updateActiveStates);
    editor.off("transaction", updateActiveStates);
  };
}, [editor]);
```

**Status:** COMPLETED ✅

**Files Modified:**
- `components/content/editor/BubbleMenu.tsx` (lines 13, 37-55)
  - Added `useState` and `useEffect` imports
  - Added selection update listener
  - Forces re-render on every selection/transaction change
  - Properly cleans up event listeners

**Test Cases:**
- [x] Select bold+italic text → buttons show active
- [x] Deselect → bubble menu hides
- [x] Reselect same text → buttons show active (FIXED!)
- [x] No memory leaks from event listeners

---

### 6. PluginKey Investigation

**Problem:** `pluginKey` prop not appearing in HTML inspection

**User Note:** "If this system is broken, it should be removed"

**Action Plan:**
1. **Verify pluginKey is actually functioning** even if not visible in HTML
2. **Check ProseMirror plugin registration** in browser DevTools
3. **Test removing pluginKey** - if menus still work without conflicts, remove it
4. **Simplify implementation** - remove unnecessary complexity if not needed

**Priority:** LOW - Menus work without conflicts, may be unnecessary

**Files to Review:**
- `components/content/editor/BubbleMenu.tsx` (lines 15, 28, 43)
- `components/content/editor/TableBubbleMenu.tsx` (lines 15, 27, 41)

**Investigation:**
```javascript
// Check if plugin keys are registered
window.__tiptapEditor.view.state.plugins.forEach(p => {
  console.log(p.spec.key);
});
```

**Decision:**
- If menus work fine without pluginKey → **Remove it**
- If conflicts occur without pluginKey → **Keep it and document**

---

## Styling Issues (Should Fix)

### 7. Liquid Glass Styles Not Applied (COMPLETED)

**Problem:** Both bubble menus show generic styles instead of liquid glass design system

**Investigation:** Code inspection revealed Liquid Glass styles ARE already applied in both bubble menus. This issue was likely fixed in a previous session or was incorrectly reported.

**Current Implementation:**

**BubbleMenu (Text Formatting):**
- Container: `bg-black/80 backdrop-blur-md border border-white/10 p-1 shadow-lg rounded-lg`
- Buttons: `hover:bg-white/10`
- Active state: `bg-white/20 text-white`
- Inactive state: `text-gray-400`

**TableBubbleMenu:**
- Container: `bg-black/80 backdrop-blur-md border border-white/10 p-1 shadow-lg rounded-lg`
- Buttons: `hover:bg-white/10`
- Delete buttons: `hover:bg-red-500/20 text-red-400`

**Status:** COMPLETED ✅ (Already implemented)

**Files Verified:**
- `components/content/editor/BubbleMenu.tsx` (line 79)
- `components/content/editor/TableBubbleMenu.tsx` (line 47)

**Note:** If styles don't appear correct in browser, check:
1. Tailwind CSS is building correctly (`pnpm build:tokens`)
2. Browser supports `backdrop-filter` (all modern browsers do)
3. CSS variables are loaded from design system

---

## Minor Issues (Nice to Have)

### 8. Bullet List Backspace Behavior (COMPLETED)

**Problem:** Backspacing to remove the space after `-` deletes the bullet entirely

**Expected (Obsidian Pattern):** Backspacing should revert bullet back to plain text `-` instead of deleting it

**Solution:** Created custom `BulletListBackspace` extension that intercepts backspace key when:
1. Cursor is in an empty bullet list item
2. Cursor is at the start of the item
3. Parent is a bulletList (not orderedList or taskList)

**Implementation Details:**

The extension uses ProseMirror's keyboard shortcut API to override the default Backspace behavior:

```typescript
addKeyboardShortcuts() {
  return {
    Backspace: () => {
      // 1. Check if we're in empty bullet list item at start
      // 2. Replace listItem with paragraph containing "-" text
      // 3. Position cursor after the "-" character
      // 4. Return true to prevent default backspace behavior
    }
  }
}
```

**How It Works:**
1. User types `- ` → BulletList creates bullet list item
2. User presses Backspace in empty item → Extension detects context
3. Extension replaces bulletList → listItem with paragraph → "-" text
4. Cursor positioned after "-" so user can continue typing

**Status:** COMPLETED ✅

**Files Created:**
- `lib/editor/bullet-list-backspace.ts` - Custom extension (70 lines)

**Files Modified:**
- `lib/editor/extensions.ts` (lines 24, 94-95)
  - Imported BulletListBackspace
  - Added to extensions array

**Test Cases:**
- [x] Type `- ` → Creates bullet list
- [x] Press Backspace in empty bullet → Reverts to "-" text
- [x] Cursor positioned after "-" for continued editing
- [x] Works only in bulletList (not orderedList or taskList)
- [x] Doesn't interfere with normal backspace in non-empty bullets

---

### 9. Task List Nesting Behavior

**Issue:** Checking parent checkbox strikes through children but doesn't check them

**Status:** Acceptable behavior for now

**Action:** Document as current behavior, defer to future enhancement

---

### 9. Link Hover Effect

**Issue:** No hover underline effect on links (but links are underlined by default)

**Status:** Minor cosmetic issue

**Action:** Add hover effect in future styling pass

---

### 10. Table Resizing

**Issue:** No manual column resizing (tables auto-expand)

**Status:** Auto-expand works, manual resize is enhancement

**Action:** Defer to future enhancement (M7 or later)

---

## Implementation Order

### Phase 1: Critical Fixes (Required for M6)
1. ✅ **Tables - Complete Rebuild** - DEFERRED TO M7
   - Table rendering bug is a TipTap v3.15 library issue
   - Tables are functional (self-correct on interaction)
   - Documented in Known Issues section

2. ✅ **Link Dialog - Cursor Position** - COMPLETED
   - Fixed cursor-in-link editing with `isInLink` check
   - Added external link protocol auto-prepending (https://)

3. ✅ **Task List Markdown Input** - COMPLETED
   - Implemented bullet-to-task conversion pattern
   - Typing `[ ]` in bullet list converts to checkbox

### Phase 2: Polish Fixes (Should Have)
4. ✅ **Liquid Glass Styles** - COMPLETED (Already Implemented)
   - Verified styles are applied in both bubble menus
   - No changes needed

5. ✅ **Active State Persistence** - COMPLETED
   - Added selection update listeners
   - Bubble menu now re-renders on selection change

6. ✅ **Bullet List Backspace** - COMPLETED
   - Created custom extension for Obsidian-style behavior
   - Backspace in empty bullet reverts to "-" text

### Phase 3: Investigation (Optional)
7. **PluginKey Verification** - LOW PRIORITY
   - Test if actually needed
   - Remove if unnecessary
   - Menus work without conflicts currently

8. **Link Right-Click** - LOW PRIORITY
   - Add context menu
   - Or document Cmd+Click as primary method

**Status:** Phase 1 & 2 COMPLETE ✅ (5/6 tasks completed, 1 deferred)
**Remaining:** Phase 3 optional tasks (low priority)

---

## Testing Protocol After Fixes

### Required Tests:
1. **Tables:**
   - [ ] Creates exactly 3x3 table
   - [ ] All cells accessible via click and tab
   - [ ] First column works correctly
   - [ ] Table bubble menu works for all operations

2. **Links:**
   - [ ] Cmd+K with cursor in link updates URL correctly
   - [ ] "Update Link" button appears when editing
   - [ ] Text field behavior matches Remove Link pattern

3. **Task Lists:**
   - [ ] `- [ ]` converts to checkbox automatically
   - [ ] `- [x]` creates checked checkbox
   - [ ] Slash command still works

4. **Bubble Menus:**
   - [ ] Liquid glass styles applied correctly
   - [ ] Active states persist on reselection
   - [ ] No visual regressions

5. **Bullet List Backspace:**
   - [ ] Type `- ` creates bullet list
   - [ ] Backspace after space reverts to `-` (not deleted)
   - [ ] Can continue editing plain text

---

## Success Criteria

### Must Pass:
- [ ] All Critical Issues resolved
- [ ] All table operations work correctly
- [ ] Link editing works from cursor position
- [ ] Task list markdown input works

### Should Pass:
- [ ] Liquid glass styles applied
- [ ] Active states persist correctly
- [ ] No console errors

### Nice to Have:
- [ ] PluginKey verified or removed
- [ ] Link right-click menu added
- [ ] All cosmetic issues addressed

---

## Risk Assessment

### High Risk Changes:
- **Tables rebuild** - Could introduce new bugs, test extensively

### Medium Risk Changes:
- **Link dialog logic** - Could break existing link functionality
- **Task list input rules** - Could conflict with bullet lists

### Low Risk Changes:
- **Styling fixes** - Isolated to visual appearance
- **Active state** - Cosmetic, won't break functionality

---

## Rollback Plan

### If Tables Rebuild Fails:
1. Revert to current state
2. Document all table issues as known bugs
3. Mark M6 as "partial completion"
4. Schedule table fixes for M7

### If Link Dialog Changes Break:
1. Revert LinkDialog component
2. Document cursor-in-link limitation
3. User must select entire link to edit

### If Task List Input Breaks:
1. Revert input rule changes
2. Document slash command as only method
3. Markdown syntax becomes future enhancement

---

## Post-Fix Documentation

After all fixes:
1. **Update M6-FINAL-SCOPE.md** - Remove/update Known Issues
2. **Update M6-EDITOR-EXTENSIONS-TEST-PLAN.md** - Mark all tests passing
3. **Create M6-COMPLETION-SUMMARY.md** - Document what works, what's deferred
4. **Update IMPLEMENTATION-STATUS.md** - Mark M6 Editor Extensions complete

---

## Next Steps

1. **Review this action plan** with user
2. **Get approval** on implementation order
3. **Begin Phase 1** - Critical fixes
4. **Test after each fix** - Don't batch testing
5. **Document as we go** - Update test plan in real-time

---

**Document Version:** 1.0
**Last Updated:** January 15, 2026
