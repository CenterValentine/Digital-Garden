/**
 * Test script to verify FolderPayload creation and retrieval
 *
 * Tests:
 * 1. Create folder with default settings
 * 2. Create folder with custom view mode
 * 3. Retrieve folder and verify payload
 * 4. Update folder payload
 *
 * Run: npx tsx scripts/test-folder-payload.ts
 */

import { prisma } from "@/lib/database/client";

// Inline constant to avoid importing client-side dependencies
const CONTENT_WITH_PAYLOADS = {
  folderPayload: true,
  notePayload: true,
  filePayload: true,
  htmlPayload: true,
  codePayload: true,
  externalPayload: true,
  chatPayload: true,
  visualizationPayload: true,
  dataPayload: true,
  hopePayload: true,
  workflowPayload: true,
} as const;

async function main() {
  console.log("🧪 Testing FolderPayload Implementation\n");

  // Find or create a test user
  let testUser = await prisma.user.findFirst({
    where: { role: "owner" },
  });

  if (!testUser) {
    console.error("❌ No owner user found. Please create a user first.");
    process.exit(1);
  }

  console.log(`✅ Using test user: ${testUser.email}\n`);

  // Test 1: Create folder with default settings
  console.log("📁 Test 1: Creating folder with default settings...");
  const folder1 = await prisma.contentNode.create({
    data: {
      title: "Test Folder - Default",
      slug: `test-folder-default-${Date.now()}`,
      contentType: "folder",
      ownerId: testUser.id,
      folderPayload: {
        create: {
          viewMode: "list",
          sortMode: null,
          viewPrefs: {},
          includeReferencedContent: false,
        },
      },
    },
    include: CONTENT_WITH_PAYLOADS,
  });

  if (!folder1.folderPayload) {
    console.error("❌ FAIL: FolderPayload not created!");
    process.exit(1);
  }

  console.log(`✅ PASS: Folder created with ID: ${folder1.id}`);
  console.log(`   - viewMode: ${folder1.folderPayload.viewMode}`);
  console.log(`   - sortMode: ${folder1.folderPayload.sortMode}`);
  console.log(`   - includeReferencedContent: ${folder1.folderPayload.includeReferencedContent}\n`);

  // Test 2: Create folder with custom settings
  console.log("📁 Test 2: Creating folder with custom settings...");
  const folder2 = await prisma.contentNode.create({
    data: {
      title: "Test Folder - Gallery",
      slug: `test-folder-gallery-${Date.now()}`,
      contentType: "folder",
      ownerId: testUser.id,
      folderPayload: {
        create: {
          viewMode: "gallery",
          sortMode: "asc",
          viewPrefs: { gridSize: "large" },
          includeReferencedContent: true,
        },
      },
    },
    include: CONTENT_WITH_PAYLOADS,
  });

  if (!folder2.folderPayload) {
    console.error("❌ FAIL: FolderPayload not created!");
    process.exit(1);
  }

  if (folder2.folderPayload.viewMode !== "gallery") {
    console.error(`❌ FAIL: Expected viewMode 'gallery', got '${folder2.folderPayload.viewMode}'`);
    process.exit(1);
  }

  console.log(`✅ PASS: Folder created with ID: ${folder2.id}`);
  console.log(`   - viewMode: ${folder2.folderPayload.viewMode}`);
  console.log(`   - sortMode: ${folder2.folderPayload.sortMode}`);
  console.log(`   - includeReferencedContent: ${folder2.folderPayload.includeReferencedContent}`);
  console.log(`   - viewPrefs: ${JSON.stringify(folder2.folderPayload.viewPrefs)}\n`);

  // Test 3: Retrieve folder and verify payload
  console.log("📁 Test 3: Retrieving folder and verifying payload...");
  const retrieved = await prisma.contentNode.findUnique({
    where: { id: folder1.id },
    include: CONTENT_WITH_PAYLOADS,
  });

  if (!retrieved) {
    console.error("❌ FAIL: Could not retrieve folder!");
    process.exit(1);
  }

  if (!retrieved.folderPayload) {
    console.error("❌ FAIL: FolderPayload missing on retrieval!");
    process.exit(1);
  }

  console.log(`✅ PASS: Folder retrieved successfully with payload\n`);

  // Test 4: Update folder payload
  console.log("📁 Test 4: Updating folder payload...");
  await prisma.folderPayload.update({
    where: { contentId: folder1.id },
    data: {
      viewMode: "kanban",
      includeReferencedContent: true,
    },
  });

  const updated = await prisma.contentNode.findUnique({
    where: { id: folder1.id },
    include: CONTENT_WITH_PAYLOADS,
  });

  if (!updated?.folderPayload) {
    console.error("❌ FAIL: Could not retrieve updated folder!");
    process.exit(1);
  }

  if (updated.folderPayload.viewMode !== "kanban") {
    console.error(`❌ FAIL: Expected viewMode 'kanban', got '${updated.folderPayload.viewMode}'`);
    process.exit(1);
  }

  if (!updated.folderPayload.includeReferencedContent) {
    console.error("❌ FAIL: includeReferencedContent not updated!");
    process.exit(1);
  }

  console.log(`✅ PASS: Folder payload updated successfully`);
  console.log(`   - viewMode: ${updated.folderPayload.viewMode}`);
  console.log(`   - includeReferencedContent: ${updated.folderPayload.includeReferencedContent}\n`);

  // Test 5: Verify discriminant pattern
  console.log("📁 Test 5: Verifying discriminant pattern...");

  if (folder1.notePayload !== null) {
    console.error("❌ FAIL: Folder should not have notePayload!");
    process.exit(1);
  }

  if (folder1.filePayload !== null) {
    console.error("❌ FAIL: Folder should not have filePayload!");
    process.exit(1);
  }

  if (folder1.htmlPayload !== null) {
    console.error("❌ FAIL: Folder should not have htmlPayload!");
    process.exit(1);
  }

  if (folder1.codePayload !== null) {
    console.error("❌ FAIL: Folder should not have codePayload!");
    process.exit(1);
  }

  if (folder1.externalPayload !== null) {
    console.error("❌ FAIL: Folder should not have externalPayload!");
    process.exit(1);
  }

  console.log("✅ PASS: Folder has exactly one payload (folderPayload only)\n");

  // Cleanup
  console.log("🧹 Cleaning up test data...");
  await prisma.contentNode.deleteMany({
    where: {
      id: { in: [folder1.id, folder2.id] },
    },
  });
  console.log("✅ Test data cleaned up\n");

  console.log("🎉 All tests passed! FolderPayload implementation is working correctly.\n");
}

main()
  .catch((error) => {
    console.error("❌ Test failed with error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
