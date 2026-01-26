# Database Change Checklist

**Purpose:** Prevent migration drift and ensure safe, reversible database changes
**Audience:** Developers and AI assistants making Prisma schema changes
**Last Updated:** January 25, 2026

---

## ⚠️ READ THIS BEFORE ANY DATABASE CHANGE

**Golden Rule:** ALWAYS use this checklist before modifying `prisma/schema.prisma`

Every database change should follow this workflow to avoid migration drift, data loss, and broken states.

---

## Pre-Change Checklist

### 1. Planning Phase ✅

Before touching the schema file, answer these questions:

- [ ] **What exactly am I changing?**
  - Adding a field? (safest)
  - Modifying a field? (risky)
  - Removing a field? (very risky)
  - Adding a relation? (medium risk)
  - Changing indexes/constraints? (migration drift risk)

- [ ] **Is this a breaking change?**
  - Does it remove required data?
  - Does it change field types?
  - Does it affect existing queries?
  - Will existing data remain valid?

- [ ] **Do I need a data migration?**
  - Are there existing rows that need updating?
  - Do I need to backfill data?
  - Do I need to transform data?

- [ ] **What's my rollback plan?**
  - Can I reverse this change safely?
  - Will reverting break existing data?
  - Do I have a backup?

### 2. Environment Check ✅

- [ ] **Which database am I targeting?**
  - [ ] Development (local or Neon dev branch)
  - [ ] Production (Neon main branch)

- [ ] **Do I have recent backups?**
  - For production: ALWAYS backup before schema changes
  - For development: Consider if data is valuable

- [ ] **Is anyone else working on the database?**
  - Check for concurrent migrations
  - Coordinate with team if needed

---

## Change Workflow

### Option A: Development Changes (RECOMMENDED)

**Use this for:** Daily development, iterating on features, testing changes

```bash
# 1. Edit schema.prisma
# Make your changes

# 2. Push to database (no migration file)
npx prisma db push

# 3. Regenerate Prisma client
npx prisma generate

# 4. Test the changes
npm run dev
# Verify your changes work

# 5. If something breaks, revert schema.prisma
git checkout prisma/schema.prisma
npx prisma db push
npx prisma generate
```

**Checklist:**
- [ ] Schema edited
- [ ] `db push` succeeded
- [ ] Prisma client regenerated
- [ ] TypeScript server restarted (in IDE)
- [ ] Changes tested in running app
- [ ] No errors in console

**When to Use:**
- Adding optional fields
- Iterating on new features
- Testing schema ideas
- Development/staging environments

**Pros:**
- ✅ No migration drift
- ✅ No data loss
- ✅ Fast iteration
- ✅ Easy rollback (git revert + db push)

**Cons:**
- ❌ No migration history
- ❌ Can't track changes over time

### Option B: Production Changes (WHEN READY)

**Use this for:** Deploying to production, creating migration history

```bash
# 1. Edit schema.prisma
# Make your changes

# 2. Create migration file (don't apply yet)
npx prisma migrate dev --name descriptive_name --create-only

# 3. Review generated SQL
cat prisma/migrations/TIMESTAMP_descriptive_name/migration.sql
# Check for:
# - Unexpected changes
# - Data loss operations (DROP, DELETE)
# - Index changes you didn't intend

# 4. Add data migration if needed
# Edit the migration.sql file to include data transformations

# 5. Test on development database FIRST
npx prisma migrate deploy

# 6. Verify everything works
npm run dev
# Test thoroughly

# 7. Deploy to production (when ready)
npx prisma migrate deploy
```

**Checklist:**
- [ ] Migration file created
- [ ] SQL reviewed manually
- [ ] Data migration added (if needed)
- [ ] Tested on development database
- [ ] App tested with new schema
- [ ] Backup created (production)
- [ ] Migration deployed to production
- [ ] Production app tested

**When to Use:**
- Deploying to production
- Need migration history
- Team collaboration (shared migration files)

**Pros:**
- ✅ Tracked migration history
- ✅ Reviewable SQL
- ✅ Repeatable deployments

**Cons:**
- ❌ Migration drift risk
- ❌ Can't iterate quickly
- ❌ Requires careful planning

---

## Common Scenarios

### Scenario 1: Adding an Optional Field ✅ SAFE

**Example:** Adding `settings` field to `User` model

```prisma
model User {
  id       String @id
  email    String
  settings Json?  @db.JsonB  // ← Optional (null allowed)
}
```

**Workflow:**
```bash
npx prisma db push        # Safe - no data loss
npx prisma generate
```

**Risk Level:** 🟢 Low
**Can Break:** No
**Data Loss:** No

### Scenario 2: Adding a Required Field ⚠️ RISKY

**Example:** Adding required `userId` to `Tag` model

```prisma
model Tag {
  id     String @id
  name   String
  userId String @db.Uuid  // ← Required! Existing rows will fail
}
```

**Problem:** Existing tags don't have a `userId`

**Safe Workflow:**
```prisma
// Step 1: Add as optional
model Tag {
  userId String? @db.Uuid  // Optional first
}
```

```bash
npx prisma db push
```

```typescript
// Step 2: Data migration script
const prisma = new PrismaClient();
const defaultUserId = "...";

await prisma.tag.updateMany({
  where: { userId: null },
  data: { userId: defaultUserId },
});
```

```prisma
// Step 3: Make required after backfill
model Tag {
  userId String @db.Uuid  // Now required
}
```

```bash
npx prisma db push
```

**Risk Level:** 🟡 Medium
**Can Break:** Yes (if rushed)
**Data Loss:** No (if multi-step)

### Scenario 3: Removing a Field 🚨 DANGEROUS

**Example:** Removing `name` field from `Tag`

```prisma
model Tag {
  id   String @id
  // name String  // ← REMOVING THIS
  slug String
}
```

**Problem:** Data will be lost permanently!

**Safe Workflow:**
```prisma
// Step 1: Make optional (deprecate)
model Tag {
  name String?  // Mark as optional
  slug String
}
```

```bash
npx prisma db push
```

```typescript
// Step 2: Migrate data if needed
await prisma.tag.updateMany({
  where: { slug: null },
  data: { slug: convertNameToSlug(tag.name) },
});
```

```prisma
// Step 3: Remove field (data migrated)
model Tag {
  // name removed
  slug String
}
```

```bash
npx prisma db push
```

**Risk Level:** 🔴 High
**Can Break:** Yes
**Data Loss:** Yes (if not migrated)

### Scenario 4: Changing Field Type 🚨 VERY DANGEROUS

**Example:** Changing `age` from `Int` to `String`

```prisma
model User {
  age String  // Was Int before
}
```

**Problem:** PostgreSQL can't auto-convert types safely

**Safe Workflow:**
```prisma
// Step 1: Add new field
model User {
  age        Int     // Keep old
  ageString  String? // Add new
}
```

```bash
npx prisma db push
```

```typescript
// Step 2: Migrate data
await prisma.user.updateMany({
  data: { ageString: user.age.toString() },
});
```

```prisma
// Step 3: Remove old, rename new
model User {
  age String  // Renamed ageString → age
}
```

**Note:** Renaming fields requires manual SQL migration

**Risk Level:** 🔴 Very High
**Can Break:** Yes
**Data Loss:** Possible

### Scenario 5: Adding Index 🟢 SAFE

**Example:** Adding index to frequently queried field

```prisma
model ContentNode {
  slug String

  @@index([slug])  // Add index
}
```

**Workflow:**
```bash
npx prisma db push  # Safe
```

**Risk Level:** 🟢 Low
**Can Break:** No
**Data Loss:** No
**Performance Impact:** Temporary (index creation)

### Scenario 6: Changing Unique Constraint ⚠️ RISKY

**Example:** Making `slug` unique per user instead of globally unique

```prisma
// Before
model Tag {
  id   String @id
  slug String @unique  // Globally unique
}

// After
model Tag {
  id     String @id
  userId String
  slug   String

  @@unique([userId, slug])  // Unique per user
}
```

**Problem:** May have duplicate slugs across users

**Workflow:**
```bash
# 1. Remove global unique
# 2. db push
# 3. Check for conflicts
# 4. Add composite unique
# 5. db push
```

**Risk Level:** 🟡 Medium
**Can Break:** Yes (if duplicates exist)
**Data Loss:** No

---

## Migration Drift Prevention

### Causes of Drift

1. **Manual database changes** (ALTER TABLE outside Prisma)
2. **Index changes** via database tools
3. **Constraint changes** (unique, foreign keys)
4. **Concurrent migrations** (team members)
5. **Schema edits without migration** (editing migration.sql)

### Prevention Strategies

**✅ DO:**
- Use `db push` for development (no drift possible)
- Always edit schema.prisma (never raw SQL)
- Commit schema.prisma to git
- Coordinate with team on schema changes
- Use descriptive migration names
- Review generated SQL before applying

**❌ DON'T:**
- Don't run raw SQL migrations (use Prisma)
- Don't edit migration SQL files (create new ones)
- Don't use `migrate dev` when drift exists
- Don't delete migration files
- Don't bypass Prisma for schema changes

### Fixing Drift (When It Happens)

**Option 1: Accept Current State**
```bash
# Mark migrations as applied
npx prisma migrate resolve --applied migration_name

# Push new changes
npx prisma db push
```

**Option 2: Baseline Fresh**
```bash
# Delete all migrations
rm -rf prisma/migrations

# Create baseline
npx prisma migrate dev --name baseline --create-only

# Mark as applied (don't run)
npx prisma migrate resolve --applied baseline
```

**Option 3: Use db push** (simplest)
```bash
# Just use db push for development
npx prisma db push
```

---

## Post-Change Checklist

After applying any schema change:

- [ ] **Prisma client regenerated**
  ```bash
  npx prisma generate
  ```

- [ ] **TypeScript server restarted**
  - In VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"

- [ ] **Application tested**
  - Start dev server
  - Test affected features
  - Check console for errors
  - Verify queries work

- [ ] **Types updated**
  - Import statements working
  - No TypeScript errors
  - Autocomplete working

- [ ] **Data verified**
  ```bash
  npx prisma studio
  ```
  - Check rows exist
  - Check new fields populated
  - Check relationships intact

- [ ] **Documentation updated**
  - Update schema docs if needed
  - Update API docs if needed
  - Add comments to schema.prisma

---

## Emergency Rollback

If a migration breaks production:

### 1. Immediate Rollback (Schema Only)

```bash
# Revert schema.prisma
git checkout HEAD~1 prisma/schema.prisma

# Push old schema
npx prisma db push --accept-data-loss  # DANGER!

# Regenerate client
npx prisma generate

# Restart app
```

### 2. Rollback with Data Preservation

```bash
# 1. Restore from backup
# (Neon: use branch restore feature)

# 2. Revert schema
git checkout HEAD~1 prisma/schema.prisma

# 3. Push schema
npx prisma db push

# 4. Regenerate
npx prisma generate
```

### 3. Manual SQL Rollback

```sql
-- If you know what changed, manually revert:
ALTER TABLE "User" DROP COLUMN "settings";
```

```bash
# Then sync Prisma
npx prisma db pull  # Pull schema from database
npx prisma generate
```

---

## Schema Change Template

Copy this template for every schema change:

```markdown
## Schema Change: [Brief Description]

**Date:** YYYY-MM-DD
**Author:** [Your Name]
**Environment:** Development / Production

### What Changed
- Added/Modified/Removed: [field/model/relation]
- Reason: [why this change is needed]

### Risk Assessment
- Breaking Change: Yes / No
- Data Migration Required: Yes / No
- Rollback Complexity: Low / Medium / High

### Pre-Change Checklist
- [ ] Backup created (production only)
- [ ] Schema edited
- [ ] Migration strategy chosen (db push / migrate dev)
- [ ] Data migration script created (if needed)

### Change Execution
```bash
# Commands run
npx prisma db push
npx prisma generate
```

### Testing
- [ ] Dev server started
- [ ] Affected features tested
- [ ] No console errors
- [ ] Data verified in Prisma Studio

### Post-Change
- [ ] TypeScript server restarted
- [ ] Documentation updated
- [ ] Team notified (if production)

### Rollback Plan
If this fails, run:
```bash
git checkout HEAD~1 prisma/schema.prisma
npx prisma db push
npx prisma generate
```
```

---

## Quick Reference

| Action | Development Command | Production Command | Risk |
|--------|-------------------|-------------------|------|
| Add optional field | `db push` | `migrate dev` | 🟢 Low |
| Add required field | Multi-step `db push` | Multi-step `migrate` | 🟡 Medium |
| Remove field | Multi-step `db push` | Multi-step `migrate` | 🔴 High |
| Change type | Multi-step `db push` | Multi-step `migrate` | 🔴 Very High |
| Add index | `db push` | `migrate dev` | 🟢 Low |
| Add relation | `db push` | `migrate dev` | 🟡 Medium |
| Change constraint | `db push` | `migrate dev` | 🟡 Medium |

---

## Additional Resources

- [PRISMA-MIGRATION-GUIDE.md](./PRISMA-MIGRATION-GUIDE.md) - Detailed migration workflows
- [PRISMA-DATABASE-GUIDE.md](./PRISMA-DATABASE-GUIDE.md) - Complete database guide
- [Prisma Docs: Schema Changes](https://www.prisma.io/docs/guides/migrate)
- [Neon: Branching](https://neon.tech/docs/guides/branching) - Safe database testing

---

**Remember:** When in doubt, use `db push` for development. It's safer, faster, and easier to rollback.
