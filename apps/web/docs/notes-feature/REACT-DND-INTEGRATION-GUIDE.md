# React DND Integration Guide

**Critical Reference for Drag-and-Drop Implementation**

This document captures hard-won lessons from integrating react-dnd with react-arborist for file tree drag-and-drop and external file uploads.

---

## The Problem: "Cannot have two HTML5 backends at the same time"

When integrating drag-and-drop features alongside libraries that use react-dnd internally (like react-arborist), you'll encounter this fatal error if you try to create multiple `DndProvider` instances.

### Why This Happens

1. **react-arborist creates its own DndProvider**: The `Tree` component internally wraps itself with `<DndProvider backend={HTML5Backend}>` to enable node reordering
2. **HTML5Backend is a singleton**: React's HTML5 drag-and-drop backend can only be instantiated once per page
3. **Nested providers fail**: Attempting to wrap react-arborist with another `DndProvider` causes a collision

### Common Mistakes (Don't Do This!)

❌ **Mistake 1: Creating a separate DndProvider at layout level**
```tsx
// DON'T DO THIS
export default function Layout({ children }) {
  return (
    <DndProvider backend={HTML5Backend}>  {/* ❌ Creates first backend */}
      <LeftSidebar />  {/* Uses useDrop here */}
        <FileTree />  {/* react-arborist creates second backend ❌ */}
    </DndProvider>
  );
}
```

❌ **Mistake 2: Using native HTML5 drag events**
```tsx
// DON'T DO THIS
<div
  onDragEnter={handleDragEnter}  {/* ❌ Tries to use HTML5 API */}
  onDrop={handleDrop}             {/* ❌ Conflicts with react-dnd */}
>
  <FileTree />  {/* react-arborist uses react-dnd */}
</div>
```

❌ **Mistake 3: Placing useDrop outside the provider context**
```tsx
// DON'T DO THIS
export function Sidebar() {
  const [, dropRef] = useDrop(...);  {/* ❌ No provider above this */}

  return (
    <div ref={dropRef}>
      <FileTree />  {/* Tree creates provider here */}
    </div>
  );
}
```

---

## The Solution: Shared DndManager Pattern

The correct approach is to create **one DndProvider** and share it with react-arborist via the `dndManager` prop.

### Implementation

#### Step 1: Create a Wrapper Component with DndProvider

```tsx
// components/notes/FileTreeWithDropZone.tsx
"use client";

import { DndProvider, useDrop, useDragDropManager } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { NativeTypes } from "react-dnd-html5-backend";

/**
 * Inner component that uses useDrop hook
 * Must be inside DndProvider context
 */
function FileTreeDropZoneInner({ onFileDrop, ...treeProps }) {
  // Get the DND manager to pass to react-arborist
  // This allows react-arborist to share our DndProvider
  const manager = useDragDropManager();

  const [{ isOver, canDrop }, dropRef] = useDrop(
    () => ({
      accept: NativeTypes.FILE,  // Accept external file drops from OS
      drop: (item: { files: File[] }) => {
        // Handle file drop
        if (onFileDrop) {
          onFileDrop(item.files);
        }
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onFileDrop]
  );

  return (
    <div ref={dropRef as any} className="relative w-full h-full">
      {/* Overlay when dragging */}
      {isOver && canDrop && <DragOverlay />}

      {/* Pass dndManager to FileTree so it uses our DndProvider */}
      <FileTree {...treeProps} dndManager={manager} />
    </div>
  );
}

/**
 * Wrapper that provides DndProvider context
 *
 * This component creates a single DndProvider that is shared by both:
 * 1. The useDrop hook (for external file drops)
 * 2. react-arborist's Tree (for node reordering)
 */
export function FileTreeWithDropZone(props) {
  return (
    <DndProvider backend={HTML5Backend}>
      <FileTreeDropZoneInner {...props} />
    </DndProvider>
  );
}
```

#### Step 2: Update FileTree to Accept dndManager

```tsx
// components/notes/FileTree.tsx
interface FileTreeProps {
  // ... other props
  dndManager?: any; // Optional: DndManager from parent DndProvider
}

export function FileTree({ dndManager, ...props }: FileTreeProps) {
  return (
    <Tree
      {...props}
      // If dndManager is provided, react-arborist will use it
      // instead of creating its own DndProvider
      {...(dndManager && { dndManager })}
    >
      {/* tree nodes */}
    </Tree>
  );
}
```

#### Step 3: Use FileTreeWithDropZone in Your Component

```tsx
// components/notes/content/LeftSidebarContent.tsx
export function LeftSidebarContent({ onFileDrop, ...props }) {
  return (
    <FileTreeWithDropZone
      data={treeData}
      onMove={handleMove}
      onFileDrop={onFileDrop}  // Callback for file drops
      {...props}
    />
  );
}
```

---

## Why This Works

1. **Single DndProvider**: `FileTreeWithDropZone` creates ONE `DndProvider` with `HTML5Backend`
2. **Shared Manager**: `useDragDropManager()` gets the manager instance from that provider
3. **react-arborist Reuses It**: By passing `dndManager` to `Tree`, react-arborist uses the existing provider instead of creating a new one
4. **Both Features Work**: External file drops (via `useDrop`) and tree reordering (via react-arborist) both use the same backend

### Architecture Diagram

```
FileTreeWithDropZone (creates DndProvider)
  └─ FileTreeDropZoneInner (calls useDragDropManager)
      ├─ useDrop hook (for file drops)
      └─ FileTree (receives dndManager)
          └─ Tree (react-arborist - uses shared dndManager)
```

---

## Key Concepts

### 1. NativeTypes.FILE

When accepting external file drops from the operating system, use `NativeTypes.FILE`:

```tsx
const [, dropRef] = useDrop(() => ({
  accept: NativeTypes.FILE,  // Accepts files from OS
  drop: (item: { files: File[] }) => {
    console.log(item.files);  // Array of File objects
  },
}));
```

This is different from internal drag-and-drop (like tree nodes), which uses custom types.

### 2. useDragDropManager

This hook provides access to the DndProvider's internal manager:

```tsx
const manager = useDragDropManager();
```

**Requirements**:
- Must be called inside a component that's wrapped by `DndProvider`
- Returns the manager instance that can be passed to other components

### 3. dndManager Prop

react-arborist's `Tree` component accepts an optional `dndManager` prop:

```tsx
<Tree
  data={data}
  dndManager={manager}  // If provided, Tree won't create its own provider
/>
```

This is documented in react-arborist's TypeScript types:
```typescript
interface TreeProps {
  dndManager?: ReturnType<typeof useDragDropManager>;
}
```

---

## Common Debugging Steps

If you encounter drag-and-drop errors:

### 1. Check for Multiple DndProviders

Search your codebase:
```bash
grep -r "DndProvider" apps/web/components --include="*.tsx"
```

You should only see ONE `DndProvider` that wraps both your `useDrop` and the `FileTree`.

### 2. Verify dndManager is Passed

Check that `FileTree` receives and passes the `dndManager`:

```tsx
// In FileTreeWithDropZone
const manager = useDragDropManager();
<FileTree dndManager={manager} />

// In FileTree
<Tree {...(dndManager && { dndManager })} />
```

### 3. Check Hook Order

`useDrop` must be called AFTER the `DndProvider` is rendered:

✅ Correct:
```
DndProvider
  └─ Component (useDrop is called here)
```

❌ Wrong:
```
Component (useDrop is called here)
  └─ DndProvider
```

### 4. Browser Console Errors

Look for these specific error messages:

- `"Cannot have two HTML5 backends at the same time"` → Multiple DndProviders
- `"Expected drag drop context"` → useDrop called outside DndProvider
- `"Cannot read properties of undefined (reading 'emit')"` → Manager not available

---

## Alternative Approaches (Not Recommended)

### Option 1: Separate Drop Zone

Instead of integrating with react-arborist, create a separate drop zone:

```tsx
<div>
  <div className="drop-zone" onDrop={handleDrop}>
    Drop files here
  </div>
  <FileTree />  {/* react-arborist handles its own DND */}
</div>
```

**Downsides**:
- Less intuitive UX (users can't drop anywhere)
- Requires extra UI space
- Two separate drag-and-drop systems

### Option 2: Replace react-arborist

Switch to a tree library that doesn't use react-dnd:

**Downsides**:
- High migration cost
- May lose features (virtualization, keyboard nav)
- Still need to implement drag-and-drop

### Option 3: Native HTML5 Events Only

Use native HTML5 drag events for everything:

**Downsides**:
- Can't use react-dnd features
- Have to reimplement tree reordering manually
- More complex state management

---

## Testing Checklist

When implementing or modifying drag-and-drop:

- [ ] Drag external file into sidebar → overlay appears
- [ ] Drop external file → validation runs, dialog opens
- [ ] Drag tree node → can reorder within tree
- [ ] Drop tree node → updates server, optimistic UI
- [ ] Drag file AND tree node simultaneously → no conflicts
- [ ] No console errors about HTML5 backends
- [ ] No "Expected drag drop context" errors
- [ ] TypeScript compiles without DND-related errors
- [ ] Dev server hot-reloads without crashing

---

## Performance Considerations

### 1. useDrop Dependencies

Always include callbacks in the dependency array:

```tsx
const [, dropRef] = useDrop(
  () => ({
    accept: NativeTypes.FILE,
    drop: (item) => onFileDrop(item.files),
  }),
  [onFileDrop]  // ✅ Include callback
);
```

### 2. Prevent Unnecessary Re-renders

Memoize the drop handler if it causes re-renders:

```tsx
const handleFileDrop = useCallback((files: File[]) => {
  // handle files
}, []);
```

### 3. Large File Trees

react-arborist handles virtualization, but monitor performance with:
- 1000+ nodes
- Deep nesting (10+ levels)
- Frequent reordering

---

## Related Files

When modifying drag-and-drop functionality, these files are involved:

```
apps/web/
├── components/notes/
│   ├── FileTreeWithDropZone.tsx      # DndProvider wrapper (main integration point)
│   ├── FileTree.tsx                  # Accepts dndManager prop
│   ├── content/
│   │   └── LeftSidebarContent.tsx    # Uses FileTreeWithDropZone
│   └── LeftSidebar.tsx               # Receives file drop callback
├── lib/media/
│   └── file-validation.ts            # File validation (size, type)
└── docs/notes-feature/
    ├── REACT-DND-INTEGRATION-GUIDE.md    # This document
    └── M7-DRAG-DROP-UPLOAD.md            # Feature implementation docs
```

---

## FAQ

### Q: Can I use react-dnd hooks outside of FileTreeWithDropZone?

**A:** No. All `useDrop`, `useDrag`, and `useDragDropManager` calls must be inside the `DndProvider` context. If you need drag-and-drop in another component, you have two options:

1. Move that component inside `FileTreeWithDropZone`
2. Create a new wrapper with its own `DndProvider` (if it doesn't interact with react-arborist)

### Q: What if I need multiple drop zones?

**A:** You can have multiple `useDrop` hooks inside the same `DndProvider`:

```tsx
function FileTreeDropZoneInner({ onFileDrop, onFolderDrop }) {
  const manager = useDragDropManager();

  const [, fileDropRef] = useDrop(() => ({
    accept: NativeTypes.FILE,
    drop: (item) => onFileDrop(item.files),
  }));

  const [, folderDropRef] = useDrop(() => ({
    accept: "FOLDER",
    drop: (item) => onFolderDrop(item),
  }));

  return (
    <div>
      <div ref={fileDropRef}>Drop files here</div>
      <div ref={folderDropRef}>Drop folders here</div>
      <FileTree dndManager={manager} />
    </div>
  );
}
```

### Q: Can I customize the drag preview?

**A:** Yes, but it requires additional setup. See [react-dnd documentation](https://react-dnd.github.io/react-dnd/docs/api/use-drag-layer) for `useDragLayer`.

### Q: What about mobile/touch support?

**A:** `HTML5Backend` doesn't support touch. For mobile, you need:
1. Install `react-dnd-touch-backend`
2. Use `TouchBackend` instead of `HTML5Backend`
3. Or use a multi-backend setup

```tsx
import { TouchBackend } from 'react-dnd-touch-backend';

<DndProvider backend={TouchBackend} options={{ enableMouseEvents: true }}>
```

---

## Version History

- **2026-01-22**: Initial document created after solving HTML5 backend conflicts
- **Implementation**: M7 Phase 3 - Drag-and-Drop File Upload

---

## Additional Resources

- [react-dnd Documentation](https://react-dnd.github.io/react-dnd/)
- [react-arborist GitHub](https://github.com/brimdata/react-arborist)
- [HTML5Backend API](https://react-dnd.github.io/react-dnd/docs/backends/html5)
- [M7-DRAG-DROP-UPLOAD.md](./M7-DRAG-DROP-UPLOAD.md) - Implementation details
- [FileTreeWithDropZone.tsx](../../components/notes/FileTreeWithDropZone.tsx) - Source code

---

**Remember**: When in doubt, ensure there's only ONE DndProvider in your component tree, and pass its manager to any libraries that need it.
