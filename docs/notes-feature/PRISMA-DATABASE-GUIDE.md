# Prisma & Database Management Guide

**Purpose:** Authoritative guide for error-free database operations in Digital Garden
**Audience:** Developers and AI assistants working with this codebase
**Last Updated:** January 20, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Database Setup](#database-setup)
3. [Schema Changes Workflow](#schema-changes-workflow)
4. [Migration Best Practices](#migration-best-practices)
5. [Common Patterns](#common-patterns)
6. [Troubleshooting](#troubleshooting)
7. [Testing Database Changes](#testing-database-changes)
8. [**IMPORTANT: Dealing with Migration Drift**](#important-dealing-with-migration-drift) 👈 **Read this if `migrate dev` fails!**

**📘 New:** See [PRISMA-MIGRATION-GUIDE.md](./PRISMA-MIGRATION-GUIDE.md) for comprehensive migration drift resolution and workflow best practices.

---

## Overview

### Stack

- **Database:** PostgreSQL (recommended version: 14+)
- **ORM:** Prisma 7.2.0
- **Generated Client Location:** `lib/generated/prisma`
- **Schema Location:** `prisma/schema.prisma`
- **Migrations:** `prisma/migrations/`

### Key Principles

1. **Always use Prisma for schema changes** (never edit database directly)
2. **Test migrations in development before production**
3. **Use descriptive migration names**
4. **Always regenerate Prisma client after schema changes**
5. **Use seed scripts for consistent test data**

---

## Database Setup

### Initial Setup

```bash
# 1. Navigate to web app
cd apps/web

# 2. Install dependencies (if not already done)
pnpm install

# 3. Set up environment variables
# Create .env file with DATABASE_URL
cat > .env << EOF
DATABASE_URL="postgresql://user:password@localhost:5432/digital_garden?schema=public"
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"
EOF

# 4. Create database (if doesn't exist)
createdb digital_garden

# 5. Run migrations
npx prisma migrate deploy

# 6. Generate Prisma client
npx prisma generate

# 7. Seed database with test data
pnpm db:seed
```

### Verify Setup

```bash
# Open Prisma Studio to view database
npx prisma studio

# Check that tables exist:
# - User, ContentNode, NotePayload, FilePayload, etc.
# - Tag, ContentTag (for M6)
```

---

## Schema Changes Workflow

### Step-by-Step Process

```mermaid
graph TD
    A[Edit schema.prisma] --> B{Is DB new/disposable?}
    B -->|Yes| C[prisma migrate reset]
    B -->|No| D[prisma migrate dev]
    C --> E[prisma generate]
    D --> E
    E --> F[Update TypeScript types]
    F --> G[Update API routes]
    G --> H[Update seed script]
    H --> I[Test changes]
```

### Option 1: Fresh Start (Recommended for Development)

**When to use:** Database is new, no important data, or schema has breaking changes

```bash
cd apps/web

# DANGER: This drops the entire database!
npx prisma migrate reset --force

# What this does:
# 1. Drops database
# 2. Creates new database
# 3. Applies all migrations from prisma/migrations/
# 4. Runs seed script (prisma/seed.ts)
# 5. Regenerates Prisma client
```

**Advantages:**
- ✅ Clean slate, no migration errors
- ✅ Fastest for breaking changes
- ✅ Automatically runs seed script

**Disadvantages:**
- ❌ Loses all data (dev only!)
- ❌ Can't use in production

### Option 2: Incremental Migration (Production-Safe)

**When to use:** Database has important data, production environment

```bash
cd apps/web

# 1. Edit prisma/schema.prisma
# (make your changes)

# 2. Create named migration
npx prisma migrate dev --name add_user_to_tags

# What this does:
# 1. Compares schema to current database
# 2. Generates SQL migration file
# 3. Applies migration to database
# 4. Regenerates Prisma client

# 3. Review generated migration file
cat prisma/migrations/20260120_add_user_to_tags/migration.sql

# 4. Test migration
pnpm db:seed  # Or run your own tests

# 5. Commit migration files
git add prisma/migrations/
git commit -m "feat(db): add userId to Tag table"
```

**Advantages:**
- ✅ Preserves existing data
- ✅ Can review SQL before applying
- ✅ Production-safe
- ✅ Rollback possible

**Disadvantages:**
- ❌ Can fail if schema changes conflict with data
- ❌ Requires manual data migration for complex changes

---

## Migration Best Practices

### 1. Naming Conventions

**Good migration names:**
```bash
npx prisma migrate dev --name add_user_tags_and_positions
npx prisma migrate dev --name remove_global_tag_uniqueness
npx prisma migrate dev --name add_soft_delete_to_notes
```

**Bad migration names:**
```bash
npx prisma migrate dev --name update  # Too vague
npx prisma migrate dev --name fix    # What fix?
npx prisma migrate dev --name test   # Not descriptive
```

**Convention:** `<action>_<what>_<where>`
- add_userId_to_tag
- remove_name_unique_constraint
- create_content_tag_table

### 2. Breaking Changes Strategy

**Examples of breaking changes:**
- Removing a required field
- Changing field type
- Removing a table
- Changing unique constraints

**Safe Approach:**

```prisma
// BAD: Direct breaking change
model Tag {
  id   String @id
  name String @unique  // Remove this ← BREAKS existing data
  slug String @unique
}

// GOOD: Multi-step migration
// Step 1: Add new field (optional)
model Tag {
  id     String  @id
  name   String  @unique
  slug   String  @unique
  userId String? @db.Uuid  // Optional first
}

// Step 2: Populate new field with data migration
// (SQL or Prisma script to set userId for existing records)

// Step 3: Make field required
model Tag {
  id     String @id
  name   String
  slug   String
  userId String @db.Uuid  // Now required

  @@unique([userId, slug])  // New constraint
}
```

### 3. Data Migrations

**When schema changes require data updates:**

```typescript
// Example: Migrate existing tags to default user

// Create file: prisma/migrations/20260120_migrate_tags/data-migration.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get default user
  const defaultUser = await prisma.user.findFirst({
    where: { email: 'admin@example.com' },
  });

  if (!defaultUser) {
    throw new Error('Default user not found');
  }

  // Update all existing tags
  await prisma.tag.updateMany({
    where: { userId: null },
    data: { userId: defaultUser.id },
  });

  console.log('✓ Migrated tags to default user');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run manually:
```bash
npx tsx prisma/migrations/20260120_migrate_tags/data-migration.ts
```

### 4. Testing Migrations

**Always test in this order:**

1. **Local Development**
   ```bash
   npx prisma migrate dev --name my_change
   pnpm db:seed
   # Test manually
   ```

2. **CI/CD (Staging)**
   ```bash
   npx prisma migrate deploy  # Apply pending migrations
   # Run automated tests
   ```

3. **Production**
   ```bash
   # Backup database first!
   npx prisma migrate deploy
   # Monitor for errors
   ```

---

## Common Patterns

### Adding a New Table

```prisma
// 1. Add to schema.prisma
model NewTable {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String   @db.VarChar(255)
  createdAt DateTime @default(now()) @db.Timestamptz()

  @@index([name])
}

// 2. Run migration
// npx prisma migrate dev --name create_new_table

// 3. Update seed script
// prisma/seed.ts - add sample data

// 4. Create TypeScript interface
// lib/content/types.ts

// 5. Create API routes if needed
// app/api/new-table/route.ts
```

### Adding a Foreign Key

```prisma
model Tag {
  id     String @id
  userId String @db.Uuid  // 1. Add foreign key field

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)  // 2. Add relation
}

model User {
  id   String @id
  tags Tag[]  // 3. Add reverse relation
}
```

**Delete Behaviors:**
- `onDelete: Cascade` - Delete related records (e.g., delete user → delete tags)
- `onDelete: SetNull` - Set field to null (requires optional field)
- `onDelete: Restrict` - Prevent deletion if related records exist
- `onDelete: NoAction` - Database default (usually Restrict)

### Adding a Unique Constraint

```prisma
model Tag {
  userId String
  slug   String

  // Single field unique
  @@unique([slug])

  // Composite unique (per-user uniqueness)
  @@unique([userId, slug])
}
```

### Adding an Index

```prisma
model Tag {
  userId String
  name   String

  // Single field index
  @@index([name])

  // Composite index (for autocomplete queries)
  @@index([userId, name])
}
```

### Adding a JSON Field

```prisma
model ContentTag {
  id        String @id
  positions Json   @default("[]") @db.JsonB  // PostgreSQL JSONB (faster)

  // Or for MySQL/SQLite:
  // positions Json   @default("[]")
}
```

**TypeScript type for JSON field:**

```typescript
import { Prisma } from '@/lib/generated/prisma';

// Option 1: Prisma.JsonValue (any JSON)
positions: Prisma.JsonValue;

// Option 2: Custom type
interface TagPosition {
  offset: number;
  context: string;
}

positions: TagPosition[];

// In code:
const positions = contentTag.positions as TagPosition[];
```

---

## Troubleshooting

### Error: "Migration failed to apply"

**Cause:** Schema change conflicts with existing data

**Solution:**
```bash
# Option 1: Reset database (dev only)
npx prisma migrate reset --force

# Option 2: Fix data, then retry
# 1. Revert migration
npx prisma migrate resolve --rolled-back <migration_name>

# 2. Fix data manually (SQL or Prisma script)

# 3. Re-run migration
npx prisma migrate dev
```

### Error: "P2002: Unique constraint failed"

**Cause:** Trying to insert duplicate value in unique field

**Solution:**
```typescript
// Use upsert instead of create
await prisma.tag.upsert({
  where: { slug: 'react' },
  update: {},  // No changes if exists
  create: { slug: 'react', name: 'React' },  // Create if not exists
});
```

### Error: "Property does not exist on type 'PrismaClient'"

**Cause:** Prisma client not regenerated after schema change

**Solution:**
```bash
npx prisma generate
# Restart TypeScript server in IDE (Cmd+Shift+P → "Restart TS Server")
```

### Error: "Database 'digital_garden' does not exist"

**Cause:** Database not created

**Solution:**
```bash
# PostgreSQL
createdb digital_garden

# Or via psql
psql -U postgres
CREATE DATABASE digital_garden;
\q

# Then run migrations
npx prisma migrate deploy
```

### Error: "Can't reach database server"

**Cause:** Database not running or wrong credentials

**Solution:**
```bash
# Check PostgreSQL is running
pg_isready

# Start PostgreSQL (macOS)
brew services start postgresql@14

# Check DATABASE_URL in .env
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL
```

### Error: "Migration is in a failed state"

**Cause:** Previous migration crashed mid-execution

**Solution:**
```bash
# Mark migration as rolled back
npx prisma migrate resolve --rolled-back <migration_name>

# Or reset (dev only)
npx prisma migrate reset --force
```

---

## Testing Database Changes

### 1. Unit Tests for Queries

```typescript
// tests/db/tag.test.ts
import { prisma } from '@/lib/generated/prisma';

describe('Tag queries', () => {
  beforeEach(async () => {
    // Clear database
    await prisma.tag.deleteMany();
    await prisma.user.deleteMany();
  });

  it('should create tag for user', async () => {
    const user = await prisma.user.create({
      data: { email: 'test@example.com', name: 'Test' },
    });

    const tag = await prisma.tag.create({
      data: {
        userId: user.id,
        name: 'react',
        slug: 'react',
      },
    });

    expect(tag.userId).toBe(user.id);
  });

  it('should enforce per-user uniqueness', async () => {
    const user1 = await prisma.user.create({
      data: { email: 'user1@example.com', name: 'User 1' },
    });

    const user2 = await prisma.user.create({
      data: { email: 'user2@example.com', name: 'User 2' },
    });

    // Same tag name, different users → should succeed
    const tag1 = await prisma.tag.create({
      data: { userId: user1.id, name: 'react', slug: 'react' },
    });

    const tag2 = await prisma.tag.create({
      data: { userId: user2.id, name: 'react', slug: 'react' },
    });

    expect(tag1.id).not.toBe(tag2.id);
  });

  it('should fail on duplicate tag for same user', async () => {
    const user = await prisma.user.create({
      data: { email: 'test@example.com', name: 'Test' },
    });

    await prisma.tag.create({
      data: { userId: user.id, name: 'react', slug: 'react' },
    });

    // Duplicate → should throw error
    await expect(
      prisma.tag.create({
        data: { userId: user.id, name: 'react', slug: 'react' },
      })
    ).rejects.toThrow();
  });
});
```

### 2. Seed Script Verification

```typescript
// prisma/seed.ts
async function main() {
  console.log('🌱 Seeding database...');

  // Create test user
  const user = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
    },
  });

  console.log('✓ Created user:', user.email);

  // Create test tags
  const tags = await Promise.all([
    prisma.tag.upsert({
      where: { userId_slug: { userId: user.id, slug: 'react' } },
      update: {},
      create: { userId: user.id, name: 'react', slug: 'react' },
    }),
    prisma.tag.upsert({
      where: { userId_slug: { userId: user.id, slug: 'typescript' } },
      update: {},
      create: { userId: user.id, name: 'typescript', slug: 'typescript' },
    }),
  ]);

  console.log(`✓ Created ${tags.length} tags`);

  // Verify data
  const tagCount = await prisma.tag.count({ where: { userId: user.id } });
  console.log(`✓ Verified: ${tagCount} tags in database`);

  console.log('🌱 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### 3. Manual Testing Checklist

After any schema change:

- [ ] Run `npx prisma studio` - verify tables exist
- [ ] Run seed script - verify sample data loads
- [ ] Test API routes - verify queries work
- [ ] Check unique constraints - try creating duplicates
- [ ] Check foreign keys - try deleting related records
- [ ] Check indexes - verify query performance
- [ ] Test in production-like environment

---

## Quick Reference

### Common Commands

```bash
# Schema changes
npx prisma migrate dev --name <migration_name>  # Create migration
npx prisma migrate reset --force                # Reset database (dev only)
npx prisma migrate deploy                       # Apply migrations (prod)

# Client generation
npx prisma generate                             # Regenerate Prisma client

# Database inspection
npx prisma studio                               # Open GUI
npx prisma db pull                              # Pull schema from database
npx prisma db push                              # Push schema to database (skip migrations)

# Seeding
pnpm db:seed                                    # Run seed script
npx tsx prisma/seed.ts                          # Run seed script directly

# Troubleshooting
npx prisma migrate resolve --rolled-back <name> # Mark migration as rolled back
npx prisma migrate status                       # Check migration status
npx prisma validate                             # Validate schema syntax
```

### File Locations

```

├── prisma/
│   ├── schema.prisma           # Database schema
│   ├── seed.ts                 # Seed script
│   └── migrations/             # Migration history
│       └── 20260120_name/
│           └── migration.sql
├── lib/
│   └── generated/
│       └── prisma/             # Generated Prisma client
│           ├── index.d.ts
│           └── runtime/
└── .env                        # DATABASE_URL
```

---

## Best Practices Summary

1. **Always use descriptive migration names**
2. **Test migrations in development first**
3. **Use `npx prisma migrate dev` for dev, `deploy` for prod**
4. **Regenerate client after every schema change**
5. **Use upsert for idempotent operations**
6. **Add indexes for frequently queried fields**
7. **Use proper delete behaviors (Cascade, SetNull, Restrict)**
8. **Version control all migrations**
9. **Document breaking changes**
10. **Use seed scripts for consistent test data**

---

## Common Gotchas

❌ **Don't:**
- Edit migration SQL files manually (unless you know what you're doing)
- Use `migrate reset` when drift is detected (use `db push` instead)
- Delete migrations from `prisma/migrations/` (breaks history)
- Forget to run `prisma generate` after schema changes
- Use `migrate reset` in production (deletes all data!)

✅ **Do:**
- Use `db push` for development (fast, no data loss)
- Use `migrate dev` → `deploy` for production (tracked history)
- Use `migrate resolve` to fix drift without reset
- Commit migration files to git (when using migrations)
- Test migrations on copy of production data before deploying
- Keep seed script up-to-date with schema

---

## IMPORTANT: Dealing with Migration Drift

**Problem:** `migrate dev` says "drift detected" and wants to reset the database.

**Quick Fix (Development):**
```bash
# Use db push instead (no migration history, no data loss)
npx prisma db push

# Regenerate client
npx prisma generate
```

**Long-term Solution:**
See [PRISMA-MIGRATION-GUIDE.md](./PRISMA-MIGRATION-GUIDE.md) for:
- Why drift happens
- Using `db push` vs `migrate dev`
- Resolving drift without data loss
- Baselining migrations
- Production migration workflows

**Key Insight:**
- **Development:** Use `db push` for fast iteration (no migration files)
- **Production:** Use `migrate dev` → `migrate deploy` (tracked migrations)
- **Drift:** Use `migrate resolve` to fix without reset

---

**End of Prisma & Database Guide**
