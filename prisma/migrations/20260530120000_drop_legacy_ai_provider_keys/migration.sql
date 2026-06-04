-- Drop legacy AIProviderKey table.
-- The model was replaced by AIConnection earlier in this epoch; all
-- callers have been deleted (route handlers, services, BYOK lookup).
-- IF EXISTS keeps this safe in environments where the table was
-- already removed manually or via `prisma db push` (e.g. dev).

-- DropForeignKey
ALTER TABLE IF EXISTS "AIProviderKey" DROP CONSTRAINT IF EXISTS "AIProviderKey_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "AIProviderKey";
