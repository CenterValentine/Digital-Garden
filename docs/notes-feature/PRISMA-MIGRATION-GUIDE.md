# Prisma Migration Guide

**Date:** January 25, 2026
**Purpose:** Resolve recurring migration drift issues and establish proper workflow

---

## The Problem We Keep Having

**Symptom:**
```
Drift detected: Your database schema is not in sync with your migration history.
We need to reset the "public" schema.
All data will be lost.
```

**Root Cause:**
- Prisma migrations track schema + indexes/constraints
- Manual database changes (removing indexes, etc.) create drift
- `migrate dev` refuses to proceed without full reset

---

## The Solution: Use `db push` for Development

### **Development Workflow (RECOMMENDED)**

```bash
# 1. Edit schema.prisma
# 2. Push changes directly to database (no migration file)
npx prisma db push

# 3. Regenerate client
npx prisma generate

# 4. Restart dev server if needed
```

**Why This Works:**
- ✅ Syncs schema without migration history
- ✅ No data loss
- ✅ Fast iteration
- ✅ No drift issues
- ⚠️ Doesn't track migration history (fine for dev)

### **Production Workflow (When Ready for Prod)**

```bash
# 1. Create a clean migration from current schema
npx prisma migrate dev --name descriptive_name --create-only

# 2. Review generated SQL in prisma/migrations/
# 3. Edit if needed (e.g., add data migrations)

# 4. Apply migration
npx prisma migrate deploy
```

---

## Common Commands Reference

### **Development (Daily Use)**

```bash
# Push schema changes (no migration file)
npx prisma db push

# Generate Prisma client after schema changes
npx prisma generate

# Open database GUI
npx prisma studio

# Check current database state
npx prisma db pull
```

### **Migration Management**

```bash
# Check migration status
npx prisma migrate status

# Create migration without applying
npx prisma migrate dev --create-only --name my_migration

# Apply pending migrations (production)
npx prisma migrate deploy

# Mark migration as applied (fix drift)
npx prisma migrate resolve --applied "20260125_migration_name"

# Mark migration as rolled back (fix drift)
npx prisma migrate resolve --rolled-back "20260125_migration_name"
```

### **Nuclear Options (ONLY WHEN NEEDED)**

```bash
# Reset database (DANGER: loses all data!)
npx prisma migrate reset --force

# Skip migrations and just reset data
npx prisma db push --force-reset
```

---

## When to Use Each Command

| Command | Use When | Data Loss? |
|---------|----------|------------|
| `db push` | Daily development, iterating on schema | ❌ No |
| `migrate dev` | Creating tracked migrations for features | ⚠️ May reset if drift |
| `migrate deploy` | Deploying to production | ❌ No |
| `migrate reset` | Starting fresh, fixing broken state | ✅ YES - ALL DATA |
| `migrate resolve` | Fixing drift without reset | ❌ No |

---

## Fixing Drift Without Data Loss

**Scenario:** `migrate dev` says "drift detected"

**Solution 1: Accept Current State**
```bash
# Mark all pending migrations as applied
npx prisma migrate resolve --applied "migration_name"

# Then push new changes
npx prisma db push
```

**Solution 2: Baseline Fresh**
```bash
# 1. Delete all migration files
rm -rf prisma/migrations

# 2. Create fresh baseline migration
npx prisma migrate dev --name baseline --create-only

# 3. Mark as applied (don't actually run it)
npx prisma migrate resolve --applied baseline
```

---

## Our Current Setup (as of M8)

**Database:** Neon PostgreSQL (production database)
**Schema Location:** `prisma/schema.prisma`
**Client Output:** `lib/generated/prisma`
**Config:** `prisma.config.ts`

**Recent Changes:**
- Added `settings` (Json @db.JsonB) to User model
- Added `settingsVersion` (Int @default(1)) to User model
- Applied with `npx prisma db push` (no migration file)

**Migration State:**
- Drift exists (removed unique indexes on ContentNode.slug, Tag.name/slug)
- Using `db push` to avoid reset
- Will baseline migrations before production deploy

---

## Best Practices Going Forward

### ✅ DO:
- Use `db push` for daily development
- Test schema changes in dev before production
- Create proper migrations before production deploy
- Use descriptive migration names
- Always run `prisma generate` after schema changes

### ❌ DON'T:
- Don't use `migrate dev` when drift exists (use `db push` instead)
- Don't use `migrate reset` unless absolutely necessary
- Don't manually edit migration SQL files (create new ones)
- Don't commit broken migration states
- Don't use `--force-reset` in production

---

## Quick Troubleshooting

**Problem:** "Prisma Client not found"
**Solution:** `npx prisma generate`

**Problem:** "Drift detected"
**Solution:** `npx prisma db push` (dev) or `migrate resolve` (prod)

**Problem:** TypeScript can't find Prisma types
**Solution:** `npx prisma generate` + restart TypeScript server

**Problem:** Migration failed, database in bad state
**Solution:** Check `prisma migrate status`, use `migrate resolve`

**Problem:** Need to start completely fresh
**Solution:** `npx prisma migrate reset --force` (dev only!)

---

## References

- [Prisma db push](https://www.prisma.io/docs/concepts/components/prisma-migrate/db-push)
- [Prisma migrate dev](https://www.prisma.io/docs/concepts/components/prisma-migrate/migrate-dev)
- [Prisma migrate resolve](https://www.prisma.io/docs/reference/api-reference/command-reference#migrate-resolve)
- [Baselining a database](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining)
