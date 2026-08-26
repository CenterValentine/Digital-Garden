-- Workbenches: folder-derived sub-workspaces.
--
-- Purely additive. Both columns are nullable with no default and no backfill:
-- an existing row reads as an ordinary workspace precisely because
-- "parentWorkspaceId" IS NULL. No data is read, moved, or rewritten.
--
-- The unique index is what makes lazy creation safe. A workbench is created on
-- first click, so a double-click (or two devices) can fire two POSTs before
-- either commits; without the constraint that yields two workbenches for one
-- folder, each with its own pane layout. Postgres treats NULLs as distinct in
-- unique indexes, so ordinary workspaces (NULL parent) are unaffected however
-- many share a view root, and two different parents may each hold a workbench
-- on the same folder.

ALTER TABLE "ContentWorkspace" ADD COLUMN "parentWorkspaceId" UUID;
ALTER TABLE "ContentWorkspace" ADD COLUMN "dormantAt" TIMESTAMPTZ(6);

CREATE INDEX "ContentWorkspace_parentWorkspaceId_idx" ON "ContentWorkspace"("parentWorkspaceId");

CREATE UNIQUE INDEX "ContentWorkspace_parentWorkspaceId_viewRootContentId_key" ON "ContentWorkspace"("parentWorkspaceId", "viewRootContentId");

ALTER TABLE "ContentWorkspace" ADD CONSTRAINT "ContentWorkspace_parentWorkspaceId_fkey" FOREIGN KEY ("parentWorkspaceId") REFERENCES "ContentWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
