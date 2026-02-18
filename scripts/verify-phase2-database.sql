-- ============================================================
-- Phase 2 Database Integrity Verification
-- ============================================================

-- Check 1: Verify ContentType enum has all Phase 2 values
SELECT 'ContentType Enum Values:' as check_name;
SELECT unnest(enum_range(NULL::"ContentType")) as content_type;

-- Check 2: Verify ContentRole enum exists and has correct values
SELECT 'ContentRole Enum Values:' as check_name;
SELECT unnest(enum_range(NULL::"ContentRole")) as content_role;

-- Check 3: Verify FolderViewMode enum exists
SELECT 'FolderViewMode Enum Values:' as check_name;
SELECT unnest(enum_range(NULL::"FolderViewMode")) as folder_view_mode;

-- Check 4: Count folders and verify FolderPayload backfill
SELECT 'Folder Backfill Status:' as check_name;
SELECT
  COUNT(*) as total_folders,
  COUNT(fp."contentId") as folders_with_payload,
  CASE
    WHEN COUNT(*) = COUNT(fp."contentId") THEN '✅ All folders have payload'
    ELSE '❌ Missing payloads!'
  END as status
FROM "ContentNode" cn
LEFT JOIN "FolderPayload" fp ON cn.id = fp."contentId"
WHERE cn."contentType" = 'folder';

-- Check 5: Verify all ContentNodes have a role field
SELECT 'ContentRole Distribution:' as check_name;
SELECT
  role,
  COUNT(*) as count
FROM "ContentNode"
GROUP BY role
ORDER BY count DESC;

-- Check 6: Verify ContentType distribution
SELECT 'ContentType Distribution:' as check_name;
SELECT
  "contentType",
  COUNT(*) as count
FROM "ContentNode"
GROUP BY "contentType"
ORDER BY count DESC;

-- Check 7: Verify new payload tables exist
SELECT 'New Payload Tables:' as check_name;
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('FolderPayload', 'ExternalPayload', 'ChatPayload', 'VisualizationPayload', 'DataPayload', 'HopePayload', 'WorkflowPayload')
ORDER BY table_name;

-- Check 8: Verify no orphaned payload records
SELECT 'Orphaned Payload Check:' as check_name;
SELECT
  'FolderPayload' as payload_table,
  COUNT(*) as orphaned_count
FROM "FolderPayload" fp
WHERE NOT EXISTS (
  SELECT 1 FROM "ContentNode" WHERE id = fp."contentId"
);
