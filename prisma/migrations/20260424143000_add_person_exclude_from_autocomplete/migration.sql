-- Backfill: this migration was applied to production via `prisma db push`
-- without producing a migration file. SQL reconstructed from schema state.
-- Apply on prod via: `npx prisma migrate resolve --applied 20260424143000_add_person_exclude_from_autocomplete`

-- AlterTable
ALTER TABLE "Person" ADD COLUMN "excludeFromAutocomplete" BOOLEAN NOT NULL DEFAULT false;
