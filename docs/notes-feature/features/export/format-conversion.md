# Format Conversion

**Multi-format export system** for notes with TipTap → Markdown, HTML, JSON, and plain text conversion.

## Overview

The export system converts TipTap JSON content to multiple formats while preserving semantic information through metadata sidecars.

**Supported Formats:**
- **Markdown** - Obsidian-compatible with wiki-links, callouts, YAML frontmatter
- **HTML** - Standalone with embedded CSS, light/dark themes
- **JSON** - Lossless TipTap export for re-import
- **Plain Text** - Simple text extraction for search indexing

**Key Feature**: Metadata sidecars (`.meta.json`) preserve information lost in conversion

## Architecture

### Converter Pattern

**Location**: `lib/domain/export/converters/`

```
lib/domain/export/converters/
├── markdown-converter.ts    # TipTap → Markdown
├── html-converter.ts        # TipTap → HTML
├── json-converter.ts        # TipTap → JSON
└── text-converter.ts        # TipTap → Plain text
```

**Interface**:
```typescript
interface FormatConverter {
  convert(content: JSONContent, options?: ConvertOptions): Promise<string>;
  getSupportedExtensions(): string[];
}
```

## Markdown Conversion

**File**: `lib/domain/export/converters/markdown-converter.ts`

### Obsidian Compatibility

**Goal**: Export markdown that works seamlessly in Obsidian

**Key Features**:
- Wiki-links: `[[Note Title]]` or `[[slug|Display]]`
- Callouts: `> [!note]`, `> [!warning]`, etc.
- Task lists: `- [ ]`, `- [x]`
- YAML frontmatter with metadata
- GitHub Flavored Markdown tables

### Conversion Examples

**TipTap JSON** → **Markdown**

**1. Wiki-Links**:
```typescript
// TipTap JSON
{
  type: 'wikiLink',
  attrs: { targetTitle: 'Getting Started', displayText: null }
}

// Markdown Output
[[Getting Started]]
```

**2. Callouts**:
```typescript
// TipTap JSON
{
  type: 'callout',
  attrs: { type: 'warning', title: 'Watch Out' },
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Be careful!' }] }]
}

// Markdown Output
> [!warning] Watch Out
> Be careful!
```

**3. Task Lists**:
```typescript
// TipTap JSON
{
  type: 'taskList',
  content: [
    { type: 'taskItem', attrs: { checked: false }, content: [...] },
    { type: 'taskItem', attrs: { checked: true }, content: [...] },
  ]
}

// Markdown Output
- [ ] Todo item
- [x] Completed item
```

**4. Code Blocks**:
```typescript
// TipTap JSON
{
  type: 'codeBlock',
  attrs: { language: 'typescript' },
  content: [{ type: 'text', text: 'const x = 1;' }]
}

// Markdown Output
​```typescript
const x = 1;
​```
```

### YAML Frontmatter

**Generated automatically**:
```yaml
---
title: Note Title
slug: note-title
created: 2026-02-18T10:30:00Z
updated: 2026-02-18T15:45:00Z
tags:
  - tag1
  - tag2
---
```

**Options**:
```typescript
{
  includeFrontmatter: true, // Default: true
  frontmatterFields: ['title', 'slug', 'tags', 'created', 'updated'],
}
```

## HTML Conversion

**File**: `lib/domain/export/converters/html-converter.ts`

### Standalone HTML

**Goal**: Self-contained HTML file with embedded styles

**Template**:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>
    /* Embedded CSS (light + dark themes) */
    /* Syntax highlighting with highlight.js */
    /* Responsive layout */
    /* Print-friendly styles */
  </style>
</head>
<body>
  <article class="note-content">
    {converted-content}
  </article>
</body>
</html>
```

### Features

**1. Embedded CSS**:
- Light/dark theme support (prefers-color-scheme media query)
- Syntax highlighting styles (highlight.js themes)
- Responsive layout (mobile, tablet, desktop)
- Print-friendly styles (@media print)

**2. Syntax Highlighting**:
- Uses highlight.js for code blocks
- 50+ language support
- Multiple theme options (github, monokai, nord, etc.)

**3. Self-Contained**:
- No external dependencies
- All assets embedded (CSS, fonts)
- Works offline

**Options**:
```typescript
{
  theme: 'light' | 'dark' | 'auto', // Default: 'auto'
  syntaxTheme: 'github' | 'monokai' | 'nord', // Default: 'github'
  includeTableOfContents: boolean, // Default: false
}
```

## JSON Conversion

**File**: `lib/domain/export/converters/json-converter.ts`

### Lossless Export

**Goal**: Complete TipTap JSON structure with zero data loss

**Output**:
```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [{ "type": "text", "text": "Getting Started" }]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "This is a " },
        { "type": "text", "marks": [{ "type": "bold" }], "text": "bold" },
        { "type": "text", "text": " word." }
      ]
    }
  ]
}
```

**Use Cases**:
- Re-import to Digital Garden (no data loss)
- Backup and restore
- Version control (git-friendly JSON)
- Programmatic content manipulation

**Features**:
- Preserves all node attributes
- Preserves all marks (bold, italic, etc.)
- Preserves custom node types (wikiLink, callout, etc.)
- Schema version tracking

## Plain Text Conversion

**File**: `lib/domain/export/converters/text-converter.ts`

### Text Extraction

**Goal**: Simple text extraction for search indexing

**Behavior**:
- Strips all formatting (bold, italic, links)
- Preserves paragraph breaks
- Removes HTML tags
- Removes code block markers

**Example**:
```typescript
// TipTap JSON
{
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'This is ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
        { type: 'text', text: ' text.' },
      ]
    }
  ]
}

// Plain Text Output
This is bold text.
```

**Use Cases**:
- Full-text search indexing
- Character/word count
- Preview snippets
- Copy to clipboard

## API Endpoints

### Single Document Export

**Endpoint**: `POST /api/content/export/[id]`

**Request**:
```typescript
{
  format: 'markdown' | 'html' | 'json' | 'text',
  options?: {
    // Format-specific options
  }
}
```

**Response**:
```typescript
{
  content: string, // Converted content
  metadata: {
    contentId: string,
    title: string,
    format: string,
    exportedAt: string,
  },
  sidecar?: object, // Metadata sidecar (if format != 'json')
}
```

**Example**:
```bash
curl -X POST https://api.example.com/api/content/export/abc123 \
  -H "Content-Type: application/json" \
  -d '{"format": "markdown"}'
```

### Bulk Vault Export

**Endpoint**: `POST /api/content/export/vault`

**Request**:
```typescript
{
  format: 'markdown' | 'html' | 'json',
  filter?: {
    folderId?: string, // Export specific folder
    contentTypes?: string[], // Filter by type
    tags?: string[], // Filter by tags
  },
  options?: {
    fileNaming: 'slug' | 'title' | 'id', // Default: 'slug'
    preserveHierarchy: boolean, // Default: true
    includeSidecars: boolean, // Default: true
  }
}
```

**Response**:
```typescript
{
  downloadUrl: string, // Presigned URL for ZIP download
  stats: {
    totalFiles: number,
    totalSize: number,
    exportedAt: string,
  }
}
```

**ZIP Structure**:
```
export-2026-02-18/
├── README.md (auto-generated)
├── folder1/
│   ├── note1.md
│   ├── note1.meta.json
│   └── note2.md
└── folder2/
    └── note3.md
```

## Format-Specific Options

### Markdown Options

```typescript
{
  includeFrontmatter: boolean, // YAML frontmatter (default: true)
  wikiLinkStyle: '[[title]]' | '[[slug]]', // Default: '[[title]]'
  calloutStyle: 'obsidian' | 'github', // Default: 'obsidian'
  codeBlockStyle: 'fenced' | 'indented', // Default: 'fenced'
}
```

### HTML Options

```typescript
{
  theme: 'light' | 'dark' | 'auto', // Color scheme (default: 'auto')
  syntaxTheme: string, // highlight.js theme (default: 'github')
  includeTableOfContents: boolean, // Auto-generated TOC (default: false)
  embedImages: boolean, // Base64 embed images (default: false)
}
```

### JSON Options

```typescript
{
  pretty: boolean, // Pretty-print JSON (default: true)
  includeSchema: boolean, // Include schema version (default: true)
}
```

## Error Handling

### Unsupported Nodes

**Strategy**: Graceful degradation with warning

```typescript
if (!converter.supports(node.type)) {
  console.warn(`Unsupported node type: ${node.type}`);
  return node.textContent || ''; // Fallback to text content
}
```

### Invalid Content

**Strategy**: Validation with helpful errors

```typescript
try {
  validateTipTapJSON(content);
} catch (error) {
  throw new ExportError(
    `Invalid TipTap content: ${error.message}`,
    { contentId, format }
  );
}
```

### Large Documents

**Strategy**: Streaming for >10MB documents

```typescript
if (contentSize > 10 * 1024 * 1024) {
  // Use streaming conversion
  return streamConvert(content, format);
}
```

## Related Documentation

- [Metadata Sidecars](metadata-sidecars.md) - Preserve semantic information
- [Bulk Export](bulk-export.md) - ZIP archive creation
- [Export Architecture](../../guides/export/EXPORT-BACKUP-ARCHITECTURE.md)
- [Markdown Solution](../../guides/export/EXPORT-MARKDOWN-SOLUTION.md)

---

**Implemented**: Epoch 4 (M8 - Export System)
**Last Updated**: Feb 18, 2026
