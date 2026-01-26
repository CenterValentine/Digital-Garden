# Duplication Risk Analysis

**Date:** 2026-01-22
**Status:** Active Analysis
**Risk Level:** Medium (with mitigations in place)

## Executive Summary

The Digital Garden Notes application has **multiple layers of deduplication protection**, but there are **edge cases** that can lead to duplicate content creation. This document analyzes all duplication vectors, existing protections, and recommendations.

**Overall Risk:** Medium-Low with current protections, but race conditions exist.

---

## Duplication Vectors

### 1. Slug Collision (Your Error)

**Risk Level:** 🟡 Medium
**Current Status:** **VULNERABLE to race conditions**

#### The Problem

```
Error: Unique constraint failed on the fields: (`slug`)
```

**What Happened:**
- You dropped a file (e.g., "Transcript.pdf") into the sidebar
- The system started creating a ContentNode with slug "transcript"
- Before it completed, you (or the system) tried to upload the same/another file with the same name
- Both requests called `generateUniqueSlug()` at nearly the same time
- Both got the same slug ("transcript")
- Second request failed when trying to insert into database

#### Database Constraint

```prisma
model ContentNode {
  slug String @unique @db.VarChar(255)  // ❌ Globally unique (not per-user!)
}
```

**Critical Issue:** Slugs are **globally unique across ALL users**, not just per-user. This means:
- User A creates "my-note" → slug = "my-note"
- User B tries to create "my-note" → ❌ FAILS (slug already exists)

**This is a MAJOR design flaw** for a multi-user application!

#### Current Protection

`generateUniqueSlug()` in `/lib/content/slug.ts`:

```typescript
export async function generateUniqueSlug(
  title: string,
  ownerId: string,
  excludeId?: string
): Promise<string> {
  const baseSlug = generateSlug(title);

  // Check if base slug is available
  const existing = await prisma.contentNode.findFirst({
    where: {
      slug: baseSlug,
      ownerId,  // ✅ Checks within user's content
      id: excludeId ? { not: excludeId } : undefined,
    },
  });

  if (!existing) {
    return baseSlug;
  }

  // Add numeric suffix: my-note-2, my-note-3, etc.
  let suffix = 2;
  let candidateSlug = `${baseSlug}-${suffix}`;

  while (true) {
    const exists = await prisma.contentNode.findFirst({
      where: { slug: candidateSlug, ownerId },
    });

    if (!exists) {
      return candidateSlug;
    }

    suffix++;
    // ... safety limit at 1000
  }
}
```

**The Race Condition:**
1. Request A checks: "transcript" → not found → returns "transcript"
2. Request B checks: "transcript" → not found → returns "transcript" (before A inserts)
3. Request A inserts ContentNode with slug="transcript" → ✅ Success
4. Request B tries to insert ContentNode with slug="transcript" → ❌ UNIQUE CONSTRAINT ERROR

This is a classic **Time-of-Check to Time-of-Use (TOCTOU)** race condition.

#### Impact

- **User Experience:** Upload fails with cryptic database error
- **Data Loss:** File successfully uploaded to storage, but ContentNode creation fails (orphaned file in storage)
- **Frequency:** Happens when:
  - User drag-drops same file multiple times quickly
  - User clicks upload button multiple times (double-click)
  - Multiple browser tabs uploading simultaneously
  - High-traffic scenarios with many users

#### Recommendations

**Option 1: Make slugs per-user (RECOMMENDED)**
```prisma
model ContentNode {
  slug String @db.VarChar(255)

  @@unique([ownerId, slug])  // Unique per user, not globally
}
```

**Option 2: Use UUIDs in slugs**
```typescript
const slug = `${baseSlug}-${crypto.randomUUID().substring(0, 8)}`;
// Result: "transcript-a3f9b2c1"
```

**Option 3: Atomic upsert with retry**
```typescript
// Try to create, if fails due to unique constraint, retry with suffix
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const content = await prisma.contentNode.create({ ... });
    return content;
  } catch (error) {
    if (error.code === 'P2002' && attempt < 3) {
      slug = `${baseSlug}-${Date.now()}`;  // Add timestamp
      continue;
    }
    throw error;
  }
}
```

---

### 2. File Content Deduplication

**Risk Level:** 🟢 Low
**Current Status:** **PROTECTED** (with gaps)

#### Current Protection

In `/app/api/notes/content/upload/initiate/route.ts`:

```typescript
// Check for duplicate file (by checksum + size)
if (checksum) {
  const duplicate = await prisma.filePayload.findFirst({
    where: {
      checksum,
      fileSize: BigInt(fileSize),
      content: {
        ownerId: session.user.id,  // ✅ Only within user's files
      },
      uploadStatus: "ready",  // ⚠️ Only checks completed uploads
    },
    include: {
      content: true,
    },
  });

  if (duplicate) {
    return NextResponse.json({
      success: true,
      data: {
        isDuplicate: true,
        existingContentId: duplicate.contentId,
        message: "File already exists. Reference the existing file.",
      },
    });
  }
}
```

#### Database Schema

```prisma
model FilePayload {
  checksum String @db.VarChar(64)  // SHA-256 hash
  fileSize BigInt

  @@index([checksum, fileSize])  // ✅ Indexed for fast lookup
}
```

#### Gaps

1. **Checksum is optional**: If client doesn't send checksum, no deduplication happens
2. **Only checks "ready" files**: Files in "uploading" state are ignored
   ```typescript
   uploadStatus: "ready",  // ⚠️ Gap: misses in-progress uploads
   ```
3. **No cross-user deduplication**: Same file uploaded by 2 users = 2 storage copies
   - This is intentional for data isolation, but wastes storage

#### Scenarios

✅ **Protected:**
- User uploads `document.pdf` twice (sequentially)
  - Second upload: "File already exists. Reference the existing file."
- User uploads same file with different name
  - Detected by checksum, not filename

⚠️ **Vulnerable:**
- User uploads `file.pdf`, then immediately uploads it again before first completes
  - First is "uploading", second proceeds → 2 copies created
- User uploads without checksum (malicious client or network error)
  - No deduplication possible

#### Recommendations

1. **Include "uploading" status in duplicate check**
   ```typescript
   uploadStatus: { in: ["uploading", "ready"] },  // Check both
   ```

2. **Calculate checksum server-side** if client doesn't provide it
   ```typescript
   if (!checksum) {
     checksum = await calculateFileChecksum(file);
   }
   ```

3. **Global deduplication table** (advanced)
   ```prisma
   model GlobalFileRegistry {
     checksum     String  @id @db.VarChar(64)
     fileSize     BigInt
     storageKey   String  @unique
     referenceCount Int   @default(1)

     files FilePayload[]
   }
   ```
   - Single storage copy, multiple references
   - Requires reference counting for cleanup

---

### 3. Folder/Note Name Collisions

**Risk Level:** 🟢 Low
**Current Status:** **PROTECTED** (via slug auto-increment)

#### Current Protection

When creating a note/folder via `/api/notes/content` POST:

```typescript
// In the create handler
const slug = await generateUniqueSlug(title, session.user.id);

const content = await prisma.contentNode.create({
  data: {
    title: "My Note",
    slug,  // Automatically gets "-2", "-3" suffix if needed
    ...
  },
});
```

#### Behavior

- User creates "Project Ideas" → slug = "project-ideas"
- User creates another "Project Ideas" → slug = "project-ideas-2"
- User creates another "Project Ideas" → slug = "project-ideas-3"

✅ No collisions, but **same race condition as file uploads**

---

### 4. Tag Duplication

**Risk Level:** 🟢 Low
**Current Status:** **PROTECTED** (database constraint)

#### Database Constraint

```prisma
model Tag {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @db.Uuid
  name      String   @db.VarChar(50)
  slug      String   @db.VarChar(50)

  @@unique([userId, slug])  // ✅ Per-user unique tags
}
```

#### API Protection

In `/app/api/notes/tags/route.ts`:

```typescript
// Check if tag already exists
const existingTag = await prisma.tag.findFirst({
  where: {
    userId: session.user.id,
    slug: tagSlug,
  },
});

if (existingTag) {
  return NextResponse.json({
    success: true,
    data: existingTag,  // Return existing tag, don't create duplicate
  });
}
```

✅ **Properly protected** - tags have per-user uniqueness

---

### 5. Storage Key Collisions

**Risk Level:** 🟢 Very Low
**Current Status:** **PROTECTED** (UUID-based keys)

#### Current Implementation

```typescript
// In initiate/route.ts
const fileExtension = fileName.split(".").pop() || "";
const uniqueId = crypto.randomUUID();
const storageKey = `uploads/${session.user.id}/${uniqueId}.${fileExtension}`;
// Example: "uploads/user-123/a7f3c9d1-8b4e-4f2a-9c1d-5e6f7a8b9c0d.pdf"
```

✅ **Extremely low risk** - UUIDs have 2^122 possible values (virtually impossible to collide)

---

### 6. Content Link Duplication

**Risk Level:** 🟢 Low
**Current Status:** **PROTECTED** (database constraint)

```prisma
model ContentLink {
  sourceId  String  @db.Uuid
  targetId  String  @db.Uuid
  linkType  String  @db.VarChar(20)

  @@unique([sourceId, targetId, linkType])  // ✅ Can't create same link twice
}
```

---

### 7. Content Tag Assignment Duplication

**Risk Level:** 🟢 Low
**Current Status:** **PROTECTED** (database constraint)

```prisma
model ContentTag {
  contentId String  @db.Uuid
  tagId     String  @db.Uuid

  @@unique([contentId, tagId])  // ✅ Can't assign same tag twice to same content
}
```

---

## Summary Matrix

| Duplication Type | Risk Level | Protected? | Race Condition? | Recommendation |
|-----------------|------------|------------|-----------------|----------------|
| **Slug collision** | 🟡 Medium | Partial | ✅ Yes | Fix race condition + make per-user |
| **File content (checksum)** | 🟢 Low | Yes | ⚠️ Small gap | Include "uploading" status |
| **Folder/Note names** | 🟢 Low | Yes | ✅ Yes (same as slugs) | Fix with slugs |
| **Tags** | 🟢 Low | ✅ Strong | No | Good |
| **Storage keys** | 🟢 Very Low | ✅ Strong | No | Good |
| **Content links** | 🟢 Low | ✅ Strong | No | Good |
| **Content-tag assignments** | 🟢 Low | ✅ Strong | No | Good |

---

## Recommended Fixes

### Priority 1: Fix Slug Uniqueness (HIGH)

**Problem:** Slugs are globally unique, should be per-user

**Fix:** Update Prisma schema

```prisma
model ContentNode {
  id       String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerId  String  @db.Uuid
  slug     String  @db.VarChar(255)  // Remove @unique

  // ... other fields

  @@unique([ownerId, slug])  // Add composite unique constraint
  @@index([ownerId, deletedAt])
  @@index([parentId, displayOrder])
}
```

**Migration:**

```bash
cd apps/web
npx prisma migrate dev --name fix_slug_uniqueness_per_user
```

**Impact:**
- ✅ Allows different users to have same slug
- ✅ Fixes your duplicate upload error
- ⚠️ Requires URL routing changes if using slug-only URLs

### Priority 2: Handle Race Conditions (HIGH)

**Problem:** TOCTOU race condition in slug generation

**Fix:** Add retry logic with error handling

```typescript
// In upload/initiate/route.ts and content/route.ts
async function createContentWithRetry(data: any, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const content = await prisma.contentNode.create({ data });
      return content;
    } catch (error: any) {
      // Check if it's a unique constraint error on slug
      if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
        if (attempt < maxAttempts) {
          // Regenerate slug with timestamp suffix
          const timestamp = Date.now();
          data.slug = `${data.slug}-${timestamp}`;
          console.log(`[Retry ${attempt}] Slug collision, retrying with: ${data.slug}`);
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error('Failed to create content after retries');
}
```

### Priority 3: Improve File Deduplication (MEDIUM)

**Fix:** Include "uploading" status in duplicate check

```typescript
// In upload/initiate/route.ts
const duplicate = await prisma.filePayload.findFirst({
  where: {
    checksum,
    fileSize: BigInt(fileSize),
    content: {
      ownerId: session.user.id,
    },
    uploadStatus: { in: ["uploading", "ready"] },  // ✅ Check both statuses
  },
});
```

### Priority 4: Add Client-Side Debouncing (LOW)

**Fix:** Prevent rapid duplicate requests from UI

```typescript
// In FileUploadDialog.tsx
const uploadWithDebounce = useMemo(
  () => debounce(uploadSingleFile, 300),  // 300ms debounce
  []
);
```

---

## Testing Recommendations

### Test Case 1: Rapid Duplicate Uploads

```bash
# Test script
for i in {1..5}; do
  curl -X POST /api/notes/content/upload/initiate \
    -H "Content-Type: application/json" \
    -d '{"fileName":"test.pdf","fileSize":1024,"mimeType":"application/pdf"}' &
done
wait
```

**Expected:** All 5 should succeed with different slugs (test-2, test-3, etc.)
**Current:** May fail with unique constraint errors

### Test Case 2: Cross-User Same Filename

```typescript
// User A uploads "report.pdf"
// User B uploads "report.pdf"
// Expected: Both succeed with slug="report" (after fix)
// Current: User B fails (global slug uniqueness)
```

### Test Case 3: Interrupted Upload Retry

```typescript
// 1. Start upload, interrupt halfway (uploadStatus="uploading")
// 2. Retry same file
// Expected: Detect duplicate by checksum, even if first is "uploading"
// Current: Creates second ContentNode (gap in deduplication)
```

---

## Monitoring Recommendations

Add metrics to track:

1. **Unique constraint failures**
   ```typescript
   if (error.code === 'P2002') {
     metrics.increment('content.slug_collision', { field: error.meta.target });
   }
   ```

2. **Duplicate file detections**
   ```typescript
   if (duplicate) {
     metrics.increment('file.duplicate_detected');
   }
   ```

3. **Upload retry attempts**
   ```typescript
   metrics.histogram('upload.retry_attempts', attempt);
   ```

---

## Conclusion

**Current State:**
- ✅ Strong protections for tags, links, and storage keys
- ⚠️ Race condition vulnerability in slug generation
- 🔴 **Critical:** Slugs are globally unique (should be per-user)
- ⚠️ Small gap in file deduplication for in-progress uploads

**Action Items:**
1. **Immediate:** Fix slug uniqueness to be per-user (database migration)
2. **High Priority:** Add retry logic for race conditions
3. **Medium Priority:** Improve file deduplication to include "uploading" status
4. **Low Priority:** Add client-side debouncing

**Overall Risk:** Can be reduced from **Medium** to **Low** with recommended fixes.
