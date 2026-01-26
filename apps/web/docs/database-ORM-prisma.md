## Why use an ORM?

An ORM (Object–Relational Mapper) is a tool that lets your application work with a database using code objects instead of raw SQL.
An ORM exists to manage changes to the database schema. ORMs trade a little control for earlier feedback and safer change management.

1. CRUD convenience
2. Schema awareness
3. Type safety
4. Change/migration management
5. Data integrity/consistency

To catch breaking database changes earlier

Prisma thesis: Compile-time failure instead of runtime surprises by:

1. Detecting schema differences
2. Generating a migration
3. Forcing regeneration of types
4. Breaking the build if the app is out of sync

It also:

- centralizes the schema
- makes changes reviewable in PRs
- surfaces breakage immediately
- enforces migration discipline
- keeps DB + app in lockstep

You are still responsible for:

- migration intent
- data preservation
- backward compatibility

## Careful Column renaming:

1. Rename from email to emailAddress

```prisma
model User {
  id            String @id @default(uuid())
  emailAddress  String @unique
}
```

2. Run migration

   > npx prisma migrate dev --name rename_email

3. Fix the migration manually:

   > ALTER TABLE "User" RENAME COLUMN "email" TO "emailAddress";

4. Build failure
   any code using user.email will now fail to compile.

! Prisma will:

- generate a migration
- force you to handle casting or backfilling
- fail if unsafe

## The Rules of Prisma Usage:

1. Always read generated migrations
2. Use expand → backfill → contract
   ```Add new column
   Backfill data
   Switch app code
   Remove old column later
   ```
3. Never assume Prisma understands intent

---

## Assumptions:

Automatic renames are dangerous at scale
Tooling should force decisions, not guess them
Compile-time failures are a gift
Migration review is part of engineering, not overhead
You can use SQL with ORMs (escape hatches exist)

## Further Learning

- Hybrid approaches (ORM + raw SQL)
- Zero-downtime migrations
- Postgres ALTER TABLE strategies
- Prisma migration internals
- Schema drift detection
- Forward-only migration philosophy
  -ORM vs query builder vs raw SQL
- Schema evolution
- When ORMs leak abstractions

## AI Prompts:

> “Given this Prisma schema change, rewrite the generated migration to preserve data and support zero-downtime deploys.”
> "Show a safe rename pattern step-by-step"
> "Design a migration review rubric I can reuse"
