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

export type PrefetchedAccessNode = {
  id: string;
  ownerId: string;
  contentType: string;
  deletedAt?: Date | null;
};

/**
 * Resolve access when the caller already has the content node in hand.
 *
 * Use this from API routes that fetched the content for other reasons
 * (payload includes, ownership-derived response shape, etc.) — passing it
 * here skips the duplicate `findFirst` that `resolveContentAccess` would
 * otherwise issue. Saves one DB round trip per request.
 *
 * The caller must guarantee `content` came from a query with the same
 * tombstone semantics as the original helper (`deletedAt: null`); if
 * `content.deletedAt` is set, this throws the same "Content not found"
 * error the original helper would.
 */
export async function resolveContentAccessFromNode(
  prisma: PrismaClient,
  input: {
    content: PrefetchedAccessNode;
    userId: string;
    require?: "view" | "edit";
  }
): Promise<ContentAccessResult> {
  const content = input.content;
  if (content.deletedAt) {
    throw new Error("Content not found");
  }

  let accessLevel: CollaborationAccessLevel = "none";
  if (content.ownerId === input.userId) {
    accessLevel = "owner";
  } else {
    const grant = await prisma.viewGrant.findUnique({
      where: {
        contentId_userId: {
          contentId: content.id,
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

  // Delegate to the prefetched variant — kept as one implementation so the
  // grant-lookup and EDIT/VIEW level mapping live in a single place.
  return resolveContentAccessFromNode(prisma, {
    content,
    userId: input.userId,
    require: input.require,
  });
}

