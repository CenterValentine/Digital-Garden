# TipTap Schema Evolution & Export Compatibility Guide

**Version:** 1.0
**Date:** 2026-01-26
**Purpose:** Proactive maintenance strategy for TipTap schema changes

---

## The Problem

Your export/import system has **tight coupling** to TipTap's schema:
- Each converter serializes specific node types
- Markdown export depends on node attributes
- Import depends on consistent schema structure
- Adding/modifying extensions can break conversions

**Risk Scenarios:**
1. ✅ Add new extension → Old converters ignore it → **Data loss**
2. ✅ Change node attributes → Metadata sidecar becomes stale → **Import fails**
3. ✅ Rename node type → Old exports can't be imported → **Breaking change**
4. ✅ TipTap core upgrade → API changes → **Converter breaks**

---

## Solution: Defense-in-Depth Strategy

### Layer 1: Schema Versioning
### Layer 2: Compatibility Testing
### Layer 3: Migration System
### Layer 4: Fallback Mechanisms
### Layer 5: Developer Guardrails

---

## Layer 1: Schema Versioning

### 1.1 Conventional Versioning for TipTap Schema

**Semantic Versioning Format:** `MAJOR.MINOR.PATCH`

We follow **strict semantic versioning** with TipTap-specific rules:

#### Version Bump Rules

| Bump Type | When to Use | Import Compatibility | Migration Required |
|-----------|-------------|---------------------|-------------------|
| **MAJOR** | Breaking changes | ❌ Incompatible | ✅ Yes |
| **MINOR** | New features (backward compatible) | ✅ Compatible | ❌ No |
| **PATCH** | Bug fixes (no schema changes) | ✅ Compatible | ❌ No |

#### MAJOR Version (X.0.0) - Breaking Changes

**Bump MAJOR when:**
- ✅ Removing an extension
- ✅ Renaming node/mark types
- ✅ Changing required attribute types
- ✅ Removing required attributes
- ✅ Changing node content rules (e.g., paragraph can no longer contain images)
- ✅ TipTap core upgrade with breaking API changes

**Examples:**
```typescript
// ❌ BREAKING - Rename node type
// Old: { type: "internalLink" }
// New: { type: "wikiLink" }
// Version: 1.5.0 → 2.0.0

// ❌ BREAKING - Remove extension
// Old: callout extension exists
// New: callout extension removed
// Version: 1.3.0 → 2.0.0

// ❌ BREAKING - Change attribute type
// Old: { attrs: { level: string } }
// New: { attrs: { level: number } }
// Version: 1.2.0 → 2.0.0

// ❌ BREAKING - Remove required attribute
// Old: { attrs: { targetTitle: string, displayText: string } }
// New: { attrs: { targetTitle: string } } // removed displayText
// Version: 1.1.0 → 2.0.0
```

**Required actions:**
1. Increment MAJOR version
2. Create migration in `migrations.ts`
3. Update all converters
4. Update compatibility tests
5. Document in SCHEMA_HISTORY with `breaking: true`

#### MINOR Version (0.X.0) - New Features

**Bump MINOR when:**
- ✅ Adding new extension
- ✅ Adding new node/mark type
- ✅ Adding optional attributes
- ✅ Adding new marks to existing nodes
- ✅ Extending functionality without breaking old exports

**Examples:**
```typescript
// ✅ NON-BREAKING - Add new extension
// Old: No highlight extension
// New: Add highlight mark extension
// Version: 1.2.0 → 1.3.0

// ✅ NON-BREAKING - Add optional attribute
// Old: { attrs: { type: string } }
// New: { attrs: { type: string, color?: string } }
// Version: 1.1.0 → 1.2.0

// ✅ NON-BREAKING - Add new node type
// Old: No "diagram" node
// New: Add "diagram" node
// Version: 1.0.0 → 1.1.0
```

**Required actions:**
1. Increment MINOR version
2. Add serialization to converters
3. Add test case
4. Document in SCHEMA_HISTORY with `breaking: false`
5. Old exports still load (they just don't have new features)

#### PATCH Version (0.0.X) - Bug Fixes

**Bump PATCH when:**
- ✅ Fixing converter serialization bugs
- ✅ Improving export quality (no schema change)
- ✅ Fixing metadata sidecar generation
- ✅ Performance improvements
- ✅ Documentation updates

**Examples:**
```typescript
// ✅ NON-BREAKING - Fix serialization bug
// Old: Callout exports with wrong syntax
// New: Callout exports with correct syntax
// Version: 1.2.3 → 1.2.4

// ✅ NON-BREAKING - Performance improvement
// Old: Slow HTML conversion
// New: Faster HTML conversion (same output)
// Version: 1.1.0 → 1.1.1

// ✅ NON-BREAKING - Fix metadata generation
// Old: Tags missing color in metadata
// New: Tags include color in metadata
// Version: 1.0.5 → 1.0.6
```

**Required actions:**
1. Increment PATCH version
2. Fix bug
3. Add regression test
4. Update SCHEMA_HISTORY (optional for minor patches)

#### Edge Cases & Special Scenarios

**Scenario 1: TipTap Core Upgrade**
```typescript
// Non-breaking TipTap upgrade (3.10.0 → 3.15.0)
// Version: 1.5.0 → 1.6.0 (MINOR)

// Breaking TipTap upgrade (3.x → 4.x with API changes)
// Version: 1.5.0 → 2.0.0 (MAJOR)
```

**Scenario 2: Multiple Changes in One Commit**
```typescript
// If any change is BREAKING → MAJOR bump
// Add new extension (MINOR) + rename node (MAJOR) = MAJOR bump
// Version: 1.3.0 → 2.0.0
```

**Scenario 3: Attribute Default Values**
```typescript
// ✅ NON-BREAKING - Add default for optional attribute
// Old: { attrs: { color?: string } } // undefined if not set
// New: { attrs: { color?: string = "#000000" } } // has default
// Version: 1.1.0 → 1.1.1 (PATCH)

// ❌ BREAKING - Change default value
// Old: { attrs: { color: string = "#000000" } }
// New: { attrs: { color: string = "#ff0000" } }
// Version: 1.1.0 → 2.0.0 (MAJOR - changes behavior)
```

**Scenario 4: Deprecation Path**
```typescript
// Phase 1: Mark as deprecated, add warning (MINOR)
// Old: Uses "internalLink"
// New: "internalLink" still works but logs warning, "wikiLink" available
// Version: 1.5.0 → 1.6.0

// Phase 2: Remove deprecated feature (MAJOR)
// Old: Both "internalLink" and "wikiLink" work
// New: Only "wikiLink" works
// Version: 1.6.0 → 2.0.0
```

#### Decision Flowchart

```
Did TipTap schema change?
├─ No → No version bump needed (just code refactoring)
└─ Yes → Does it break old exports?
    ├─ Yes → MAJOR bump (X.0.0)
    │   ├─ Create migration
    │   └─ Update converters
    └─ No → Is it a new feature?
        ├─ Yes → MINOR bump (0.X.0)
        │   ├─ Add converter support
        │   └─ Add tests
        └─ No → PATCH bump (0.0.X)
            └─ Fix bugs only
```

#### Version Compatibility Matrix

| Export Version | Import Version | Result |
|---------------|---------------|--------|
| 1.0.0 | 1.0.0 | ✅ Perfect match |
| 1.0.0 | 1.5.0 | ✅ Works (forward compatible) |
| 1.5.0 | 1.0.0 | ⚠️ Warnings (unknown nodes ignored) |
| 1.x.x | 2.x.x | ❌ Incompatible (migration required) |
| 2.x.x | 1.x.x | ❌ Incompatible (can't downgrade) |

### 1.2 Track TipTap Schema Versions

**Create schema registry:**

```typescript
// lib/domain/editor/schema-version.ts

/**
 * TipTap Schema Version Registry
 *
 * CRITICAL: Update this file whenever you:
 * - Add a new TipTap extension
 * - Modify an extension's schema
 * - Remove an extension
 * - Upgrade TipTap core
 *
 * VERSION BUMP RULES:
 * - MAJOR (X.0.0): Breaking changes (remove/rename nodes, change attribute types)
 * - MINOR (0.X.0): New features (add extensions, add optional attributes)
 * - PATCH (0.0.X): Bug fixes (converter improvements, no schema changes)
 */

export const TIPTAP_SCHEMA_VERSION = "2.0.0"; // Semantic versioning

export interface SchemaVersion {
  version: string;
  date: string;
  changes: SchemaChange[];
  migrationsRequired: boolean;
}

export interface SchemaChange {
  type: "add" | "modify" | "remove" | "upgrade";
  target: "node" | "mark" | "extension" | "core";
  name: string;
  description: string;
  breaking: boolean;
  migrationsAvailable: string[]; // Migration function names
}

export const SCHEMA_HISTORY: SchemaVersion[] = [
  {
    version: "1.0.0",
    date: "2026-01-01",
    changes: [
      {
        type: "add",
        target: "node",
        name: "wikiLink",
        description: "Obsidian-style [[links]]",
        breaking: false,
        migrationsAvailable: [],
      },
      {
        type: "add",
        target: "node",
        name: "tag",
        description: "#tag nodes with metadata",
        breaking: false,
        migrationsAvailable: [],
      },
      {
        type: "add",
        target: "node",
        name: "callout",
        description: "Obsidian-style callouts",
        breaking: false,
        migrationsAvailable: [],
      },
    ],
    migrationsRequired: false,
  },
  {
    version: "2.0.0",
    date: "2026-01-26",
    changes: [
      {
        type: "upgrade",
        target: "core",
        name: "tiptap",
        description: "Upgraded from 3.10.0 to 3.15.3",
        breaking: false,
        migrationsAvailable: [],
      },
    ],
    migrationsRequired: false,
  },
  // Add new versions here...
];

/**
 * Get current schema version
 */
export function getCurrentSchemaVersion(): string {
  return TIPTAP_SCHEMA_VERSION;
}

/**
 * Check if a schema version is compatible with current version
 */
export function isCompatibleVersion(version: string): boolean {
  const [currentMajor] = TIPTAP_SCHEMA_VERSION.split(".").map(Number);
  const [targetMajor] = version.split(".").map(Number);

  // Breaking changes only on major version bumps
  return currentMajor === targetMajor;
}

/**
 * Get required migrations for upgrading from old version
 */
export function getRequiredMigrations(fromVersion: string): SchemaChange[] {
  const changes: SchemaChange[] = [];

  for (const historyEntry of SCHEMA_HISTORY) {
    if (compareVersions(historyEntry.version, fromVersion) > 0) {
      changes.push(...historyEntry.changes);
    }
  }

  return changes.filter(c => c.breaking);
}

function compareVersions(v1: string, v2: string): number {
  const [major1, minor1, patch1] = v1.split(".").map(Number);
  const [major2, minor2, patch2] = v2.split(".").map(Number);

  if (major1 !== major2) return major1 - major2;
  if (minor1 !== minor2) return minor1 - minor2;
  return patch1 - patch2;
}
```

### 1.3 Embed Schema Version in Exports

**Update metadata sidecar:**

```typescript
// lib/domain/export/metadata.ts

export interface MetadataSidecar {
  version: string;
  schemaVersion: string;  // NEW: Track TipTap schema
  contentId: string;
  title: string;
  // ... existing fields

  // NEW: Schema snapshot
  schema: {
    nodes: string[];      // List of node types used
    marks: string[];      // List of mark types used
    extensions: string[]; // List of extensions used
  };
}

export function generateMetadataSidecar(content: any): MetadataSidecar {
  const tiptapJson = content.notePayload.tiptapJson as JSONContent;

  return {
    version: "1.0",
    schemaVersion: getCurrentSchemaVersion(), // Track schema version
    contentId: content.id,
    // ... existing fields

    schema: extractSchemaSnapshot(tiptapJson), // NEW
  };
}

/**
 * Extract schema snapshot from TipTap JSON
 * Lists all node/mark types actually used in this document
 */
function extractSchemaSnapshot(json: JSONContent): {
  nodes: string[];
  marks: string[];
  extensions: string[];
} {
  const nodes = new Set<string>();
  const marks = new Set<string>();

  function traverse(node: JSONContent) {
    if (node.type) nodes.add(node.type);

    if (node.marks) {
      node.marks.forEach(mark => marks.add(mark.type));
    }

    if (node.content) {
      node.content.forEach(traverse);
    }
  }

  traverse(json);

  return {
    nodes: Array.from(nodes),
    marks: Array.from(marks),
    extensions: [
      // Infer extensions from nodes
      ...(nodes.has("wikiLink") ? ["WikiLink"] : []),
      ...(nodes.has("tag") ? ["Tag"] : []),
      ...(nodes.has("callout") ? ["Callout"] : []),
    ],
  };
}
```

### 1.4 Version Check on Import

```typescript
// lib/domain/import/markdown-import.ts (NEW FILE)

import { isCompatibleVersion, getRequiredMigrations } from "@/lib/domain/editor/schema-version";

export async function importMarkdownWithMetadata(
  markdown: string,
  metadata: MetadataSidecar
): Promise<JSONContent> {
  // Check schema compatibility
  if (!isCompatibleVersion(metadata.schemaVersion)) {
    const migrations = getRequiredMigrations(metadata.schemaVersion);

    if (migrations.length > 0) {
      throw new Error(
        `Schema version mismatch. Export version: ${metadata.schemaVersion}, Current: ${getCurrentSchemaVersion()}. ` +
        `Breaking changes detected: ${migrations.map(m => m.name).join(", ")}. ` +
        `Migration required.`
      );
    }
  }

  // Check for unknown nodes/marks
  const unknownNodes = metadata.schema.nodes.filter(
    node => !isSupportedNode(node)
  );

  if (unknownNodes.length > 0) {
    console.warn(
      `[Import] Unknown node types detected: ${unknownNodes.join(", ")}. ` +
      `These will be imported as-is but may not render correctly.`
    );
  }

  // Proceed with import...
  const tiptapJson = await markdownToTiptap(markdown);

  // Apply metadata overlay
  const enrichedJson = applyMetadataToTiptap(tiptapJson, metadata);

  return enrichedJson;
}

function isSupportedNode(nodeType: string): boolean {
  const supportedNodes = [
    "doc", "paragraph", "text", "heading",
    "bulletList", "orderedList", "listItem",
    "codeBlock", "blockquote", "horizontalRule",
    "hardBreak", "table", "tableRow", "tableCell",
    "wikiLink", "tag", "callout",
    "taskList", "taskItem",
  ];

  return supportedNodes.includes(nodeType);
}
```

---

## Layer 2: Compatibility Testing

### 2.1 Schema Compatibility Test Suite

**Create automated tests:**

```typescript
// lib/domain/export/__tests__/schema-compatibility.test.ts

import { describe, it, expect } from "vitest";
import { convertDocument } from "../factory";
import { getCurrentSchemaVersion } from "@/lib/domain/editor/schema-version";
import type { JSONContent } from "@tiptap/core";

describe("Schema Compatibility Tests", () => {
  /**
   * CRITICAL: Update this test whenever you modify TipTap schema
   *
   * This ensures all converters handle the schema correctly
   */

  const allNodeTypes: JSONContent[] = [
    // Standard nodes
    { type: "doc", content: [] },
    { type: "paragraph", content: [] },
    { type: "heading", attrs: { level: 1 }, content: [] },
    { type: "bulletList", content: [] },
    { type: "orderedList", content: [] },
    { type: "listItem", content: [] },
    { type: "codeBlock", attrs: { language: "typescript" }, content: [] },
    { type: "blockquote", content: [] },
    { type: "horizontalRule" },
    { type: "hardBreak" },

    // Tables
    { type: "table", content: [] },
    { type: "tableRow", content: [] },
    { type: "tableCell", content: [] },

    // Custom extensions
    { type: "wikiLink", attrs: { targetTitle: "Test", displayText: "Link" } },
    { type: "tag", attrs: { tagId: "123", tagName: "test", color: "#ff0000" } },
    { type: "callout", attrs: { type: "warning", title: "Test" }, content: [] },

    // Task lists
    { type: "taskList", content: [] },
    { type: "taskItem", attrs: { checked: false }, content: [] },
  ];

  it("should export all node types to Markdown without errors", async () => {
    for (const node of allNodeTypes) {
      const doc: JSONContent = { type: "doc", content: [node] };

      const result = await convertDocument(doc, {
        format: "markdown",
        settings: mockSettings,
      });

      expect(result.success).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
    }
  });

  it("should export all node types to HTML without errors", async () => {
    for (const node of allNodeTypes) {
      const doc: JSONContent = { type: "doc", content: [node] };

      const result = await convertDocument(doc, {
        format: "html",
        settings: mockSettings,
      });

      expect(result.success).toBe(true);
    }
  });

  it("should preserve schema version in metadata", async () => {
    const doc: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

    const result = await convertDocument(doc, {
      format: "markdown",
      settings: { ...mockSettings, markdown: { includeMetadata: true } },
      metadata: { customMetadata: { title: "Test" } },
    });

    const metadataFile = result.files.find(f => f.name.endsWith(".meta.json"));
    expect(metadataFile).toBeDefined();

    const metadata = JSON.parse(metadataFile!.content as string);
    expect(metadata.schemaVersion).toBe(getCurrentSchemaVersion());
  });

  it("should detect unknown node types", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [{ type: "unknownNode", attrs: {} }],
    };

    // Should not crash, but should warn
    expect(() => {
      convertDocument(doc, { format: "markdown", settings: mockSettings });
    }).not.toThrow();
  });
});
```

### 2.2 Regression Test Generator

**Auto-generate tests from real documents:**

```typescript
// scripts/generate-export-tests.ts

import { prisma } from "@/lib/database/client";
import { convertDocument } from "@/lib/domain/export";
import fs from "fs/promises";

/**
 * Generate regression tests from production data
 *
 * Run: tsx scripts/generate-export-tests.ts
 */

async function generateRegressionTests() {
  // Fetch sample documents with diverse content
  const sampleDocs = await prisma.contentNode.findMany({
    where: {
      notePayload: { isNot: null },
      // Get diverse examples
      OR: [
        { contentTags: { some: {} } },        // Has tags
        { sourceLinks: { some: {} } },        // Has wiki-links
      ],
    },
    include: {
      notePayload: true,
      contentTags: { include: { tag: true } },
    },
    take: 50,
  });

  const testCases: any[] = [];

  for (const doc of sampleDocs) {
    const tiptapJson = doc.notePayload!.tiptapJson;

    // Export to all formats
    for (const format of ["markdown", "html", "json"] as const) {
      try {
        const result = await convertDocument(tiptapJson as any, {
          format,
          settings: mockSettings,
        });

        testCases.push({
          id: doc.id,
          title: doc.title,
          format,
          input: tiptapJson,
          output: result.files[0].content,
          success: result.success,
          schemaVersion: getCurrentSchemaVersion(),
        });
      } catch (error) {
        console.error(`Failed to export ${doc.id} as ${format}:`, error);
      }
    }
  }

  // Write test snapshots
  await fs.writeFile(
    "lib/domain/export/__tests__/snapshots.json",
    JSON.stringify(testCases, null, 2)
  );

  console.log(`Generated ${testCases.length} regression test cases`);
}

generateRegressionTests();
```

### 2.3 CI/CD Integration

**GitHub Actions workflow:**

```yaml
# .github/workflows/export-compatibility.yml

name: Export Compatibility Tests

on:
  push:
    paths:
      - "lib/domain/editor/**"
      - "lib/domain/export/**"
  pull_request:

jobs:
  test-compatibility:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install

      - name: Run schema compatibility tests
        run: pnpm test lib/domain/export/__tests__/schema-compatibility.test.ts

      - name: Check schema version updated
        run: |
          if git diff --name-only ${{ github.event.before }} ${{ github.sha }} | grep "lib/domain/editor/extensions"; then
            if ! git diff --name-only ${{ github.event.before }} ${{ github.sha }} | grep "lib/domain/editor/schema-version.ts"; then
              echo "ERROR: TipTap schema modified but schema-version.ts not updated!"
              exit 1
            fi
          fi
```

---

## Layer 3: Migration System

### 3.1 Schema Migration Framework

```typescript
// lib/domain/export/migrations.ts

export interface SchemaMigration {
  fromVersion: string;
  toVersion: string;
  description: string;
  migrateMetadata: (metadata: MetadataSidecar) => MetadataSidecar;
  migrateTiptapJSON: (json: JSONContent) => JSONContent;
}

export const MIGRATIONS: SchemaMigration[] = [
  // Example: Migrating from v1.0.0 to v2.0.0
  {
    fromVersion: "1.0.0",
    toVersion: "2.0.0",
    description: "Renamed 'internalLink' to 'wikiLink'",

    migrateMetadata(metadata) {
      // Update schema snapshot
      if (metadata.schema.nodes.includes("internalLink")) {
        metadata.schema.nodes = metadata.schema.nodes.map(n =>
          n === "internalLink" ? "wikiLink" : n
        );
      }

      // Update wikiLinks array if needed
      // ... migration logic

      return metadata;
    },

    migrateTiptapJSON(json) {
      // Recursively rename node types
      function migrate(node: JSONContent): JSONContent {
        if (node.type === "internalLink") {
          node.type = "wikiLink";
        }

        if (node.content) {
          node.content = node.content.map(migrate);
        }

        return node;
      }

      return migrate(json);
    },
  },

  // Add more migrations here...
];

/**
 * Apply all required migrations to bring old export to current schema
 */
export function applyMigrations(
  tiptapJson: JSONContent,
  metadata: MetadataSidecar
): { tiptapJson: JSONContent; metadata: MetadataSidecar } {
  let currentVersion = metadata.schemaVersion;
  let migratedJSON = tiptapJson;
  let migratedMetadata = metadata;

  // Apply migrations in sequence
  for (const migration of MIGRATIONS) {
    if (migration.fromVersion === currentVersion) {
      console.log(`[Migration] Applying: ${migration.description}`);

      migratedJSON = migration.migrateTiptapJSON(migratedJSON);
      migratedMetadata = migration.migrateMetadata(migratedMetadata);

      currentVersion = migration.toVersion;
    }
  }

  // Update schema version
  migratedMetadata.schemaVersion = getCurrentSchemaVersion();

  return { tiptapJson: migratedJSON, metadata: migratedMetadata };
}
```

### 3.2 Auto-Migration on Import

```typescript
// lib/domain/import/markdown-import.ts (updated)

export async function importMarkdownWithMetadata(
  markdown: string,
  metadata: MetadataSidecar
): Promise<JSONContent> {
  // Check if migration needed
  if (metadata.schemaVersion !== getCurrentSchemaVersion()) {
    console.log(
      `[Import] Schema version mismatch. Applying migrations from ${metadata.schemaVersion} to ${getCurrentSchemaVersion()}`
    );

    // Parse markdown to TipTap JSON
    let tiptapJson = await markdownToTiptap(markdown);

    // Apply migrations
    const migrated = applyMigrations(tiptapJson, metadata);
    tiptapJson = migrated.tiptapJson;
    metadata = migrated.metadata;

    console.log(`[Import] Migration complete`);
  }

  // Continue with import...
  return applyMetadataToTiptap(tiptapJson, metadata);
}
```

---

## Layer 4: Fallback Mechanisms

### 4.1 Unknown Node Handler

```typescript
// lib/domain/export/converters/markdown.ts (updated)

private serializeNode(
  node: JSONContent,
  settings: MarkdownExportSettings,
  depth: number = 0
): string {
  if (!node) return "";

  // Known node types
  switch (node.type) {
    case "doc":
    case "paragraph":
    // ... existing cases

    default:
      // FALLBACK: Unknown node type
      return this.handleUnknownNode(node, settings, depth);
  }
}

/**
 * Fallback handler for unknown node types
 * Preserves content even if schema changes
 */
private handleUnknownNode(
  node: JSONContent,
  settings: MarkdownExportSettings,
  depth: number
): string {
  console.warn(`[Markdown Export] Unknown node type: ${node.type}`);

  // Strategy 1: Try to serialize children
  if (node.content && node.content.length > 0) {
    return node.content
      .map(child => this.serializeNode(child, settings, depth))
      .join("");
  }

  // Strategy 2: Extract text if present
  if (node.text) {
    return node.text;
  }

  // Strategy 3: Preserve as JSON comment (for debugging)
  if (settings.preserveSemantics) {
    return `<!-- unknown-node:${node.type}:${JSON.stringify(node.attrs || {})} -->`;
  }

  return "";
}
```

### 4.2 Graceful Degradation

```typescript
// lib/domain/export/factory.ts (updated)

export async function convertDocument(
  tiptapJson: JSONContent,
  options: ConversionOptions
): Promise<ConversionResult> {
  try {
    const converter = getConverter(options.format);
    return await converter.convert(tiptapJson, options);
  } catch (error) {
    console.error(`[Export] Conversion failed for format ${options.format}:`, error);

    // FALLBACK: Try JSON export (always works)
    if (options.format !== "json") {
      console.warn(`[Export] Falling back to JSON export`);

      const jsonConverter = getConverter("json");
      const result = await jsonConverter.convert(tiptapJson, options);

      return {
        ...result,
        success: false,
        metadata: {
          ...result.metadata,
          warnings: [
            `${options.format} export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            "Exported as JSON instead (lossless format)",
          ],
        },
      };
    }

    // If JSON also fails, return error
    return {
      success: false,
      files: [],
      metadata: {
        conversionTime: 0,
        format: options.format,
        warnings: [
          error instanceof Error ? error.message : "Unknown conversion error",
        ],
      },
    };
  }
}
```

---

## Layer 5: Developer Guardrails

### 5.1 Pre-Commit Hook

```bash
# .husky/pre-commit

#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Check if TipTap extensions were modified
if git diff --cached --name-only | grep -q "lib/domain/editor/extensions"; then
  echo "⚠️  TipTap extensions modified. Checking schema version..."

  # Check if schema-version.ts was also updated
  if ! git diff --cached --name-only | grep -q "lib/domain/editor/schema-version.ts"; then
    echo "❌ ERROR: You modified TipTap extensions but didn't update schema-version.ts"
    echo ""
    echo "Please:"
    echo "  1. Update TIPTAP_SCHEMA_VERSION in lib/domain/editor/schema-version.ts"
    echo "  2. Add entry to SCHEMA_HISTORY documenting your changes"
    echo "  3. Run: pnpm test lib/domain/export/__tests__/schema-compatibility.test.ts"
    echo ""
    exit 1
  fi

  echo "✅ Schema version updated"
fi

# Run export compatibility tests
echo "Running export compatibility tests..."
pnpm test lib/domain/export/__tests__/schema-compatibility.test.ts --run --silent

if [ $? -ne 0 ]; then
  echo "❌ Export compatibility tests failed!"
  echo "Your TipTap changes may have broken export converters."
  exit 1
fi

echo "✅ All checks passed"
```

### 5.2 Developer Checklist

```markdown
# TipTap Extension Modification Checklist

Before modifying TipTap extensions, complete this checklist:

## Pre-Modification
- [ ] Read this entire guide
- [ ] Understand which converters will be affected
- [ ] Check existing schema version (lib/domain/editor/schema-version.ts)
- [ ] Create test document with the extension you're modifying

## During Modification
- [ ] Document schema changes in code comments
- [ ] Update converter serialization logic (if needed)
- [ ] Update schema-version.ts with new entry
- [ ] Increment version (patch for non-breaking, minor for features, major for breaking)

## Post-Modification
- [ ] Run: pnpm test lib/domain/export/__tests__/schema-compatibility.test.ts
- [ ] Export test document to all formats (markdown, html, json)
- [ ] Manually verify exported files look correct
- [ ] Create migration if breaking change
- [ ] Update documentation

## If Adding New Extension
- [ ] Add serialization to MarkdownConverter
- [ ] Add serialization to HTMLConverter
- [ ] Add to schema-compatibility.test.ts
- [ ] Add to supportedNodes list
- [ ] Document in CLAUDE.md
```

### 5.3 Extension Template

```typescript
// lib/domain/editor/extensions/template.ts

/**
 * [Extension Name] TipTap Extension
 *
 * Schema Version: 2.1.0
 * Added: 2026-01-26
 *
 * Export Compatibility:
 * - Markdown: ✅ Fully supported
 * - HTML: ✅ Fully supported
 * - JSON: ✅ Lossless
 * - PDF/DOCX: ⚠️ Limited support
 *
 * Attributes:
 * - myAttr: string (required) - Description
 * - myOtherAttr: number (optional) - Description
 *
 * Markdown Syntax:
 * - Input: `> [!myextension]`
 * - Output: `> [!myextension]`
 *
 * Migration Notes:
 * - None (new extension)
 */

import { Node } from "@tiptap/core";

export const MyExtension = Node.create({
  name: "myExtension",

  // ... implementation

  /**
   * CRITICAL: Update this when schema changes
   */
  renderText({ node }) {
    // Define how this exports to Markdown
    return `[myExtension:${node.attrs.myAttr}]`;
  },
});
```

---

## Maintenance Workflows

### Workflow 1: Adding New Extension

```bash
# 1. Create extension with template
cp lib/domain/editor/extensions/template.ts lib/domain/editor/extensions/my-extension.ts

# 2. Implement extension
# ... edit my-extension.ts

# 3. Add to extensions-client.ts
# Add import and configure

# 4. Add serialization to converters
# Edit: lib/domain/export/converters/markdown.ts
# Edit: lib/domain/export/converters/html.ts

# 5. Update schema version
# Edit: lib/domain/editor/schema-version.ts
# Increment patch version (2.0.0 → 2.0.1)
# Add SCHEMA_HISTORY entry

# 6. Update tests
# Edit: lib/domain/export/__tests__/schema-compatibility.test.ts
# Add test case for new node type

# 7. Run tests
pnpm test lib/domain/export

# 8. Generate regression tests
tsx scripts/generate-export-tests.ts

# 9. Commit with descriptive message
git add .
git commit -m "feat(editor): Add MyExtension node type

- Added MyExtension with myAttr attribute
- Updated schema version to 2.0.1
- Added Markdown/HTML serialization
- No breaking changes"
```

### Workflow 2: Modifying Existing Extension

```bash
# 1. Check current schema version
cat lib/domain/editor/schema-version.ts | grep TIPTAP_SCHEMA_VERSION

# 2. Make changes to extension
# ... edit extension file

# 3. Determine if breaking
# Breaking = Changes existing attribute types or removes attributes
# Non-breaking = Adds new optional attributes

# 4. Update converters if needed
# If breaking: Update serialization logic
# If non-breaking: Add new attribute handling

# 5. Update schema version
# Breaking: Increment major (2.0.0 → 3.0.0)
# Non-breaking: Increment minor (2.0.0 → 2.1.0)

# 6. Create migration if breaking
# Edit: lib/domain/export/migrations.ts
# Add migration function

# 7. Test thoroughly
pnpm test lib/domain/export
tsx scripts/generate-export-tests.ts

# 8. Update docs
# Edit: docs/notes-feature/TIPTAP-SCHEMA-EVOLUTION-GUIDE.md
```

### Workflow 3: Upgrading TipTap Core

```bash
# 1. Check for breaking changes
open https://tiptap.dev/docs/editor/changelog

# 2. Update package
pnpm update @tiptap/core @tiptap/starter-kit

# 3. Run tests to see what breaks
pnpm test

# 4. Fix broken converters
# Update imports, API calls, etc.

# 5. Update schema version
# Increment major if API breaks (2.0.0 → 3.0.0)
# Increment minor if compatible (2.0.0 → 2.1.0)

# 6. Add SCHEMA_HISTORY entry
# Document TipTap upgrade

# 7. Full regression test
pnpm test
tsx scripts/generate-export-tests.ts

# 8. Manual verification
# Export sample documents
# Verify all formats work
```

---

## Monitoring & Alerts

### Dashboard Metrics

Track these metrics in production:

```typescript
// lib/infrastructure/monitoring/export-metrics.ts

export interface ExportMetrics {
  totalExports: number;
  successfulExports: number;
  failedExports: number;
  unknownNodeWarnings: number;
  schemaVersions: Record<string, number>;
  formatBreakdown: Record<ExportFormat, number>;
}

export async function trackExportMetrics(
  format: ExportFormat,
  success: boolean,
  schemaVersion: string,
  warnings: string[]
) {
  // Send to analytics
  await analytics.track("export_attempted", {
    format,
    success,
    schemaVersion,
    unknownNodes: warnings.filter(w => w.includes("Unknown node")).length,
    timestamp: new Date().toISOString(),
  });
}

// Alert if failure rate exceeds threshold
export function checkExportHealth(metrics: ExportMetrics) {
  const failureRate = metrics.failedExports / metrics.totalExports;

  if (failureRate > 0.1) { // 10% threshold
    alertDevTeam({
      severity: "high",
      message: `Export failure rate: ${(failureRate * 100).toFixed(1)}%`,
      details: metrics,
    });
  }
}
```

---

## Emergency Recovery

### If Export System Breaks in Production

```typescript
// lib/domain/export/emergency-fallback.ts

/**
 * Emergency fallback: Export raw TipTap JSON
 *
 * Use this if converters are completely broken
 */
export async function emergencyExport(contentId: string): Promise<Buffer> {
  const content = await prisma.contentNode.findUnique({
    where: { id: contentId },
    include: { notePayload: true },
  });

  if (!content?.notePayload) {
    throw new Error("Content not found");
  }

  // Return raw JSON (always works)
  const json = JSON.stringify(content.notePayload.tiptapJson, null, 2);

  return Buffer.from(json, "utf-8");
}

/**
 * Emergency bulk export
 */
export async function emergencyVaultExport(userId: string): Promise<Buffer> {
  const notes = await prisma.contentNode.findMany({
    where: { ownerId: userId, notePayload: { isNot: null } },
    include: { notePayload: true },
  });

  const zip = new JSZip();

  for (const note of notes) {
    zip.file(
      `${note.slug}.json`,
      JSON.stringify(note.notePayload!.tiptapJson, null, 2)
    );
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}
```

---

## Summary Checklist

### Before Every TipTap Change

- [ ] Read schema evolution guide
- [ ] Check current schema version
- [ ] Plan migration strategy
- [ ] Update schema-version.ts
- [ ] Run compatibility tests

### After Every TipTap Change

- [ ] All tests pass
- [ ] Converters updated
- [ ] Migration created (if breaking)
- [ ] Documentation updated
- [ ] Pre-commit hook passes

### Quarterly Maintenance

- [ ] Review schema history
- [ ] Audit unknown node warnings
- [ ] Check export failure rates
- [ ] Update regression tests
- [ ] Review TipTap changelog
- [ ] Plan TipTap upgrades

---

## Contact & Support

**Questions?**
- See: `EXPORT-BACKUP-ARCHITECTURE.md`
- See: `EXPORT-MARKDOWN-SOLUTION.md`

**Emergency?**
- Use: `emergencyExport()` or `emergencyVaultExport()`
- Exports raw JSON (always works)

**Schema broken?**
- Check: schema-compatibility tests
- Review: SCHEMA_HISTORY
- Create: migration in migrations.ts
