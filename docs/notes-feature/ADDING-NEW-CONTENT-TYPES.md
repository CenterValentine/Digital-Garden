# Adding New Content Types - Developer Guide

**Purpose:** Show how to extend the system with new content types
**Architecture:** Modular design requires updates to only 3 files
**Last Updated:** January 18, 2026

---

## Overview

The context menu and content creation system is designed to be **highly modular**. Adding a new content type requires changes to only **3 files**:

1. **Type definitions** - Add to type union
2. **Action provider** - Add menu item to sub-menu
3. **Handler** - Add payload configuration

No changes needed to:
- ❌ Core menu infrastructure (`ContextMenu.tsx`)
- ❌ Context menu store (`context-menu-store.ts`)
- ❌ File tree component (`FileTree.tsx`)
- ❌ File node component (`FileNode.tsx`)

---

## Example: Adding "PDF Document" Content Type

Let's walk through adding support for PDF documents as a new content type.

---

### Step 1: Update Type Definitions

**File:** `components/content/FileNode.tsx` (and propagate through chain)

**Before:**
```typescript
onCreate?: (
  parentId: string | null,
  type: "folder" | "note" | "file" | "code" | "html"
) => Promise<void>;
```

**After:**
```typescript
onCreate?: (
  parentId: string | null,
  type: "folder" | "note" | "file" | "code" | "html" | "pdf"  // ← Add "pdf"
) => Promise<void>;
```

**Files to Update:**
1. `components/content/FileNode.tsx` - Interface definition
2. `components/content/FileTree.tsx` - Props interface
3. `components/content/content/LeftSidebarContent.tsx` - Handler signature

**Time:** ~2 minutes (3 one-line changes)

---

### Step 2: Add Menu Item to Sub-Menu

**File:** `components/content/context-menu/file-tree-actions.tsx`

**Location:** Inside the `submenu` array of the "Create" action (lines 112-148)

**Add this item:**
```typescript
{
  id: "new-pdf",
  label: "PDF Document",
  icon: <FileText className="h-4 w-4" />,  // Use appropriate icon
  onClick: () => onCreatePdf?.(targetId || null),
  disabled: !onCreatePdf,
},
```

**Context (where to insert):**
```typescript
submenu: [
  {
    id: "new-note",
    label: "Note (Markdown)",
    // ...
  },
  {
    id: "new-folder",
    label: "Folder",
    // ...
  },
  // ... other items ...
  {
    id: "new-html",
    label: "HTML Document",
    // ...
  },
  // ← INSERT NEW PDF ITEM HERE
  {
    id: "new-pdf",
    label: "PDF Document",
    icon: <FileText className="h-4 w-4" />,
    onClick: () => onCreatePdf?.(targetId || null),
    disabled: !onCreatePdf,
  },
],
```

**Also Add to Interface:**
```typescript
interface FileTreeContext extends BaseContextMenuContext {
  // ... existing callbacks ...
  onCreateNote?: (parentId: string | null) => Promise<void>;
  onCreateFolder?: (parentId: string | null) => Promise<void>;
  onCreateFile?: (parentId: string | null) => Promise<void>;
  onCreateCode?: (parentId: string | null) => Promise<void>;
  onCreateHtml?: (parentId: string | null) => Promise<void>;
  onCreatePdf?: (parentId: string | null) => Promise<void>;  // ← Add this
}
```

**Time:** ~3 minutes (add menu item + interface callback)

---

### Step 3: Add Payload Configuration to Handler

**File:** `components/content/content/LeftSidebarContent.tsx`

**Location:** Inside `handleCreate` function (lines 374-466)

**Add to `defaults` object:**
```typescript
const defaults: Record<string, { title: string; payload?: any }> = {
  folder: { title: "New Folder" },
  note: {
    title: "New Note",
    payload: {
      tiptapJson: {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
    },
  },
  // ... existing types ...
  html: {
    title: "New HTML Document",
    payload: {
      html: "<h1>Hello World</h1>",
    },
  },
  // ← ADD PDF HERE
  pdf: {
    title: "New PDF Document",
    payload: {
      // PDF-specific payload (depends on your FilePayload schema)
      // For now, could be similar to "file" type requiring upload
    },
  },
};
```

**Add to request body construction:**
```typescript
// Add type-specific payloads
if (type === "folder") {
  requestBody.isFolder = true;
} else if (type === "note") {
  requestBody.tiptapJson = config.payload?.tiptapJson;
} else if (type === "code") {
  requestBody.code = config.payload?.code;
  requestBody.language = config.payload?.language;
} else if (type === "html") {
  requestBody.html = config.payload?.html;
} else if (type === "pdf") {
  // ← ADD PDF PAYLOAD HANDLING HERE
  // Depending on your API, might need to:
  // 1. Trigger file upload flow (like "file" type)
  // 2. Or create empty PDF payload and upload later
  requestBody.pdfUrl = config.payload?.pdfUrl;
  requestBody.fileName = config.payload?.fileName;
}
```

**Wire callback in FileNode:**

**File:** `components/content/FileNode.tsx`

```typescript
// In handleContextMenu
openMenu("file-tree", { x: e.clientX, y: e.clientY }, {
  selectedIds,
  clickedId: data.id,
  clickedNode: { /* ... */ },
  onCreateNote: onCreate ? async (parentId: string | null) => onCreate(parentId, "note") : undefined,
  onCreateFolder: onCreate ? async (parentId: string | null) => onCreate(parentId, "folder") : undefined,
  onCreateFile: onCreate ? async (parentId: string | null) => onCreate(parentId, "file") : undefined,
  onCreateCode: onCreate ? async (parentId: string | null) => onCreate(parentId, "code") : undefined,
  onCreateHtml: onCreate ? async (parentId: string | null) => onCreate(parentId, "html") : undefined,
  // ← ADD THIS LINE
  onCreatePdf: onCreate ? async (parentId: string | null) => onCreate(parentId, "pdf") : undefined,
});
```

**Time:** ~5 minutes (add to defaults + request body logic + wire callback)

---

## Total Time to Add New Content Type

**~10 minutes** for a developer familiar with the codebase.

**Files Modified:**
1. `components/content/FileNode.tsx` - 2 changes (type union + callback wire)
2. `components/content/FileTree.tsx` - 1 change (type union)
3. `components/content/content/LeftSidebarContent.tsx` - 2 changes (type union + defaults object)
4. `components/content/context-menu/file-tree-actions.tsx` - 2 changes (interface + menu item)

**Total:** 5 files, 7 small changes

---

## Content Type Registry Pattern (Future Enhancement)

For even better modularity, you could create a **content type registry**:

### Centralized Registry

**File:** `lib/content/content-type-registry.ts`

```typescript
import { FileText, File, Code, FileCode, /* etc */ } from "lucide-react";

export interface ContentTypeDefinition {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  keyboardShortcut?: string;
  createPayload: (parentId: string | null) => any;
  requiresUpload?: boolean;
}

export const CONTENT_TYPES: Record<string, ContentTypeDefinition> = {
  note: {
    id: "note",
    label: "Note (Markdown)",
    icon: File,
    keyboardShortcut: "A",
    createPayload: (parentId) => ({
      title: "New Note",
      parentId,
      tiptapJson: {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
    }),
  },

  folder: {
    id: "folder",
    label: "Folder",
    icon: Folder,
    keyboardShortcut: "⇧A",
    createPayload: (parentId) => ({
      title: "New Folder",
      parentId,
      isFolder: true,
    }),
  },

  code: {
    id: "code",
    label: "Code Snippet",
    icon: Code,
    createPayload: (parentId) => ({
      title: "New Code Snippet",
      parentId,
      code: "// Your code here",
      language: "javascript",
    }),
  },

  html: {
    id: "html",
    label: "HTML Document",
    icon: FileCode,
    createPayload: (parentId) => ({
      title: "New HTML Document",
      parentId,
      html: "<h1>Hello World</h1>",
    }),
  },

  pdf: {
    id: "pdf",
    label: "PDF Document",
    icon: FileText,
    createPayload: (parentId) => ({
      title: "New PDF Document",
      parentId,
      // PDF-specific payload
    }),
  },

  // ← ADD NEW TYPES HERE (only need to modify this one file!)
};

// Helper to get all create menu items
export function getCreateMenuItems(): Array<{
  id: string;
  label: string;
  icon: JSX.Element;
  shortcut?: string;
  onClick: (parentId: string | null) => void;
}> {
  return Object.values(CONTENT_TYPES).map((type) => ({
    id: `new-${type.id}`,
    label: type.label,
    icon: <type.icon className="h-4 w-4" />,
    shortcut: type.keyboardShortcut,
    onClick: async (parentId: string | null) => {
      const payload = type.createPayload(parentId);
      // Make API call with payload
      await fetch("/api/content/content", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  }));
}
```

### Using the Registry

**In `file-tree-actions.tsx`:**

```typescript
import { getCreateMenuItems } from "@/lib/content/content-type-registry";

export const fileTreeActionProvider: ContextMenuActionProvider = (ctx) => {
  // ...

  sections.push({
    title: "Create",
    actions: [
      {
        id: "create-submenu",
        label: "Create",
        icon: <Plus className="h-4 w-4" />,
        submenu: getCreateMenuItems(), // ← Single line!
        divider: true,
      },
    ],
  });

  // ...
};
```

**Benefits:**
- ✅ Add new content types by editing **one file** (the registry)
- ✅ All menu items, icons, shortcuts auto-generated
- ✅ Payload construction centralized
- ✅ Type definitions come from registry keys
- ✅ Easy to disable/enable content types dynamically

**Trade-offs:**
- More abstraction (harder to trace for beginners)
- Less explicit control over individual items
- May be overkill if you only have 5-10 content types

---

## Current System: Pros & Cons

### ✅ Pros

1. **Explicit and Clear**
   - Easy to see exactly what happens for each content type
   - No "magic" - all logic is visible

2. **Type-Safe**
   - TypeScript enforces all callbacks are wired
   - Compiler catches missing handlers

3. **Flexible**
   - Each content type can have unique behavior
   - Easy to add special cases (e.g., file upload flow)

4. **Minimal Abstraction**
   - New developers can understand flow quickly
   - No need to learn registry pattern

### ⚠️ Cons

1. **Multiple Files to Update**
   - Need to touch 5 files for each new type
   - Easy to forget one location

2. **Type Union Gets Long**
   - `type: "folder" | "note" | "file" | "code" | "html" | "pdf" | ...`
   - Could become unwieldy with 20+ types

3. **Code Duplication**
   - Callback wiring looks repetitive (though necessary for type safety)

---

## Recommendation

### For Now (5-10 Content Types)
**Keep the current explicit approach.**

**Reasons:**
- Clear and maintainable
- Easy for new developers to understand
- Adding a new type takes ~10 minutes
- TypeScript ensures nothing is forgotten

### For Future (10+ Content Types)
**Consider migrating to registry pattern.**

**When:**
- You have 10+ content types
- You want to enable/disable types dynamically (e.g., feature flags)
- You need to load content types from a database or config file

**Migration Strategy:**
1. Create `content-type-registry.ts` with current 5 types
2. Refactor menu generation to use registry
3. Update handlers to look up payloads from registry
4. Keep type union as `keyof typeof CONTENT_TYPES` for type safety

---

## Example: Adding Multiple Types at Once

If you need to add **3 new types** (e.g., PDF, Excel, PowerPoint):

### Current System (Explicit)
- Update type union in 3 files: `"pdf" | "excel" | "ppt"`
- Add 3 menu items in `file-tree-actions.tsx`
- Add 3 payload configs in `handleCreate`
- Wire 3 callbacks in `FileNode.tsx`

**Total:** 5 files × 3 types = ~30 minutes

### Registry System (Centralized)
- Add 3 objects to `CONTENT_TYPES` registry
- Done!

**Total:** 1 file × 3 types = ~10 minutes

**Verdict:** If you're adding multiple types frequently, the registry pattern saves significant time.

---

## Testing New Content Types

When adding a new content type, test:

1. **Menu Item Appears:**
   - Right-click → Create → Verify new type shows

2. **API Call Correct:**
   - Check browser DevTools Network tab
   - Verify request body has correct payload structure

3. **Tree Refreshes:**
   - Verify new item appears in tree after creation

4. **Icon Displays:**
   - Verify correct icon shows in tree

5. **Keyboard Shortcut (if applicable):**
   - If you added a shortcut, verify it works

**Test Template:** See [M4-CONTEXT-MENU-TEST-PLAN.md](./M4-CONTEXT-MENU-TEST-PLAN.md) for full testing checklist.

---

## Conclusion

The current system is **highly modular** for adding new content types:

- ✅ Only 5 files need updates (7 small changes)
- ✅ ~10 minutes per content type
- ✅ Type-safe with compiler checks
- ✅ No changes to core menu infrastructure

For now (5-10 types), the **explicit approach is recommended** for clarity and maintainability.

If you grow to 10+ types or need dynamic type management, consider migrating to the **registry pattern** for even faster additions (1 file, ~3 minutes per type).

**Next Steps:**
1. Continue with current system for MD notes
2. Add other document types when needed (one at a time)
3. Re-evaluate if registry pattern is needed when you have 10+ types

---

## Quick Reference: Adding a New Type

**Checklist:**
- [ ] Update type union in `FileNode.tsx`, `FileTree.tsx`, `LeftSidebarContent.tsx`
- [ ] Add interface callback in `file-tree-actions.tsx`
- [ ] Add menu item to sub-menu in `file-tree-actions.tsx`
- [ ] Add payload config to `defaults` in `LeftSidebarContent.tsx`
- [ ] Add request body logic for new type in `handleCreate`
- [ ] Wire callback in `FileNode.tsx` `handleContextMenu`
- [ ] Test: Menu appears, API call correct, tree refreshes

**Files:**
1. `components/content/FileNode.tsx`
2. `components/content/FileTree.tsx`
3. `components/content/content/LeftSidebarContent.tsx`
4. `components/content/context-menu/file-tree-actions.tsx`

**Time:** ~10 minutes
