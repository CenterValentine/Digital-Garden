# M6: Search & Backlinks - Implementation Guide

**Milestone:** M6 - Full-Text Search, Backlinks, and Outline Panel
**Architecture:** Server Components + Client Search UI
**Version:** 2.0
**Last Updated:** January 14, 2026

## Overview

M6 implements the right sidebar features that make the Digital Garden a powerful knowledge management tool:

1. **Full-Text Search** - Fast search across all notes with highlighting
2. **Backlinks Panel** - See which notes link to the current note
3. **Outline Panel** - Table of contents for the current note
4. **Tags System** - Tag management and filtering

---

## Architecture Overview

### Database Foundation (Already Complete)

From M1, we already have:
- `ContentNode.searchText` - Full-text search field (indexed)
- Prisma full-text search capabilities
- `ContentNode.metadata` - Can store extracted links

### API Endpoints Needed (3 new endpoints)

```
Search:
  GET /api/content/search?q=query&type=note&limit=20

Backlinks:
  GET /api/content/backlinks/[id]  # Notes linking to this ID

Outline:
  GET /api/content/outline/[id]    # Extract headings from TipTap JSON
```

### Component Architecture

```
RightSidebar (Server Component)
├── RightSidebarHeader (Server Component) ✅ Already exists
├── Suspense Boundary
│   └── RightSidebarContent (Client Component)
│       ├── SearchPanel (Client)
│       ├── BacklinksPanel (Client)
│       ├── OutlinePanel (Client)
│       └── TagsPanel (Client)
```

---

## Phase 0: Persist Selection on Refresh

### Problem
Currently, refreshing the page loses the selected note and returns to welcome screen.

### Solution
Store `selectedContentId` in URL query parameter and localStorage.

**File:** `stores/content-store.ts`

Add URL persistence:
```typescript
import { useRouter, useSearchParams } from 'next/navigation';

export const useContentStore = create<ContentState>((set) => ({
  selectedContentId: null,
  setSelectedContentId: (id) => {
    set({ selectedContentId: id });

    // Persist to localStorage
    if (id) {
      localStorage.setItem('lastSelectedContentId', id);
    }

    // Update URL query param
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set('note', id);
    } else {
      url.searchParams.delete('note');
    }
    window.history.replaceState({}, '', url);
  },
  clearSelection: () => set({ selectedContentId: null }),
}));
```

**File:** `components/content/content/MainPanelContent.tsx`

Restore selection on mount:
```typescript
useEffect(() => {
  // Check URL first
  const params = new URLSearchParams(window.location.search);
  const noteId = params.get('note');

  if (noteId) {
    setSelectedContentId(noteId);
    return;
  }

  // Fallback to localStorage
  const lastNoteId = localStorage.getItem('lastSelectedContentId');
  if (lastNoteId) {
    setSelectedContentId(lastNoteId);
  }
}, []);
```

**Benefits:**
- Shareable URLs (`/notes?note=cm123abc`)
- Refresh preserves state
- Browser back/forward works

---

## Phase 1: Search Panel

### 1.1 Search API Route

**File:** `app/api/content/search/route.ts`

**Request Query Parameters:**
```typescript
interface SearchParams {
  q: string;           // Search query
  type?: string;       // Filter by contentType (note, folder, html, code)
  limit?: number;      // Results limit (default 20)
  offset?: number;     // Pagination offset (default 0)
}
```

**Response:**
```typescript
interface SearchResult {
  id: string;
  title: string;
  slug: string;
  contentType: string;
  excerpt: string;      // Context snippet with query
  matchCount: number;   // Number of matches
  lastModified: Date;
}

interface SearchResponse {
  success: true;
  data: {
    results: SearchResult[];
    total: number;
    query: string;
  };
}
```

**Implementation Strategy:**

1. **PostgreSQL Full-Text Search:**
   ```typescript
   const results = await prisma.contentNode.findMany({
     where: {
       userId,
       deletedAt: null,
       searchText: {
         search: query,  // Prisma full-text search
       },
       contentType: type || undefined,
     },
     select: {
       id: true,
       title: true,
       slug: true,
       contentType: true,
       searchText: true,
       updatedAt: true,
     },
     take: limit,
     skip: offset,
   });
   ```

2. **Generate Excerpts:**
   - Find first occurrence of query in `searchText`
   - Extract 50 characters before and after
   - Highlight query match

3. **Rank Results:**
   - Prisma handles relevance ranking automatically
   - Can add manual boost for title matches

### 1.2 Search Panel Component

**File:** `components/content/search/SearchPanel.tsx`

**Features:**
- Search input with debouncing (300ms)
- Results list with highlighting
- Type filter chips (All, Notes, Folders, HTML, Code)
- Click to open note
- Keyboard navigation (↑/↓, Enter)
- Loading state
- Empty state

**UI Design:**
```
┌─────────────────────────────────┐
│ 🔍 Search...                    │
├─────────────────────────────────┤
│ [All] [Notes] [Folders] [Code]  │
├─────────────────────────────────┤
│ 📄 Introduction to React        │
│    ...useState hook allows...   │
│    3 matches · 2 hours ago      │
├─────────────────────────────────┤
│ 📄 Advanced Hooks               │
│    ...React hooks like use...   │
│    1 match · 1 day ago          │
└─────────────────────────────────┘
```

**State Management:**
```typescript
interface SearchState {
  query: string;
  type: string | null;
  results: SearchResult[];
  isLoading: boolean;
  total: number;
}
```

---

## Phase 2: Backlinks Panel

### 2.1 Link Extraction System

**Challenge:** TipTap stores content as JSON, we need to extract internal links.

**Strategy:** Extract links during save and store in metadata.

**File:** `lib/content/link-extractor.ts`

```typescript
interface ExtractedLink {
  targetId: string;    // ID of linked note
  text: string;        // Link text
  position: number;    // Character position in document
}

/**
 * Extract internal links from TipTap JSON
 *
 * Looks for link marks with hrefs matching:
 * - /notes/[slug]
 * - internal:[id]
 */
export function extractLinks(tiptapJson: JSONContent): ExtractedLink[];
```

**Update Save Logic:**

Modify `app/api/content/content/[id]/route.ts` PATCH handler:

```typescript
// Extract links from TipTap JSON
const links = extractLinks(tiptapJson);

// Store in metadata
await prisma.notePayload.update({
  where: { contentNodeId: id },
  data: {
    tiptapJson,
    metadata: {
      ...existingMetadata,
      links: links.map(l => ({ targetId: l.targetId, text: l.text })),
    },
  },
});
```

### 2.2 Backlinks API Route

**File:** `app/api/content/backlinks/[id]/route.ts`

**Logic:**
1. Find all notes where `metadata.links` contains `targetId: [id]`
2. For each linking note, extract context around the link
3. Return linking notes with context

**Response:**
```typescript
interface Backlink {
  id: string;
  title: string;
  slug: string;
  context: string;      // Text around the link
  linkText: string;     // The actual link text
  lastModified: Date;
}

interface BacklinksResponse {
  success: true;
  data: {
    backlinks: Backlink[];
    total: number;
  };
}
```

### 2.3 Backlinks Panel Component

**File:** `components/content/backlinks/BacklinksPanel.tsx`

**UI Design:**
```
┌─────────────────────────────────┐
│ 🔗 Backlinks (3)                │
├─────────────────────────────────┤
│ 📄 Getting Started              │
│    See also [[Introduction]]    │
│    Updated 1 hour ago           │
├─────────────────────────────────┤
│ 📄 Advanced Topics              │
│    Building on [[Introduction]] │
│    Updated 2 days ago           │
└─────────────────────────────────┘
```

**Features:**
- Auto-updates when note changes
- Click to navigate
- Shows link context
- Empty state: "No backlinks yet"

---

## Phase 3: Outline Panel

### 3.1 Heading Extraction

**File:** `lib/content/outline-extractor.ts`

```typescript
interface OutlineHeading {
  id: string;          // Auto-generated anchor ID
  level: number;       // 1-6 (H1-H6)
  text: string;        // Heading text
  position: number;    // Document position
}

/**
 * Extract headings from TipTap JSON
 * Generates anchor IDs for navigation
 */
export function extractOutline(tiptapJson: JSONContent): OutlineHeading[];
```

**Algorithm:**
1. Recursively walk TipTap JSON tree
2. Find all nodes with `type: "heading"`
3. Extract level and text content
4. Generate anchor ID from text (slugify)
5. Return sorted by position

### 3.2 Outline API Route

**File:** `app/api/content/outline/[id]/route.ts`

**Simple Implementation:**
1. Fetch note's `tiptapJson`
2. Extract outline using `extractOutline()`
3. Return outline

**Response:**
```typescript
interface OutlineResponse {
  success: true;
  data: {
    outline: OutlineHeading[];
  };
}
```

### 3.3 Outline Panel Component

**File:** `components/content/outline/OutlinePanel.tsx`

**UI Design:**
```
┌─────────────────────────────────┐
│ 📑 Outline                      │
├─────────────────────────────────┤
│ Introduction                    │
│   └ What is React?              │
│   └ Why React?                  │
│ Getting Started                 │
│   └ Installation                │
│   └ First Component             │
│ Advanced Topics                 │
└─────────────────────────────────┘
```

**Features:**
- Indentation shows heading hierarchy
- Click heading to scroll editor
- Highlight current section (active heading)
- Auto-collapse/expand sections
- Empty state: "No headings yet"

**Scroll-to-Heading:**
```typescript
const scrollToHeading = (headingId: string) => {
  // Use TipTap editor commands to scroll
  editor?.commands.focus(headingId);
};
```

---

## Phase 4: Tags System

### 4.1 Tag Extraction

**Strategy:** Extract tags from note content and store separately.

**Tag Formats Supported:**
- `#tag` - Inline hashtags
- `[[#tag]]` - Wiki-style tags
- Frontmatter: `tags: [react, hooks]`

**File:** `lib/content/tag-extractor.ts`

```typescript
export function extractTags(tiptapJson: JSONContent): string[];
```

### 4.2 Tags Database Schema

**Already exists in M1!** Using `ContentNode.metadata`:

```typescript
metadata: {
  tags: string[];  // ["react", "hooks", "tutorial"]
}
```

**Alternative:** Create dedicated `Tag` table for better querying:

```prisma
model Tag {
  id        String   @id @default(cuid())
  name      String   @unique
  nodes     ContentNode[]
  createdAt DateTime @default(now())
}

// Add to ContentNode:
model ContentNode {
  tags Tag[]
}
```

### 4.3 Tag Panel Component

**File:** `components/content/tags/TagsPanel.tsx`

**UI Design:**
```
┌─────────────────────────────────┐
│ 🏷️  Tags                        │
├─────────────────────────────────┤
│ + Add tag...                    │
├─────────────────────────────────┤
│ react        (12 notes) ✕       │
│ hooks        (8 notes)  ✕       │
│ typescript   (5 notes)  ✕       │
│ tutorial     (3 notes)  ✕       │
└─────────────────────────────────┘
```

**Features:**
- Add/remove tags with autocomplete
- Click tag to filter notes
- Show note count per tag
- Tag colors (optional)

---

## Phase 5: Right Sidebar Integration

### 5.1 Tab Navigation

**File:** `components/content/RightSidebar.tsx`

Add tab state to switch between panels:

```typescript
type RightSidebarTab = "search" | "backlinks" | "outline" | "tags";

const [activeTab, setActiveTab] = useState<RightSidebarTab>("outline");
```

**Header with Tabs:**
```
┌─────────────────────────────────┐
│ [🔍] [🔗] [📑] [🏷️]    [⋯]     │
├─────────────────────────────────┤
│                                 │
│   (Active Panel Content)        │
│                                 │
└─────────────────────────────────┘
```

### 5.2 Keyboard Shortcuts

**Global Shortcuts:**
- `Cmd+K` - Focus search
- `Cmd+Shift+B` - Toggle backlinks
- `Cmd+Shift+O` - Toggle outline
- `Cmd+Shift+T` - Toggle tags

---

## Implementation Order

### Week 1: Search Foundation
1. ✅ Create search API route
2. ✅ Build SearchPanel component
3. ✅ Add debounced search input
4. ✅ Implement result highlighting
5. ✅ Test search functionality

### Week 2: Backlinks & Outline
6. ✅ Create link extraction utility
7. ✅ Update save logic to extract links
8. ✅ Build backlinks API route
9. ✅ Create BacklinksPanel component
10. ✅ Build outline extraction utility
11. ✅ Create outline API route
12. ✅ Build OutlinePanel component

### Week 3: Tags & Integration
13. ✅ Create tag extraction utility
14. ✅ Update save logic for tags
15. ✅ Build TagsPanel component
16. ✅ Integrate all panels into RightSidebar
17. ✅ Add tab navigation
18. ✅ Implement keyboard shortcuts
19. ✅ Testing and polish

---

## Success Criteria

- [ ] Search finds notes by content
- [ ] Search results show relevant excerpts
- [ ] Backlinks show notes linking to current note
- [ ] Backlinks update when links are added/removed
- [ ] Outline shows heading hierarchy
- [ ] Clicking outline scrolls to heading
- [ ] Tags can be added/removed
- [ ] Tags filter works
- [ ] All panels accessible via tabs
- [ ] Keyboard shortcuts working
- [ ] No performance issues with 100+ notes

---

## Technical Considerations

### Performance

**Search:**
- PostgreSQL full-text search is fast (< 50ms for 1000s of notes)
- Debounce input to reduce API calls
- Cache recent searches

**Backlinks:**
- Requires scanning all notes' metadata
- Index `metadata.links` for faster queries
- Consider caching backlinks per note

**Outline:**
- Extract on-demand (not stored)
- Fast extraction from TipTap JSON
- Minimal API overhead

### Security

**Search:**
- Only return notes for current user
- Respect `deletedAt` filter
- Sanitize search query (prevent injection)

**Backlinks:**
- Verify user owns both linking and linked notes
- Don't expose private notes in backlinks

### Edge Cases

**Search:**
- Empty query → return recent notes
- No results → helpful empty state
- Special characters in query → escape properly

**Backlinks:**
- Note with no backlinks → empty state
- Self-links (note links to itself) → filter out
- Circular links → handle gracefully

**Outline:**
- Note with no headings → empty state
- Duplicate heading text → ensure unique IDs
- Very long headings → truncate in UI

---

## Optional Enhancements (Post-M6)

### Advanced Search
- Filter by date range
- Filter by tags
- Search within specific folder
- Regex search mode

### Smart Backlinks
- "Unlinked mentions" - find notes mentioning title but not linked
- Visual graph of connections
- Backlink strength (number of links)

### Outline Features
- Collapsible sections
- Outline editing (reorder headings)
- Export outline to markdown
- Mini-map view

### Tag Features
- Hierarchical tags (`#coding/react/hooks`)
- Tag synonyms
- Tag colors
- Tag cloud visualization

---

## Files to Create

**API Routes (3):**
1. `app/api/content/search/route.ts`
2. `app/api/content/backlinks/[id]/route.ts`
3. `app/api/content/outline/[id]/route.ts`

**Utilities (3):**
1. `lib/content/link-extractor.ts`
2. `lib/content/outline-extractor.ts`
3. `lib/content/tag-extractor.ts`

**Components (5):**
1. `components/content/search/SearchPanel.tsx`
2. `components/content/search/SearchResult.tsx`
3. `components/content/backlinks/BacklinksPanel.tsx`
4. `components/content/outline/OutlinePanel.tsx`
5. `components/content/tags/TagsPanel.tsx`

**Modified Files (2):**
1. `components/content/RightSidebar.tsx` - Add tab navigation
2. `app/api/content/content/[id]/route.ts` - Extract links/tags on save

**Total:** 8 new files, 2 modified files

---

## Dependencies

**No new dependencies needed!** Everything can be built with existing stack:
- Prisma for full-text search
- TipTap JSON traversal for extraction
- Zustand for panel state (if needed)

---

## Testing Plan

Create `M6-SEARCH-TEST-PLAN.md` with tests for:

1. Search with various queries
2. Search filtering by type
3. Backlinks detection
4. Backlinks context extraction
5. Outline extraction accuracy
6. Outline navigation
7. Tag extraction
8. Tag filtering
9. Keyboard shortcuts
10. Performance with large notes

---

## Design Decisions (Confirmed)

### ✅ Link Syntax
- **Internal links:** `[[note-slug]]` - Wiki-style (Obsidian-like)
  - Auto-complete note titles as you type
  - Click to navigate in-app
  - Syntax highlighting in editor
- **External links:** `[text](url)` - Standard markdown
  - Opens in new tab on click
  - Standard TipTap Link extension

### ✅ Tag Storage
- **Dedicated Tag table** - Better querying and autocomplete
- Per-user tags (scoped by userId)
- Many-to-many relationship with ContentNode

### ✅ Outline Updates
- **Real-time** - Updates as you type
- Uses TipTap `onUpdate` hook to re-extract headings
- Debounced for performance (500ms)

### ✅ Selection Persistence
- Store in URL query param + localStorage
- Enables shareable URLs
- Survives page refresh

---

## Recommended TipTap Extensions for M6

Beyond the base features, here are high-value TipTap extensions to consider:

### 🔥 Highly Recommended (Add to M6)

#### 1. **Link Extension with Auto-complete**
- Package: `@tiptap/extension-link`
- **Features:**
  - Paste URLs to auto-create links
  - Edit link dialog (Cmd+K)
  - External link detection
  - Target="_blank" for external links
- **Wiki Link Custom Extension:**
  - Detect `[[` trigger
  - Show autocomplete dropdown of note titles
  - Convert to internal link on selection
  - Syntax: `[[note-slug|Display Text]]`

#### 2. **Placeholder Extension**
- Package: `@tiptap/extension-placeholder`
- **Features:**
  - "Start typing..." placeholder text
  - Different placeholders per node type
  - Improves empty document UX
- **Example:**
  ```typescript
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'heading') {
        return 'Heading...';
      }
      return 'Start writing...';
    },
  })
  ```

#### 3. **Task List Extension**
- Package: `@tiptap/extension-task-list` + `@tiptap/extension-task-item`
- **Features:**
  - `[ ]` → Checkbox (unchecked)
  - `[x]` → Checkbox (checked)
  - Click to toggle
  - Keyboard shortcuts
- **Why it's great:** Essential for PKM/note-taking apps like Obsidian

#### 4. **Table Extension**
- Package: `@tiptap/extension-table` + `@tiptap/extension-table-row` + `@tiptap/extension-table-cell`
- **Features:**
  - Create/edit tables
  - Add/remove rows/columns
  - Merge cells
  - Table navigation (Tab)
- **Why it's great:** Critical for structured data, comparisons, planning

#### 5. **Mention Extension (for @mentions)**
- Package: `@tiptap/extension-mention`
- **Features:**
  - Type `@` to trigger autocomplete
  - Mention users or notes
  - Customizable suggestion list
- **Use cases:**
  - `@person` - Mention collaborators
  - `@note` - Link to other notes (alternative to `[[]]`)

### 💡 Nice to Have (Consider for M7+)

#### 6. **Collaboration Extensions**
- Package: `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-cursor`
- **Features:**
  - Real-time collaborative editing (like Google Docs)
  - Show other users' cursors
  - Conflict resolution
- **Requirements:** Y.js or Hocuspocus server
- **Why later:** Complex setup, requires backend changes

#### 7. **Image Extension**
- Package: `@tiptap/extension-image`
- **Features:**
  - Drag-and-drop image upload
  - Paste images from clipboard
  - Resize images
  - Alt text
- **Note:** You mentioned image upload is M7, so this fits there

#### 8. **Typography Extension**
- Package: `@tiptap/extension-typography`
- **Features:**
  - Smart quotes (`"` → `"..."`)
  - Em dashes (`--` → `—`)
  - Ellipsis (`...` → `…`)
  - Copyright symbols (`(c)` → `©`)
- **Why nice:** Professional-looking text

#### 9. **Text Align Extension**
- Package: `@tiptap/extension-text-align`
- **Features:**
  - Left/center/right/justify alignment
  - Toolbar buttons
- **Why later:** Not essential for PKM, adds complexity

#### 10. **Focus Extension**
- Package: `@tiptap/extension-focus`
- **Features:**
  - Highlight current paragraph/block
  - Typewriter mode (keeps cursor centered)
  - Distraction-free writing
- **Why nice:** Great UX for writing, but optional

### 🎯 Novel-Specific Features (Inspired by novel.sh)

Novel.sh is built on TipTap and has excellent features we can adopt:

#### 11. **Slash Commands**
- **Package:** Custom implementation using `@tiptap/suggestion`
- **Features:**
  - Type `/` to show command menu
  - `/h1` → Heading 1
  - `/code` → Code block
  - `/table` → Insert table
  - `/image` → Upload image
- **Example from Novel:**
  ```
  / → [H1] [H2] [H3] [Code] [Quote] [List] [Table]
  ```

#### 12. **Bubble Menu**
- **Package:** `@tiptap/extension-bubble-menu`
- **Features:**
  - Floating toolbar on text selection
  - Bold, italic, link, highlight buttons
  - Appears contextually
- **Novel uses this heavily** - very polished UX

#### 13. **Floating Menu**
- **Package:** `@tiptap/extension-floating-menu`
- **Features:**
  - Appears on empty lines
  - Shows `/` slash command trigger
  - "Click or type / for commands"

#### 14. **Color & Highlight**
- **Package:** `@tiptap/extension-color` + `@tiptap/extension-highlight`
- **Features:**
  - Text color picker
  - Background highlight colors
  - Useful for annotations
- **Novel example:**
  - Yellow highlight for important
  - Red text for warnings

#### 15. **Character Count**
- **Package:** `@tiptap/extension-character-count`
- **Features:**
  - Word count
  - Character count
  - Reading time estimate
- **Display in:** Status bar (bottom of editor)

### 📦 Recommended Package Additions for M6

Based on decisions, install these:

```bash
pnpm add @tiptap/extension-link \
         @tiptap/extension-placeholder \
         @tiptap/extension-task-list \
         @tiptap/extension-task-item \
         @tiptap/extension-table \
         @tiptap/extension-table-row \
         @tiptap/extension-table-cell \
         @tiptap/extension-table-header \
         @tiptap/extension-mention \
         @tiptap/suggestion
```

### 🎨 Custom Extensions to Build

#### Wiki Link Extension
```typescript
// lib/editor/extensions/wiki-link.ts
import { Node, mergeAttributes } from '@tiptap/core';

export const WikiLink = Node.create({
  name: 'wikiLink',

  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      slug: { default: null },
      label: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-wiki-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, {
      'data-wiki-link': '',
      'href': `/notes/${node.attrs.slug}`,
      'class': 'wiki-link',
    }), node.attrs.label || node.attrs.slug];
  },

  addInputRules() {
    return [
      // Convert [[slug|label]] or [[slug]]
      {
        find: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        handler: ({ match, chain }) => {
          const slug = match[1];
          const label = match[2] || slug;
          chain().insertContent({
            type: this.name,
            attrs: { slug, label },
          }).run();
        },
      },
    ];
  },
});
```

---

## Priority for M6 Implementation

### Must-Have (Core M6):
1. ✅ Selection persistence (Phase 0)
2. ✅ Search panel
3. ✅ Backlinks panel
4. ✅ Outline panel (real-time)
5. ✅ Tags table + panel
6. ✅ Wiki links (`[[]]`)
7. ✅ External links (clickable)

### Should-Have (Polish):
8. ⭐ Placeholder extension
9. ⭐ Task lists (`[ ]` / `[x]`)
10. ⭐ Link dialog (Cmd+K)
11. ⭐ Character count (status bar)

### Nice-to-Have (Optional):
12. 💡 Table support
13. 💡 Slash commands (`/`)
14. 💡 Bubble menu (selection toolbar)
15. 💡 @mentions
16. 💡 Typography (smart quotes)

---

## Ready to Begin?

Review this guide and let me know:
1. Which phase to start with (recommend: Phase 1 - Search)
2. Answers to the questions above
3. Any modifications to the plan

Once approved, I'll begin implementing M6! 🚀
