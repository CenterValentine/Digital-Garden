# RightSidebar Architecture Refactor

**Date:** January 19, 2026
**Status:** ✅ Complete

## Problem

The RightSidebar originally had an **inconsistent architecture** compared to LeftSidebar:

### Before Refactor:
```
RightSidebar (Server Component)
├── RightSidebarHeader (Server Component, lucide-react icons)
└── RightSidebarContent (Client Component with tab state)
```

**Issues:**
1. Header was a server component, couldn't have interactive state
2. Tab navigation was duplicated in Content component
3. Header buttons were non-functional placeholders
4. Inconsistent with LeftSidebar pattern
5. Used lucide-react (client-only) in a server component

## Solution

Refactored to match the **LeftSidebar pattern**:

### After Refactor:
```
RightSidebar (Client Component - State Manager)
├── RightSidebarHeader (Client Component - Receives props)
└── RightSidebarContent (Client Component - Receives props)
```

**Benefits:**
1. ✅ Header and Content share state via prop drilling
2. ✅ Tab navigation centralized in parent wrapper
3. ✅ Consistent architecture with LeftSidebar
4. ✅ Uses inline SVG (works in both server/client)
5. ✅ Tab persistence via localStorage in wrapper

## Files Modified

### 1. `components/notes/RightSidebar.tsx`
**Changed:** Server Component → Client Component

**Responsibilities:**
- Manages `activeTab` state
- Persists tab selection to localStorage
- Passes state down to Header and Content

**Code Pattern:**
```typescript
"use client";

export function RightSidebar() {
  const [activeTab, setActiveTab] = useState<RightSidebarTab>(() => {
    // Restore from localStorage
  });

  useEffect(() => {
    // Persist to localStorage
  }, [activeTab]);

  return (
    <div>
      <RightSidebarHeader activeTab={activeTab} onTabChange={setActiveTab} />
      <RightSidebarContent activeTab={activeTab} />
    </div>
  );
}
```

### 2. `components/notes/headers/RightSidebarHeader.tsx`
**Changed:** Server Component → Client Component with props

**Responsibilities:**
- Renders tab buttons with icons
- Calls `onTabChange` when user clicks
- Shows active state based on `activeTab` prop

**Key Changes:**
- Replaced `lucide-react` icons with inline SVG
- Added `activeTab` and `onTabChange` props
- Added gold underline for active tab
- Removed "More options" button (unused)

**Code Pattern:**
```typescript
"use client";

interface RightSidebarHeaderProps {
  activeTab: RightSidebarTab;
  onTabChange: (tab: RightSidebarTab) => void;
}

export function RightSidebarHeader({ activeTab, onTabChange }: RightSidebarHeaderProps) {
  return (
    <div className="flex h-12">
      <button onClick={() => onTabChange("backlinks")}
              className={activeTab === "backlinks" ? "active-styles" : ""}>
        <svg>...</svg>
      </button>
      {/* ... more tabs */}
    </div>
  );
}
```

### 3. `components/notes/content/RightSidebarContent.tsx`
**Changed:** Removed internal tab state, now receives via props

**Responsibilities:**
- Renders panel based on `activeTab` prop
- Manages outline store subscription
- Handles panel-specific logic (e.g., heading clicks)

**Key Changes:**
- Removed `useState` for `activeTab`
- Removed `useEffect` for localStorage
- Removed duplicate tab navigation UI
- Now receives `activeTab` as prop

**Code Pattern:**
```typescript
"use client";

interface RightSidebarContentProps {
  activeTab: RightSidebarTab;
}

export function RightSidebarContent({ activeTab }: RightSidebarContentProps) {
  const outline = useOutlineStore((state) => state.outline);

  return (
    <div className="flex-1 overflow-hidden">
      {activeTab === "backlinks" && <BacklinksPanel />}
      {activeTab === "outline" && <OutlinePanel outline={outline} />}
      {activeTab === "chat" && <ChatPlaceholder />}
    </div>
  );
}
```

## Architecture Comparison

### LeftSidebar Pattern (Now Both Use This):
```
Wrapper (Client)
  ├─ State: refreshTrigger, createTrigger, isCreateDisabled
  ├─ Header (Client) ← receives props
  └─ Content (Client) ← receives props
```

### Benefits of This Pattern:
1. **State Coordination** - Wrapper manages shared state
2. **Prop Drilling** - Simple, explicit data flow
3. **Reusability** - Header/Content are pure, testable
4. **Consistency** - Same pattern for both sidebars
5. **TypeScript** - Full type safety with interfaces

## Type Definitions

### Shared Type (Exported from RightSidebar.tsx):
```typescript
export type RightSidebarTab = "backlinks" | "outline" | "chat";
```

**Used By:**
- `RightSidebar.tsx` - State management
- `RightSidebarHeader.tsx` - Props interface
- `RightSidebarContent.tsx` - Props interface

## localStorage Persistence

**Key:** `rightSidebarActiveTab`
**Values:** `"backlinks"` | `"outline"` | `"chat"`
**Default:** `"backlinks"`

**Flow:**
1. On mount: Read from localStorage, default to "backlinks"
2. On tab change: Update state, persist to localStorage
3. Next session: Restore from localStorage

## Testing Checklist

- [x] Tabs are clickable and change active state
- [x] Active tab shows gold underline
- [x] Panel content switches based on active tab
- [x] Tab selection persists across page reloads
- [x] No TypeScript errors
- [x] No duplicate navigation UI
- [x] Inline SVG renders in both server/client

## Migration Notes

**Breaking Changes:** None (internal refactor only)

**What Users Will Notice:**
- Tab selection now persists across sessions
- Cleaner, more consistent UI
- Functional header buttons (previously placeholders)

## Future Enhancements

1. **Keyboard Navigation** - Arrow keys to switch tabs
2. **Badge Counts** - Show number of backlinks/outline items
3. **Drag to Reorder** - Let users customize tab order
4. **More Options Menu** - Add back the MoreHorizontal button with dropdown

## Lessons Learned

### What Went Wrong Initially:
1. Didn't check existing component architecture (LeftSidebar)
2. Assumed server components were intentional
3. Duplicated tab navigation in Content instead of using Header

### What Could Have Prevented This:

**Add to CLAUDE.md:**
```markdown
## Critical: Check Existing Components First

**Before implementing ANY UI element:**
1. Run `glob "**/*Sidebar*.tsx"` to find existing patterns
2. Compare architectures (Left vs Right, etc.)
3. Match the established pattern for consistency

**Sidebar Pattern (Standard):**
- Wrapper is CLIENT component (manages state)
- Header is CLIENT component (receives props)
- Content is CLIENT component (receives props)
- Use inline SVG (not lucide-react) for icons
```

### Key Takeaway:
**Architectural consistency > Individual component optimization**

Even if server components are slightly faster, maintaining a consistent pattern across similar components is more valuable for:
- Developer understanding
- Code maintainability
- Future refactoring
- Bug prevention

## Related Documentation

- [LeftSidebar Implementation](./M3-UI-FOUNDATION-LIQUID-GLASS.md)
- [M6 Outline Panel](./M6-OUTLINE-PANEL-COMPLETION.md)
- [Architecture Overview](./01-architecture.md)
