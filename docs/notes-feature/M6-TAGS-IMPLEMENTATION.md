# M6: Tags System - Complete Implementation Guide

**Milestone:** M6 (Final 5% - Tags completion)
**Status:** Ready to Implement
**Last Updated:** January 20, 2026
**Dependencies:** M6 Search, Backlinks, Outline, Wiki-links (all complete)

---

## Executive Summary

This document provides complete specifications for implementing the tags system to finalize M6. The tags system enables users to categorize and filter content using `#tag` syntax with autocomplete, visual tag management, and search integration.

**Key Features:**
1. **Tag Extraction:** Extract `#tag` from content with real-time updates
2. **Tag Autocomplete:** Suggestion menu similar to wiki-links `[[]]` (and slash commands `/`)
3. **Tag Panel:** Display tags in right sidebar with pills, counts, and filtering
4. **Search Integration:** Tag-only filter in left sidebar search
5. **Slash Command Integration:** `/tag` command to create tags
6. **Visual Design:** Pill-style tags with colors and click-to-filter

---

## Architecture Overview

### Database Schema (Already Complete)

The tag database schema is already implemented in `prisma/schema.prisma`:

```prisma
model Tag {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String       @unique @db.VarChar(50)
  slug          String       @unique @db.VarChar(50)
  createdAt     DateTime     @default(now()) @db.Timestamptz()

  contentTags   ContentTag[]

  @@index([name])
}

model ContentTag {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId   String      @db.Uuid
  tagId       String      @db.Uuid
  createdAt   DateTime    @default(now()) @db.Timestamptz()

  content     ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  tag         Tag         @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([contentId, tagId])
  @@index([tagId])
}

// ContentNode.contentTags field:
model ContentNode {
  // ... other fields
  contentTags   ContentTag[]
}
```

**Key Design Decisions:**

1. **Normalized Tag Table**
   - Tags are deduplicated across all content
   - Global tag namespace (no user-specific tags)
   - Slug for URL-safe tag identifiers
   - Unique constraint on name prevents duplicates

2. **Junction Table (ContentTag)**
   - Many-to-many relationship between content and tags
   - Cascade delete: removing content removes tag associations
   - Cascade delete: removing tag removes all associations
   - Created timestamp for tag application history

3. **Indexes for Performance**
   - `Tag.name` indexed for autocomplete queries
   - `ContentTag.tagId` indexed for "find all content with tag X"
   - `ContentTag.[contentId, tagId]` unique constraint prevents duplicate associations

**Database Query Patterns:**

```typescript
// Get all tags for a content node
const tagsForContent = await prisma.contentTag.findMany({
  where: { contentId: noteId },
  include: { tag: true }
});

// Get all content with a specific tag
const contentWithTag = await prisma.contentTag.findMany({
  where: { tag: { slug: "typescript" } },
  include: { content: true }
});

// Get tag usage counts
const tagCounts = await prisma.contentTag.groupBy({
  by: ['tagId'],
  _count: { tagId: true }
});

// Search tags by name prefix (for autocomplete)
const matchingTags = await prisma.tag.findMany({
  where: {
    name: { startsWith: query, mode: 'insensitive' }
  },
  take: 10
});
```

---

## Tag Extraction System

### 1. Tag Syntax Specification

**Supported Syntax:** `#tag`

**Rules:**
- Must start with `#` character
- Followed by alphanumeric characters, hyphens, underscores
- Initial followed by does not start with hyphen or underscore
- Case-insensitive (e.g., `#TypeScript` → `typescript`)
- No spaces (use hyphens: `#web-dev` not `#web dev`)
- New line or space required before `#` (e.g., `This is #tag` valid, `bob#tag` invalid).

- Compatability with markdown # headings, unordered list, and ordered list syntax:
  - Space immediately after `#` (e.g., `# web-dev` is a header)
  - List items starting with `- #tag` or `1. #tag` are valid tags.
  - Tags can appear anywhere in the document body except headings.
  - Tags in code blocks are **EXCLUDED** from extraction (prevent false positives)
  - Double `##` is NOT a tag (used for markdown headings)

- Extract from both TipTap JSON text content and heading content
- Minimum length: 2 characters (prevents `#` alone)
- Maximum length: 50 characters (database constraint)
- Autocomplete:
  - Starts after typing `#` and at least 1 (non-space) character
  - Pressing space confirms the tag but leaves a space after it
  - Pressing Enter confirms the tag without adding space and without moving to new line.

**Valid Examples:**
- `#react`
- `#web-development`
- `#TypeScript` (stored as `typescript`)
- `#2024` (numbers allowed)
- `#coding_tips`

**Invalid Examples:**
- `#` (too short)
- `# ` (used for heading, not a tag)
- '# Heading #tag-on-this-line' (tag after heading text)
- 'bob#tag' (no inline characters in the character preceeding #, new line or space required)
- 
- `#web dev` (spaces not allowed)
- `#this-is-a-very-long-tag-that-exceeds-the-maximum-length-limit` (> 50 chars)

**Edge Cases:**
- Multiple tags: `#react #typescript #webdev` → extracts all three
- Duplicate tags in same document: `#react ... #react` → only stored once
- Tags in code blocks: **EXCLUDED** from extraction (prevent false positives)
- Tags in links: `[#issue-123](url)` → **EXCLUDED**  or  `[[#issue-123]]` → **EXCLUDED** (not a tag, part of markdown or wiki link)

---

### 2. Tag Extraction Utility

**File:** `lib/content/tag-extractor.ts`

```typescript
import type { JSONContent } from "@tiptap/core";

/**
 * Extracted tag information
 */
export interface ExtractedTag {
  name: string;      // Original tag name (e.g., "TypeScript")
  slug: string;      // Slugified for storage (e.g., "typescript")
  position: number;  // Character position in document (for potential highlighting)
}

/**
 * Extract tags from TipTap JSON content
 *
 * Searches for #tag patterns in text nodes, excluding code blocks.
 * Returns deduplicated tags with normalized slugs.
 *
 * @param tiptapJson - TipTap document JSON
 * @returns Array of extracted tags (deduplicated)
 */
export function extractTags(tiptapJson: JSONContent): ExtractedTag[] {
  const tags = new Map<string, ExtractedTag>(); // Use Map for deduplication by slug
  let position = 0;

  /**
   * Recursively walk TipTap JSON tree
   */
  function walkNode(node: JSONContent, inCodeBlock = false, inHeading = false) {
    // Skip code blocks entirely (```code```)
    if (node.type === "codeBlock") {
      return;
    }

    // Mark if we're in a heading (tags not allowed in headings)
    if (node.type === "heading") {
      inHeading = true;
    }

    // Check if text node has inline code mark (`code`)
    const hasCodeMark = node.marks?.some((mark) => mark.type === "code") || false;

    // Extract from text content (not in code blocks, inline code, or headings)
    if (node.type === "text" && node.text && !inCodeBlock && !inHeading && !hasCodeMark) {
      // Updated regex enforces:
      // - Space/newline before # (prevents bob#tag)
      // - First char after # must be alphanumeric (prevents #-tag, #_tag)
      // - 2-50 total characters
      const matches = node.text.matchAll(/(?:^|[\s\n])#([a-zA-Z0-9][a-zA-Z0-9_-]{1,49})\b/g);

      for (const match of matches) {
        const name = match[1];
        const slug = slugifyTag(name);

        // Deduplicate by slug (case-insensitive)
        if (!tags.has(slug)) {
          tags.set(slug, {
            name,
            slug,
            position: position + match.index!,
          });
        }
      }

      position += node.text.length;
    }

    // Recurse into child nodes
    if (node.content) {
      for (const child of node.content) {
        walkNode(child, inCodeBlock, inHeading);
      }
    }
  }

  walkNode(tiptapJson);

  return Array.from(tags.values());
}

/**
 * Convert tag name to URL-safe slug
 *
 * Rules:
 * - Lowercase
 * - Replace spaces with hyphens (in case user types multi-word)
 * - Remove special characters except hyphens and underscores
 * - Trim hyphens from start/end
 *
 * @param name - Original tag name
 * @returns Slugified tag
 */
export function slugifyTag(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Spaces to hyphens
    .replace(/[^a-z0-9_-]/g, '')    // Remove invalid chars
    .replace(/^-+|-+$/g, '');       // Trim hyphens
}

/**
 * Validate tag name
 *
 * @param name - Tag name to validate
 * @returns Validation error message or null if valid
 */
export function validateTag(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return "Tag name cannot be empty";
  }

  if (name.length < 2) {
    return "Tag must be at least 2 characters";
  }

  if (name.length > 50) {
    return "Tag cannot exceed 50 characters";
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return "Tag can only contain letters, numbers, hyphens, and underscores";
  }

  return null;
}
```

**Testing Requirements:**

**Basic Extraction:**
- Extract single tag: `"This is #react code"` → `["react"]`
- Extract multiple tags: `"#react #typescript"` → `["react", "typescript"]`
- Deduplicate: `"#react and #React"` → `["react"]` (case-insensitive)

**Code Block Exclusions:**
- Ignore code blocks: ` ```#notag``` ` → `[]` (codeBlock node type)
- Ignore inline code: `` `#notag` `` → `[]` (code mark on text node)
- Mixed content: `"This is #valid but not `#invalid` code"` → `["valid"]`

**Heading Exclusions:**
- No tags in headings: `"# Heading #invalid"` → `[]`
- Tags after headings OK: `"# Heading\n#valid"` → `["valid"]`

**Spacing Rules:**
- Valid: `"This is #tag"` → `["tag"]` (space before #)
- Invalid: `"bob#tag"` → `[]` (no space before #)
- Valid: `"\n#tag"` → `["tag"]` (newline before #)

**Character Rules:**
- Invalid: `"#-tag"` → `[]` (first char must be alphanumeric)
- Invalid: `"#_tag"` → `[]` (first char must be alphanumeric)
- Valid: `"#tag-name"` → `["tag-name"]` (hyphen allowed after first char)
- Valid: `"#tag_name"` → `["tag_name"]` (underscore allowed after first char)

**Edge Cases:**
- Too short: `"#"` → `[]`
- Too short: `"#a"` → `[]` (minimum 2 chars)
- Valid: `"#ab"` → `["ab"]` (exactly 2 chars)
- Valid: `"#web-dev-2024"` → `["web-dev-2024"]`
- Too long: `"#this-is-a-very-long-tag-exceeding-fifty-characters-limit"` → `[]`

**List Items:**
- Unordered list: `"- #todo"` → `["todo"]`
- Ordered list: `"1. #important"` → `["important"]`

---

## Tag Autocomplete System

### Design Pattern

Follow the **exact same pattern** as wiki-links (`[[`) and slash commands (`/`):
1. Trigger character: `#`
2. Suggestion popup using `@tiptap/suggestion`
3. Keyboard navigation (↑/↓, Enter, Esc)
4. Debounced API query for tag suggestions
5. React component rendered via Tippy.js

### 1. Tag Suggestion Extension

**File:** `lib/editor/tag-suggestion.tsx`

```typescript
/**
 * Tag Autocomplete Suggestion
 *
 * Shows popup menu when typing # to select or create tags
 * Pattern: Same as wiki-link-suggestion.tsx
 *
 * M6: Tags System - Autocomplete
 */

import { ReactRenderer } from "@tiptap/react";
import { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export interface TagSuggestionItem {
  id: string;
  name: string;
  slug: string;
  count: number; // Number of notes using this tag
  isNew?: boolean; // Flag for "Create new tag: X" option
}

interface TagListProps {
  items: TagSuggestionItem[];
  command: (item: TagSuggestionItem) => void;
  query: string; // For "Create new tag: X" display
}

export const TagList = forwardRef((props: TagListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }

      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }

      if (event.key === "Enter") {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-gray-900/95 p-3 shadow-xl backdrop-blur-sm">
        <div className="text-sm text-gray-400">
          {props.query.trim() ? `Create new tag: #${props.query}` : "Start typing to search tags"}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-gray-900/95 shadow-xl backdrop-blur-sm overflow-hidden">
      <div className="max-h-60 overflow-y-auto p-1">
        {props.items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={`w-full rounded px-3 py-2 text-left text-sm transition-colors flex items-center justify-between ${
              index === selectedIndex
                ? "bg-primary/20 text-primary"
                : "text-gray-300 hover:bg-white/5"
            }`}
          >
            <span className="flex items-center gap-2">
              {item.isNew && <span className="text-xs text-gray-500">Create:</span>}
              <span className="font-medium">#{item.name}</span>
            </span>
            {!item.isNew && <span className="text-xs text-gray-500">{item.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
});

TagList.displayName = "TagList";

/**
 * Create tag suggestion configuration
 *
 * @param fetchTags - Function to fetch tag suggestions from API
 * @returns Suggestion configuration for TipTap
 */
export function createTagSuggestion(
  fetchTags: (query: string) => Promise<TagSuggestionItem[]>
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "#",

    allowSpaces: false, // Tags cannot have spaces

    items: async ({ query }) => {
      // Fetch existing tags matching query
      const tags = await fetchTags(query);

      // If query doesn't match any existing tag exactly, offer "Create new tag"
      if (query.trim() && !tags.some(t => t.slug === query.toLowerCase())) {
        tags.unshift({
          id: `new-${query}`,
          name: query,
          slug: query.toLowerCase(),
          count: 0,
          isNew: true,
        });
      }

      return tags;
    },

    render: () => {
      let component: ReactRenderer;
      let popup: TippyInstance[];

      return {
        onStart: (props) => {
          component = new ReactRenderer(TagList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as any,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props) {
          component.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as any,
          });
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup[0].hide();
            return true;
          }

          return component.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          if (popup && popup[0]) {
            popup[0].destroy();
          }
          if (component) {
            component.destroy();
          }
        },
      };
    },

    command: ({ editor, range, props }) => {
      const item = props as TagSuggestionItem;

      // Delete the # trigger and typed text
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent(`#${item.name} `)
        .run();

      // TODO: Optionally trigger tag extraction here or wait for auto-save
    },
  };
}
```

**Integration into Editor:**

Update `lib/editor/extensions.ts`:

```typescript
import { createTagSuggestion } from "./tag-suggestion";

export function getEditorExtensions(options: EditorExtensionsOptions) {
  // ... existing extensions

  // Tag autocomplete
  Suggestion.configure({
    ...createTagSuggestion(async (query) => {
      // Fetch tag suggestions from API
      const response = await fetch(`/api/notes/tags/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.tags || [];
    }),
  }),
}
```

---

## API Routes

### 1. Tag Search/Autocomplete

**Endpoint:** `GET /api/notes/tags/search`

**File:** `app/api/notes/tags/search/route.ts`

**Query Parameters:**
- `q` (string): Search query (prefix match)
- `limit` (number, optional): Max results (default 10)

**Response:**
```typescript
interface TagSearchResponse {
  success: true;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    count: number; // Number of content nodes using this tag
  }>;
}
```

**Implementation:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/generated/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q") || "";
  const limit = parseInt(searchParams.get("limit") || "10");

  try {
    // Search tags by name prefix (case-insensitive)
    const tags = await prisma.tag.findMany({
      where: {
        name: {
          startsWith: query,
          mode: "insensitive",
        },
      },
      include: {
        _count: {
          select: { contentTags: true },
        },
      },
      orderBy: [
        { name: "asc" },
      ],
      take: limit,
    });

    return NextResponse.json({
      success: true,
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        count: tag._count.contentTags,
      })),
    });
  } catch (error) {
    console.error("Tag search error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to search tags" },
      { status: 500 }
    );
  }
}
```

---

### 2. Get All Tags

**Endpoint:** `GET /api/notes/tags`

**File:** `app/api/notes/tags/route.ts`

**Query Parameters:**
- `sortBy` (string, optional): `name`, `count`, `recent` (default: `count`)
- `order` (string, optional): `asc`, `desc` (default: `desc`)

**Response:**
```typescript
interface TagsListResponse {
  success: true;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    count: number;
    createdAt: string;
  }>;
  total: number;
}
```

**Implementation:**
```typescript
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sortBy = searchParams.get("sortBy") || "count";
  const order = searchParams.get("order") || "desc";

  try {
    const tags = await prisma.tag.findMany({
      include: {
        _count: {
          select: { contentTags: true },
        },
      },
      orderBy:
        sortBy === "name"
          ? { name: order as any }
          : sortBy === "recent"
          ? { createdAt: order as any }
          : undefined,
    });

    // Sort by count if requested (requires post-query sorting)
    let sortedTags = tags;
    if (sortBy === "count") {
      sortedTags = tags.sort((a, b) =>
        order === "asc"
          ? a._count.contentTags - b._count.contentTags
          : b._count.contentTags - a._count.contentTags
      );
    }

    return NextResponse.json({
      success: true,
      tags: sortedTags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        count: tag._count.contentTags,
        createdAt: tag.createdAt.toISOString(),
      })),
      total: tags.length,
    });
  } catch (error) {
    console.error("Failed to fetch tags:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}
```

---

### 3. Get Tags for Content

**Endpoint:** `GET /api/notes/content/[id]/tags`

**File:** `app/api/notes/content/[id]/tags/route.ts`

**Response:**
```typescript
interface ContentTagsResponse {
  success: true;
  contentId: string;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    appliedAt: string;
  }>;
}
```

**Implementation:**
```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/generated/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const contentId = params.id;

  try {
    const contentTags = await prisma.contentTag.findMany({
      where: { contentId },
      include: { tag: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      contentId,
      tags: contentTags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        slug: ct.tag.slug,
        appliedAt: ct.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch content tags:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}
```

---

### 4. Add Tag to Content

**Endpoint:** `POST /api/notes/content/[id]/tags`

**File:** `app/api/notes/content/[id]/tags/route.ts`

**Request Body:**
```typescript
{
  tagName: string; // Tag name or slug
}
```

**Response:**
```typescript
interface AddTagResponse {
  success: true;
  tag: {
    id: string;
    name: string;
    slug: string;
  };
  created: boolean; // True if tag was newly created
}
```

**Implementation:**
```typescript
import { slugifyTag, validateTag } from "@/lib/content/tag-extractor";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const contentId = params.id;
  const body = await request.json();
  const { tagName } = body;

  // Validate tag name
  const validationError = validateTag(tagName);
  if (validationError) {
    return NextResponse.json(
      { success: false, error: validationError },
      { status: 400 }
    );
  }

  const slug = slugifyTag(tagName);

  try {
    // Find or create tag
    let tag = await prisma.tag.findUnique({ where: { slug } });
    let created = false;

    if (!tag) {
      tag = await prisma.tag.create({
        data: {
          name: tagName,
          slug,
        },
      });
      created = true;
    }

    // Create ContentTag association (idempotent - unique constraint prevents duplicates)
    await prisma.contentTag.upsert({
      where: {
        contentId_tagId: {
          contentId,
          tagId: tag.id,
        },
      },
      create: {
        contentId,
        tagId: tag.id,
      },
      update: {}, // No-op if already exists
    });

    return NextResponse.json({
      success: true,
      tag: {
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
      },
      created,
    });
  } catch (error) {
    console.error("Failed to add tag:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add tag" },
      { status: 500 }
    );
  }
}
```

---

### 5. Remove Tag from Content

**Endpoint:** `DELETE /api/notes/content/[id]/tags/[tagId]`

**File:** `app/api/notes/content/[id]/tags/[tagId]/route.ts`

**Response:**
```typescript
interface RemoveTagResponse {
  success: true;
  message: string;
}
```

**Implementation:**
```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; tagId: string } }
) {
  const { id: contentId, tagId } = params;

  try {
    await prisma.contentTag.delete({
      where: {
        contentId_tagId: {
          contentId,
          tagId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Tag removed successfully",
    });
  } catch (error) {
    console.error("Failed to remove tag:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove tag" },
      { status: 500 }
    );
  }
}
```

---

### 6. Delete Tag (Admin)

**Endpoint:** `DELETE /api/notes/tags/[id]`

**File:** `app/api/notes/tags/[id]/route.ts`

**Response:**
```typescript
interface DeleteTagResponse {
  success: true;
  message: string;
  removedFrom: number; // Number of content nodes affected
}
```

**Implementation:**
```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tagId = params.id;

  try {
    // Count associations before deleting
    const count = await prisma.contentTag.count({
      where: { tagId },
    });

    // Delete tag (cascade deletes ContentTag associations)
    await prisma.tag.delete({
      where: { id: tagId },
    });

    return NextResponse.json({
      success: true,
      message: "Tag deleted successfully",
      removedFrom: count,
    });
  } catch (error) {
    console.error("Failed to delete tag:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete tag" },
      { status: 500 }
    );
  }
}
```

---

### 7. Update Content Save Logic

**File:** `app/api/notes/content/[id]/route.ts` (PATCH handler)

**Add Tag Extraction:**

```typescript
import { extractTags } from "@/lib/content/tag-extractor";

// Inside PATCH handler, after saving NotePayload
if (tiptapJson) {
  // Extract tags from content
  const extractedTags = extractTags(tiptapJson);

  // Create/associate tags
  for (const extracted of extractedTags) {
    // Find or create tag
    const tag = await prisma.tag.upsert({
      where: { slug: extracted.slug },
      create: {
        name: extracted.name,
        slug: extracted.slug,
      },
      update: {}, // No-op if exists
    });

    // Create association (idempotent)
    await prisma.contentTag.upsert({
      where: {
        contentId_tagId: {
          contentId: id,
          tagId: tag.id,
        },
      },
      create: {
        contentId: id,
        tagId: tag.id,
      },
      update: {}, // No-op if exists
    });
  }

  // Remove tags no longer in content
  const extractedSlugs = extractedTags.map(t => t.slug);
  const currentTags = await prisma.contentTag.findMany({
    where: { contentId: id },
    include: { tag: true },
  });

  for (const ct of currentTags) {
    if (!extractedSlugs.includes(ct.tag.slug)) {
      await prisma.contentTag.delete({
        where: { id: ct.id },
      });
    }
  }
}
```

---

## UI Components

### 1. Tags Panel (Right Sidebar)

**File:** `components/notes/TagsPanel.tsx`

```typescript
/**
 * TagsPanel Component
 *
 * Displays tags for the current content with pills, counts, and filtering
 *
 * Features:
 * - Display tags as colored pills
 * - Show tag usage counts
 * - Click tag to filter notes (opens search with tag filter)
 * - Remove tag from current note (X button)
 * - Add new tag (input field with autocomplete)
 * - Empty state when no tags
 *
 * M6: Tags System - UI
 */

"use client";

import { useEffect, useState } from "react";
import { useContentStore } from "@/stores/content-store";
import { useSearchStore } from "@/stores/search-store";

interface Tag {
  id: string;
  name: string;
  slug: string;
  count?: number;
  appliedAt?: string;
}

export function TagsPanel() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const { openSearch, setFilter } = useSearchStore();

  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Fetch tags for selected content
  useEffect(() => {
    if (!selectedContentId) {
      setTags([]);
      return;
    }

    fetchTags();
  }, [selectedContentId]);

  const fetchTags = async () => {
    if (!selectedContentId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/notes/content/${selectedContentId}/tags`);
      if (!response.ok) throw new Error("Failed to fetch tags");

      const data = await response.json();
      setTags(data.tags || []);
    } catch (err) {
      console.error("Tag fetch error:", err);
      setError("Failed to load tags");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!selectedContentId) return;

    try {
      const response = await fetch(`/api/notes/content/${selectedContentId}/tags/${tagId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to remove tag");

      // Remove from local state
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (err) {
      console.error("Tag remove error:", err);
      // TODO: Show toast notification
    }
  };

  const handleTagClick = (tagSlug: string) => {
    // Open search with tag filter
    setFilter({ tags: [tagSlug] });
    openSearch();
  };

  // Empty state
  if (!selectedContentId) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-gray-500">Select a note to view tags</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tag Pills */}
      <div className="flex-1 overflow-y-auto p-4">
        {tags.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-500">
              No tags yet. Type #tag in your note to add tags.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="group relative flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm transition-all hover:border-primary/30 hover:bg-primary/10"
              >
                <button
                  onClick={() => handleTagClick(tag.slug)}
                  className="flex items-center gap-1.5 font-medium text-gray-300 hover:text-primary"
                >
                  <span>#</span>
                  <span>{tag.name}</span>
                  {tag.count !== undefined && (
                    <span className="text-xs text-gray-500">({tag.count})</span>
                  )}
                </button>

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveTag(tag.id)}
                  className="ml-1 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Remove tag"
                >
                  <svg
                    className="h-3.5 w-3.5 text-gray-400 hover:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Tag Button */}
      <div className="border-t border-white/10 p-4">
        <button
          onClick={() => setIsAdding(true)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
        >
          + Add Tag
        </button>
      </div>

      {/* TODO: Add tag input modal */}
    </div>
  );
}
```

---

### 2. Update Right Sidebar

**File:** `components/notes/RightSidebar.tsx`

Add "tags" tab type:

```typescript
export type RightSidebarTab = "backlinks" | "outline" | "tags" | "chat";

export function RightSidebar() {
  const [activeTab, setActiveTab] = useState<RightSidebarTab>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved && (saved === "backlinks" || saved === "outline" || saved === "tags" || saved === "chat")) {
        return saved as RightSidebarTab;
      }
    }
    return "backlinks";
  });

  // ... rest of component
}
```

**File:** `components/notes/headers/RightSidebarHeader.tsx`

Add tags button:

```tsx
{/* Tags Tab */}
<button
  onClick={() => onTabChange("tags")}
  className={`flex flex-1 items-center justify-center px-4 py-3 transition-colors ${
    activeTab === "tags"
      ? "border-b-2 border-gold-primary text-gold-primary"
      : "text-gray-400 hover:text-gray-300"
  }`}
  title="Tags"
  type="button"
>
  <svg
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
    />
  </svg>
</button>
```

**File:** `components/notes/content/RightSidebarContent.tsx`

Add tags case:

```tsx
import { TagsPanel } from "../TagsPanel";

export function RightSidebarContent({ activeTab }: RightSidebarContentProps) {
  if (activeTab === "backlinks") {
    return <BacklinksPanel />;
  }

  if (activeTab === "outline") {
    return <OutlinePanel />;
  }

  if (activeTab === "tags") {
    return <TagsPanel />;
  }

  if (activeTab === "chat") {
    return <ChatPlaceholder />;
  }

  return null;
}
```

---

### 3. Search Panel Tag Filter

**File:** Update `components/notes/SearchPanel.tsx`

Add tag filter toggle button:

```tsx
{/* Tag Filter Toggle */}
<button
  onClick={() => setShowTagFilter(!showTagFilter)}
  className={`rounded px-2 py-1 text-xs transition-colors ${
    filter.tags && filter.tags.length > 0
      ? "bg-primary/20 text-primary"
      : "bg-white/5 text-gray-400 hover:bg-white/10"
  }`}
  title="Filter by tags"
>
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
    />
  </svg>
</button>

{/* Tag Filter Dropdown */}
{showTagFilter && (
  <TagFilterDropdown
    selectedTags={filter.tags || []}
    onTagsChange={(tags) => setFilter({ tags })}
  />
)}
```

---

### 4. Slash Command Integration

**File:** Update `lib/editor/slash-commands.tsx`

Add tag creation command:

```typescript
{
  title: "Tag",
  description: "Add a tag to this note",
  icon: "🏷️",
  command: ({ editor, range }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent("#")
      .run();

    // Trigger tag autocomplete by inserting #
    // The tag-suggestion extension will handle the rest
  },
  aliases: ["tag", "label"],
},
```

---

## Dependency Chain & Implementation Order

### Phase 1: Foundation (Utilities & API)
**No dependencies**

1. Create `lib/content/tag-extractor.ts`
   - `extractTags()`
   - `slugifyTag()`
   - `validateTag()`
   - **Test:** Unit tests for extraction logic

2. Create API route `app/api/notes/tags/search/route.ts`
   - GET handler for tag autocomplete
   - **Test:** Query existing tags by prefix

3. Create API route `app/api/notes/tags/route.ts`
   - GET handler for listing all tags
   - **Test:** Fetch all tags with counts

4. Create API route `app/api/notes/content/[id]/tags/route.ts`
   - GET handler for content tags
   - POST handler for adding tags
   - **Test:** Add/fetch tags for content

5. Create API route `app/api/notes/content/[id]/tags/[tagId]/route.ts`
   - DELETE handler for removing tags
   - **Test:** Remove tag association

6. Create API route `app/api/notes/tags/[id]/route.ts`
   - DELETE handler for deleting tags
   - **Test:** Delete tag and verify cascade

### Phase 2: Editor Integration (Autocomplete)
**Depends on:** Phase 1 (API routes)

7. Create `lib/editor/tag-suggestion.tsx`
   - `TagList` component
   - `createTagSuggestion()` function
   - **Test:** # trigger shows suggestion menu

8. Update `lib/editor/extensions.ts`
   - Add tag suggestion to editor extensions
   - **Test:** Type # in editor, verify autocomplete works

9. Update `lib/editor/slash-commands.tsx`
   - Add `/tag` command
   - **Test:** Type `/tag` and verify it inserts #

### Phase 3: Auto-Extraction on Save
**Depends on:** Phase 1 (tag-extractor)

10. Update `app/api/notes/content/[id]/route.ts`
    - Add tag extraction in PATCH handler
    - Auto-create/associate tags from content
    - Remove tags no longer in content
    - **Test:** Save note with `#react`, verify tag created

### Phase 4: UI Components
**Depends on:** Phase 1-3 (APIs, extraction)

11. Create `components/notes/TagsPanel.tsx`
    - Display tags for current content
    - Pill-style tag display
    - Remove tag functionality
    - Click to filter
    - **Test:** View tags, click to filter, remove tag

12. Update `components/notes/RightSidebar.tsx`
    - Add "tags" tab type
    - **Test:** Tab persistence

13. Update `components/notes/headers/RightSidebarHeader.tsx`
    - Add tags icon/button
    - **Test:** Click tags tab

14. Update `components/notes/content/RightSidebarContent.tsx`
    - Add tags case
    - **Test:** Tags panel renders when tab selected

### Phase 5: Search Integration
**Depends on:** Phase 4 (UI components)

15. Update `components/notes/SearchPanel.tsx`
    - Add tag filter toggle
    - Tag filter UI
    - **Test:** Filter search by tags

16. Update `lib/search/filters.ts`
    - Ensure tag filter is used in query building
    - **Test:** Search with tag filter returns correct results

---

## Testing Plan

### Unit Tests

**Tag Extraction (`tag-extractor.ts`):**
- [ ] Extract single tag: `#react`
- [ ] Extract multiple tags: `#react #typescript`
- [ ] Deduplicate: `#react #React` → one tag
- [ ] Ignore code blocks: `` `#code` `` → no tag
- [ ] Validate edge cases: `#`, `#a`, `#very-long-tag-name`

**Tag Slugification:**
- [ ] Lowercase: `TypeScript` → `typescript`
- [ ] Handle hyphens: `web-dev` → `web-dev`
- [ ] Remove spaces: `web dev` → `web-dev`

### API Tests

**GET /api/notes/tags/search:**
- [ ] Search returns matching tags
- [ ] Search is case-insensitive
- [ ] Returns tags with counts
- [ ] Limit parameter works

**POST /api/notes/content/[id]/tags:**
- [ ] Add new tag creates Tag record
- [ ] Add existing tag reuses Tag record
- [ ] Duplicate add is idempotent
- [ ] Invalid tag name returns error

**DELETE /api/notes/content/[id]/tags/[tagId]:**
- [ ] Removes association
- [ ] Does not delete Tag record
- [ ] Returns success

### Integration Tests

**Editor Autocomplete:**
- [ ] Type `#` triggers suggestion menu
- [ ] Keyboard navigation (↑/↓) works
- [ ] Enter selects tag
- [ ] Escape closes menu
- [ ] Tag inserted into editor

**Auto-Extraction on Save:**
- [ ] Save note with `#tag` creates tag
- [ ] Removing `#tag` from note removes association
- [ ] Multiple saves are idempotent

**Tags Panel:**
- [ ] Displays tags for selected content
- [ ] Click tag opens search with filter
- [ ] Remove tag button works
- [ ] Empty state shows when no tags

### End-to-End Tests

**Complete Tag Workflow:**
1. Create new note
2. Type "This is about `#react` and `#typescript`"
3. Save note
4. Verify tags appear in TagsPanel
5. Click `#react` tag
6. Verify search opens with tag filter
7. Verify search results show only react-tagged content
8. Remove `#react` from note
9. Save note
10. Verify `#react` no longer in TagsPanel

---

## UI/UX Design Specifications

### Tag Pills

**Visual Design:**
- Border: `border border-white/10`
- Background: `bg-white/5` (hover: `bg-primary/10`)
- Border on hover: `border-primary/30`
- Text: `text-gray-300` (hover: `text-primary`)
- Padding: `px-3 py-1.5`
- Border radius: `rounded-full`
- Font size: `text-sm`

**Pill Structure:**
```
[ # tagname (5) × ]
   ^    ^    ^  ^
   |    |    |  |
   |    |    |  Remove button (hover-visible)
   |    |    Tag count (gray)
   |    Tag name (primary on hover)
   Hash symbol
```

**Tag Colors (Optional Enhancement):**
- Default: White/gray
- User-defined: Allow color picker in future
- Auto-generated: Hash tag name to HSL color

### Empty States

**No Tags in Note:**
```
┌─────────────────────────────────────┐
│                                     │
│      No tags yet.                   │
│      Type #tag in your note         │
│      to add tags.                   │
│                                     │
└─────────────────────────────────────┘
```

**No Content Selected:**
```
┌─────────────────────────────────────┐
│                                     │
│      Select a note to view tags     │
│                                     │
└─────────────────────────────────────┘
```

### Tag Count Badges

**Display Rules:**
- Show count in TagsPanel when viewing all tags
- Show count in autocomplete menu
- Format: `(5)` in gray text
- Right-aligned within pill

### Click Interactions

**Tag Pill Click:**
- Opens search panel (left sidebar)
- Sets tag filter to clicked tag
- Focuses search input
- Shows filtered results immediately

**Remove Tag Click:**
- Hover to reveal ✕ button
- Click removes tag from current note only
- Optimistic UI update (remove immediately, rollback on error)
- No confirmation (low risk - can re-add)

---

## Success Criteria

### M6 Completion Checklist

**Tag Extraction:**
- [x] Database schema complete
- [ ] `tag-extractor.ts` created and tested
- [ ] Tag extraction on save working
- [ ] Auto-removal of unused tags working

**Tag Autocomplete:**
- [ ] `tag-suggestion.tsx` created
- [ ] `#` trigger shows tag menu
- [ ] Keyboard navigation works
- [ ] Tag insertion works
- [ ] "Create new tag" option works

**Tag Management:**
- [ ] TagsPanel displays current note's tags
- [ ] Pills styled correctly
- [ ] Tag counts showing
- [ ] Click tag → filter search
- [ ] Remove tag works
- [ ] Empty states correct

**Search Integration:**
- [ ] Tag filter toggle in SearchPanel
- [ ] Tag filter works in search
- [ ] Search results correct with tag filter

**Slash Commands:**
- [ ] `/tag` command inserts `#`

**API Routes:**
- [ ] GET /api/notes/tags/search
- [ ] GET /api/notes/tags
- [ ] GET /api/notes/content/[id]/tags
- [ ] POST /api/notes/content/[id]/tags
- [ ] DELETE /api/notes/content/[id]/tags/[tagId]
- [ ] DELETE /api/notes/tags/[id]

**Right Sidebar:**
- [ ] Tags tab added
- [ ] Tags icon displays
- [ ] Tab persistence works

---

## Future Enhancements (Post-M6)

### Tag Colors
- User-defined tag colors
- Color picker in tag settings
- Auto-generated colors from tag name hash

### Hierarchical Tags
- Support `#coding/react/hooks` syntax
- Tree view in TagsPanel
- Parent-child relationships in database

### Tag Synonyms
- Link related tags (e.g., `#js` → `#javascript`)
- Auto-suggest synonyms
- Merge duplicate tags

### Tag Analytics
- Most used tags
- Tag usage over time
- Related tags (frequently co-occurring)

### Tag Templates
- Predefined tag sets for content types
- Quick-apply tag templates

### Tag Export/Import
- Export tags to CSV/JSON
- Import tags from Obsidian/Notion

---

## Files Summary

### New Files to Create (10)

**Utilities (1):**
1. `lib/content/tag-extractor.ts`

**API Routes (6):**
2. `app/api/notes/tags/search/route.ts`
3. `app/api/notes/tags/route.ts`
4. `app/api/notes/content/[id]/tags/route.ts`
5. `app/api/notes/content/[id]/tags/[tagId]/route.ts`
6. `app/api/notes/tags/[id]/route.ts`

**Editor (1):**
7. `lib/editor/tag-suggestion.tsx`

**Components (2):**
8. `components/notes/TagsPanel.tsx`
9. `components/notes/TagFilterDropdown.tsx` (optional)

**Documentation (1):**
10. This file: `docs/notes-feature/M6-TAGS-IMPLEMENTATION.md`

### Files to Modify (7)

1. `lib/editor/extensions.ts` - Add tag suggestion
2. `lib/editor/slash-commands.tsx` - Add `/tag` command
3. `app/api/notes/content/[id]/route.ts` - Add tag extraction on save
4. `components/notes/RightSidebar.tsx` - Add "tags" tab
5. `components/notes/headers/RightSidebarHeader.tsx` - Add tags icon
6. `components/notes/content/RightSidebarContent.tsx` - Add tags case
7. `components/notes/SearchPanel.tsx` - Add tag filter

**Total:** 17 files (10 new, 7 modified)

---

## Implementation Estimate

**Phase 1 (Foundation):** 4-6 hours
- Tag extraction utility
- API routes (6 routes)
- Testing

**Phase 2 (Editor Integration):** 3-4 hours
- Tag autocomplete
- Slash command integration
- Testing

**Phase 3 (Auto-Extraction):** 2-3 hours
- Update save logic
- Testing

**Phase 4 (UI Components):** 4-6 hours
- TagsPanel
- Right sidebar updates
- Styling

**Phase 5 (Search Integration):** 2-3 hours
- Tag filter UI
- Integration testing

**Total:** 15-22 hours (~2-3 days)

---

## Conclusion

This implementation plan provides complete specifications for the tags system, the final 5% of M6. The design follows established patterns from wiki-links and slash commands, ensuring consistency and maintainability.

**Key Strengths:**
- Leverages existing database schema
- Follows proven autocomplete pattern
- Integrates seamlessly with search
- Clear dependency chain prevents errors
- Comprehensive testing plan

**Ready to Implement:** All specifications, APIs, components, and tests are defined. Implementation can begin immediately following the phase order.

---

**End of M6 Tags Implementation Guide**
