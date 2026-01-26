-- Verify contentType backfill results

-- Check distribution by contentType
SELECT "contentType", COUNT(*) as count
FROM "ContentNode"
GROUP BY "contentType"
ORDER BY count DESC;

-- Check for any NULL contentTypes (should be 0)
SELECT COUNT(*) as null_count
FROM "ContentNode"
WHERE "contentType" IS NULL;

-- Verify contentType matches payload presence (sample check)
SELECT
  cn."id",
  cn."title",
  cn."contentType",
  CASE
    WHEN np."contentId" IS NOT NULL THEN 'has_note'
    WHEN fp."contentId" IS NOT NULL THEN 'has_file'
    WHEN hp."contentId" IS NOT NULL AND hp."isTemplate" = false THEN 'has_html'
    WHEN hp."contentId" IS NOT NULL AND hp."isTemplate" = true THEN 'has_template'
    WHEN cp."contentId" IS NOT NULL THEN 'has_code'
    ELSE 'no_payload'
  END as detected_type
FROM "ContentNode" cn
LEFT JOIN "NotePayload" np ON cn."id" = np."contentId"
LEFT JOIN "FilePayload" fp ON cn."id" = fp."contentId"
LEFT JOIN "HtmlPayload" hp ON cn."id" = hp."contentId"
LEFT JOIN "CodePayload" cp ON cn."id" = cp."contentId"
LIMIT 10;
