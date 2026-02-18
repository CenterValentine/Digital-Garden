# Tool Belt Architecture

**Status:** ✅ Active (M7+)
**Created:** 2025-01-24
**Last Updated:** 2025-01-24

## Overview

The **Tool Belt** is a context-aware action system for file viewers in the Digital Garden Notes IDE. It provides file-type-specific actions (save, format, export, AI chat, etc.) with flexible positioning and styling.

**Key Concept:** Just like a carpenter's tool belt contains different tools for different tasks, the file viewer's tool belt adapts its available actions based on the file type being viewed.

## Architecture

### Core Components

```
components/content/tool-belt/
├── ToolBelt.tsx              # Main component (renders actions)
├── types.ts                  # Type definitions
├── index.ts                  # Exports
└── providers/
    ├── json-provider.tsx     # JSON file actions
    ├── image-provider.tsx    # (Future) Image actions
    ├── video-provider.tsx    # (Future) Video actions
    ├── markdown-provider.tsx # (Future) Markdown + AI chat
    └── ...
```

### Type System

**Key Types:**

```typescript
// Individual action
interface ToolAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger" | "warning" | "success";
  tooltip?: string;
  hidden?: boolean;
  shortcut?: string; // e.g., "⌘S"
}

// Group of related actions
interface ToolActionGroup {
  id: string;
  label?: string;
  actions: ToolAction[];
  separator?: boolean; // Visual separator before group
}

// Configuration for the tool belt
interface ToolBeltConfig {
  position: "top" | "bottom" | "center" | "floating";
  style: "compact" | "expanded" | "minimal";
  groups: ToolActionGroup[];
  alwaysVisible?: boolean;
  className?: string;
}
```

### Positioning Strategies

The tool belt supports four positioning modes:

1. **`top`** - Below the header (e.g., toolbar for images)
2. **`bottom`** - Above the status bar (e.g., video controls)
3. **`center`** - Centered floating (current JSON pattern)
4. **`floating`** - Positioned by parent (custom layouts)

### Styling Modes

Three visual styles:

1. **`compact`** - Small buttons with icons and labels (default)
2. **`expanded`** - Full buttons with shortcuts visible
3. **`minimal`** - Icon-only buttons (dense layouts)

## Current Implementation: JSON Provider

### Features

The JSON provider currently offers:

- **Format** - Pretty-print JSON with proper indentation
- **Copy** - Copy JSON to clipboard
- **Revert** - Restore to last saved version (only when unsaved changes exist)
- **Save** - Save changes with Cmd+S keyboard shortcut (primary action)

### Usage Example

```tsx
import { ToolBelt, getJSONToolBeltConfig } from "@/components/content/tool-belt";

function JSONViewer({ fileName, contentId, ... }) {
  const [editorContent, setEditorContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Generate tool belt configuration
  const toolBeltConfig = getJSONToolBeltConfig(
    {
      fileName,
      mimeType: "application/json",
      contentId,
      editable: true,
      hasUnsavedChanges,
      isSaving,
    },
    {
      content: editorContent,
      originalContent,
      hasUnsavedChanges,
      isSaving,
      onFormat: handleFormat,
      onCopy: copyToClipboard,
      onRevert: handleRevert,
      onSave: handleSave,
    }
  );

  return (
    <div className="relative">
      {/* Your viewer content */}

      {/* Tool Belt */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <ToolBelt config={toolBeltConfig} />
      </div>
    </div>
  );
}
```

### Dynamic Visibility

Actions can be conditionally shown/hidden:

```typescript
{
  id: "revert",
  label: "Revert",
  onClick: onRevert,
  hidden: !hasUnsavedChanges, // Only show when there are changes
}

{
  id: "save",
  label: "Save",
  onClick: onSave,
  disabled: !hasUnsavedChanges || isSaving, // Disable when no changes or saving
}
```

## Future File Type Providers

### Image Provider (M7+)

**Planned Actions:**
- Rotate (90°, 180°, 270°)
- Crop (freeform, aspect ratios)
- Resize (dimensions, quality)
- Filters (brightness, contrast, saturation)
- Download (original, processed)

**Position:** `top` (toolbar below header)
**Style:** `compact`

### Video Provider (M7+)

**Planned Actions:**
- Play/Pause (spacebar)
- Mute/Unmute (M key)
- Playback Speed (0.5x, 1x, 1.5x, 2x)
- Trim/Cut
- Extract Frame
- Download

**Position:** `bottom` (video controls)
**Style:** `minimal`

### Audio Provider (M7+)

**Planned Actions:**
- Play/Pause
- Mute/Unmute
- Playback Speed
- Waveform View Toggle
- Download

**Position:** `bottom`
**Style:** `minimal`

### PDF Provider (M7+)

**Planned Actions:**
- Zoom In/Out
- Fit to Width/Height
- Print
- Annotations (highlight, comment)
- Download

**Position:** `top`
**Style:** `compact`

### Markdown Provider (M8+)

**Planned Actions:**
- Bold (⌘B)
- Italic (⌘I)
- Link (⌘K)
- Code Block
- Insert Image
- **AI Chat** - Opens AI assistant for content help
- Preview Toggle

**Position:** `top`
**Style:** `expanded` (show shortcuts)

**Special Feature:** AI Chat button opens an input bar for conversational assistance with writing, editing, and understanding markdown content.

### Code Provider (Future)

**Planned Actions:**
- Format Code
- Run (if executable)
- Debug
- AI Explain (explain selected code)
- Copy
- Download

**Position:** `top`
**Style:** `compact`

## AI Chat Integration (M8+)

### Vision

The tool belt will eventually include an **AI Chat** action that opens a conversational interface for file-specific assistance:

**Markdown Files:**
- "Summarize this note"
- "Suggest related topics"
- "Improve this paragraph"
- "Generate outline"

**Code Files:**
- "Explain this function"
- "Find bugs"
- "Suggest refactoring"
- "Add comments"

**JSON Files:**
- "Validate schema"
- "Transform structure"
- "Extract specific fields"

### UI Pattern

When AI Chat is activated:

1. Tool belt transforms to show chat input bar
2. User types question/command
3. AI responds with inline suggestions or edits
4. User can accept/reject/modify suggestions

**Reference:** Similar to GitHub Copilot's inline chat or Cursor's command palette.

## Implementation Strategy

### Phase 1: Extract & Refactor (✅ Complete)

- [x] Extract tool belt types and component
- [x] Create JSON provider
- [x] Refactor JSONViewer to use tool belt
- [x] Document architecture

### Phase 2: Expand File Types (M7+)

- [ ] Image provider (rotate, crop, resize)
- [ ] Video provider (playback controls)
- [ ] Audio provider (playback controls)
- [ ] PDF provider (zoom, annotations)

### Phase 3: AI Integration (M8+)

- [ ] Markdown provider with AI chat
- [ ] Code provider with AI explain
- [ ] AI chat input component
- [ ] AI action registry system

### Phase 4: Advanced Features (M9+)

- [ ] Custom action plugins
- [ ] User-configurable shortcuts
- [ ] Action history/undo
- [ ] Multi-file batch actions

## Design Patterns

### Provider Pattern

Each file type has a provider function that generates configuration:

```typescript
export function getImageToolBeltConfig(
  fileContext: FileContext,
  imageContext: ImageToolBeltContext
): ToolBeltConfig {
  return {
    position: "top",
    style: "compact",
    groups: [
      {
        id: "transform",
        label: "Transform",
        actions: [
          { id: "rotate", label: "Rotate", onClick: imageContext.onRotate },
          { id: "crop", label: "Crop", onClick: imageContext.onCrop },
        ],
      },
      // ... more groups
    ],
  };
}
```

### Conditional Actions

Actions can be dynamically shown/hidden based on state:

```typescript
{
  id: "undo",
  label: "Undo",
  onClick: onUndo,
  hidden: !canUndo, // Only show when undo is available
  disabled: isProcessing, // Disable during processing
}
```

### Keyboard Shortcuts

Actions can specify keyboard shortcuts:

```typescript
{
  id: "save",
  label: "Save",
  onClick: onSave,
  shortcut: "⌘S", // Displayed in expanded mode
}
```

The component registers keyboard listeners automatically when shortcuts are specified.

## Accessibility

- All actions have clear labels and tooltips
- Keyboard shortcuts for common actions
- Focus management for keyboard navigation
- Screen reader announcements for state changes
- High contrast mode support

## Testing Strategy

### Unit Tests

- Test action visibility logic
- Test keyboard shortcut registration
- Test position/style rendering

### Integration Tests

- Test provider configurations
- Test action callbacks
- Test state synchronization

### E2E Tests

- Test complete workflows (edit, save, revert)
- Test keyboard navigation
- Test AI chat integration (M8+)

## Migration Guide

### Converting Existing Viewers

To migrate an existing file viewer to use the tool belt:

1. **Create a provider** in `tool-belt/providers/`
2. **Extract action handlers** from the viewer component
3. **Generate config** using the provider
4. **Replace old UI** with `<ToolBelt config={...} />`
5. **Position the tool belt** using absolute/relative positioning

**Example:** See [JSONViewer.tsx](../../components/content/viewer/JSONViewer.tsx) for reference implementation.

## Future Considerations

### Extensibility

- **Plugin System** - Allow third-party actions
- **Action Marketplace** - Share custom tools
- **Macro Recording** - Record action sequences
- **Context-Aware AI** - Smart action suggestions

### Performance

- Lazy load provider configurations
- Virtualize large action lists
- Debounce action callbacks
- Cache rendered components

### UX Enhancements

- Drag-and-drop action reordering
- Customizable action placement
- Action favorites/recent
- Contextual tooltips with examples

## References

**Related Documents:**
- [M7-STORAGE-ARCHITECTURE-V2.md](./M7-STORAGE-ARCHITECTURE-V2.md) - File storage system
- [M7-MEDIA-VIEWERS-IMPLEMENTATION.md](./M7-MEDIA-VIEWERS-IMPLEMENTATION.md) - Media viewer components
- [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) - Current milestone status

**Implementation:**
- [ToolBelt.tsx](../../components/content/tool-belt/ToolBelt.tsx) - Main component
- [types.ts](../../components/content/tool-belt/types.ts) - Type definitions
- [json-provider.tsx](../../components/content/tool-belt/providers/json-provider.tsx) - JSON file actions

**Inspiration:**
- VS Code Editor Actions
- Notion Slash Commands
- GitHub Copilot Inline Chat
- Figma Tool Panels
