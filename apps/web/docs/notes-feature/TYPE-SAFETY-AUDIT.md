# Type Safety Audit - Document Types

**Date:** January 12, 2026  
**Scope:** Audit of document/content type usage across codebase  
**Goal:** Identify and fix non-type-safe type attributes

## Executive Summary

The codebase is transitioning from v1.0 (`StructuredDocument` with `docType: string`) to v2.0 (`ContentNode` with derived `ContentType`). This audit identifies remaining v1.0 references that need migration.

## Type System Overview

### v1.0 (DEPRECATED)
```typescript
// ❌ OLD: Type stored as string field
interface StructuredDocument {
  docType: string;  // Non-type-safe!
  contentData: Json;  // Untyped payload
}
```

### v2.0 (CURRENT)
```typescript
// ✅ NEW: Type derived from payload presence
type ContentType = "folder" | "note" | "file" | "html" | "template" | "code";

interface ContentNode {
  // No docType field!
  notePayload?: NotePayload;
  filePayload?: FilePayload;
  htmlPayload?: HtmlPayload;
  codePayload?: CodePayload;
}

// Type derived via:
function deriveContentType(content: ContentNodeWithPayloads): ContentType {
  if (content.notePayload) return "note";
  if (content.filePayload) return "file";
  if (content.htmlPayload?.isTemplate) return "template";
  if (content.htmlPayload) return "html";
  if (content.codePayload) return "code";
  return "folder";
}
```

## Findings

### CRITICAL: Non-Type-Safe References

#### 1. lib/db/navigation.ts (NEEDS UPDATE)

**Issue:** Uses old `docType: string` field

**Lines:**
- L25: `docType: string;` in `NavigationDocument` interface
- L143: `docType: doc.docType,` mapping
- L150: `docType: child.docType,` mapping
- L230: `docType: string;` in interface
- L242: `docType: string;` in array type
- L291: `docType: doc.docType,` mapping
- L323: `docType: doc.docType,` mapping

**Impact:** High - this is a core navigation module

**Fix Required:**
```typescript
// Current (v1.0):
export interface NavigationDocument {
  id: string;
  title: string;
  slug: string;
  docType: string;  // ❌ Non-type-safe!
  displayOrder: number;
  children: NavigationDocument[];
}

// Proposed (v2.0):
import type { ContentType } from "@/lib/content/types";

export interface NavigationDocument {
  id: string;
  title: string;
  slug: string;
  contentType: ContentType;  // ✅ Type-safe!
  displayOrder: number;
  children: NavigationDocument[];
  
  // Optional payload summaries for display
  note?: { wordCount: number };
  file?: { fileName: string; uploadStatus: string };
  html?: { isTemplate: boolean };
  code?: { language: string };
}
```

**Migration Strategy:**
1. Update schema references from `StructuredDocument` to `ContentNode`
2. Update `prisma.category.documents` queries to include payloads
3. Derive `contentType` using `deriveContentType()` helper
4. Update all downstream consumers

**Estimated Effort:** 2-4 hours (requires testing navigation UI)

---

### MEDIUM: Documentation References

#### 2. prisma/migrations/20251213233902_init_digital_garden_schema/migration.sql

**Issue:** Contains old schema with `docType` column

**Impact:** Low - historical migration file, cannot be changed

**Action:** No action required (migrations are immutable)

---

#### 3. docs/notes-mvp-testing.md

**Issue:** References old `docType` field in examples

**Lines:** Multiple references to `docType: "Note"`

**Impact:** Low - documentation only

**Fix:** Update examples to show v2.0 payload-based approach

---

#### 4. docs/admin-ui-implementation.md & admin-ui-prompt.md

**Issue:** References old `StructuredDocument` and `docType`

**Impact:** Low - documentation only

**Fix:** Update to reference `ContentNode` and `ContentType`

---

### LOW: Archived/WIP Documents

#### 5. docs/wip-notes-scope.md

**Status:** (unsaved)

**Action:** Verify if still needed, update or delete

---

#### 6. docs/notes-feature/archive/03-database-design-v1.md

**Status:** Archived

**Action:** No action needed (intentionally preserved as historical reference)

---

## Type Safety Checklist

### Database Layer
- [x] Prisma schema uses typed payloads (v2.0)
- [x] Enums defined for `UserRole`, `UploadStatus`, `StorageProvider`
- [ ] ⚠️  Navigation queries use old `docType` field

### Utility Layer
- [x] `lib/content/types.ts` provides type-safe ContentType
- [x] Type guards: `isNote()`, `isFile()`, etc.
- [x] Type derivation: `deriveContentType()`
- [x] Payload validation: `validatePayloads()`

### API Layer
- [ ] TODO: M2 - API routes not yet implemented
- [ ] TODO: Ensure all API responses use `ContentType`, not `docType`

### UI Layer
- [ ] TODO: M4 - File tree component not yet implemented
- [ ] TODO: Ensure tree uses `ContentType` for icons/display
- [ ] ⚠️  Navigation component uses old `docType`

## Recommendations

### Immediate Actions (Before M2)

1. **Update lib/db/navigation.ts**
   - Replace `docType: string` with `contentType: ContentType`
   - Include payloads in queries
   - Use `deriveContentType()` for type derivation
   - Add payload summaries to `NavigationDocument` interface

2. **Create Migration Utility**
   ```typescript
   // lib/content/migrate.ts
   export function migrateNavigationDocument(
     node: ContentNodeWithPayloads
   ): NavigationDocument {
     return {
       id: node.id,
       title: node.title,
       slug: node.slug,
       contentType: deriveContentType(node),
       displayOrder: node.displayOrder,
       children: [],
       // Payload summaries
       note: node.notePayload ? {
         wordCount: node.notePayload.metadata.wordCount || 0
       } : undefined,
       file: node.filePayload ? {
         fileName: node.filePayload.fileName,
         uploadStatus: node.filePayload.uploadStatus
       } : undefined,
       html: node.htmlPayload ? {
         isTemplate: node.htmlPayload.isTemplate
       } : undefined,
       code: node.codePayload ? {
         language: node.codePayload.language
       } : undefined,
     };
   }
   ```

3. **Update Documentation**
   - Update `docs/notes-mvp-testing.md` examples
   - Update `docs/admin-ui-*.md` references

### Long-Term Actions (M2+)

1. **API Consistency**
   - Establish rule: All API responses MUST use `ContentType`, never `docType`
   - Add ESLint rule to prevent `docType` usage
   - Document in API specification

2. **Frontend Type Safety**
   - Generate TypeScript types from API spec (OpenAPI)
   - Use discriminated unions for payload types
   - Enforce strict null checks

3. **Runtime Validation**
   - Add Zod schemas for all API payloads
   - Validate `ContentType` matches payload presence
   - Throw errors on type mismatches

## ESLint Rule Proposal

```typescript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'Identifier[name="docType"]',
        message: 'Use ContentType instead of docType. See TYPE-SAFETY-AUDIT.md',
      },
    ],
  },
};
```

## Testing Strategy

### Unit Tests
```typescript
describe('ContentType derivation', () => {
  it('derives "note" from NotePayload presence', () => {
    const content = { notePayload: {} };
    expect(deriveContentType(content)).toBe('note');
  });
  
  it('throws on multiple payloads', () => {
    const content = { notePayload: {}, filePayload: {} };
    expect(() => validatePayloads(content)).toThrow();
  });
});
```

### Integration Tests
```typescript
describe('Navigation API', () => {
  it('returns contentType not docType', async () => {
    const nav = await getNavigationTree({ userId: 'test' });
    expect(nav.categories[0].documents[0]).toHaveProperty('contentType');
    expect(nav.categories[0].documents[0]).not.toHaveProperty('docType');
  });
});
```

## Conclusion

**Status:** Mostly type-safe, one critical issue identified

**Blocking:** `lib/db/navigation.ts` must be updated before M2 API implementation

**Effort:** ~4 hours to fix navigation + update docs

**Next Steps:**
1. Fix `lib/db/navigation.ts` (assign to M2)
2. Add ESLint rule to prevent `docType` usage
3. Update documentation examples
4. Add unit tests for type derivation

---

**Reviewed By:** AI Assistant  
**Approved By:** Pending review  
**Target Completion:** Before M2 API implementation

