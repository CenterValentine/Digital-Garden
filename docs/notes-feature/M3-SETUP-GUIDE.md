# M3 Setup Guide

**Milestone:** M3 - UI Foundation with Liquid Glass  
**Status:** Implementation Complete  
**Last Updated:** January 12, 2026

## What Was Implemented

✅ **Design Token System**

- `lib/design-system/surfaces.ts` - Glass surface tokens (glass-0/1/2)
- `lib/design-system/intents.ts` - Semantic intent colors
- `lib/design-system/motion.ts` - Conservative motion rules

✅ **State Management**

- `stores/panel-store.ts` - Zustand store with localStorage persistence and version-based migration

✅ **Panel Layout System**

- `components/content/PanelLayout.tsx` - Allotment-based resizable panels
- `components/content/LeftSidebar.tsx` - File tree placeholder
- `components/content/RightSidebar.tsx` - Outline/backlinks placeholder
- `components/content/MainPanel.tsx` - Editor placeholder
- `components/content/StatusBar.tsx` - Status information

✅ **Route Structure**

- `app/(authenticated)/content/layout.tsx` - Notes layout wrapper
- `app/(authenticated)/content/page.tsx` - Main notes page

✅ **Dependencies Added**

- `allotment` - Resizable panel layout
- `zustand` - State management
- `@tanstack/react-virtual` - Virtualization (for M4)

---

## Setup Instructions

### Step 1: Install Dependencies

```bash
cd /Users/davidvalentine/Documents/Digital-Garden

# Install new dependencies
pnpm install
```

This will install:

- `allotment@^1.20.3`
- `zustand@^5.0.2`
- `@tanstack/react-virtual@^3.10.8`

### Step 2: Add Glass-UI Components (Optional - Not Required for M3)

**Important:** Glass-UI and DiceUI component installation will be handled in later milestones when specific components are needed. For M3, we've built everything with basic React components styled using our design tokens.

**Status of Component Registries:**

- ✅ **Glass-UI**: Will verify and add components in M4+ as needed
- ⚠️ **DiceUI**: Registry URL verification required (encountered 404 error)
  ```bash
  # Known issue:
  npx shadcn@latest add "@diceui/command"
  # Returns: "The item at https://diceui.com/r/command.json was not found"
  ```

**Alternative Approach for M4+:**
When we need Glass-UI/DiceUI components, we'll:

1. Verify the correct registry URLs and component names
2. Use standard shadcn components as fallback
3. Apply our design tokens (surfaces, intents, motion) for consistent styling

**For M3:** No external components needed. We use:

- Basic React components
- Our design token system (`lib/design-system/`)
- Allotment for panel layout
- Zustand for state management

### Step 3: Verify Setup

```bash
# Start dev server
pnpm dev
```

Navigate to: `http://localhost:3000/notes`

You should see:

- ✅ Resizable left sidebar (file tree placeholder)
- ✅ Main content area with tab bar
- ✅ Resizable right sidebar (outline/backlinks placeholder)
- ✅ Status bar at bottom
- ✅ Glass surface styling with subtle blur

### Step 4: Test Panel Resizing

1. Drag the divider between left sidebar and main content
2. Drag the divider between main content and right sidebar
3. Refresh the page - panel widths should persist (localStorage)

---

## File Structure

```

├── app/(authenticated)/content/
│   ├── layout.tsx                 # Notes layout wrapper
│   └── page.tsx                   # Main notes page
├── components/content/
│   ├── PanelLayout.tsx            # Resizable panel system
│   ├── LeftSidebar.tsx            # File tree (placeholder)
│   ├── RightSidebar.tsx           # Outline/backlinks (placeholder)
│   ├── MainPanel.tsx              # Editor (placeholder)
│   └── StatusBar.tsx              # Status information
├── lib/design-system/
│   ├── surfaces.ts                # Glass surface tokens
│   ├── intents.ts                 # Semantic colors
│   ├── motion.ts                  # Animation rules
│   └── index.ts                   # Exports
└── stores/
    └── panel-store.ts             # Panel state (Zustand)
```

---

## Keyboard Shortcuts (Future)

These will be implemented in M7 (Command Palette):

- `Cmd/Ctrl + B` - Toggle left sidebar
- `Cmd/Ctrl + Shift + B` - Toggle right sidebar
- `Cmd/Ctrl + K` - Open command palette
- `Cmd/Ctrl + P` - Quick file switcher

---

## Next Steps

### M4: File Tree (Week 3-4)

**Components to implement:**

- Virtualized tree with `react-arborist`
- Drag-and-drop support
- Custom icon picker
- Context menu

**API Integration:**

- Connect to `GET /api/content/content/tree`
- Implement optimistic updates
- Handle drag-and-drop with `POST /api/content/content/move`

### M5: Content Editors & Viewers (Week 5-6)

**Components to implement:**

- TipTap editor integration
- Markdown mode toggle
- PDF viewer
- Image viewer
- Code syntax highlighting

---

## Troubleshooting

### Issue: pnpm store location error

```
ERR_PNPM_UNEXPECTED_STORE
```

**Solution:**

```bash
pnpm install
```

This will reinstall dependencies using the correct store location.

### Issue: Components not found

**Solution:** Ensure you've run `pnpm install` after dependencies were added to `package.json`.

### Issue: Glass surfaces not visible

**Solution:** The glass effect requires a background behind it. Ensure your app has a background color or image set.

### Issue: DiceUI component installation fails

```
The item at https://diceui.com/r/command.json was not found
```

**Solution:** This is a known issue with DiceUI registry. For M3, this doesn't affect functionality since we're not using DiceUI components yet. We'll verify the correct installation method in M4+ when specific components are needed. Alternative: Use standard shadcn components with our design tokens.

### Issue: Panel widths not persisting

**Solution:** Check browser console for localStorage errors. Zustand persist middleware requires localStorage API.

### Issue: Left sidebar stuck at 600px or wrong width after refresh

**Cause:** You may have an old cached value from version 2 that needs to be cleared.

**Solution (Step-by-step):**

1. **Open browser console** (F12 or Cmd+Option+I)
2. **Clear the stored data:**
   ```javascript
   localStorage.removeItem("notes-panel-layout");
   ```
3. **Hard refresh** (Cmd/Ctrl + Shift + R)
4. **Verify in console** - you should see:
   ```
   [Panel Store] Migrating from version 2 to 3
   [PanelLayout] Mounted with widths: { left: 200, right: 300 }
   ```
5. **Test resizing** - drag the sidebar and check console:
   ```
   [PanelLayout] Saving left width on drag end: <new_width>
   ```

**Debugging script:**

```javascript
// Check what's stored
const stored = JSON.parse(localStorage.getItem("notes-panel-layout"));
console.log("Current stored data:", stored);

// Force complete reset
localStorage.removeItem("notes-panel-layout");
window.location.reload();
```

**What changed in version 3:**

- Switched from `onChange` (fires constantly) to `onDragEnd` (fires only after drag)
- Added 100ms initialization delay to prevent race conditions
- Width changes only save when you actually drag the divider

### Issue: Left sidebar stuck at 600px or wrong width

**Cause:** Allotment was calling `onChange` during initialization, overriding stored values.

**Solution:**

1. Clear localStorage: `localStorage.removeItem('notes-panel-layout')`
2. Hard refresh the page (Cmd/Ctrl + Shift + R)
3. The version 3 migration will automatically reset to 200px default

**Fixed in version 3:**

- Initial `onChange` callbacks are now skipped
- Stored width values are properly preserved on mount

---

## Testing M3 Implementation

### Visual Testing

- [ ] Left sidebar visible by default
- [ ] Right sidebar visible by default
- [ ] Status bar visible by default
- [ ] Panel dividers are draggable
- [ ] Glass surfaces have subtle blur
- [ ] Borders are semi-transparent
- [ ] No glow effects present
- [ ] Motion is conservative (200ms transitions)

### Functional Testing

- [ ] Drag left sidebar divider - width updates
- [ ] Drag right sidebar divider - width updates
- [ ] Refresh page - panel widths persist
- [ ] Close tab and reopen - panel widths persist
- [ ] Minimum panel width enforced (200px)
- [ ] Maximum panel width enforced (600px)

### State Testing

Open browser console:

```javascript
// Check Zustand store
localStorage.getItem("notes-panel-layout");

// Should return something like:
// {"state":{"version":2,"leftSidebarVisible":true,"leftSidebarWidth":200,...},"version":2}
```

**Version Migration:**
The store includes automatic version-based migration. When the store version changes:

- Old localStorage data is automatically reset to defaults
- Prevents compatibility issues with updated store structure
- Current version: 3 (fixed initialization bug, enforces 200px default)

**Initialization Fix:**

- Uses `onDragEnd` instead of `onChange` to only save when user finishes dragging
- Prevents automatic width changes during component initialization
- Adds 100ms mount delay to ensure Allotment is fully initialized
- Console logs width changes for debugging

---

## Known Limitations (M3)

1. **Placeholder Components:** Left sidebar, right sidebar, and main panel are placeholders with static content.
2. **No API Integration:** Not connected to backend yet (M4+).
3. **No Real Editor:** Main panel shows static HTML, not TipTap editor (M5).
4. **No Command Palette:** Keyboard shortcuts not implemented (M7).
5. **No Glass-UI Components:** Using basic React components with glass styling. Actual Glass-UI components will be added in M4+ as needed.
6. **DiceUI Registry Issue:** DiceUI component installation returns 404 errors. Will investigate correct installation method in M4+. Not blocking for M3.

---

## Success Criteria ✅

- [x] Design token system implemented
- [x] Zustand store with persistence
- [x] Allotment panel layout working
- [x] Left/right sidebars resizable
- [x] Status bar visible
- [x] Glass surface styling applied
- [x] No banned patterns (glow, excessive rotation)
- [x] Conservative motion (200ms)
- [x] /notes route accessible

**M3 Complete!** Ready to proceed to M4: File Tree.
