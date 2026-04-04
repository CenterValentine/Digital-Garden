---
sprint: 48
epoch: 11 (Block Builder + Templates + Snippets + Input Blocks + Tech Debt)
duration: 2026-04-02
branch: main
status: planned
---

# Sprint 48: UI Cleanups + Tech Debt

## Sprint Goal
Adhoc tech debt sprint addressing visual bugs, UX inconsistencies, and design system alignment. Each issue is gated — resolve before moving to next. Skip if blocked.

**Status**: Planned

## Success Criteria
- [ ] `pnpm build` passes after each fix
- [ ] Logo GIF visible on desktop
- [ ] Favicon and tab metadata updated
- [ ] Neon/debug styling replaced with glass-ui tokens
- [ ] File tree scrollable with single scroll
- [ ] Panel header toggles not clipped
- [ ] "+" button repositioned
- [ ] Root pseudo-selectable with file count in status bar
- [ ] Inline file rename via H1 header
- [ ] Content scrollable to bottom without keyboard workaround

## Work Items (Gated — sequential)

### 1. Logo GIF Fix
- [ ] Fix animated tree logo inside gold medallion (NotesNavBar → CompactLogo)
- [ ] Desktop renders ring but SVG tree is invisible
- [ ] Likely `useLogoAnimation` issue: SVG paths stay at `opacity: 0` if draw animation fails

### 2. Favicon + Tab Metadata
- [ ] Copy logo to make it a favicon
- [ ] Update tab title to "Digital Garden"
- [ ] Review/update OG metadata (og:title, og:description, og:image)

### 3. Neon Formatting Removal
- [ ] Replace neon/debug styling (JSON viewer, debug panels) with glass-ui design system
- [ ] Convert any remaining neon formatting to glass surfaces/intents

### 4. Double Scroll Fix
- [ ] File tree requires two scrolls to view bottom content
- [ ] Single scroll should cover full tree even when folders are expanded
- [ ] Scroll alignment breaks on folder expansion

### 5. Panel Header Toggle Cutoff
- [ ] Left and right sidebar headers clip panel toggle buttons
- [ ] User shouldn't need to manually correct this

### 6. "+" Button Repositioning
- [ ] Move "+" action button to the left of extensions/calendar icons
- [ ] Horizontal overflow scrollable but expansion toggle must persist outside scroll area

### 7. Root Pseudo-Selectable
- [ ] Make "Root" clickable and highlightable like a tree node
- [ ] Selecting Root shows total file count in status bar

### 8. Status Bar File Count
- [ ] Selecting a file shows "1 file selected" in bottom status bar
- [ ] Multi-select shows count of selected files

### 9. Inline File Rename via H1
- [ ] Clicking H1 document header enters rename mode
- [ ] Name change updates file tree in real-time
- [ ] File tree rename updates H1 header in real-time

### 10. Content Scroll Issue
- [ ] Document content can't scroll to bottom without moving cursor via keyboard
- [ ] Should be scrollable naturally with mouse/trackpad

---

# Sprint 49: Error Handling + Auth Redirects (Planned)

## Sprint Goal
Improve error handling so users never see raw error states from auth failures.

### Work Items
- [ ] All 401/403/session-expired errors redirect to login page
- [ ] "Failed to load content" errors from signed-out state replaced with graceful redirect
- [ ] Detect auth failures at fetch/API layer and redirect
- [ ] No raw error states visible to signed-out users
