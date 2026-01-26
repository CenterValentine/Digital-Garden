# M6 Tags: Database Migration Plan

**Created:** January 20, 2026
**Status:** Ready to Execute
**Type:** Schema Update (Fresh Reset)

---

## Overview

This migration updates the Tag and ContentTag tables to support:
1. **Per-user tags** (privacy/isolation via `userId`)
2. **Tag position tracking** (jump-to-tag-in-document via `positions` JSON)
3. **Auto-delete with confirmation** (remove tag text from documents)

---

## Schema Changes

### Current Schema (Before)

```prisma
model Tag {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String       @unique @db.VarChar(50)  // ← Global unique
  slug          String       @unique @db.VarChar(50)  // ← Global unique
  createdAt     DateTime     @default(now()) @db.Timestamptz()

  contentTags   ContentTag[]

  @@index([name])
}

model ContentTag {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId   String      @db.Uuid
  tagId       String      @db.Uuid
  createdAt   DateTime    @default(now()) @db.Timestamptz()  // ← No positions

  content     ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  tag         Tag         @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([contentId, tagId])
  @@index([tagId])
}
```

### New Schema (After)

```prisma
model Tag {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String       @db.Uuid  // ← NEW: Owner of tag
  name          String       @db.VarChar(50)  // ← No longer globally unique
  slug          String       @db.VarChar(50)  // ← No longer globally unique
  createdAt     DateTime     @default(now()) @db.Timestamptz()

  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  contentTags   ContentTag[]

  @@unique([userId, slug])  // ← NEW: Per-user uniqueness
  @@index([userId, name])   // ← NEW: Index for autocomplete
}

model ContentTag {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId   String      @db.Uuid
  tagId       String      @db.Uuid
  positions   Json        @default("[]") @db.JsonB  // ← NEW: Tag positions array
  createdAt   DateTime    @default(now()) @db.Timestamptz()

  content     ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  tag         Tag         @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([contentId, tagId])
  @@index([tagId])
}
```

**Positions JSON Format:**
```json
[
  { "offset": 120, "context": "This is about #react hooks" },
  { "offset": 450, "context": "Learn #react basics" },
  { "offset": 890, "context": "#react ecosystem" }
]
```

---

## Migration Strategy: Fresh Reset

**Since database is new, reset is cleanest approach.**

### Step 1: Update Prisma Schema

**File:** `apps/web/prisma/schema.prisma`

Update the `Tag` model:

```prisma
model Tag {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String       @db.Uuid
  name          String       @db.VarChar(50)
  slug          String       @db.VarChar(50)
  createdAt     DateTime     @default(now()) @db.Timestamptz()

  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  contentTags   ContentTag[]

  @@unique([userId, slug])
  @@index([userId, name])
}
```

Update the `ContentTag` model:

```prisma
model ContentTag {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId   String      @db.Uuid
  tagId       String      @db.Uuid
  positions   Json        @default("[]") @db.JsonB
  createdAt   DateTime    @default(now()) @db.Timestamptz()

  content     ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  tag         Tag         @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([contentId, tagId])
  @@index([tagId])
}
```

Update the `User` model (add Tag relation):

```prisma
model User {
  // ... existing fields

  tags          Tag[]  // ← NEW: User's tags relation

  // ... rest of fields
}
```

### Step 2: Create Migration

**Since this is a breaking change, use reset:**

```bash
cd apps/web

# Reset database (drops all tables and recreates)
npx prisma migrate reset --force

# This will:
# 1. Drop the database
# 2. Create new database
# 3. Apply all migrations
# 4. Run seed script (prisma/seed.ts)
```

**Alternatively, create named migration:**

```bash
npx prisma migrate dev --name add_user_tags_and_positions

# This will:
# 1. Create migration file
# 2. Apply migration
# 3. Regenerate Prisma client
```

### Step 3: Update Seed Script

**File:** `apps/web/prisma/seed.ts`

Add sample tags for test user:

```typescript
// After creating test user
const user = await prisma.user.upsert({
  where: { email: "admin@example.com" },
  update: {},
  create: {
    email: "admin@example.com",
    name: "Admin User",
    // ... other fields
  },
});

// Create sample tags
const reactTag = await prisma.tag.create({
  data: {
    userId: user.id,
    name: "react",
    slug: "react",
  },
});

const typescriptTag = await prisma.tag.create({
  data: {
    userId: user.id,
    name: "typescript",
    slug: "typescript",
  },
});

const webdevTag = await prisma.tag.create({
  data: {
    userId: user.id,
    name: "web-dev",
    slug: "web-dev",
  },
});

// Apply tags to welcome note with positions
const welcomeNote = await prisma.contentNode.findFirst({
  where: { title: "Welcome to Digital Garden" },
});

if (welcomeNote) {
  await prisma.contentTag.create({
    data: {
      contentId: welcomeNote.id,
      tagId: reactTag.id,
      positions: [
        { offset: 120, context: "Learn #react basics" },
        { offset: 450, context: "#react ecosystem" },
      ],
    },
  });

  await prisma.contentTag.create({
    data: {
      contentId: welcomeNote.id,
      tagId: typescriptTag.id,
      positions: [
        { offset: 300, context: "Using #typescript for types" },
      ],
    },
  });
}
```

### Step 4: Regenerate Prisma Client

```bash
npx prisma generate

# Outputs to: apps/web/lib/generated/prisma
```

### Step 5: Verify Migration

**Check database structure:**

```bash
npx prisma studio

# Verify:
# - Tag table has userId column
# - Tag has unique constraint on [userId, slug]
# - ContentTag has positions column (JSON)
# - Sample tags exist for test user
```

---

## Breaking Changes & Required Code Updates

### 1. Tag Creation

**Before:**
```typescript
const tag = await prisma.tag.create({
  data: {
    name: "react",
    slug: "react",
  },
});
```

**After:**
```typescript
const tag = await prisma.tag.create({
  data: {
    userId: currentUserId,  // ← Required now
    name: "react",
    slug: "react",
  },
});
```

### 2. Tag Queries (Autocomplete)

**Before:**
```typescript
const tags = await prisma.tag.findMany({
  where: {
    name: { startsWith: query },
  },
});
```

**After:**
```typescript
const tags = await prisma.tag.findMany({
  where: {
    userId: currentUserId,  // ← Filter by user
    name: { startsWith: query },
  },
});
```

### 3. ContentTag Creation

**Before:**
```typescript
await prisma.contentTag.create({
  data: {
    contentId: noteId,
    tagId: tag.id,
  },
});
```

**After:**
```typescript
await prisma.contentTag.create({
  data: {
    contentId: noteId,
    tagId: tag.id,
    positions: [  // ← Add positions
      { offset: 120, context: "This is about #react" },
    ],
  },
});
```

### 4. Tag Extraction Utility

**Update:** `lib/content/tag-extractor.ts`

```typescript
export interface ExtractedTag {
  name: string;
  slug: string;
  position: number;       // ← Already has this
  context?: string;       // ← NEW: Add context snippet
}

export function extractTags(tiptapJson: JSONContent): ExtractedTag[] {
  const tags = new Map<string, ExtractedTag[]>();
  let position = 0;

  function walkNode(node: JSONContent) {
    if (node.type === "text" && node.text) {
      // Updated regex (see below)
      const matches = node.text.matchAll(TAG_REGEX);

      for (const match of matches) {
        const name = match[1];
        const slug = slugifyTag(name);
        const offset = position + match.index!;

        // Extract context (20 chars before and after)
        const start = Math.max(0, offset - 20);
        const end = Math.min(node.text.length, offset + name.length + 21);
        const context = node.text.substring(start, end);

        if (!tags.has(slug)) {
          tags.set(slug, []);
        }

        tags.get(slug)!.push({
          name,
          slug,
          position: offset,
          context,
        });
      }

      position += node.text.length;
    }

    if (node.content) {
      for (const child of node.content) {
        walkNode(child);
      }
    }
  }

  walkNode(tiptapJson);

  // Return flattened array with all occurrences
  return Array.from(tags.values()).flat();
}
```

### 5. Tag Regex Update

**Updated Rules:**
- Space/newline required **before** `#`
- First character after `#` cannot be hyphen/underscore
- Exclude from headings

```typescript
// Updated regex for tag extraction
const TAG_REGEX = /(?:^|[\s\n])#([a-zA-Z0-9][a-zA-Z0-9_-]{1,49})\b/g;

// Breakdown:
// (?:^|[\s\n])   - Start of line OR whitespace/newline (not captured)
// #              - Hash symbol
// ([a-zA-Z0-9]   - First char must be alphanumeric (captured)
// [a-zA-Z0-9_-]{1,49})  - Remaining chars (alphanumeric, hyphen, underscore, 1-49 chars)
// \b             - Word boundary (prevents bob#tag)
```

---

## Data Migration (If Needed)

**If database has existing data to preserve:**

### Option A: Migrate Existing Tags to Default User

```sql
-- Add userId column (nullable temporarily)
ALTER TABLE "Tag" ADD COLUMN "userId" UUID;

-- Set all existing tags to default user (admin@example.com)
UPDATE "Tag"
SET "userId" = (SELECT id FROM "User" WHERE email = 'admin@example.com' LIMIT 1)
WHERE "userId" IS NULL;

-- Make userId required
ALTER TABLE "Tag" ALTER COLUMN "userId" SET NOT NULL;

-- Drop old unique constraints
ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_name_key";
ALTER TABLE "Tag" DROP CONSTRAINT IF EXISTS "Tag_slug_key";

-- Add new unique constraint
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_slug_key" UNIQUE ("userId", "slug");

-- Add positions column to ContentTag with default empty array
ALTER TABLE "ContentTag" ADD COLUMN "positions" JSONB DEFAULT '[]';
```

### Option B: Drop and Recreate (Recommended for New DB)

```bash
# Fresh start (loses all data)
npx prisma migrate reset --force
```

---

## TypeScript Interface Updates

**Update:** `lib/content/api-types.ts`

```typescript
export interface TagResponse {
  id: string;
  userId: string;         // ← NEW
  name: string;
  slug: string;
  count: number;
  createdAt: string;
}

export interface ContentTagResponse {
  id: string;
  name: string;
  slug: string;
  positions: Array<{     // ← NEW
    offset: number;
    context: string;
  }>;
  appliedAt: string;
}
```

---

## API Route Updates

### 1. Tag Search (Autocomplete)

**File:** `app/api/notes/tags/search/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  const userId = session.user.id;  // ← Get current user

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q") || "";

  const tags = await prisma.tag.findMany({
    where: {
      userId,  // ← Filter by user
      name: { startsWith: query, mode: "insensitive" },
    },
    include: {
      _count: { select: { contentTags: true } },
    },
    take: 10,
  });

  return NextResponse.json({
    success: true,
    tags: tags.map((tag) => ({
      id: tag.id,
      userId: tag.userId,
      name: tag.name,
      slug: tag.slug,
      count: tag._count.contentTags,
    })),
  });
}
```

### 2. Create Tag

**File:** `app/api/notes/content/[id]/tags/route.ts`

```typescript
export async function POST(request: NextRequest, { params }) {
  const session = await getSession();
  const userId = session.user.id;  // ← Get current user
  const contentId = params.id;
  const body = await request.json();
  const { tagName } = body;

  const slug = slugifyTag(tagName);

  // Find or create tag (scoped to user)
  let tag = await prisma.tag.findUnique({
    where: {
      userId_slug: { userId, slug },  // ← Per-user lookup
    },
  });

  if (!tag) {
    tag = await prisma.tag.create({
      data: {
        userId,  // ← Set owner
        name: tagName,
        slug,
      },
    });
  }

  // Extract tag positions from content
  const content = await prisma.contentNode.findUnique({
    where: { id: contentId },
    include: { notePayload: true },
  });

  const positions = [];
  if (content?.notePayload?.tiptapJson) {
    const extracted = extractTags(content.notePayload.tiptapJson);
    const tagOccurrences = extracted.filter(t => t.slug === slug);
    positions.push(...tagOccurrences.map(t => ({
      offset: t.position,
      context: t.context || "",
    })));
  }

  // Create association with positions
  await prisma.contentTag.upsert({
    where: {
      contentId_tagId: { contentId, tagId: tag.id },
    },
    create: {
      contentId,
      tagId: tag.id,
      positions,  // ← Store positions
    },
    update: {
      positions,  // ← Update positions if already exists
    },
  });

  return NextResponse.json({
    success: true,
    tag: {
      id: tag.id,
      userId: tag.userId,
      name: tag.name,
      slug: tag.slug,
    },
  });
}
```

### 3. Delete Tag (With Confirmation)

**File:** `app/api/notes/tags/[id]/route.ts`

```typescript
export async function DELETE(request: NextRequest, { params }) {
  const session = await getSession();
  const userId = session.user.id;
  const tagId = params.id;

  // Verify tag belongs to user
  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
    include: {
      contentTags: {
        include: {
          content: { include: { notePayload: true } },
        },
      },
    },
  });

  if (!tag) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  if (tag.userId !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const affectedDocs = tag.contentTags.length;

  // Delete tag (cascade deletes ContentTag associations)
  await prisma.tag.delete({ where: { id: tagId } });

  // TODO: Remove tag text from documents (background job)
  // This is complex - requires updating TipTap JSON
  // Can be done asynchronously

  return NextResponse.json({
    success: true,
    message: `Tag deleted from ${affectedDocs} documents`,
    removedFrom: affectedDocs,
  });
}
```

---

## Testing Plan

### 1. Database Migration Tests

```bash
# Test reset
npx prisma migrate reset --force

# Verify seed data
npx prisma studio
# Check:
# - Tag table has userId column
# - Tags belong to test user
# - ContentTag has positions JSON
```

### 2. Schema Validation

```typescript
// Test: User can only see their own tags
const userATags = await prisma.tag.findMany({
  where: { userId: userA.id },
});
// Should only return userA's tags

// Test: Same tag name, different users
const tag1 = await prisma.tag.create({
  data: { userId: userA.id, name: "react", slug: "react" },
});
const tag2 = await prisma.tag.create({
  data: { userId: userB.id, name: "react", slug: "react" },
});
// Should succeed (per-user uniqueness)

// Test: Duplicate tag for same user
const tag3 = await prisma.tag.create({
  data: { userId: userA.id, name: "react", slug: "react" },
});
// Should fail (unique constraint)
```

### 3. Position Tracking

```typescript
// Test: Extract tags with positions
const extracted = extractTags(tiptapJson);
// Verify:
// - Multiple occurrences tracked
// - Positions accurate
// - Context snippets present
```

### 4. Tag Deletion

```typescript
// Test: Delete tag removes from documents
await deleteTag(tagId);
// Verify:
// - Tag deleted from database
// - ContentTag associations removed
// - Documents still intact (text remains for now)
```

---

## Rollback Plan

**If migration fails:**

```bash
# Revert to previous migration
npx prisma migrate resolve --rolled-back <migration_name>

# Or reset to clean state
npx prisma migrate reset --force
```

---

## Success Criteria

- [ ] `Tag` table has `userId` column
- [ ] `Tag` has `@@unique([userId, slug])` constraint
- [ ] `User` has `tags` relation
- [ ] `ContentTag` has `positions` JSON column
- [ ] Seed script creates sample tags for test user
- [ ] Prisma client regenerated
- [ ] All API routes updated for user isolation
- [ ] Tag extraction tracks positions
- [ ] TypeScript interfaces updated
- [ ] No breaking changes in existing code

---

## Estimated Time

**Migration Execution:** 30-60 minutes
- Update schema: 10 min
- Run migration: 5 min
- Update seed script: 10 min
- Update API routes: 15-20 min
- Test migration: 10-15 min

**Total:** ~1 hour (including testing)

---

## Checklist

**Pre-Migration:**
- [ ] Backup database (if has data)
- [ ] Review schema changes
- [ ] Update `prisma/schema.prisma`
- [ ] Update `prisma/seed.ts`
- [ ] Review API route changes

**Migration:**
- [ ] Run `npx prisma migrate reset --force`
- [ ] Verify migration success
- [ ] Run `npx prisma generate`
- [ ] Check Prisma Studio

**Post-Migration:**
- [ ] Update API routes
- [ ] Update TypeScript interfaces
- [ ] Update tag extraction utility
- [ ] Run tests
- [ ] Verify user isolation

---

**End of Migration Plan**
