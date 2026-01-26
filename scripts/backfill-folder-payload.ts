/**
 * Backfill FolderPayload for Existing Folders
 *
 * Creates FolderPayload records with default list view for all folder-type ContentNodes
 * that don't already have a payload.
 *
 * Usage: npx tsx scripts/backfill-folder-payload.ts
 */

import { prisma } from "../lib/database/client.js";

async function main() {
  console.log("🔍 Finding folders without FolderPayload...");

  // Find all folders
  const folders = await prisma.contentNode.findMany({
    where: {
      contentType: "folder",
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      folderPayload: true,
    },
  });

  console.log(`📊 Found ${folders.length} total folders`);

  // Filter to folders without payload
  const foldersWithoutPayload = folders.filter((f) => !f.folderPayload);

  console.log(`📦 ${foldersWithoutPayload.length} folders need FolderPayload`);

  if (foldersWithoutPayload.length === 0) {
    console.log("✅ All folders already have FolderPayload!");
    return;
  }

  console.log("🚀 Creating FolderPayload records...");

  // Create FolderPayload for each folder
  let created = 0;
  for (const folder of foldersWithoutPayload) {
    try {
      await prisma.folderPayload.create({
        data: {
          contentId: folder.id,
          viewMode: "list",
          viewPrefs: {},
          includeReferencedContent: false,
        },
      });
      created++;
      console.log(`  ✓ Created FolderPayload for: ${folder.title}`);
    } catch (error) {
      console.error(`  ✗ Failed to create FolderPayload for ${folder.title}:`, error);
    }
  }

  console.log(`\n✅ Backfill complete! Created ${created}/${foldersWithoutPayload.length} FolderPayload records`);

  // Verify
  const verification = await prisma.contentNode.findMany({
    where: {
      contentType: "folder",
    },
    select: {
      id: true,
      folderPayload: true,
    },
  });

  const withPayload = verification.filter((f) => f.folderPayload).length;
  console.log(`📊 Verification: ${withPayload}/${verification.length} folders have FolderPayload`);
}

main()
  .catch((error) => {
    console.error("❌ Backfill failed:", error);
    process.exit(1);
  });
