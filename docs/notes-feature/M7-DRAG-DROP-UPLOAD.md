# M7 Phase 3: Drag-and-Drop File Upload

**Status**: ✅ Complete
**Date**: 2026-01-22

## Overview

Added intuitive drag-and-drop file upload functionality to the left sidebar with file size validation, visual feedback, and error notifications.

## Features Implemented

### 1. File Size Validation (`lib/media/file-validation.ts`)

New utility module for comprehensive file validation:

```typescript
FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE: 100MB,      // Per file limit
  MAX_BATCH_SIZE: 500MB      // Total batch limit
}
```

**Functions:**
- `validateFile(file)` - Validates individual file size and type
- `validateFileBatch(files)` - Validates multiple files with cumulative size check
- `isFileTypeSupported(mimeType)` - Checks against all supported types
- `getSupportedFileTypes()` - Returns all supported MIME types and extensions
- `formatFileSize(bytes)` - Formats bytes for user-friendly display

**Supported File Types:**
- Documents: .txt, .md, .json, .pdf, .docx
- Images: .jpg, .png, .gif, .webp, .svg, .avif
- Videos: .mp4, .webm, .mov, .avi, .mkv

### 2. Drag-and-Drop UI (`components/notes/content/LeftSidebarContent.tsx`)

**Event Handling:**
Uses react-dnd's `useDrop` hook to integrate with react-arborist's existing DndProvider:

```typescript
const [{ isOver, canDrop }, dropRef] = useDrop(
  () => ({
    accept: NativeTypes.FILE,  // Accept external file drops
    drop: (item: { files: File[] }) => {
      // Validate and pass to parent
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }),
  [onFileDrop]
);
```

**Visual Feedback:**
- Glass overlay with dark background (rgba + backdrop blur)
- Upload icon (cloud with arrow)
- Clear messaging: "Drop files to upload"
- File size limits displayed: "Max 100MB per file, 500MB total"

**Component Flow:**
- `LeftSidebarContent` receives `onFileDrop` callback from parent
- `useDrop` hook processes file drops and calls validation
- Valid files are passed to `LeftSidebar` via callback
- `LeftSidebar` opens `FileUploadDialog` with validated files

### 3. Dialog Integration (`components/notes/dialogs/FileUploadDialog.tsx`)

**New Props:**
- `initialFiles?: File[]` - Pre-populate dialog with dropped files

**Auto-Upload:**
When `initialFiles` are provided, the upload process starts automatically:
```typescript
useEffect(() => {
  if (initialFiles && initialFiles.length > 0) {
    handleMultiFileUpload(initialFiles);
  }
}, [initialFiles]);
```

### 4. Error Notifications

**Toast Integration:**
Uses `sonner` for elegant error notifications:

```typescript
// Invalid file type
toast.error("File type \".xyz\" is not supported", {
  description: "File: test.xyz"
});

// File too large
toast.error("File exceeds maximum size of 100MB", {
  description: "File: large-video.mp4"
});

// Batch size exceeded
toast.error("Adding file would exceed batch limit of 500MB", {
  description: "File: another-file.pdf"
});
```

## User Experience Flow

### Happy Path (Valid Files)
1. User drags file(s) over left sidebar
2. Overlay appears with upload icon and messaging
3. User drops file(s)
4. Validation passes (size + type)
5. Upload dialog opens with files pre-selected
6. Upload starts automatically
7. Progress shown per file
8. Success → dialog closes → tree refreshes

### Error Path (Invalid Files)
1. User drags file(s) over left sidebar
2. Overlay appears with upload icon
3. User drops file(s)
4. Validation fails for some/all files
5. Toast notifications appear for each invalid file with specific reason
6. Valid files (if any) proceed to upload dialog
7. Invalid files are excluded

### Mixed Batch
1. User drops 5 files: 3 valid, 2 invalid
2. 2 error toasts appear for invalid files
3. Upload dialog opens with 3 valid files
4. Upload proceeds normally for valid files

## Technical Implementation Details

### Drag Counter Pattern

```typescript
const dragCounterRef = useRef(0);

// Enter: increment counter
handleDragEnter() {
  dragCounterRef.current++;
  setIsDragOver(true);
}

// Leave: decrement, hide when zero
handleDragLeave() {
  dragCounterRef.current--;
  if (dragCounterRef.current === 0) {
    setIsDragOver(false);
  }
}

// Drop: reset counter
handleDrop() {
  dragCounterRef.current = 0;
  setIsDragOver(false);
  // ... process files
}
```

**Why?** Prevents flickering when dragging over child elements. Each nested element triggers enter/leave, so we track depth.

### File Validation Strategy

```typescript
const { validFiles, invalidFiles, totalSize } = validateFileBatch(files);

// Show errors
invalidFiles.forEach(({ file, error }) => {
  toast.error(error, { description: `File: ${file.name}` });
});

// Upload valid files
if (validFiles.length > 0) {
  openUploadDialog(validFiles);
}
```

**Benefits:**
- Early validation prevents unnecessary uploads
- Clear error messages for each file
- Users see exactly why each file was rejected
- Valid files proceed even if some are invalid

### Glass Overlay Styling

```typescript
<div
  style={{
    background: 'rgba(16, 24, 39, 0.85)',
    backdropFilter: 'blur(8px)',
  }}
>
```

**Design Choice:**
- Dark semi-transparent background (85% opacity)
- 8px backdrop blur for glass effect
- Matches Liquid Glass design system
- High contrast for readability
- Pointer-events: none to allow drop events to pass through

## Performance Considerations

### File Size Limits Rationale

**Per-file limit (100MB):**
- Prevents browser memory issues
- Reasonable for most documents and media
- Users can still upload multiple 100MB files

**Batch limit (500MB):**
- Prevents server overload
- Allows 5x 100MB files simultaneously
- Balances UX with resource constraints

### Validation Timing

**Client-side first:**
- Immediate feedback (no network delay)
- Prevents unnecessary uploads
- Reduces server load

**Server-side still required:**
- Security (never trust client)
- Final validation of actual file content
- MIME type verification

## Testing

### Test Files Created

```bash
# Valid file (should upload)
/tmp/test-large-file.txt

# Invalid file type (should show toast error)
/tmp/test-unsupported.xyz

# Existing test files from previous work
/tmp/test-plaintext.txt
/tmp/test-notes.md
/tmp/test-data.json
```

### Test Scenarios

1. **Single valid file**: Should open dialog and auto-upload
2. **Multiple valid files**: Should batch upload sequentially
3. **Single invalid file**: Should show toast error, no dialog
4. **Mixed batch**: Should show errors for invalid, upload valid
5. **Files exceeding batch limit**: Should show specific error per file
6. **Drag enter/leave**: Overlay should not flicker over nested elements

## Future Enhancements

1. **Folder uploads**: Allow dropping entire folders
2. **Progress in overlay**: Show upload progress without opening dialog
3. **Drag from other sources**: Accept dragged text, URLs, etc.
4. **Drop zone customization**: Allow dropping in specific folder nodes
5. **Batch optimization**: Upload multiple files in parallel (currently sequential)

## Integration with Existing Features

- ✅ Multi-file upload (M7 Phase 2)
- ✅ Folder path selector (M7 Phase 2)
- ✅ Storage provider selection (M7 Phase 2)
- ✅ Text extraction for search (M7 Phase 2)
- ✅ File tree refresh on success (M4)
- ✅ Toast notifications (UI foundation)

## Code Locations

```
apps/web/
├── lib/media/
│   └── file-validation.ts                    # NEW: Validation utilities
├── components/notes/
│   ├── LeftSidebar.tsx                       # MODIFIED: File drop state management
│   ├── content/
│   │   └── LeftSidebarContent.tsx            # MODIFIED: useDrop hook + overlay
│   └── dialogs/
│       └── FileUploadDialog.tsx              # MODIFIED: initialFiles prop
└── docs/notes-feature/
    └── M7-DRAG-DROP-UPLOAD.md               # NEW: This document
```

**Note:** `DndWrapper.tsx` was created but not used in final solution. react-arborist provides its own `DndProvider` internally.

## Troubleshooting

### Build Error: Module not found (child_process, fs, etc.)

**Issue**: When `file-validation.ts` imported `DocumentExtractor` and `MediaProcessor`, Next.js tried to bundle server-only modules (fs, child_process, sharp, ffmpeg) for the browser, causing build failures.

**Root Cause**: `LeftSidebar.tsx` is a client component that imports `file-validation.ts`. Client components cannot import server-only modules.

**Solution**: Refactored `file-validation.ts` to be client-safe:
- Removed imports of `DocumentExtractor` and `MediaProcessor`
- Created centralized `SUPPORTED_MIME_TYPES` constant
- Validation logic now works without importing server modules

**Key Learning**: Always check the import chain when creating utilities used by client components. Server-only modules (fs, child_process, database clients) must stay server-side.

## Critical Issue: HTML5 Backend Conflict

### Problem
The drag-and-drop implementation conflicts with `react-arborist`'s internal use of `react-dnd` with an HTML5 backend. When both try to use the HTML5 drag-and-drop API simultaneously, React throws:

```
Cannot have two HTML5 backends at the same time.
```

This causes:
- Component re-mounting
- Duplicate file uploads
- Slug collision errors
- Page crashes

### Root Cause
- `react-arborist` (file tree with drag-to-reorder) uses `react-dnd`'s `HTML5Backend`
- Native HTML5 drag events (`onDragEnter`, `onDrop`) also use the HTML5 API
- React doesn't allow multiple backends on the same HTML5 API

### Solution: Use react-dnd's useDrop Hook Inside Tree Context

**Decision:** Use `react-dnd`'s `useDrop` hook inside `LeftSidebarContent`, where react-arborist's DndProvider already exists.

**Key Discovery:** react-arborist's `Tree` component creates its own `DndProvider` with `HTML5Backend` internally. Creating a second `DndProvider` at the layout level causes "Cannot have two HTML5 backends" error.

**Implementation:** (2026-01-22)

**Step 1: Add useDrop to LeftSidebarContent** (`components/notes/content/LeftSidebarContent.tsx`)
```tsx
import { useDrop } from "react-dnd";
import { NativeTypes } from "react-dnd-html5-backend";

export function LeftSidebarContent({ onFileDrop, ... }) {
  /**
   * NOTE: We use react-dnd's useDrop here because we're inside
   * react-arborist's Tree component, which provides a DndProvider.
   * This allows us to share the same HTML5Backend instance.
   */
  const [{ isOver, canDrop }, dropRef] = useDrop(
    () => ({
      accept: NativeTypes.FILE, // Accept external file drops
      drop: (item: { files: File[] }) => {
        const { validFiles, invalidFiles } = validateFileBatch(item.files);

        // Show errors for invalid files
        invalidFiles.forEach(({ file, error }) => {
          toast.error(error, { description: `File: ${file.name}` });
        });

        // Pass valid files to parent
        if (validFiles.length > 0 && onFileDrop) {
          onFileDrop(validFiles);
        }
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [onFileDrop]
  );

  const isDragActive = isOver && canDrop;

  return (
    <div ref={dropRef as any} className="relative ...">
      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 glass-overlay">
          Upload icon and text
        </div>
      )}

      {/* FileTree component */}
      <FileTree ... />
    </div>
  );
}
```

**Step 2: Pass Handler from LeftSidebar** (`components/notes/LeftSidebar.tsx`)
```tsx
export function LeftSidebar() {
  const [draggedFiles, setDraggedFiles] = useState<File[] | null>(null);
  const [showFileUpload, setShowFileUpload] = useState(false);

  const handleFileDrop = useCallback((files: File[]) => {
    setDraggedFiles(files);
    setShowFileUpload(true);
  }, []);

  return (
    <>
      <LeftSidebarContent
        onFileDrop={handleFileDrop}
        {...otherProps}
      />

      {showFileUpload && (
        <FileUploadDialog
          initialFiles={draggedFiles || undefined}
          {...dialogProps}
        />
      )}
    </>
  );
}
```

**Why This Works:**
- `LeftSidebarContent` renders inside `FileTree` component
- `FileTree` uses react-arborist's `Tree`, which provides `DndProvider`
- `useDrop` hook in `LeftSidebarContent` uses that existing provider
- Both file drops and tree reordering share the **same HTML5Backend instance**
- No duplicate providers = no conflicts

**Architecture:**
```
LeftSidebar (manages upload state)
  └─ LeftSidebarContent (useDrop hook + overlay)
      └─ FileTree (react-arborist)
          └─ Tree (creates DndProvider internally)
```

**Status:** ✅ Working (2026-01-22)

### Future Solutions

**Option 1: Custom Drop Zone (Recommended)**
Create a dedicated drop zone that doesn't interfere with react-arborist:
```tsx
// Add a drop zone above or below the file tree
<div className="drop-zone" onDrop={handleFileDrop}>
  Drop files here to upload
</div>
<LeftSidebarContent /> {/* react-arborist tree */}
```

**Option 2: Custom DnD Backend**
Replace react-arborist's HTML5Backend with a custom backend that handles both:
- File reordering (react-dnd)
- File upload (native File API)

**Option 3: Use File System Access API**
Modern browsers support drag-and-drop via File System Access API, which doesn't conflict with HTML5Backend.

**Option 4: Replace react-arborist**
Switch to a tree library that doesn't use react-dnd, or implement custom tree.

## Summary

Drag-and-drop file upload **fully functional** using react-dnd:
- ✅ File size validation (100MB per file, 500MB batch)
- ✅ MIME type validation (documents, images, videos)
- ✅ Client-safe validation module
- ✅ Glass overlay UI with visual feedback
- ✅ Error toasts for invalid files
- ✅ **react-dnd useDrop integration** (no conflicts with react-arborist)
- ✅ Auto-opens upload dialog with validated files

**Upload Methods:**
1. ✅ **Drag files into left sidebar** → Auto-validates → Opens upload dialog
2. ✅ Click "+" button in left sidebar header → Select file(s)
3. ✅ Multi-file upload with progress tracking
4. ✅ Folder path selector
5. ✅ Storage provider selection (R2, S3, Vercel)

**Key Learning:**
When using libraries that create their own `DndProvider` (like react-arborist), the solution is to create your own `DndProvider` at a higher level and pass the `dndManager` to the library via props. This allows both features to share the same `HTML5Backend` instance without conflicts.

**📘 For detailed troubleshooting and future reference, see [REACT-DND-INTEGRATION-GUIDE.md](./REACT-DND-INTEGRATION-GUIDE.md)**
