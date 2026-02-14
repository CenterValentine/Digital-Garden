# Example: Adding a New TipTap Extension

**Complete walkthrough for adding a hypothetical "Highlight" extension**

---

## Step 1: Create Extension

```typescript
// lib/domain/editor/extensions/highlight.ts

/**
 * Highlight Mark Extension
 *
 * Schema Version: 1.1.0 (added in)
 * Added: 2026-01-27
 *
 * Export Compatibility:
 * - Markdown: ✅ Uses ==highlight== syntax
 * - HTML: ✅ <mark> tag with custom styling
 * - JSON: ✅ Lossless
 * - PDF/DOCX: ⚠️ May render as plain text
 *
 * Attributes:
 * - color: string (optional) - Highlight color (default: yellow)
 *
 * Markdown Syntax:
 * - Input: `==highlighted text==`
 * - Output: `==highlighted text==`
 *
 * Migration Notes:
 * - Non-breaking (new feature)
 * - No migrations required
 */

import { Mark, mergeAttributes } from "@tiptap/core";

export interface HighlightOptions {
  HTMLAttributes: Record<string, any>;
}

export const Highlight = Mark.create<HighlightOptions>({
  name: "highlight",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (element) => element.getAttribute("data-color") || "yellow",
        renderHTML: (attributes) => {
          return {
            "data-color": attributes.color,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "mark",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const color = node.attrs?.color || "yellow";

    return [
      "mark",
      mergeAttributes(
        {
          style: `background-color: ${color}; padding: 0.125rem 0.25rem; border-radius: 2px;`,
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      0,
    ];
  },

  /**
   * CRITICAL: Markdown export
   */
  renderText({ node }) {
    // Obsidian-style highlight syntax
    return "==";
  },

  addCommands() {
    return {
      setHighlight:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleHighlight:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetHighlight:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-h": () => this.editor.commands.toggleHighlight(),
    };
  },
});
```

---

## Step 2: Add to Extensions Client

```typescript
// lib/domain/editor/extensions-client.ts

import { Highlight } from "./extensions/highlight";

export function getEditorExtensions(options?: EditorExtensionsOptions): Extensions {
  return [
    StarterKit.configure({
      // ... existing config
    }),

    // ... existing extensions

    // NEW: Highlight mark
    Highlight,
  ];
}
```

---

## Step 3: Update Markdown Converter

```typescript
// lib/domain/export/converters/markdown.ts

private serializeNode(
  node: JSONContent,
  settings: MarkdownExportSettings,
  depth: number = 0
): string {
  // ... existing cases

  case "text": {
    let text = node.text || "";

    // Apply marks
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "bold") text = `**${text}**`;
        if (mark.type === "italic") text = `*${text}*`;
        if (mark.type === "code") text = `\`${text}\``;
        if (mark.type === "strike") text = `~~${text}~~`;

        // NEW: Highlight support
        if (mark.type === "highlight") {
          text = `==${text}==`;
        }

        if (mark.type === "link") {
          const href = mark.attrs?.href || "";
          text = `[${text}](${href})`;
        }
      }
    }

    return text;
  }

  // ... rest of cases
}
```

---

## Step 4: Update HTML Converter

```typescript
// lib/domain/export/converters/html.ts

private getCSS(theme: string, syntaxHighlight: boolean): string {
  const isDark = theme === "dark";

  return `<style>
    /* ... existing styles */

    /* NEW: Highlight mark */
    mark {
      background-color: ${isDark ? "rgba(255, 255, 0, 0.3)" : "rgba(255, 255, 0, 0.5)"};
      padding: 0.125rem 0.25rem;
      border-radius: 2px;
    }

    mark[data-color="pink"] {
      background-color: ${isDark ? "rgba(255, 192, 203, 0.3)" : "rgba(255, 192, 203, 0.5)"};
    }

    /* ... rest of styles */
  </style>`;
}
```

---

## Step 5: Update Schema Version

```typescript
// lib/domain/editor/schema-version.ts

export const TIPTAP_SCHEMA_VERSION = "1.1.0"; // Incremented from 1.0.0

export const SCHEMA_HISTORY: SchemaVersion[] = [
  // ... existing versions

  {
    version: "1.1.0",
    date: "2026-01-27",
    changes: [
      {
        type: "add",
        target: "mark",
        name: "highlight",
        description: "Text highlighting with ==syntax==",
        breaking: false,
        migrationsAvailable: [],
      },
    ],
    migrationsRequired: false,
  },
];

// Update snapshot
export function getCurrentSchemaSnapshot() {
  return {
    version: TIPTAP_SCHEMA_VERSION,
    nodes: [
      // ... existing nodes
    ],
    marks: [
      "bold",
      "italic",
      "strike",
      "code",
      "link",
      "highlight", // NEW
    ],
    extensions: [
      // ... existing extensions
      "Highlight", // NEW
    ],
  };
}
```

---

## Step 6: Add Tests

```typescript
// lib/domain/export/__tests__/schema-compatibility.test.ts

describe("Schema Compatibility Tests", () => {
  // ... existing tests

  it("should export highlight marks to Markdown", async () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "highlighted text",
              marks: [{ type: "highlight", attrs: { color: "yellow" } }],
            },
          ],
        },
      ],
    };

    const result = await convertDocument(doc, {
      format: "markdown",
      settings: mockSettings,
    });

    expect(result.success).toBe(true);
    const markdown = result.files[0].content as string;
    expect(markdown).toContain("==highlighted text==");
  });

  it("should export highlight marks to HTML", async () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "highlighted text",
              marks: [{ type: "highlight", attrs: { color: "yellow" } }],
            },
          ],
        },
      ],
    };

    const result = await convertDocument(doc, {
      format: "html",
      settings: mockSettings,
    });

    expect(result.success).toBe(true);
    const html = result.files[0].content as string;
    expect(html).toContain("<mark");
    expect(html).toContain("highlighted text");
  });
});
```

---

## Step 7: Run Tests

```bash
# Run all export tests
pnpm test lib/domain/export

# Run schema compatibility tests specifically
pnpm test lib/domain/export/__tests__/schema-compatibility.test.ts

# If tests pass, proceed to commit
```

---

## Step 8: Update Documentation

```typescript
// CLAUDE.md

### TipTap Editor Extensions

**Custom Extensions:**
- **WikiLink** - Obsidian-style [[links]]
- **Tag** - #tag nodes with metadata
- **Callout** - Obsidian-style callouts
- **Highlight** - ==highlight== text (NEW in v1.1.0) 👈 ADD THIS

// docs/notes-feature/TIPTAP-SCHEMA-EVOLUTION-GUIDE.md
// Update with example of highlight addition
```

---

## Step 9: Commit

```bash
git add .
git commit -m "feat(editor): Add Highlight mark extension

- Added Highlight mark with ==syntax==
- Supports custom colors via color attribute
- Updated schema version to 1.1.0
- Added Markdown/HTML serialization
- Added compatibility tests
- No breaking changes (non-breaking minor version bump)"
```

---

## What Happens on Export?

### Markdown Export

**Before** (TipTap JSON):
```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "This is highlighted",
          "marks": [{ "type": "highlight", "attrs": { "color": "yellow" } }]
        }
      ]
    }
  ]
}
```

**After** (Markdown + Metadata):

`my-note.md`:
```markdown
This is ==highlighted==
```

`my-note.meta.json`:
```json
{
  "schemaVersion": "1.1.0",
  "schema": {
    "nodes": ["doc", "paragraph", "text"],
    "marks": ["highlight"],
    "extensions": ["Highlight"]
  }
}
```

---

## Backward Compatibility

### Importing Old Exports (Pre-Highlight)

**Old export (v1.0.0):**
- No highlight marks
- Schema version: 1.0.0

**Import to v1.1.0:**
- ✅ Works fine (backward compatible)
- No migration needed (non-breaking change)
- Old documents render correctly

### Forward Compatibility

**New export (v1.1.0):**
- Contains highlight marks
- Schema version: 1.1.0

**Import to v1.0.0:**
- ⚠️ Highlight marks will be ignored
- Text content preserved
- Warning logged: "Unknown mark type: highlight"

---

## Summary Checklist

- [x] Created extension with schema version comments
- [x] Added `renderText()` for Markdown export
- [x] Updated extensions-client.ts
- [x] Updated Markdown converter
- [x] Updated HTML converter
- [x] Updated schema-version.ts (incremented version)
- [x] Added SCHEMA_HISTORY entry
- [x] Updated getCurrentSchemaSnapshot()
- [x] Added compatibility tests
- [x] Tests pass
- [x] Updated documentation
- [x] Committed with descriptive message

---

## Common Pitfalls to Avoid

### ❌ Don't Do This

```typescript
// Forgot to add renderText()
export const MyExtension = Node.create({
  name: "myExtension",
  // Missing: renderText() method!
});

// Result: Markdown export fails or loses content
```

### ✅ Do This

```typescript
export const MyExtension = Node.create({
  name: "myExtension",

  renderText({ node }) {
    return `[myExtension:${node.attrs.value}]`;
  },
});
```

### ❌ Don't Do This

```typescript
// Forgot to update schema version
export const TIPTAP_SCHEMA_VERSION = "1.0.0"; // Still old version!
```

### ✅ Do This

```typescript
// Incremented version
export const TIPTAP_SCHEMA_VERSION = "1.1.0";

// Added history entry
export const SCHEMA_HISTORY: SchemaVersion[] = [
  // ... existing
  {
    version: "1.1.0",
    date: "2026-01-27",
    changes: [/* ... */],
  },
];
```

---

## Next Steps

After adding your extension:

1. **Test in production** - Export real documents
2. **Monitor metrics** - Check export success rates
3. **Generate regression tests** - Run `tsx scripts/generate-export-tests.ts`
4. **Update user docs** - Document new feature
5. **Celebrate!** 🎉 You've added a new extension without breaking exports!
