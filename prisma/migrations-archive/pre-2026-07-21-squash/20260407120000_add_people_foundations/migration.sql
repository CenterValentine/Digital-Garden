-- Epoch 13 People foundations.
-- Groups/subgroups are People-domain records rendered folder-like in the file tree;
-- this intentionally does not add a group ContentType.

-- AlterTable
ALTER TABLE "ContentNode" ADD COLUMN IF NOT EXISTS "peopleGroupId" UUID;
ALTER TABLE "ContentNode" ADD COLUMN IF NOT EXISTS "personId" UUID;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PeopleGroup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "parentGroupId" UUID,
    "defaultForOwnerId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    CONSTRAINT "PeopleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Person" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "primaryGroupId" UUID NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "givenName" VARCHAR(120),
    "familyName" VARCHAR(120),
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "avatarUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PeopleFileTreeMount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "contentParentId" UUID,
    "groupId" UUID,
    "personId" UUID,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PeopleFileTreeMount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PersonMention" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "positions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonMention_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "PeopleGroup_defaultForOwnerId_key" ON "PeopleGroup"("defaultForOwnerId");
CREATE UNIQUE INDEX IF NOT EXISTS "PeopleGroup_ownerId_slug_key" ON "PeopleGroup"("ownerId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Person_ownerId_slug_key" ON "Person"("ownerId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "PeopleFileTreeMount_ownerId_groupId_key" ON "PeopleFileTreeMount"("ownerId", "groupId");
CREATE UNIQUE INDEX IF NOT EXISTS "PeopleFileTreeMount_ownerId_personId_key" ON "PeopleFileTreeMount"("ownerId", "personId");
CREATE UNIQUE INDEX IF NOT EXISTS "PersonMention_contentId_personId_key" ON "PersonMention"("contentId", "personId");

-- Indexes
CREATE INDEX IF NOT EXISTS "ContentNode_peopleGroupId_displayOrder_idx" ON "ContentNode"("peopleGroupId", "displayOrder");
CREATE INDEX IF NOT EXISTS "ContentNode_personId_displayOrder_idx" ON "ContentNode"("personId", "displayOrder");
CREATE INDEX IF NOT EXISTS "PeopleGroup_ownerId_parentGroupId_displayOrder_idx" ON "PeopleGroup"("ownerId", "parentGroupId", "displayOrder");
CREATE INDEX IF NOT EXISTS "PeopleGroup_ownerId_isDefault_idx" ON "PeopleGroup"("ownerId", "isDefault");
CREATE INDEX IF NOT EXISTS "PeopleGroup_parentGroupId_idx" ON "PeopleGroup"("parentGroupId");
CREATE INDEX IF NOT EXISTS "PeopleGroup_deletedAt_idx" ON "PeopleGroup"("deletedAt");
CREATE INDEX IF NOT EXISTS "Person_ownerId_primaryGroupId_displayOrder_idx" ON "Person"("ownerId", "primaryGroupId", "displayOrder");
CREATE INDEX IF NOT EXISTS "Person_ownerId_displayName_idx" ON "Person"("ownerId", "displayName");
CREATE INDEX IF NOT EXISTS "Person_email_idx" ON "Person"("email");
CREATE INDEX IF NOT EXISTS "Person_deletedAt_idx" ON "Person"("deletedAt");
CREATE INDEX IF NOT EXISTS "PeopleFileTreeMount_ownerId_contentParentId_displayOrder_idx" ON "PeopleFileTreeMount"("ownerId", "contentParentId", "displayOrder");
CREATE INDEX IF NOT EXISTS "PeopleFileTreeMount_contentParentId_idx" ON "PeopleFileTreeMount"("contentParentId");
CREATE INDEX IF NOT EXISTS "PersonMention_ownerId_personId_idx" ON "PersonMention"("ownerId", "personId");
CREATE INDEX IF NOT EXISTS "PersonMention_personId_idx" ON "PersonMention"("personId");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_peopleGroupId_fkey"
    FOREIGN KEY ("peopleGroupId") REFERENCES "PeopleGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleGroup" ADD CONSTRAINT "PeopleGroup_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleGroup" ADD CONSTRAINT "PeopleGroup_defaultForOwnerId_fkey"
    FOREIGN KEY ("defaultForOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleGroup" ADD CONSTRAINT "PeopleGroup_parentGroupId_fkey"
    FOREIGN KEY ("parentGroupId") REFERENCES "PeopleGroup"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Person" ADD CONSTRAINT "Person_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Person" ADD CONSTRAINT "Person_primaryGroupId_fkey"
    FOREIGN KEY ("primaryGroupId") REFERENCES "PeopleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleFileTreeMount" ADD CONSTRAINT "PeopleFileTreeMount_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleFileTreeMount" ADD CONSTRAINT "PeopleFileTreeMount_contentParentId_fkey"
    FOREIGN KEY ("contentParentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleFileTreeMount" ADD CONSTRAINT "PeopleFileTreeMount_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "PeopleGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleFileTreeMount" ADD CONSTRAINT "PeopleFileTreeMount_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PersonMention" ADD CONSTRAINT "PersonMention_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PersonMention" ADD CONSTRAINT "PersonMention_contentId_fkey"
    FOREIGN KEY ("contentId") REFERENCES "ContentNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PersonMention" ADD CONSTRAINT "PersonMention_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Guardrails Prisma cannot express directly.
DO $$ BEGIN
  ALTER TABLE "ContentNode" ADD CONSTRAINT "ContentNode_people_assignment_exclusive_check"
    CHECK (NOT ("peopleGroupId" IS NOT NULL AND "personId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleGroup" ADD CONSTRAINT "PeopleGroup_default_owner_check"
    CHECK (
      ("isDefault" = true AND "defaultForOwnerId" = "ownerId")
      OR ("isDefault" = false AND "defaultForOwnerId" IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleGroup" ADD CONSTRAINT "PeopleGroup_not_own_parent_check"
    CHECK ("parentGroupId" IS NULL OR "parentGroupId" <> "id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PeopleFileTreeMount" ADD CONSTRAINT "PeopleFileTreeMount_single_target_check"
    CHECK (
      ("groupId" IS NOT NULL AND "personId" IS NULL)
      OR ("groupId" IS NULL AND "personId" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
