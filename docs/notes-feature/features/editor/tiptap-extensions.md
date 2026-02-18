# TipTap Extensions

**Custom editor extensions** for Obsidian-like note-taking experience.

## Overview

The Digital Garden editor uses TipTap 3.15.3 with a combination of built-in and custom extensions to provide a rich markdown editing experience similar to Obsidian.

**Key Features:**
- Wiki-links with autocomplete
- Obsidian-style callouts
- Slash commands for quick insertion
- Task lists with checkbox support
- Syntax highlighting for 50+ languages

## Extension Categories

### Built-In Extensions (TipTap Core)

**StarterKit** (Base functionality):
- Document, Text, Paragraph
- Heading (H1-H6)
- Bold, Italic, Strike
- Code, CodeBlock
- BulletList, OrderedList, ListItem
- Blockquote
- HorizontalRule
- HardBreak
- Gapcursor, Dropcursor

**Additional Built-In:**
- **CodeBlockLowlight** - Syntax highlighting (50+ languages via lowlight)
- **Link** - Hyperlinks with `target="_blank"` for external URLs
- **Image** - Inline image support
- **Table** - Full table support (create, edit, add/delete rows/columns)
- **TaskList + TaskItem** - Interactive checkboxes
- **TextAlign** - Left, center, right, justify alignment
- **Underline** - Underline formatting
- **CharacterCount** - Real-time word/character/reading time stats
- **Placeholder** - "Type '/' for commands..." hint

### Custom Extensions

#### 1. WikiLink Extension

**File**: `lib/domain/editor/extensions/wiki-link.ts`

**Syntax**:
- `[[Note Title]]` - Link to note by title
- `[[slug|Display Text]]` - Link with custom display text

**Features**:
- Click navigation to linked notes
- Autocomplete suggestions as you type
- Renders as blue underlined link
- Tracks backlinks for connected notes

**Implementation**:
```typescript
WikiLink.configure({
  onWikiLinkClick: (targetTitle: string) => {
    // Navigate to target note
    router.push(`/content?title=${encodeURIComponent(targetTitle)}`);
  },
  fetchNotesForWikiLink: async (query: string) => {
    // Search notes for autocomplete
    const response = await fetch(`/api/content/search?q=${query}`);
    return response.json();
  },
})
```

**Autocomplete**: Triggered by typing `[[`, shows dropdown of matching notes

#### 2. Callout Extension

**File**: `lib/domain/editor/extensions/callout.ts`

**Syntax**:
```markdown
> [!note] Title
> Content here

> [!warning] Watch Out
> Important warning

> [!tip] Pro Tip
> Helpful information
```

**Types** (6 total):
- `[!note]` - Blue, for general information
- `[!tip]` - Green, for helpful hints
- `[!warning]` - Orange, for cautions
- `[!danger]` - Red, for critical warnings
- `[!info]` - Blue (lighter), for FYI
- `[!success]` - Green, for completions

**Features**:
- Colored left border matching type
- Icon matching type (lucide-react)
- Collapsible with `> [!note]-` syntax (minus sign)
- Supports nested content (paragraphs, lists, code blocks)

**Rendering**:
```tsx
<div className="callout callout-warning">
  <div className="callout-header">
    <AlertTriangleIcon />
    <span>Watch Out</span>
  </div>
  <div className="callout-content">
    Important warning
  </div>
</div>
```

#### 3. Slash Commands

**File**: `lib/domain/editor/commands/slash-commands.tsx`

**Trigger**: Type `/` in the editor

**Available Commands**:
- **Headings**: `/h1`, `/h2`, `/h3` (or just `/heading`)
- **Lists**: `/bullet`, `/number`, `/task`
- **Blocks**: `/quote`, `/code`, `/divider`
- **Advanced**: `/table`, `/callout`
- **Media**: `/image`

**UI**:
- Dropdown menu with keyboard navigation (↑↓)
- Enter to insert, Escape to dismiss
- Fuzzy search (type `/cod` matches "code block")
- Icons for each command

**Implementation**:
```typescript
SlashCommands.configure({
  suggestion: {
    items: ({ query }) => {
      return SLASH_COMMANDS.filter(cmd =>
        cmd.title.toLowerCase().includes(query.toLowerCase())
      );
    },
    render: () => {
      // Custom React component for dropdown
      return <SlashCommandMenu />;
    },
  },
})
```

#### 4. TaskList Input Rule

**File**: `lib/domain/editor/extensions/task-list.ts`

**Behavior**:
- Type `- [ ]` → Converts to unchecked task
- Type `- [x]` → Converts to checked task
- Backspace in empty task → Removes task formatting

**Features**:
- Click checkbox to toggle state
- Persists checked state in TipTap JSON
- Exports to markdown as `- [ ]` or `- [x]`

#### 5. BulletList Backspace

**File**: `lib/domain/editor/extensions/bullet-list.ts`

**Obsidian-style behavior**:
- Backspace in empty bullet item → Converts to plain text "-"
- Maintains Obsidian muscle memory

## Markdown Shortcuts

**Auto-formatting as you type:**

| Type | Result |
|------|--------|
| `#` + Space | H1 heading |
| `##` + Space | H2 heading |
| `###` + Space | H3 heading |
| `-` + Space | Bullet list |
| `1.` + Space | Ordered list |
| `> ` + Space | Blockquote |
| ` ``` ` + Space | Code block |
| `- [ ]` + Space | Task list |
| `---` | Horizontal rule |

**Keyboard Shortcuts:**
- `Cmd/Ctrl+B` - Bold
- `Cmd/Ctrl+I` - Italic
- `Cmd/Ctrl+K` - Insert link
- `Cmd/Ctrl+Shift+X` - Strikethrough
- `Cmd/Ctrl+Z` - Undo
- `Cmd/Ctrl+Shift+Z` - Redo

## Editor Configuration

### Client-Side Configuration

**File**: `lib/domain/editor/extensions-client.ts`

```typescript
export function getEditorExtensions(options: EditorExtensionOptions) {
  return [
    StarterKit,
    CodeBlockLowlight.configure({ /* ... */ }),
    Link.configure({ /* ... */ }),
    Image,
    Table,
    TaskList,
    TaskItem,
    WikiLink.configure({ /* ... */ }),
    Callout,
    SlashCommands.configure({ /* ... */ }),
    CharacterCount,
    // ... more extensions
  ];
}
```

**Use Case**: Editor component, requires React and DOM

### Server-Side Configuration

**File**: `lib/domain/editor/extensions-server.ts`

```typescript
export function getServerExtensions() {
  return [
    StarterKit,
    CodeBlockLowlight.configure({ /* ... */ }),
    Link,
    // NO React components (WikiLink autocomplete, SlashCommands)
    // Safe for API routes and markdown conversion
  ];
}
```

**Use Case**: Markdown export, search text extraction, API routes

### Viewer Configuration

**File**: `lib/domain/editor/extensions-client.ts`

```typescript
export function getViewerExtensions() {
  return [
    StarterKit,
    // Read-only, no editing features
    // Renders content but disables modifications
  ];
}
```

**Use Case**: Display-only note viewer (no editing)

## Auto-Save System

**Debounce**: 2-second delay after typing stops

**Flow**:
1. User types → Auto-save timer starts (yellow indicator)
2. 2 seconds of inactivity → API call to save
3. Success → Green indicator, toast notification
4. Error → Red indicator, retry logic

**Implementation**:
```typescript
const editor = useEditor({
  onUpdate: ({ editor }) => {
    debouncedSave(editor.getJSON());
  },
});

const debouncedSave = useDebouncedCallback(async (content) => {
  const response = await fetch(`/api/content/content/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
  // Show success/error indicator
}, 2000);
```

## Extension Development Guide

### Creating a Custom Extension

**1. Define the Extension**:
```typescript
import { Node } from '@tiptap/core';

export const MyCustomNode = Node.create({
  name: 'myCustomNode',

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [{ tag: 'div[data-my-node]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-my-node': '' }, 0];
  },

  addCommands() {
    return {
      insertMyNode: () => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
        });
      },
    };
  },
});
```

**2. Add to Extension List**:
```typescript
// lib/domain/editor/extensions-client.ts
export function getEditorExtensions() {
  return [
    // ... existing extensions
    MyCustomNode,
  ];
}
```

**3. Style the Extension**:
```css
/* app/globals.css */
div[data-my-node] {
  padding: 1rem;
  border-left: 4px solid var(--color-primary);
  background: var(--color-surface-glass-1);
}
```

### Best Practices

**Do:**
- ✅ Follow TipTap v3 API patterns
- ✅ Use input rules for markdown shortcuts
- ✅ Test with server-safe extensions
- ✅ Add keyboard shortcuts sparingly
- ✅ Support export to markdown

**Don't:**
- ❌ Conflict with browser shortcuts
- ❌ Add client-only extensions to server config
- ❌ Mutate editor state directly
- ❌ Skip schema validation
- ❌ Forget to handle edge cases (empty content, nested structures)

## Related Documentation

- [TipTap Schema Evolution Guide](../../guides/editor/TIPTAP-SCHEMA-EVOLUTION-GUIDE.md)
- [TipTap Extension Example](../../guides/editor/TIPTAP-EXTENSION-EXAMPLE.md)
- [Wiki-Links Feature](wiki-links.md)
- [Editor Architecture](../../core/06-ui-components.md#editor)

---

**Implemented**: Epoch 2 (M5 - Editor, M6 - Extensions)
**Last Updated**: Feb 18, 2026
