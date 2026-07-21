-- Fix Account.updatedAt missing column (causes auth failures — account.findUnique returns "column does not exist")
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Fix Calendar schema drift: enums were replaced with varchar in schema.prisma after migration was applied
-- Step 1: Drop affected FK and indexes that reference enum columns
ALTER TABLE "CalendarSource" DROP CONSTRAINT IF EXISTS "CalendarSource_connectionId_fkey";
DROP INDEX IF EXISTS "CalendarConnection_userId_status_idx";
DROP INDEX IF EXISTS "CalendarEventAttendee_eventId_email_key";
DROP INDEX IF EXISTS "CalendarEventAttendee_eventId_responseStatus_idx";
DROP INDEX IF EXISTS "CalendarSource_connectionId_idx";
DROP INDEX IF EXISTS "CalendarSource_userId_visible_idx";

-- Step 2: Migrate CalendarConnection enum columns to varchar
ALTER TABLE "CalendarConnection"
  ALTER COLUMN "provider" TYPE VARCHAR(20) USING "provider"::TEXT,
  ALTER COLUMN "displayName" TYPE VARCHAR(255),
  ALTER COLUMN "status" TYPE VARCHAR(30) USING "status"::TEXT,
  ALTER COLUMN "syncStatus" TYPE VARCHAR(20) USING "syncStatus"::TEXT;

ALTER TABLE "CalendarConnection"
  ALTER COLUMN "status" SET DEFAULT 'active',
  ALTER COLUMN "syncStatus" SET DEFAULT 'idle';

-- Step 3: Migrate CalendarSource enum column to varchar
ALTER TABLE "CalendarSource"
  ALTER COLUMN "title" TYPE VARCHAR(255),
  ALTER COLUMN "color" TYPE VARCHAR(7),
  ALTER COLUMN "timezone" TYPE VARCHAR(100),
  ALTER COLUMN "syncMode" TYPE VARCHAR(20) USING "syncMode"::TEXT;

ALTER TABLE "CalendarSource"
  ALTER COLUMN "syncMode" SET DEFAULT 'local';

-- Step 4: Migrate CalendarEvent enum column to varchar
ALTER TABLE "CalendarEvent"
  ALTER COLUMN "externalEventId" TYPE VARCHAR(512),
  ALTER COLUMN "location" TYPE VARCHAR(512),
  ALTER COLUMN "timezone" TYPE VARCHAR(100),
  ALTER COLUMN "status" TYPE VARCHAR(20) USING "status"::TEXT,
  ALTER COLUMN "meetingUrl" TYPE VARCHAR(512);

ALTER TABLE "CalendarEvent"
  ALTER COLUMN "status" SET DEFAULT 'confirmed';

-- Step 5: Migrate CalendarEventAttendee — drop old enum column, add varchar
ALTER TABLE "CalendarEventAttendee"
  DROP COLUMN IF EXISTS "responseStatus";

ALTER TABLE "CalendarEventAttendee"
  ADD COLUMN "responseStatus" VARCHAR(20) NOT NULL DEFAULT 'needs_action';

ALTER TABLE "CalendarEventAttendee"
  DROP COLUMN IF EXISTS "createdAt",
  DROP COLUMN IF EXISTS "metadata",
  DROP COLUMN IF EXISTS "updatedAt";

-- Step 6: Drop the now-unused Calendar enums
DROP TYPE IF EXISTS "CalendarAttendeeResponseStatus";
DROP TYPE IF EXISTS "CalendarConnectionStatus";
DROP TYPE IF EXISTS "CalendarEventStatus";
DROP TYPE IF EXISTS "CalendarProvider";
DROP TYPE IF EXISTS "CalendarSourceSyncMode";
DROP TYPE IF EXISTS "CalendarSyncStatus";

-- Step 7: Re-create indexes and FK matching new schema
CREATE INDEX IF NOT EXISTS "CalendarConnection_userId_provider_idx" ON "CalendarConnection"("userId", "provider");
CREATE INDEX IF NOT EXISTS "CalendarEventAttendee_eventId_idx" ON "CalendarEventAttendee"("eventId");
CREATE INDEX IF NOT EXISTS "CalendarEventAttendee_email_idx" ON "CalendarEventAttendee"("email");
CREATE INDEX IF NOT EXISTS "CalendarSource_userId_connectionId_idx" ON "CalendarSource"("userId", "connectionId");
CREATE INDEX IF NOT EXISTS "CalendarSource_userId_syncMode_idx" ON "CalendarSource"("userId", "syncMode");
CREATE INDEX IF NOT EXISTS "CalendarSource_userId_isPrimary_idx" ON "CalendarSource"("userId", "isPrimary");

ALTER TABLE "CalendarSource"
  ADD CONSTRAINT "CalendarSource_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
