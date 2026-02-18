/**
 * Backfill Script - Create FolderPayload records for existing folders
 *
 * This script creates FolderPayload records for all existing folders
 * that don't have one yet. This is needed because folders created before
 * the FolderPayload feature was added won't have view settings.
 *
 * Run with: npx tsx scripts/backfill-folder-payloads.ts
 */

import { PrismaClient } from "../lib/database/generated/prisma";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

// Load environment variables
config({ path: ".env.local" });
config(); // Fallback to .env

// Create Prisma client
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function backfillFolderPayloads() {
  console.log("🔍 Finding folders without FolderPayload...");

  // Find all folders that don't have a folderPayload
  const foldersWithoutPayload = await prisma.contentNode.findMany({
    where: {
      contentType: "folder",
      folderPayload: null,
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      createdAt: true,
    },
  });

  console.log(`📊 Found ${foldersWithoutPayload.length} folders without FolderPayload`);

  if (foldersWithoutPayload.length === 0) {
    console.log("✅ All folders already have FolderPayload records!");
    return;
  }

  console.log("📝 Creating FolderPayload records...");

  let successCount = 0;
  let errorCount = 0;

  for (const folder of foldersWithoutPayload) {
    try {
      await prisma.folderPayload.create({
        data: {
          contentId: folder.id,
          viewMode: "list", // Default view mode
          sortMode: null, // Inherit tree order
          viewPrefs: {}, // Empty prefs
          includeReferencedContent: false,
          createdAt: folder.createdAt, // Use folder's creation date
          updatedAt: folder.createdAt,
        },
      });

      successCount++;
      console.log(`  ✓ Created FolderPayload for "${folder.title}" (${folder.id})`);
    } catch (error) {
      errorCount++;
      console.error(`  ✗ Failed to create FolderPayload for "${folder.title}":`, error);
    }
  }

  console.log("\n📈 Backfill Summary:");
  console.log(`  ✅ Successfully created: ${successCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log(`  📊 Total processed: ${foldersWithoutPayload.length}`);

  if (successCount > 0) {
    console.log("\n🎉 Backfill completed! All folders now have FolderPayload records.");
  }
}

// Run the backfill
backfillFolderPayloads()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
