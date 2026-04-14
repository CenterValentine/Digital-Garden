import type { Prisma, PrismaClient } from "@/lib/database/generated/prisma";

import {
  evaluatePeopleMount,
  type PeopleMountConflict,
  type PeopleMountTarget,
  type PeoplePolicyDecision,
} from "./tree-policy";

type PeoplePrismaClient = PrismaClient | Prisma.TransactionClient;

interface PeopleGroupReference {
  id: string;
  parentGroupId: string | null;
}

export interface PeopleFileTreeMountRecord {
  id: string;
  ownerId: string;
  contentParentId: string | null;
  groupId: string | null;
  personId: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreviewPeopleFileTreeMountInput {
  ownerId: string;
  target: PeopleMountTarget;
  contentParentId: string | null;
  allowRemount?: boolean;
}

export interface PreviewPeopleFileTreeMountResult {
  decision: PeoplePolicyDecision;
  target: PeopleMountTarget;
  contentParentId: string | null;
}

export interface CreatePeopleFileTreeMountInput extends PreviewPeopleFileTreeMountInput {
  displayOrder?: number;
  allowRemount?: boolean;
}

export type CreatePeopleFileTreeMountResult =
  | {
      created: true;
      mount: PeopleFileTreeMountRecord;
      decision: PeoplePolicyDecision;
    }
  | {
      created: false;
      status: "confirmation-required" | "denied";
      decision: PeoplePolicyDecision;
    };

export async function previewPeopleFileTreeMount(
  prisma: PeoplePrismaClient,
  input: PreviewPeopleFileTreeMountInput
): Promise<PreviewPeopleFileTreeMountResult> {
  await assertMountParentIsValid(prisma, input.ownerId, input.contentParentId);
  const targetContext = await assertMountTargetExists(prisma, input.ownerId, input.target);
  const existingTargetMount = await findExistingTargetMount(prisma, input.ownerId, input.target);

  if (input.target.kind === "person") {
    if (!("primaryGroupId" in targetContext)) {
      throw new Error("Invalid People mount target context.");
    }

    const conflicts = await findAncestorGroupMountConflicts(
      prisma,
      input.ownerId,
      targetContext.primaryGroupId
    );

    if (conflicts.length > 0) {
      if (existingTargetMount) {
        return {
          target: input.target,
          contentParentId: input.contentParentId,
          decision: evaluatePeopleMount({
            target: input.target,
            existingTargetMount,
            conflictingMounts: conflicts,
            allowRemount: input.allowRemount,
          }),
        };
      }

      return {
        target: input.target,
        contentParentId: input.contentParentId,
        decision: {
          ok: true,
          action: "require-confirmation",
          reason: "This person is already represented through an ancestor group mount. Add a direct representation here?",
          conflicts,
        },
      };
    }

    if (existingTargetMount) {
      return {
        target: input.target,
        contentParentId: input.contentParentId,
        decision: evaluatePeopleMount({
          target: input.target,
          existingTargetMount,
          allowRemount: input.allowRemount,
        }),
      };
    }

    return {
      target: input.target,
      contentParentId: input.contentParentId,
      decision: { ok: true, action: "allow" },
    };
  }

  if (!("groupId" in targetContext)) {
    throw new Error("Invalid People mount target context.");
  }

  const conflictingMounts = await findGroupOverlapMountConflicts(
    prisma,
    input.ownerId,
    targetContext.groupId
  );

  return {
    target: input.target,
    contentParentId: input.contentParentId,
    decision: evaluatePeopleMount({
      target: input.target,
      existingTargetMount,
      conflictingMounts,
      allowRemount: input.allowRemount,
    }),
  };
}

export async function createPeopleFileTreeMount(
  prisma: PrismaClient,
  input: CreatePeopleFileTreeMountInput
): Promise<CreatePeopleFileTreeMountResult> {
  return prisma.$transaction(async (tx) => {
    const existingTargetMount = await getExistingTargetMountRecord(tx, input.ownerId, input.target);
    const preview = await previewPeopleFileTreeMount(tx, input);

    if (!preview.decision.ok) {
      return {
        created: false,
        status: "denied",
        decision: preview.decision,
      };
    }

    if (preview.decision.action === "require-confirmation" && !input.allowRemount) {
      return {
        created: false,
        status: "confirmation-required",
        decision: preview.decision,
      };
    }

    if (preview.decision.action === "require-confirmation" && input.allowRemount) {
      const conflictIds = getConflictMountIdsToReplace(preview.decision.conflicts, input.target);
      if (conflictIds.length > 0) {
        await tx.peopleFileTreeMount.deleteMany({
          where: {
            ownerId: input.ownerId,
            id: {
              in: conflictIds,
            },
          },
        });
      }
    }

    const displayOrder =
      input.displayOrder ?? (await getNextMountDisplayOrder(tx, input.ownerId, input.contentParentId));

    const mount = existingTargetMount
      ? await tx.peopleFileTreeMount.update({
          where: {
            id: existingTargetMount.id,
          },
          data: {
            contentParentId: input.contentParentId,
            displayOrder,
          },
        })
      : await tx.peopleFileTreeMount.create({
          data: {
            ownerId: input.ownerId,
            contentParentId: input.contentParentId,
            displayOrder,
            groupId: input.target.kind === "peopleGroup" ? input.target.groupId : null,
            personId: input.target.kind === "person" ? input.target.personId : null,
          },
        });

    return {
      created: true,
      mount,
      decision: preview.decision,
    };
  });
}

function getConflictMountIdsToReplace(
  conflicts: PeopleMountConflict[],
  target: PeopleMountTarget
): string[] {
  return conflicts
    .filter((conflict) => {
      if (conflict.reason === "same-target-mounted") {
        return false;
      }

      if (conflict.reason === "ancestor-group-mounted" && target.kind === "person") {
        return false;
      }

      return true;
    })
    .map((conflict) => conflict.mountId);
}

async function getExistingTargetMountRecord(
  prisma: PeoplePrismaClient,
  ownerId: string,
  target: PeopleMountTarget
): Promise<PeopleFileTreeMountRecord | null> {
  return prisma.peopleFileTreeMount.findFirst({
    where: {
      ownerId,
      groupId: target.kind === "peopleGroup" ? target.groupId : undefined,
      personId: target.kind === "person" ? target.personId : undefined,
    },
    select: {
      id: true,
      ownerId: true,
      contentParentId: true,
      groupId: true,
      personId: true,
      displayOrder: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function assertMountParentIsValid(
  prisma: PeoplePrismaClient,
  ownerId: string,
  contentParentId: string | null
): Promise<void> {
  if (!contentParentId) return;

  const parent = await prisma.contentNode.findFirst({
    where: {
      id: contentParentId,
      ownerId,
      deletedAt: null,
    },
    select: {
      contentType: true,
    },
  });

  if (!parent) {
    throw new Error("Mount parent was not found.");
  }

  if (parent.contentType !== "folder") {
    throw new Error("People records can only be mounted at the root or under a folder.");
  }
}

async function assertMountTargetExists(
  prisma: PeoplePrismaClient,
  ownerId: string,
  target: PeopleMountTarget
): Promise<{ groupId: string } | { primaryGroupId: string }> {
  if (target.kind === "peopleGroup") {
    const group = await prisma.peopleGroup.findFirst({
      where: {
        id: target.groupId,
        ownerId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!group) {
      throw new Error("People group was not found.");
    }

    return { groupId: group.id };
  }

  const person = await prisma.person.findFirst({
    where: {
      id: target.personId,
      ownerId,
      deletedAt: null,
    },
    select: {
      primaryGroupId: true,
    },
  });

  if (!person) {
    throw new Error("Person was not found.");
  }

  return { primaryGroupId: person.primaryGroupId };
}

async function findExistingTargetMount(
  prisma: PeoplePrismaClient,
  ownerId: string,
  target: PeopleMountTarget
): Promise<PeopleMountConflict | undefined> {
  const mount = await prisma.peopleFileTreeMount.findFirst({
    where: {
      ownerId,
      groupId: target.kind === "peopleGroup" ? target.groupId : undefined,
      personId: target.kind === "person" ? target.personId : undefined,
    },
    select: {
      id: true,
      contentParentId: true,
      groupId: true,
      personId: true,
    },
  });

  return mount ? toConflict(mount, "same-target-mounted") : undefined;
}

async function findAncestorGroupMountConflicts(
  prisma: PeoplePrismaClient,
  ownerId: string,
  groupId: string
): Promise<PeopleMountConflict[]> {
  const groups = await prisma.peopleGroup.findMany({
    where: {
      ownerId,
      deletedAt: null,
    },
    select: {
      id: true,
      parentGroupId: true,
    },
  });

  const ancestorIds = collectAncestorGroupIds(groups, groupId, true);

  const mounts = await prisma.peopleFileTreeMount.findMany({
    where: {
      ownerId,
      groupId: {
        in: ancestorIds,
      },
    },
    select: {
      id: true,
      contentParentId: true,
      groupId: true,
      personId: true,
    },
  });

  return mounts.map((mount) => toConflict(mount, "ancestor-group-mounted"));
}

async function findGroupOverlapMountConflicts(
  prisma: PeoplePrismaClient,
  ownerId: string,
  groupId: string
): Promise<PeopleMountConflict[]> {
  const groups = await prisma.peopleGroup.findMany({
    where: {
      ownerId,
      deletedAt: null,
    },
    select: {
      id: true,
      parentGroupId: true,
    },
  });

  const descendantGroupIds = collectDescendantGroupIds(groups, groupId);
  const ancestorGroupIds = collectAncestorGroupIds(groups, groupId, false);

  const mounts = await prisma.peopleFileTreeMount.findMany({
    where: {
      ownerId,
      OR: [
        {
          groupId: {
            in: [...descendantGroupIds, ...ancestorGroupIds],
          },
        },
        {
          person: {
            primaryGroupId: {
              in: descendantGroupIds,
            },
            deletedAt: null,
          },
        },
      ],
    },
    select: {
      id: true,
      contentParentId: true,
      groupId: true,
      personId: true,
    },
  });

  return mounts
    .filter((mount) => mount.groupId !== groupId)
    .map((mount) => {
      if (mount.personId) return toConflict(mount, "descendant-person-mounted");
      if (mount.groupId && ancestorGroupIds.includes(mount.groupId)) {
        return toConflict(mount, "ancestor-group-mounted");
      }
      return toConflict(mount, "descendant-group-mounted");
    });
}

function collectDescendantGroupIds(groups: PeopleGroupReference[], rootGroupId: string): string[] {
  const childrenByParent = new Map<string, string[]>();

  for (const group of groups) {
    if (!group.parentGroupId) continue;
    const siblings = childrenByParent.get(group.parentGroupId) ?? [];
    siblings.push(group.id);
    childrenByParent.set(group.parentGroupId, siblings);
  }

  const ids: string[] = [];
  const queue = [rootGroupId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || ids.includes(currentId)) continue;
    ids.push(currentId);
    queue.push(...(childrenByParent.get(currentId) ?? []));
  }

  return ids;
}

function collectAncestorGroupIds(
  groups: PeopleGroupReference[],
  groupId: string,
  includeSelf: boolean
): string[] {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const ids: string[] = [];
  let currentId: string | null = includeSelf ? groupId : groupsById.get(groupId)?.parentGroupId ?? null;

  while (currentId) {
    if (ids.includes(currentId)) break;
    ids.push(currentId);
    currentId = groupsById.get(currentId)?.parentGroupId ?? null;
  }

  return ids;
}

function toConflict(
  mount: {
    id: string;
    contentParentId: string | null;
    groupId: string | null;
    personId: string | null;
  },
  reason: PeopleMountConflict["reason"]
): PeopleMountConflict {
  if (mount.personId) {
    return {
      mountId: mount.id,
      contentParentId: mount.contentParentId,
      target: {
        kind: "person",
        personId: mount.personId,
      },
      reason,
    };
  }

  if (!mount.groupId) {
    throw new Error("Invalid People file-tree mount without a target.");
  }

  return {
    mountId: mount.id,
    contentParentId: mount.contentParentId,
    target: {
      kind: "peopleGroup",
      groupId: mount.groupId,
    },
    reason,
  };
}

async function getNextMountDisplayOrder(
  prisma: PeoplePrismaClient,
  ownerId: string,
  contentParentId: string | null
): Promise<number> {
  const aggregate = await prisma.peopleFileTreeMount.aggregate({
    where: {
      ownerId,
      contentParentId,
    },
    _max: {
      displayOrder: true,
    },
  });

  return (aggregate._max.displayOrder ?? -1) + 1;
}
