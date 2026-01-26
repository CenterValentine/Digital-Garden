-- Backfill FolderPayload for existing folders
-- Creates FolderPayload records with default list view for all folder-type ContentNodes

INSERT INTO "FolderPayload" ("contentId", "viewMode", "viewPrefs", "createdAt", "updatedAt")
SELECT
  id,
  'list'::"FolderViewMode",
  '{}'::json,
  "createdAt",
  "updatedAt"
FROM "ContentNode"
WHERE "contentType" = 'folder'::"ContentType"
  AND id NOT IN (SELECT "contentId" FROM "FolderPayload");

-- Verify the backfill
SELECT
  COUNT(*) as total_folders,
  COUNT(fp."contentId") as folders_with_payload
FROM "ContentNode" cn
LEFT JOIN "FolderPayload" fp ON cn.id = fp."contentId"
WHERE cn."contentType" = 'folder'::"ContentType";
