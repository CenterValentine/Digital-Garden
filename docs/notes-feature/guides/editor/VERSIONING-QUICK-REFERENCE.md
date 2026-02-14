# TipTap Schema Versioning - Quick Reference Card

**Last Updated:** 2026-01-27
**Current Version:** 1.0.0

---

## Version Bump Decision Matrix

| Change | Bump | Migration | Example |
|--------|------|-----------|---------|
| Remove extension | **MAJOR** | ✅ Yes | Delete callout (1.0.0 → 2.0.0) |
| Rename node/mark | **MAJOR** | ✅ Yes | internalLink → wikiLink (1.0.0 → 2.0.0) |
| Change attr type | **MAJOR** | ✅ Yes | level: string → number (1.0.0 → 2.0.0) |
| Remove required attr | **MAJOR** | ✅ Yes | Remove displayText (1.0.0 → 2.0.0) |
| TipTap breaking upgrade | **MAJOR** | ✅ Yes | TipTap v3 → v4 (1.0.0 → 2.0.0) |
| Add new extension | **MINOR** | ❌ No | Add highlight mark (1.0.0 → 1.1.0) |
| Add optional attr | **MINOR** | ❌ No | Add color?: string (1.0.0 → 1.1.0) |
| TipTap compatible upgrade | **MINOR** | ❌ No | TipTap 3.10 → 3.15 (1.0.0 → 1.1.0) |
| Fix converter bug | **PATCH** | ❌ No | Fix syntax (1.0.0 → 1.0.1) |
| Performance fix | **PATCH** | ❌ No | Faster export (1.0.0 → 1.0.1) |

---

## 5-Second Decision Tree

```
1. Did the schema change?
   NO  → No bump (just code refactoring)
   YES → Continue to 2

2. Will old exports break?
   YES → MAJOR bump (X.0.0) + create migration
   NO  → Continue to 3

3. Is it a new feature?
   YES → MINOR bump (0.X.0)
   NO  → PATCH bump (0.0.X)
```

---

## Update Workflow

### Step 1: Modify TipTap Schema
```bash
# Edit extension file
vim lib/domain/editor/extensions/my-extension.ts
```

### Step 2: Update Version
```typescript
// lib/domain/editor/schema-version.ts

export const TIPTAP_SCHEMA_VERSION = "1.1.0"; // ← Bump version

export const SCHEMA_HISTORY: SchemaVersion[] = [
  // ... existing versions
  {
    version: "1.1.0", // ← Add new entry
    date: "2026-01-27",
    changes: [
      {
        type: "add",
        target: "mark",
        name: "highlight",
        description: "Text highlighting",
        breaking: false, // ← Set to true if MAJOR bump
        migrationsAvailable: [],
      },
    ],
    migrationsRequired: false, // ← Set to true if MAJOR bump
  },
];
```

### Step 3: Update Converters
```typescript
// lib/domain/export/converters/markdown.ts

if (mark.type === "highlight") {
  text = `==${text}==`;
}

// lib/domain/export/converters/html.ts

if (mark.type === "highlight") {
  return `<mark>${content}</mark>`;
}
```

### Step 4: Create Migration (MAJOR only)
```typescript
// lib/domain/export/migrations.ts

export const MIGRATIONS: SchemaMigration[] = [
  {
    fromVersion: "1.0.0",
    toVersion: "2.0.0",
    description: "Renamed 'internalLink' to 'wikiLink'",

    migrateTiptapJSON(json) {
      // Transform old schema to new
    },

    migrateMetadata(metadata) {
      // Update metadata
    },
  },
];
```

### Step 5: Run Tests
```bash
pnpm test lib/domain/export/__tests__/schema-compatibility.test.ts
```

### Step 6: Commit
```bash
git add .
git commit -m "feat: Add highlight extension (v1.1.0)"

# Pre-commit hook will:
# - Verify schema-version.ts was updated
# - Run compatibility tests
# - Block commit if tests fail
```

---

## Common Mistakes to Avoid

| ❌ Don't Do This | ✅ Do This Instead |
|-----------------|-------------------|
| Forget to update schema-version.ts | Pre-commit hook will catch it |
| Use PATCH for new features | Use MINOR (0.X.0) |
| Use MINOR for breaking changes | Use MAJOR (X.0.0) + migration |
| Skip creating migration | MAJOR bumps require migrations |
| Change default values (breaking) | Use MAJOR, not PATCH |

---

## File Locations

```
lib/domain/editor/
├── schema-version.ts          ← Update version here
└── extensions/
    └── your-extension.ts      ← Add extensions here

lib/domain/export/
├── converters/
│   ├── markdown.ts            ← Add Markdown serialization
│   └── html.ts                ← Add HTML serialization
└── migrations.ts              ← Add migrations (if breaking)

docs/notes-feature/
└── TIPTAP-SCHEMA-EVOLUTION-GUIDE.md  ← Full documentation
```

---

## Import Compatibility

| Export Version | Import Version | Result |
|---------------|---------------|--------|
| 1.0.0 | 1.0.0 | ✅ Perfect match |
| 1.0.0 | 1.5.0 | ✅ Works (forward compatible) |
| 1.5.0 | 1.0.0 | ⚠️ Warnings (new features ignored) |
| 1.x.x | 2.x.x | ❌ Incompatible (migration needed) |
| 2.x.x | 1.x.x | ❌ Incompatible (can't downgrade) |

---

## Edge Cases

### Multiple Changes in One Commit
```typescript
// If ANY change is breaking → Use MAJOR
Add highlight (MINOR) + rename node (MAJOR) = MAJOR bump (2.0.0)
```

### Deprecation Path
```typescript
// Phase 1: Add deprecation warning
Version: 1.5.0 → 1.6.0 (MINOR)
Changes: internalLink still works but warns

// Phase 2: Remove deprecated feature
Version: 1.6.0 → 2.0.0 (MAJOR)
Changes: Only wikiLink works
```

### Attribute Defaults
```typescript
// Add default to optional attr → PATCH
color?: string → color?: string = "#000000"  (1.0.0 → 1.0.1)

// Change existing default → MAJOR (changes behavior!)
color = "#000" → color = "#fff"  (1.0.0 → 2.0.0)
```

---

## Emergency Procedures

### If You Bump Version Wrong

```bash
# 1. Revert the version change
git revert HEAD

# 2. Fix the version bump
vim lib/domain/editor/schema-version.ts

# 3. Re-commit with correct version
git commit -m "fix: Correct version bump to X.Y.Z"
```

### If Pre-Commit Hook Blocks You

```bash
# 1. Check what's wrong
cat .git/hooks/pre-commit

# 2. Fix the issue
# - Update schema-version.ts if you changed extensions
# - Fix failing tests

# 3. Try committing again
git commit -m "..."

# 4. Emergency bypass (use sparingly!)
git commit --no-verify
```

### If Export System Breaks

```typescript
// Emergency fallback: Export as JSON (always works)
import { emergencyExport } from '@/lib/domain/export/emergency-fallback';
const buffer = await emergencyExport(contentId);
```

---

## Help Resources

- **Full Guide:** `docs/notes-feature/TIPTAP-SCHEMA-EVOLUTION-GUIDE.md`
- **Examples:** `docs/notes-feature/TIPTAP-EXTENSION-EXAMPLE.md`
- **Summary:** `docs/notes-feature/SCHEMA-EVOLUTION-SUMMARY.md`
- **Code:** `lib/domain/editor/schema-version.ts`

---

## Version History Template

```typescript
{
  version: "X.Y.Z",
  date: "YYYY-MM-DD",
  changes: [
    {
      type: "add" | "modify" | "remove" | "upgrade",
      target: "node" | "mark" | "extension" | "core",
      name: "extensionName",
      description: "What changed",
      breaking: true | false,
      migrationsAvailable: ["migrationName"],
    },
  ],
  migrationsRequired: true | false,
}
```

---

**Print this page and keep it handy!** 📄

**Pre-commit hook will enforce these rules automatically.** 🛡️
