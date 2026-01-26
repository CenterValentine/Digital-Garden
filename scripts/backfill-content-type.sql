-- Backfill contentType for existing ContentNode records
-- This script derives contentType from payload presence (mimics deriveContentType logic)

UPDATE "ContentNode" SET "contentType" =
  CASE
    WHEN EXISTS (SELECT 1 FROM "NotePayload" WHERE "contentId" = "ContentNode"."id") THEN 'note'::"ContentType"
    WHEN EXISTS (SELECT 1 FROM "FilePayload" WHERE "contentId" = "ContentNode"."id") THEN 'file'::"ContentType"
    WHEN EXISTS (SELECT 1 FROM "HtmlPayload" WHERE "contentId" = "ContentNode"."id" AND "isTemplate" = false) THEN 'html'::"ContentType"
    WHEN EXISTS (SELECT 1 FROM "HtmlPayload" WHERE "contentId" = "ContentNode"."id" AND "isTemplate" = true) THEN 'template'::"ContentType"
    WHEN EXISTS (SELECT 1 FROM "CodePayload" WHERE "contentId" = "ContentNode"."id") THEN 'code'::"ContentType"
    ELSE 'folder'::"ContentType"
  END
WHERE "contentType" IS NULL;

-- Verify the backfill
SELECT "contentType", COUNT(*) as count
FROM "ContentNode"
GROUP BY "contentType"
ORDER BY count DESC;

-- Check for any NULL contentTypes (should be 0)
SELECT COUNT(*) as null_count
FROM "ContentNode"
WHERE "contentType" IS NULL;
