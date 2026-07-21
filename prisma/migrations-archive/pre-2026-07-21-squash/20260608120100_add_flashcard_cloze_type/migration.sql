-- Backfill: the `cloze` value on the FlashcardCardType enum, added to the
-- schema in commit ac3319d without a migration. Kept in its own migration
-- because Postgres only permits a newly-added enum value to be USED after the
-- adding transaction commits — isolating it avoids any same-transaction-use
-- hazard for adjacent statements. Idempotent (PG12+ supports IF NOT EXISTS).
ALTER TYPE "FlashcardCardType" ADD VALUE IF NOT EXISTS 'cloze';
