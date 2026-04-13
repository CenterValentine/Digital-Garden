import type { PrismaClient } from "@/lib/database/generated/prisma";

export type CollaborationAccessLevel = "none" | "view" | "edit" | "owner";

export interface ContentAccessResult {
  contentId: string;
  ownerId: string;
  userId: string;
  accessLevel: CollaborationAccessLevel;
  canView: boolean;
  canEdit: boolean;
  readOnly: boolean;
}

const EDIT_LEVELS = new Set(["edit", "write", "owner"]);
const VIEW_LEVELS = new Set(["view", "read", ...EDIT_LEVELS]);

export async function resolveContentAccess(
  prisma: PrismaClient,
  input: {
    contentId: string;
    userId: string;
    require?: "view" | "edit";
  }
): Promise<ContentAccessResult> {
  const content = await prisma.contentNode.findFirst({
    where: {
      id: input.contentId,
      deletedAt: null,
    },
    select: {
      id: true,
      ownerId: true,
      contentType: true,
    },
  });

  if (!content) {
    throw new Error("Content not found");
  }

  let accessLevel: CollaborationAccessLevel = "none";
  if (content.ownerId === input.userId) {
    accessLevel = "owner";
  } else {
    const grant = await prisma.viewGrant.findUnique({
      where: {
        contentId_userId: {
          contentId: input.contentId,
          userId: input.userId,
        },
      },
      select: {
        accessLevel: true,
        expiresAt: true,
      },
    });
    const grantLevel =
      grant && (!grant.expiresAt || grant.expiresAt > new Date())
        ? grant.accessLevel.toLowerCase()
        : null;
    if (grantLevel && EDIT_LEVELS.has(grantLevel)) {
      accessLevel = "edit";
    } else if (grantLevel && VIEW_LEVELS.has(grantLevel)) {
      accessLevel = "view";
    }
  }

  const canView = accessLevel !== "none";
  const canEdit = accessLevel === "edit" || accessLevel === "owner";

  if (input.require === "view" && !canView) {
    throw new Error("View access required");
  }
  if (input.require === "edit" && !canEdit) {
    throw new Error("Edit access required");
  }

  return {
    contentId: content.id,
    ownerId: content.ownerId,
    userId: input.userId,
    accessLevel,
    canView,
    canEdit,
    readOnly: !canEdit,
  };
}
