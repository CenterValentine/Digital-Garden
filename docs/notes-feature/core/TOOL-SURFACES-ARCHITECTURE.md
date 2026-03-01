# Tool Surfaces Architecture

## Core Principles (from conductor-one)

- JSON (Tiptap/ProseMirror) is canonical for documents
- Markdown is debug/export only, lossless by default
- Tool surfaces are context-aware and must respect content type, selection, capabilities, and permissions
- Tools registered in deterministic registry with explicit ordering for UX consistency

**Already Implemented (don't include as new work):**
- ✅ File tree is DB-backed source of truth for ordering
- ✅ Folder-only nesting; files cannot contain children

## Tool Surface Glossary

### Toolbar

**Definition (from conductor-one):** Inline actions in the content header (download/share/quick actions). Always available when a content node is open.

**Purpose:** **UX consistency**. Right now, different content headers have download buttons in different places with inconsistent styling. Toolbar provides deterministic ordering - all documents get download/export in the same reliable location.

**Location:** Content header, fixed position

**DG Implementation:** New component `components/content/headers/ContentToolbar.tsx`

**Ordering:** Tools declare explicit `order` number in registry (10, 20, 30...) to ensure consistent placement across content types.

### Toolbelt

**Definition (from conductor-one):** Floating, headless icon strip anchored to the content area. Context-aware; appears only when active content node and selection state support the tool.

**Flexibility:** Some toolbelts use library-provided UI (e.g., TipTap's `BubbleMenu` for text formatting), others use shared toolbelt UI. Registry pattern supports both.

**Location:** Floats near selection or content area

**DG Implementation:** Align existing `BubbleMenu` to toolbelt registry pattern while preserving TipTap's native BubbleMenu component.

**State-driven:** Requires selection or active node; hide/disable otherwise.

### RightSidebar (Side Panel in docs)

**Definition (from conductor-one):** Right-side panel for complex workflows (backlinks, outline, tags, future RAG/inspectors). Context-aware; only renders tabs when active content node supports them and user has required permissions.

**Naming:** Keep `RightSidebar` name in code (there are multiple sidebars, "Side Panel" would be ambiguous). Use "Side Panel" in documentation when appropriate for clarity.

**Location:** Right sidebar (existing `RightSidebar.tsx`)

**DG Implementation:** **NO renaming needed**. Integrate with tool registry for tab visibility/ordering. Existing header with icon-based tabs already matches conductor-one pattern.

**Permission-driven:** Read-only sessions disable mutation tools.

### Interaction Surface

**Definition (from conductor-one):** Ephemeral context tools that appear based on hover/selection (e.g., link preview on hover, image resize handles).

**DG Current State:** **Already partially implemented** - align existing implementations:
- `BubbleMenu` - Text selection toolbar (align to toolbelt concept)
- `TableBubbleMenu` - Table editing toolbar (interaction surface)
- `LinkDialog` - Link insertion modal (interaction surface)
- Context menus - Right-click actions (interaction surface)

**Sprint 29 Scope:** Conceptually align existing interaction surfaces to this pattern. No new interaction surfaces in Sprint 29.

## Context Awareness Principles

### Content-Driven

Tools declare supported `ContentType` via registry and only render for matching nodes.

Example:
```typescript
{
  id: "download",
  label: "Download",
  icon: Download,
  supportedContentTypes: ["file", "note", "external"],
  onClick: () => handleDownload()
}
```

### State-Driven

Tools may require selection or active node; hide/disable otherwise.

Example: Bold/Italic in Toolbelt only appear when text is selected.

### Permission-Driven

Read-only or restricted sessions must disable mutation tools.

Example: Delete action disabled when `readOnly: true`.

### Non-Blocking

Toolbelt actions should never block primary editing; heavy flows live in Side Panel.

Example: Quick format actions in Toolbelt, complex RAG workflows in Side Panel.

### Predictable Placement

- Toolbar: Fixed to content header
- Toolbelt: Floats near selection/content
- Side Panel: Right side only

## Registry Pattern (Deterministic Tool Registration)

**Based on conductor-one's actual implementation + DG extensions:**

```typescript
// lib/domain/tools/types.ts
export type ToolSurface =
  | 'toolbar'       // Content header (always visible)
  | 'toolbelt'      // Floating actions (selection-aware)
  | 'panel'         // Right sidebar (complex workflows)
  | 'menu'          // Hierarchical menus (context menu, slash commands, command palette)
  | 'interaction';  // Ephemeral UI (autocomplete, dialogs, hover preview)

export interface ToolContextValue {
  activeContentNodeId: string | null;
  contentNodeType: ContentType | null;
  mode: 'view' | 'edit';
  selection: null | { type: 'text' | 'node'; length?: number };
  focusTarget: 'content' | 'toolbar' | 'panel' | null;
  capabilities: {
    downloadable: boolean;
    editable: boolean;
    searchable: boolean; // Renamed from 'filterable' for clarity (includes search + filter)
    ragAssignable: boolean;
  };
  permissions: {
    readOnly: boolean;
    role: 'owner' | 'admin' | 'member' | 'guest';
  };
  tree: TreeNode[]; // Optional - for advanced context
  editor?: Editor; // TipTap editor instance (when editing note)
}

export interface ToolDefinition {
  id: string;
  label: string;
  icon: JSX.Element; // Lucide icon element
  order: number; // Deterministic ordering (10, 20, 30...)
  surfaces: ToolSurface[]; // Can appear on multiple surfaces
  contentTypes: ContentType[] | 'all';
  availableWhen: (ctx: ToolContextValue) => boolean; // Show/hide
  enabledWhen?: (ctx: ToolContextValue) => boolean; // Enable/disable
  disabledReason?: (ctx: ToolContextValue) => string; // Tooltip when disabled
  onClick?: (ctx: ToolContextValue) => void;
  renderPanel?: (ctx: ToolContextValue) => JSX.Element; // For panel tools

  // Optional: TipTap integration
  tiptap?: {
    extension: string; // TipTap extension name (for reference/debugging)
    command: string; // TipTap command name
    canExecute?: (editor: Editor) => boolean; // Check if command can run
  };

  // Optional: AI integration
  ai?: {
    contextProvider: boolean; // Can provide context to AI
    aiActionable: boolean; // Can be triggered by AI
    ragEnabled: boolean; // RAG-aware
  };

  // Optional: Metadata
  metadata?: {
    category: 'editing' | 'ai' | 'workflow' | 'media' | 'navigation' | 'content-management';
    tags: string[];
    shortcut?: string; // Keyboard shortcut (e.g., "Cmd+B")
  };
}

// lib/domain/tools/registry.ts
export const toolRegistry: ToolDefinition[] = [
  // TOOLBAR TOOLS
  {
    id: 'download',
    label: 'Download',
    icon: <Download size={16} />,
    order: 10,
    surfaces: ['toolbar'],
    contentTypes: 'all',
    availableWhen: (ctx) => ctx.capabilities.downloadable,
    metadata: { category: 'content-management', tags: ['export'] },
  },
  {
    id: 'share',
    label: 'Share',
    icon: <Share2 size={16} />,
    order: 20,
    surfaces: ['toolbar'],
    contentTypes: 'all',
    availableWhen: (ctx) => !ctx.permissions.readOnly,
    metadata: { category: 'content-management', tags: ['collaboration'] },
  },

  // TOOLBELT TOOLS (TipTap-wrapped)
  {
    id: 'bold',
    label: 'Bold',
    icon: <Bold size={16} />,
    order: 10,
    surfaces: ['toolbelt', 'menu'], // Available in both surfaces
    contentTypes: ['note'],
    availableWhen: (ctx) => ctx.mode === 'edit' && ctx.selection?.type === 'text',
    enabledWhen: (ctx) => ctx.editor?.can().toggleBold() ?? false,
    onClick: (ctx) => ctx.editor?.chain().focus().toggleBold().run(),
    tiptap: { extension: 'Bold', command: 'toggleBold' },
    metadata: { category: 'editing', tags: ['formatting'], shortcut: 'Cmd+B' },
  },
  {
    id: 'italic',
    label: 'Italic',
    icon: <Italic size={16} />,
    order: 20,
    surfaces: ['toolbelt', 'menu'],
    contentTypes: ['note'],
    availableWhen: (ctx) => ctx.mode === 'edit' && ctx.selection?.type === 'text',
    enabledWhen: (ctx) => ctx.editor?.can().toggleItalic() ?? false,
    onClick: (ctx) => ctx.editor?.chain().focus().toggleItalic().run(),
    tiptap: { extension: 'Italic', command: 'toggleItalic' },
    metadata: { category: 'editing', tags: ['formatting'], shortcut: 'Cmd+I' },
  },

  // MENU TOOLS (context menu, slash commands)
  {
    id: 'create-note',
    label: 'New Note',
    icon: <FileText size={16} />,
    order: 10,
    surfaces: ['menu'], // Context menu only
    contentTypes: 'all',
    availableWhen: (ctx) => !ctx.permissions.readOnly,
    onClick: (ctx) => createNote(ctx.activeContentNodeId),
    metadata: { category: 'content-management', tags: ['create'], shortcut: 'A' },
  },
  {
    id: 'create-folder',
    label: 'New Folder',
    icon: <Folder size={16} />,
    order: 20,
    surfaces: ['menu'],
    contentTypes: 'all',
    availableWhen: (ctx) => !ctx.permissions.readOnly,
    onClick: (ctx) => createFolder(ctx.activeContentNodeId),
    metadata: { category: 'content-management', tags: ['create'], shortcut: 'Shift+A' },
  },

  // PANEL TOOLS
  {
    id: 'backlinks',
    label: 'Backlinks',
    icon: <Link2 size={16} />,
    order: 10,
    surfaces: ['panel'],
    contentTypes: ['note'],
    availableWhen: (ctx) => Boolean(ctx.activeContentNodeId),
    renderPanel: (ctx) => <BacklinksPanel contentId={ctx.activeContentNodeId} />,
    metadata: { category: 'navigation', tags: ['links', 'relationships'] },
  },
  {
    id: 'rag',
    label: 'RAG',
    icon: <Radar size={16} />,
    order: 40,
    surfaces: ['panel'],
    contentTypes: 'all',
    availableWhen: (ctx) => ctx.capabilities.ragAssignable && Boolean(ctx.activeContentNodeId),
    renderPanel: (ctx) => <RagAssignerPanel context={ctx} />,
    ai: { contextProvider: true, aiActionable: true, ragEnabled: true },
    metadata: { category: 'ai', tags: ['rag', 'context'] },
  },
];

// Resolver function (filters + sorts by order)
export function resolveToolsForSurface(
  surface: ToolSurface,
  ctx: ToolContextValue
) {
  return toolRegistry
    .filter(tool => tool.surfaces.includes(surface))
    .filter(tool => tool.contentTypes === 'all' || tool.contentTypes.includes(ctx.contentNodeType ?? 'note'))
    .filter(tool => tool.availableWhen(ctx))
    .sort((a, b) => a.order - b.order); // Deterministic ordering
}
```

**Key benefits:**
- **Deterministic ordering:** `order` field ensures download always appears before share
- **Multi-surface tools:** Same tool can appear in toolbar + panel (e.g., "settings")
- **Context-aware:** `availableWhen` and `enabledWhen` for fine-grained control
- **Disabled states:** `disabledReason` provides helpful tooltip when tool is disabled
- **TipTap integration:** Built-in editor features wrapped as tools for consistency
- **AI-ready:** Metadata for AI integration (context providers, RAG, actionable tools)

## Architectural Clarifications

### Tool Surface Types Explained

**1. Toolbar** (content header, always visible)
- **Purpose:** Persistent actions for the active content
- **Examples:** Download, Share, Export, Print
- **Visualization:** Horizontal button row in content header
- **Trigger:** Always visible when content is open

**2. Toolbelt** (floating, selection-aware)
- **Purpose:** Quick actions related to current selection or editor state
- **Examples:** Bold, Italic, Link, Headings (text formatting)
- **Visualization:** Floating bubble menu near selection, or library-provided UI (e.g., TipTap BubbleMenu)
- **Trigger:** Text selection, node selection, or editor focus
- **Key insight:** Context menu is just a different visualization of toolbelt (both context-aware, both action-oriented)

**3. Panel** (right sidebar, complex workflows)
- **Purpose:** Complex, stateful workflows that need dedicated space
- **Examples:** Backlinks, Outline, Tags, RAG settings, Tool settings
- **Visualization:** Tabbed sidebar with icon-based tabs
- **Trigger:** Tab click, always available but content filtered by `availableWhen`

**4. Menu** (hierarchical, command-driven) - **NEW surface type**
- **Purpose:** Hierarchical actions, keyboard-triggered commands
- **Examples:** Context menu (right-click), Slash commands (/), Command palette (Cmd+K future)
- **Visualization:** Dropdown menu, nested submenus
- **Trigger:** Right-click, keyboard shortcut, slash character
- **Rationale:** Context menu parallels toolbelt in behavior (context-aware, action-oriented) but uses different visualization (menu vs buttons)

**5. Interaction** (ephemeral, specialized UI)
- **Purpose:** Catch-all for custom interactions that don't fit other surfaces
- **Examples:** Autocomplete dropdowns, modal dialogs, hover previews, resize handles
- **Visualization:** Varies (inline popup, modal, overlay, handle)
- **Trigger:** Hover, keyboard input, user interaction
- **Rationale:** Too specialized or transient for standardized surfaces

### Existing Implementations Mapped to Surfaces

| Implementation | Current | Surface Type | Clarification |
|---|---|---|---|
| **BubbleMenu (component)** | TipTap library | N/A | **Implementation**, not a surface. Renders tools from `toolbelt` surface |
| **Bold, Italic, Link (tools)** | Registered in registry | `toolbelt` | Actions displayed by BubbleMenu component |
| TableBubbleMenu | Client component | `interaction` | Ephemeral, table-specific (could also be `toolbelt`) |
| Context menu | Client component | `menu` | Hierarchical, right-click triggered |
| Slash commands | TipTap extension | `menu` | Keyboard-triggered command menu |
| LinkDialog | Client component | `interaction` | Modal dialog, ephemeral |
| Wiki-link autocomplete | TipTap extension | `interaction` | Inline autocomplete dropdown |
| Tag autocomplete | TipTap extension | `interaction` | Inline autocomplete dropdown |

**Key Distinction:**
- **BubbleMenu** = TipTap library component (implementation detail)
- **Toolbelt** = Surface type (conceptual layer)
- BubbleMenu **renders** tools from the toolbelt surface
- We keep BubbleMenu component but wire it to tool registry

### TipTap Features as Tools

**Design Decision:** Wrap TipTap built-in features as tools for deterministic ordering and context-awareness, but delegate execution to TipTap's command chain.

**Example: Bold tool**
```typescript
{
  id: 'bold',
  label: 'Bold',
  icon: <Bold size={16} />,
  order: 10,
  surfaces: ['toolbelt'],
  contentTypes: ['note'],
  availableWhen: (ctx) => ctx.mode === 'edit' && ctx.selection?.type === 'text',
  enabledWhen: (ctx) => ctx.editor?.can().toggleBold() ?? false,
  onClick: (ctx) => ctx.editor?.chain().focus().toggleBold().run(),
  tiptap: {
    extension: 'Bold',
    command: 'toggleBold',
    canExecute: (editor) => editor.can().toggleBold(),
  },
  metadata: {
    category: 'editing',
    tags: ['formatting', 'text'],
    shortcut: 'Cmd+B',
  },
}
```

**Benefits:**
- Centralized tool configuration (don't duplicate logic in BubbleMenu component)
- Consistent ordering (Bold always before Italic)
- Context-aware enabling (can disable Bold when read-only)
- Future extensibility (AI can discover and trigger editor commands)

### Complete List of Interaction Surfaces

**Current (already implemented):**
1. **Wiki-link autocomplete** - Inline dropdown, keyboard-triggered ([[)
2. **Tag autocomplete** - Inline dropdown, keyboard-triggered (#)
3. **LinkDialog** - Modal dialog, keyboard-triggered (Cmd+K)
4. **TableBubbleMenu** - Floating toolbar (specialized, could be `toolbelt` or `interaction`)
5. **Image paste/upload preview** - Inline preview before upload
6. **Context menu** - Right-click menu (moving to `menu` surface)
7. **Slash commands** - Inline command menu (moving to `menu` surface)

**Future (planned):**
8. **Image resize handles** - Drag handles on selected images
9. **Hover link preview** - Show link preview on hover
10. **Drag-and-drop indicators** - Visual feedback during file tree drag
11. **Selection formatting indicator** - Show active formatting (bold, italic) in cursor/selection

### Why 'searchable' instead of 'filterable'

**Rationale:** The capability includes both search AND filter operations:
- Search: Full-text search, fuzzy matching
- Filter: Tag filters, date range filters, content type filters

`searchable` is more intuitive than `filterable` and encompasses both concepts.

## Key Architectural Decisions

**1. Five Tool Surfaces (not four)**
- Added `'menu'` as distinct surface type for hierarchical, command-driven actions
- Rationale: Context menu and slash commands share structure (hierarchical menus) but differ from toolbelt (flat buttons)

**2. TipTap Features Wrapped as Tools**
- Bold, Italic, Link, etc. registered in tool registry with `tiptap` metadata
- Benefits: Deterministic ordering, context-aware enabling, AI discoverability
- Execution delegates to TipTap's command chain (no reimplementation)

**3. AI Integration Metadata**
- `ai` field for future RAG/AI capabilities
- `contextProvider`: Tool can provide context to AI
- `aiActionable`: Tool can be triggered by AI
- `ragEnabled`: Tool is RAG-aware

**4. Context Menu = Menu Surface (not Toolbelt)**
- Context menu parallels toolbelt in behavior (context-aware, action-oriented)
- Different visualization justifies separate surface type
- Same tools can appear in both surfaces (e.g., Bold in toolbelt AND context menu)

**5. Interaction Surface as Catch-All**
- Ephemeral, specialized UI that doesn't fit other surfaces
- Examples: Autocomplete, dialogs, hover previews, resize handles
- Not formalized in registry (too varied, often library-specific)

**6. No Renaming of RightSidebar**
- Keep `RightSidebar` in code (multiple sidebars, "Side Panel" would be ambiguous)
- Use "Side Panel" in documentation for clarity when appropriate

**7. 'searchable' Capability**
- Renamed from 'filterable' to include both search AND filter operations
- More intuitive naming

**8. Tool Metadata for Extensibility**
- `category`: Editing, AI, workflow, media, navigation, content-management
- `tags`: Freeform tags for search/discovery
- `shortcut`: Keyboard shortcut display

## Implementation Guidelines

### When Adding New Tools

1. **Register in `lib/domain/tools/registry.ts`:**
   - Choose unique `id` (kebab-case)
   - Provide clear `label` (displayed in UI)
   - Import icon from `lucide-react`
   - Set `order` (increment by 10 from previous tool in same surface)
   - Specify `surfaces` array
   - Define `contentTypes` (array or `'all'`)
   - Implement `availableWhen` function
   - Optional: `enabledWhen`, `disabledReason`, `onClick`, `renderPanel`

2. **Context-Aware Logic:**
   - Use `ctx.contentNodeType` to filter by content type
   - Use `ctx.mode` to require edit mode
   - Use `ctx.selection` to require selection
   - Use `ctx.permissions.readOnly` to disable mutation tools
   - Use `ctx.capabilities` to check for specific features

3. **Ordering Strategy:**
   - Leave gaps (10, 20, 30...) to allow future insertions
   - Group related tools together (e.g., all text formatting 10-90)
   - Critical actions first (e.g., Save before Delete)

4. **Multi-Surface Tools:**
   - Same tool can appear in multiple surfaces (e.g., `['toolbar', 'panel']`)
   - Use different rendering for each surface (`onClick` vs `renderPanel`)

### Testing New Tools

1. **Visibility:** Tool appears only when `availableWhen` returns true
2. **Enablement:** Tool disabled when `enabledWhen` returns false
3. **Ordering:** Tool appears in correct position (sorted by `order`)
4. **Multi-surface:** Tool appears in all specified surfaces
5. **Context filtering:** Tool respects `contentTypes` filter
6. **Tooltip:** `disabledReason` shows when tool is disabled

### Troubleshooting

Use the **ToolDebugPanel** component (dev-only):
- Toggle with floating purple wrench button (bottom-right)
- Shows current tool context values
- Lists resolved tools per surface
- Displays full tool registry
- Highlights disabled tools with reason

## Migration Path

### Phase 1: Registry Setup (Current)
- Create tool types and registry
- Implement context provider
- Document architecture

### Phase 2: Toolbar Integration
- Create ContentToolbar component
- Wire to tool registry
- Add to all content headers
- Verify deterministic ordering

### Phase 3: Toolbelt Integration
- Wire BubbleMenu to tool registry
- Keep TipTap component intact
- Add TipTap tools to registry

### Phase 4: Panel Integration
- Update RightSidebar to use registry
- Dynamic tab visibility
- Preserve existing tabs (backlinks, outline, tags)

### Phase 5: Future Enhancements
- Command palette (Cmd+K) as menu surface
- Additional toolbar tools (print, export formats)
- AI-powered tool suggestions
- Plugin system for third-party tools

## References

- **conductor-one:** `/Users/davidvalentine/Documents/fidget.ai/conductor-one/`
  - `docs/project-scope.md` - Core principles and tool surface glossary
  - `components/studio/tools/registry.tsx` - Reference implementation
  - `components/studio/tools/ToolContext.tsx` - Context shape
- **Digital Garden:** Current implementation
  - `components/content/RightSidebar.tsx` - Existing panel implementation
  - `components/content/editor/BubbleMenu.tsx` - Existing toolbelt implementation
  - `lib/domain/editor/extensions-client.ts` - TipTap extensions
