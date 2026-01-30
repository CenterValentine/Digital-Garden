/**
 * TipTap Schema Version Registry
 *
 * CRITICAL: Update this file whenever you modify TipTap schema
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CONVENTIONAL VERSIONING RULES (Semantic Versioning)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Format: MAJOR.MINOR.PATCH
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ MAJOR (X.0.0) - BREAKING CHANGES                                        │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ • Removes an extension                                                  │
 * │ • Renames node/mark types (e.g., internalLink → wikiLink)              │
 * │ • Changes required attribute types (e.g., level: string → number)      │
 * │ • Removes required attributes                                           │
 * │ • Changes node content rules                                            │
 * │ • TipTap core upgrade with breaking API changes                        │
 * │                                                                         │
 * │ ⚠️  Old exports CANNOT be imported without migration                    │
 * │ ⚠️  You MUST create migration in lib/domain/export/migrations.ts        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ MINOR (0.X.0) - NEW FEATURES (Backward Compatible)                     │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ • Adds new extension                                                    │
 * │ • Adds new node/mark type                                               │
 * │ • Adds optional attributes                                              │
 * │ • Adds new marks to existing nodes                                      │
 * │ • TipTap core upgrade without breaking changes                          │
 * │                                                                         │
 * │ ✅ Old exports CAN still be imported (just don't have new features)     │
 * │ ✅ No migration required                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ PATCH (0.0.X) - BUG FIXES (No Schema Changes)                          │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ • Fixes converter serialization bugs                                    │
 * │ • Improves export quality (no schema change)                            │
 * │ • Performance improvements                                              │
 * │ • Documentation updates                                                 │
 * │                                                                         │
 * │ ✅ Old exports work exactly the same                                     │
 * │ ✅ No migration required                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MAJOR (Breaking):
 *   ❌ Rename node type: "internalLink" → "wikiLink"     (1.0.0 → 2.0.0)
 *   ❌ Remove extension: Delete callout                    (1.0.0 → 2.0.0)
 *   ❌ Change attr type: level: string → number           (1.0.0 → 2.0.0)
 *
 * MINOR (New Features):
 *   ✅ Add extension: New highlight mark                   (1.0.0 → 1.1.0)
 *   ✅ Add attribute: color?: string (optional)            (1.0.0 → 1.1.0)
 *   ✅ TipTap upgrade: 3.10.0 → 3.15.0 (compatible)        (1.0.0 → 1.1.0)
 *
 * PATCH (Bug Fixes):
 *   ✅ Fix bug: Callout exports with wrong syntax          (1.0.0 → 1.0.1)
 *   ✅ Optimize: Faster HTML conversion                    (1.0.0 → 1.0.1)
 *   ✅ Fix metadata: Tags missing color                    (1.0.0 → 1.0.1)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UPDATE CHECKLIST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * [ ] 1. Update TIPTAP_SCHEMA_VERSION below
 * [ ] 2. Add entry to SCHEMA_HISTORY array
 * [ ] 3. Update converters (if schema changed)
 * [ ] 4. Create migration (if MAJOR bump)
 * [ ] 5. Run tests: pnpm test lib/domain/export
 * [ ] 6. Update getCurrentSchemaSnapshot() if needed
 *
 * See: docs/notes-feature/TIPTAP-SCHEMA-EVOLUTION-GUIDE.md
 */

export const TIPTAP_SCHEMA_VERSION = "1.0.0";

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
  migrationsAvailable: string[];
}

/**
 * Complete history of schema changes
 *
 * When adding a new version:
 * 1. Add entry to SCHEMA_HISTORY
 * 2. Update TIPTAP_SCHEMA_VERSION above
 * 3. Create migration if breaking change
 * 4. Run tests: pnpm test lib/domain/export
 */
export const SCHEMA_HISTORY: SchemaVersion[] = [
  {
    version: "1.0.0",
    date: "2026-01-26",
    changes: [
      {
        type: "add",
        target: "node",
        name: "wikiLink",
        description: "Obsidian-style [[links]] with target and display text",
        breaking: false,
        migrationsAvailable: [],
      },
      {
        type: "add",
        target: "node",
        name: "tag",
        description: "#tag nodes with ID, color, and metadata",
        breaking: false,
        migrationsAvailable: [],
      },
      {
        type: "add",
        target: "node",
        name: "callout",
        description: "Obsidian-style callouts with type and title",
        breaking: false,
        migrationsAvailable: [],
      },
      {
        type: "add",
        target: "extension",
        name: "TaskList",
        description: "Task list with checkboxes",
        breaking: false,
        migrationsAvailable: [],
      },
      {
        type: "add",
        target: "extension",
        name: "Table",
        description: "Basic table support",
        breaking: false,
        migrationsAvailable: [],
      },
      {
        type: "upgrade",
        target: "core",
        name: "@tiptap/core",
        description: "TipTap v3.15.3",
        breaking: false,
        migrationsAvailable: [],
      },
    ],
    migrationsRequired: false,
  },
  // Add new versions here...
  // Example:
  // {
  //   version: "2.0.0",
  //   date: "2026-02-01",
  //   changes: [
  //     {
  //       type: "modify",
  //       target: "node",
  //       name: "wikiLink",
  //       description: "Added 'resolved' boolean attribute",
  //       breaking: false,
  //       migrationsAvailable: [],
  //     },
  //   ],
  //   migrationsRequired: false,
  // },
];

/**
 * Get current schema version
 */
export function getCurrentSchemaVersion(): string {
  return TIPTAP_SCHEMA_VERSION;
}

/**
 * Check if a schema version is compatible with current version
 *
 * Compatible = Same major version
 * Incompatible = Different major version (breaking changes)
 */
export function isCompatibleVersion(version: string): boolean {
  const [currentMajor] = TIPTAP_SCHEMA_VERSION.split(".").map(Number);
  const [targetMajor] = version.split(".").map(Number);

  return currentMajor === targetMajor;
}

/**
 * Get required migrations for upgrading from old version to current
 *
 * Returns only breaking changes that require migration
 */
export function getRequiredMigrations(fromVersion: string): SchemaChange[] {
  const changes: SchemaChange[] = [];

  for (const historyEntry of SCHEMA_HISTORY) {
    if (compareVersions(historyEntry.version, fromVersion) > 0) {
      changes.push(...historyEntry.changes.filter(c => c.breaking));
    }
  }

  return changes;
}

/**
 * Get all changes between two versions
 */
export function getChangesBetween(
  fromVersion: string,
  toVersion: string
): SchemaChange[] {
  const changes: SchemaChange[] = [];

  for (const historyEntry of SCHEMA_HISTORY) {
    if (
      compareVersions(historyEntry.version, fromVersion) > 0 &&
      compareVersions(historyEntry.version, toVersion) <= 0
    ) {
      changes.push(...historyEntry.changes);
    }
  }

  return changes;
}

/**
 * Compare semantic versions
 *
 * Returns:
 * - Positive number if v1 > v2
 * - Negative number if v1 < v2
 * - Zero if v1 === v2
 */
function compareVersions(v1: string, v2: string): number {
  const [major1, minor1, patch1] = v1.split(".").map(Number);
  const [major2, minor2, patch2] = v2.split(".").map(Number);

  if (major1 !== major2) return major1 - major2;
  if (minor1 !== minor2) return minor1 - minor2;
  return patch1 - patch2;
}

/**
 * Get schema snapshot for current version
 *
 * Lists all supported node types, marks, and extensions
 */
export function getCurrentSchemaSnapshot() {
  return {
    version: TIPTAP_SCHEMA_VERSION,
    nodes: [
      // StarterKit nodes
      "doc",
      "paragraph",
      "text",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "codeBlock",
      "blockquote",
      "horizontalRule",
      "hardBreak",

      // Table nodes
      "table",
      "tableRow",
      "tableCell",
      "tableHeader",

      // Task list nodes
      "taskList",
      "taskItem",

      // Custom nodes
      "wikiLink",
      "tag",
      "callout",
    ],
    marks: [
      // StarterKit marks
      "bold",
      "italic",
      "strike",
      "code",
      "link",
    ],
    extensions: [
      "StarterKit",
      "CodeBlockLowlight",
      "Placeholder",
      "TaskList",
      "TaskItem",
      "Link",
      "Table",
      "CharacterCount",
      "WikiLink",
      "Tag",
      "Callout",
    ],
  };
}
