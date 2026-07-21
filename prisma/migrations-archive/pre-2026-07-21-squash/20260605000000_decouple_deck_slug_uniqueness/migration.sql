-- Decouple FlashcardDeck slug uniqueness from the path materialized
-- column. Anki-style nested decks need to allow the same leaf name to
-- coexist under different parents (e.g. "spanish/irregular-verbs" AND
-- "general/irregular-verbs"). The old @@unique([ownerId, slug]) blocked
-- this because slug carries only the leaf token.
--
-- After this migration:
--   - Uniqueness is enforced on (ownerId, path), which is the full
--     materialized hierarchy and IS supposed to be globally unique.
--   - (ownerId, slug) becomes a non-unique index for legacy lookups
--     in resolveLegacyDeckId (the Sprint 6 category/subcategory shim).
--   - The old (ownerId, path) non-unique index is dropped — superseded
--     by the new unique constraint, which also serves as an index.
--   - (ownerId, parentDeckId, name) unique constraint is unchanged —
--     it already prevents duplicate-name siblings at the same level.
--
-- App-level callers were migrated in the same commit:
--   - lib/domain/flashcards/legacy-compat.ts (resolveLegacyDeckId)
--   - app/api/flashcards/route.ts (GET handler legacy lookup)
--   - app/api/flashcards/decks/route.ts (PATCH handler legacy lookup)
--
-- Rollback: drop the new constraints, recreate the old ones. Safe to
-- roll back IF the data was previously slug-unique (which it was prior
-- to this migration). Verify with:
--   SELECT "ownerId", slug, count(*) FROM "FlashcardDeck"
--   WHERE "deletedAt" IS NULL GROUP BY 1, 2 HAVING count(*) > 1;

-- 1. Drop the slug-unique constraint
DROP INDEX "FlashcardDeck_ownerId_slug_key";

-- 2. Add the path-unique constraint
CREATE UNIQUE INDEX "FlashcardDeck_ownerId_path_key"
  ON "FlashcardDeck"("ownerId", "path");

-- 3. Drop the redundant non-unique path index (the new unique covers it)
DROP INDEX "FlashcardDeck_ownerId_path_idx";

-- 4. Add a non-unique slug index for legacy lookups
CREATE INDEX "FlashcardDeck_ownerId_slug_idx"
  ON "FlashcardDeck"("ownerId", "slug");
