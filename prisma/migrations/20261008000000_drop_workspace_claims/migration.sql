-- DropForeignKey
ALTER TABLE "ContentWorkspaceItem" DROP CONSTRAINT "ContentWorkspaceItem_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "ContentWorkspaceItem" DROP CONSTRAINT "ContentWorkspaceItem_contentId_fkey";

-- AlterTable
ALTER TABLE "ContentWorkspace" DROP COLUMN "isLocked";

-- DropTable
DROP TABLE "ContentWorkspaceItem";

-- DropEnum
DROP TYPE "ContentWorkspaceItemAssignmentType";

-- DropEnum
DROP TYPE "ContentWorkspaceItemScope";
