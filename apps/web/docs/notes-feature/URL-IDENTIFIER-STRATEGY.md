# URL Identifier Strategy & Public Sharing Architecture

**Last Updated:** January 14, 2026
**Status:** Phase 0 Complete - UUID-based content parameter
**Related:** M6 Phase 0, M10-M12 Public Sharing

---

## Current Implementation (Phase 0) ✅

### URL Pattern
```
/notes?content=<uuid>
```

**Example:**
```
/notes?content=550e8400-e29b-41d4-a716-446655440000
```

### How It Works

1. **User selects content** → `setSelectedContentId(uuid)` called
2. **URL updates** → `/notes?content=<uuid>` via `window.history.replaceState()`
3. **localStorage backup** → `lastSelectedContentId` stored
4. **Page refresh** → Reads `?content=` first, falls back to localStorage
5. **API request** → `GET /api/notes/content/<uuid>`
6. **Auth check** → Validates `content.ownerId === session.user.id`

**Security:** ✅ Ownership validated on every API request (see `route.ts:59`)

---

## Alternative Identifiers Analysis

### Option 1: UUID (`ContentNode.id`) - ✅ CURRENT

**Database Schema:**
```prisma
id  String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
```

**Pros:**
- ✅ Globally unique (database-generated)
- ✅ No collisions across users
- ✅ Immediate lookup (primary key)
- ✅ Opaque (doesn't reveal content info)
- ✅ Security through obscurity
- ✅ Immutable (never changes)

**Cons:**
- ❌ Not human-readable
- ❌ Long (36 characters)
- ❌ Can't be typed/remembered

**Best for:** Private authenticated sharing, internal links

---

### Option 2: Slug (`ContentNode.slug`) - 🔮 FUTURE (Authenticated Users Only)

**Database Schema:**
```prisma
slug  String  @unique @db.VarChar(255)
```

**Slug Generation:** (`lib/content/slug.ts`)
```typescript
generateSlug("My Awesome Note!")
// Returns: "my-awesome-note"

// Rules:
// - Lowercase
// - Spaces → hyphens
// - Alphanumeric + hyphens only
// - Max 200 characters
// - Numeric suffix if collision (my-note-2, my-note-3)
```

**Pros:**
- ✅ Human-readable URLs for internal users
- ✅ Can be typed/remembered
- ✅ Unique constraint at database level
- ✅ Easier to share URLs in team chat

**Cons:**
- ❌ **NOT globally unique** - Can be reused if content deleted
- ❌ **Per-user uniqueness** - Two users can have same slug
- ❌ Requires database lookup (not primary key)
- ❌ May change if title edited (depending on strategy)

**Best for:** Internal authenticated access with friendly URLs

**IMPORTANT:** Slugs are **NOT** for public sharing. Public access will use a separate publishing system (TBD in future milestones).

---

## Recommended Strategy: Hybrid Approach 🎯

### Accept Both UUID and Slug

```typescript
// Both formats work
/notes?content=my-awesome-note              // Slug (human-readable)
/notes?content=550e8400-e29b-41d4-a716...  // UUID (canonical)
```

### Resolution Logic

```typescript
// In: GET /api/notes/content/[id]
async function getContentNode(identifier: string, userId: string) {
  // Try UUID first (most common, fastest)
  if (isUUID(identifier)) {
    return await prisma.contentNode.findUnique({
      where: { id: identifier },
    });
  }

  // Fallback to slug lookup
  return await prisma.contentNode.findFirst({
    where: {
      slug: identifier,
      ownerId: userId,  // CRITICAL: slug is NOT globally unique
      deletedAt: null,
    },
  });
}

// Helper: Check if string is UUID
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
```

### Benefits
- ✅ UUID for private links (current)
- ✅ Slug for public content (future)
- ✅ Backward compatible
- ✅ No breaking changes

---

## Public Sharing & Publishing Architecture (M10-M12+)

**IMPORTANT:** Public sharing and publishing are **future features** with systems still to be designed.

### Current Limitation (M5)
**ViewGrant Model** only supports authenticated user-to-user sharing:
```prisma
model ViewGrant {
  contentId   String   @db.Uuid
  userId      String   @db.Uuid    // Requires authentication
  accessLevel String   @db.VarChar(20)
  // ...
}
```

### Future Option A: User-to-User Anonymous Sharing (ShareLink)

**For:** Share with non-authenticated users via secure link

**New ShareLink Model:**
```prisma
model ShareLink {
  id            String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contentId     String      @db.Uuid
  token         String      @unique @db.VarChar(64)  // Random secure token
  slug          String?     @db.VarChar(255)         // Optional vanity slug

  // Permissions
  accessLevel   String      @default("view") @db.VarChar(20)  // view | comment | edit
  requireAuth   Boolean     @default(false)           // If true, user must sign in
  allowIndexing Boolean     @default(false)           // SEO: allow search engines

  // Expiration
  expiresAt     DateTime?   @db.Timestamptz()
  isActive      Boolean     @default(true)
  maxViews      Int?                                  // Optional view limit

  // Tracking
  viewCount     Int         @default(0)
  lastViewedAt  DateTime?   @db.Timestamptz()
  createdAt     DateTime    @default(now()) @db.Timestamptz()
  createdBy     String      @db.Uuid

  // Relations
  content       ContentNode @relation(fields: [contentId], references: [id], onDelete: Cascade)
  creator       User        @relation(fields: [createdBy], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([contentId, isActive])
  @@index([expiresAt, isActive])
}
```

---

## URL Patterns for Different Use Cases

### 1. Private Authenticated Access (Current) ✅

```typescript
/notes?content=<uuid>
/notes?content=<slug>  // Future: hybrid support
```

**Requirements:**
- User must be authenticated
- Must own the content (`ownerId` check)
- Works for all content types

---

### 2. Public Anonymous Sharing (M10-M12) 🔮

**Option A: Token-based (Most Secure)**
```typescript
/share/<token>       // ShareLink.token (64-char random)
/s/<token>           // Short version
```

**Example:**
```
/share/a7f3c9d1e2b4f6a8c0e1d3b5f7a9c2e4d6f8a0c2e4f6a8b0d2f4a6c8e0f2a4b6
/s/a7f3c9d1e2b4     // Truncated for display
```

**Pros:**
- ✅ Secure (random token, non-enumerable)
- ✅ No guessing possible
- ✅ Easy to revoke (deactivate token)
- ✅ Track views per link

**Cons:**
- ❌ Not memorable
- ❌ Not SEO-friendly

---

**Option B: Slug + Token Hybrid (Best UX)**
```typescript
/share/<slug>/<short-token>
/s/<slug>/<short-token>
```

**Example:**
```
/share/my-awesome-note/a7f3c9d1
/s/my-awesome-note/a7f3c9d1
```

**Pros:**
- ✅ Human-readable slug
- ✅ Secure token verification
- ✅ Good UX (can read URL)
- ✅ Track views per link

**Cons:**
- ⚠️ Longer URL
- ⚠️ Token still required for security

---

### Future Option B: Public Publishing System (TBD)

**Status:** ⏳ System design not yet finalized

**For:** Publicly published content (blog posts, documentation, etc.)

**Potential URL Patterns:**
```typescript
/published/<slug>          // Using ContentNode.slug
/blog/<slug>               // Blog-specific route
/p/<slug>                  // Short version
/<username>/<slug>         // User namespace (like Medium)
```

**Requirements (To Be Determined):**
- Publishing workflow (draft → review → publish)
- SEO optimization (meta tags, sitemaps, RSS)
- Public discovery (search, tags, categories)
- Analytics and tracking
- Content moderation
- Versioning for published content
- Unpublishing/archiving workflow

**Design Decisions Pending:**
- Should slugs be global or user-scoped when published?
- How to handle slug conflicts between users?
- Should published content use separate domain/subdomain?
- Integration with `ContentNode.isPublished` flag
- Public commenting system (if any)
- Social sharing previews (Open Graph, Twitter Cards)

**This feature is part of the social/collaboration suite (M10-M12+) and requires further discovery.**

---

### 3. User-to-User Sharing (Current ViewGrant) ✅

```typescript
/notes?content=<uuid>
```

**Flow:**
1. User A shares with User B via ViewGrant
2. User B receives email/notification
3. User B clicks link → `/notes?content=<uuid>`
4. API checks: `ViewGrant.where({ contentId, userId: B })`
5. Access granted if ViewGrant exists

**Already Implemented:** ✅ ViewGrant model exists

---

## Future: Multi-View Parameters (M7+)

### Split Panels
```typescript
/notes?left=<id>&right=<id>
/notes?left=my-note&right=another-note

// Advanced: Different content types
/notes?left=my-note&right=folder-id&view=tree
```

### Tabs
```typescript
/notes?tabs=<id>,<id>,<id>&active=1
/notes?tabs=note1,note2,note3&active=0  // First tab active (0-indexed)
```

### View Modes
```typescript
/notes?content=<id>&view=gallery
/notes?content=<id>&view=zen         // Distraction-free
/notes?content=<id>&view=presentation
/notes?content=<id>&mode=readonly
```

### Gallery View
```typescript
/notes?folder=<id>&view=gallery&sort=date
/notes?folder=<id>&view=grid&filter=images
```

### Public Share with View Options
```typescript
/share/<token>?view=presentation
/share/<token>?mode=zen
/published/<slug>?embed=true          // Embeddable version
```

---

## Migration Path

### Phase 0 (Current) ✅
```typescript
✅ Implemented: /notes?content=<uuid>
✅ URL persistence via window.history.replaceState()
✅ localStorage fallback
✅ Auth check on every request
```

### M6-M9 (Prepare for Hybrid)
```typescript
⏳ Update API to accept UUID or slug
⏳ Add isUUID() helper function
⏳ Fallback: UUID → Slug lookup
⏳ Maintain backward compatibility
```

### M10-M12 (Public Sharing)
```typescript
🔮 Add ShareLink model
🔮 New routes: /share/<token>
🔮 Optional: /published/<slug> for SEO
🔮 Track analytics (views, last accessed)
🔮 Expiration and revocation
```

### M13+ (Advanced Features)
```typescript
🔮 Multi-panel support (?left=&right=)
🔮 Tab management (?tabs=)
🔮 View modes (?view=gallery)
🔮 Embed support (?embed=true)
```

---

## Security Best Practices

### 1. Always Validate Ownership ✅

**Current implementation (route.ts:58-66):**
```typescript
// Check ownership
if (content.ownerId !== session.user.id) {
  // Check ViewGrant for shared access
  const viewGrant = await prisma.viewGrant.findUnique({
    where: {
      contentId_userId: {
        contentId: content.id,
        userId: session.user.id,
      },
    },
  });

  if (!viewGrant) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Access denied",
        },
      },
      { status: 403 }
    );
  }
}
```

**✅ GOOD:** Auth check exists and validates ownership or ViewGrant

---

### 2. UUID vs Slug Security

**UUID (Current):**
- ✅ Non-enumerable (can't guess)
- ✅ No information leakage
- ⚠️ Still requires auth check (don't rely on obscurity alone)

**Slug (Future):**
- ⚠️ Enumerable (someone could try common slugs)
- ⚠️ Information leakage (reveals title)
- 🔒 **CRITICAL:** Must validate `ownerId` on every request
- 🔒 **CRITICAL:** Scope slug lookups to current user

**Example of UNSAFE slug lookup:**
```typescript
// ❌ BAD: Globally unique slug lookup (security risk)
const content = await prisma.contentNode.findFirst({
  where: { slug: "my-note" }
});
// Problem: Could access another user's content
```

**Example of SAFE slug lookup:**
```typescript
// ✅ GOOD: User-scoped slug lookup
const content = await prisma.contentNode.findFirst({
  where: {
    slug: "my-note",
    ownerId: session.user.id,  // REQUIRED
    deletedAt: null,
  },
});
```

---

### 3. Public Sharing Security

When implementing ShareLink (M10-M12):

**Token Requirements:**
- ✅ Minimum 32 characters (64 recommended)
- ✅ Cryptographically random (use `crypto.randomBytes()`)
- ✅ Indexed for fast lookup
- ✅ Optional expiration

**Access Control:**
```typescript
async function validateShareLink(token: string) {
  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    include: { content: true },
  });

  // Validation checks
  if (!shareLink) return null;
  if (!shareLink.isActive) return null;
  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) return null;
  if (shareLink.maxViews && shareLink.viewCount >= shareLink.maxViews) return null;

  // Update view count
  await prisma.shareLink.update({
    where: { id: shareLink.id },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: new Date(),
    },
  });

  return shareLink.content;
}
```

---

## Summary

### Current State (Phase 0) ✅
- **URL Pattern:** `/notes?content=<uuid>`
- **Identifier:** UUID only
- **Access:** Authenticated users only
- **Sharing:** User-to-user via ViewGrant

### Future Enhancements

**M6-M9: Hybrid Identifiers**
- Accept both UUID and slug
- Fallback resolution
- Backward compatible

**M10-M12: Public Sharing**
- ShareLink model
- `/share/<token>` routes
- Optional `/published/<slug>` for SEO
- Anonymous access support

**M13+: Advanced Views**
- Multi-panel (`?left=&right=`)
- Tabs (`?tabs=`)
- View modes (`?view=`)
- Embed support

### Key Decisions Made
✅ Use `?content=` for all content types (not `?note=`)
✅ UUID as primary identifier (opaque, secure)
✅ Slug as future alternative (readable, SEO)
✅ Separate routes for public sharing (`/share/`, `/published/`)
✅ No breaking changes to current implementation

---

**Next Steps:**
1. ✅ Phase 0 complete - UUID-based `?content=` parameter
2. ⏳ M6 - Implement core features (search, backlinks, outline)
3. 🔮 M10-M12 - Add ShareLink model and public sharing routes
