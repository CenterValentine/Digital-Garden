import type { Prisma, PrismaClient } from "@/lib/database/generated/prisma";

import { generateSlug } from "@/lib/domain/content/slug";
import { ensureDefaultPeopleGroup } from "./default-group";
import type {
  PeopleFileTreeMountSummary,
  PeopleSearchResult,
  PeopleTreeContentNode,
  PeopleTreeGroupNode,
  PeopleTreePersonNode,
  PeopleTreeResponse,
} from "./types";

type PeoplePrismaClient = PrismaClient | Prisma.TransactionClient;

const PEOPLE_SEARCH_LIMIT = 25;

export interface CreatePersonInput {
  ownerId: string;
  displayName: string;
  primaryGroupId?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  metadata?: Prisma.InputJsonObject;
}

export interface CreatePeopleGroupInput {
  ownerId: string;
  name: string;
  parentGroupId?: string | null;
  description?: string | null;
}

function mountSummary(
  mount:
    | {
        id: string;
        contentParentId: string | null;
        displayOrder: number;
        createdAt: Date;
        updatedAt: Date;
      }
    | null
    | undefined
): PeopleFileTreeMountSummary | null {
  if (!mount) return null;
  return {
    id: mount.id,
    contentParentId: mount.contentParentId,
    displayOrder: mount.displayOrder,
    createdAt: mount.createdAt,
    updatedAt: mount.updatedAt,
  };
}

export async function getPeopleTree(
  prisma: PeoplePrismaClient,
  ownerId: string
): Promise<PeopleTreeResponse> {
  const defaultGroup = await ensureDefaultPeopleGroup(prisma, ownerId);

  const [groups, people, contentNodes] = await Promise.all([
    prisma.peopleGroup.findMany({
      where: {
        ownerId,
        deletedAt: null,
      },
      include: {
        fileTreeMounts: true,
        _count: {
          select: {
            contentNodes: true,
          },
        },
      },
    }),
    prisma.person.findMany({
      where: {
        ownerId,
        deletedAt: null,
      },
      include: {
        fileTreeMounts: true,
        _count: {
          select: {
            contentNodes: true,
          },
        },
      },
    }),
    prisma.contentNode.findMany({
      where: {
        ownerId,
        deletedAt: null,
        OR: [
          { peopleGroupId: { not: null } },
          { personId: { not: null } },
        ],
      },
      select: {
        id: true,
        title: true,
        contentType: true,
        customIcon: true,
        iconColor: true,
        parentId: true,
        peopleGroupId: true,
        personId: true,
        displayOrder: true,
        createdAt: true,
        updatedAt: true,
        filePayload: {
          select: {
            mimeType: true,
          },
        },
      },
    }),
  ]);

  const groupNodes = new Map<string, PeopleTreeGroupNode>();
  for (const group of groups) {
    groupNodes.set(group.id, {
      treeNodeKind: "peopleGroup",
      id: `peopleGroup:${group.id}`,
      groupId: group.id,
      parentGroupId: group.parentGroupId,
      name: group.name,
      slug: group.slug,
      description: group.description,
      displayOrder: group.displayOrder,
      isDefault: group.isDefault,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      mount: mountSummary(group.fileTreeMounts[0]),
      contentCount: group._count.contentNodes,
      content: [],
      people: [],
      childGroups: [],
    });
  }

  const personNodes = new Map<string, PeopleTreePersonNode>();

  for (const person of people) {
    const personNode: PeopleTreePersonNode = {
      treeNodeKind: "person",
      id: `person:${person.id}`,
      personId: person.id,
      primaryGroupId: person.primaryGroupId,
      displayName: person.displayName,
      slug: person.slug,
      givenName: person.givenName,
      familyName: person.familyName,
      email: person.email,
      phone: person.phone,
      avatarUrl: person.avatarUrl,
      displayOrder: person.displayOrder,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
      mount: mountSummary(person.fileTreeMounts[0]),
      contentCount: person._count.contentNodes,
      content: [],
    };
    personNodes.set(person.id, personNode);

    const parentGroup = groupNodes.get(person.primaryGroupId);
    if (parentGroup) {
      parentGroup.people.push(personNode);
    }
  }

  attachPeopleContent(contentNodes, groupNodes, personNodes);

  const rootGroups: PeopleTreeGroupNode[] = [];
  for (const groupNode of groupNodes.values()) {
    if (groupNode.parentGroupId) {
      const parent = groupNodes.get(groupNode.parentGroupId);
      if (parent) {
        parent.childGroups.push(groupNode);
        continue;
      }
    }
    rootGroups.push(groupNode);
  }

  sortPeopleTree(rootGroups);

  const defaultGroupNode = groupNodes.get(defaultGroup.id);
  if (!defaultGroupNode) {
    throw new Error("Default People group could not be loaded.");
  }

  const mountedGroups = groups.filter((group) => group.fileTreeMounts.length > 0).length;
  const mountedPeople = people.filter((person) => person.fileTreeMounts.length > 0).length;

  return {
    defaultGroup: defaultGroupNode,
    groups: rootGroups,
    stats: {
      groups: groups.length,
      people: people.length,
      mountedGroups,
      mountedPeople,
    },
  };
}

function attachPeopleContent(
  contentNodes: Array<{
    id: string;
    title: string;
    contentType: string;
    customIcon: string | null;
    iconColor: string | null;
    filePayload: { mimeType: string } | null;
    parentId: string | null;
    peopleGroupId: string | null;
    personId: string | null;
    displayOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>,
  groupNodes: Map<string, PeopleTreeGroupNode>,
  personNodes: Map<string, PeopleTreePersonNode>
): void {
  const contentMap = new Map<string, PeopleTreeContentNode>();

  for (const content of contentNodes) {
    contentMap.set(content.id, {
      treeNodeKind: "content",
      id: `content:${content.id}`,
      contentId: content.id,
      title: content.title,
      contentType: content.contentType,
      customIcon: content.customIcon,
      iconColor: content.iconColor,
      fileMimeType: content.filePayload?.mimeType ?? null,
      parentId: content.parentId,
      peopleGroupId: content.peopleGroupId,
      personId: content.personId,
      displayOrder: content.displayOrder,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      children: [],
    });
  }

  const rootContent: PeopleTreeContentNode[] = [];
  for (const node of contentMap.values()) {
    if (node.parentId) {
      const parent = contentMap.get(node.parentId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    rootContent.push(node);
  }

  for (const node of rootContent) {
    if (node.personId) {
      personNodes.get(node.personId)?.content.push(node);
    } else if (node.peopleGroupId) {
      groupNodes.get(node.peopleGroupId)?.content.push(node);
    }
  }

  for (const node of contentMap.values()) {
    node.children.sort(comparePeopleContent);
  }
  for (const group of groupNodes.values()) {
    group.content.sort(comparePeopleContent);
  }
  for (const person of personNodes.values()) {
    person.content.sort(comparePeopleContent);
  }
}

export async function searchPeopleTargets(
  prisma: PeoplePrismaClient,
  ownerId: string,
  query: string,
  limit = PEOPLE_SEARCH_LIMIT
): Promise<PeopleSearchResult[]> {
  await ensureDefaultPeopleGroup(prisma, ownerId);

  const normalizedLimit = Math.max(1, Math.min(limit, 100));
  const trimmedQuery = query.trim();

  const groupWhere: Prisma.PeopleGroupWhereInput = {
    ownerId,
    deletedAt: null,
  };
  const personWhere: Prisma.PersonWhereInput = {
    ownerId,
    deletedAt: null,
  };

  if (trimmedQuery) {
    groupWhere.OR = [
      { name: { contains: trimmedQuery, mode: "insensitive" } },
      { slug: { contains: trimmedQuery, mode: "insensitive" } },
    ];
    personWhere.OR = [
      { displayName: { contains: trimmedQuery, mode: "insensitive" } },
      { slug: { contains: trimmedQuery, mode: "insensitive" } },
      { email: { contains: trimmedQuery, mode: "insensitive" } },
      { phone: { contains: trimmedQuery, mode: "insensitive" } },
    ];
  }

  const [groups, people] = await Promise.all([
    prisma.peopleGroup.findMany({
      where: groupWhere,
      include: {
        fileTreeMounts: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      take: normalizedLimit,
    }),
    prisma.person.findMany({
      where: personWhere,
      include: {
        fileTreeMounts: true,
      },
      orderBy: [{ displayName: "asc" }],
      take: normalizedLimit,
    }),
  ]);

  const results: PeopleSearchResult[] = [
    ...groups.map((group) => ({
      treeNodeKind: "peopleGroup" as const,
      id: `peopleGroup:${group.id}`,
      groupId: group.id,
      parentGroupId: group.parentGroupId,
      label: group.name,
      slug: group.slug,
      isDefault: group.isDefault,
      mount: mountSummary(group.fileTreeMounts[0]),
    })),
    ...people.map((person) => ({
      treeNodeKind: "person" as const,
      id: `person:${person.id}`,
      personId: person.id,
      primaryGroupId: person.primaryGroupId,
      label: person.displayName,
      slug: person.slug,
      email: person.email,
      phone: person.phone,
      avatarUrl: person.avatarUrl,
      mount: mountSummary(person.fileTreeMounts[0]),
    })),
  ];

  return results.slice(0, normalizedLimit);
}

export async function createPerson(
  prisma: PeoplePrismaClient,
  input: CreatePersonInput
) {
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error("Person name is required.");
  }

  const primaryGroup = input.primaryGroupId
    ? await assertPeopleGroup(prisma, input.ownerId, input.primaryGroupId)
    : await ensureDefaultPeopleGroup(prisma, input.ownerId);

  const slug = await generateUniquePersonSlug(prisma, input.ownerId, displayName);

  return prisma.person.create({
    data: {
      ownerId: input.ownerId,
      primaryGroupId: primaryGroup.id,
      displayName,
      slug,
      givenName: input.givenName?.trim() || null,
      familyName: input.familyName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      avatarUrl: input.avatarUrl?.trim() || null,
      metadata: input.metadata ?? {},
    },
  });
}

export async function movePersonToGroup(
  prisma: PeoplePrismaClient,
  input: {
    ownerId: string;
    personId: string;
    targetGroupId: string;
  }
) {
  await assertPeopleGroup(prisma, input.ownerId, input.targetGroupId);

  const person = await prisma.person.findFirst({
    where: {
      id: input.personId,
      ownerId: input.ownerId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!person) {
    throw new Error("Person was not found.");
  }

  const displayOrder = await getNextPersonDisplayOrder(prisma, input.ownerId, input.targetGroupId);

  return prisma.person.update({
    where: { id: person.id },
    data: {
      primaryGroupId: input.targetGroupId,
      displayOrder,
    },
  });
}

export async function movePeopleGroup(
  prisma: PeoplePrismaClient,
  input: {
    ownerId: string;
    groupId: string;
    targetParentGroupId: string | null;
  }
) {
  const group = await prisma.peopleGroup.findFirst({
    where: {
      id: input.groupId,
      ownerId: input.ownerId,
      deletedAt: null,
    },
  });

  if (!group) {
    throw new Error("People group was not found.");
  }

  if (group.isDefault) {
    throw new Error("The default People group cannot be moved.");
  }

  if (input.targetParentGroupId === input.groupId) {
    throw new Error("A group cannot be moved into itself.");
  }

  if (input.targetParentGroupId) {
    await assertPeopleGroup(prisma, input.ownerId, input.targetParentGroupId);
    const descendantIds = await collectDescendantGroupIds(prisma, input.ownerId, input.groupId);
    if (descendantIds.includes(input.targetParentGroupId)) {
      throw new Error("A group cannot be moved into its own subgroup.");
    }
  }

  const displayOrder = await getNextGroupDisplayOrder(
    prisma,
    input.ownerId,
    input.targetParentGroupId
  );

  return prisma.peopleGroup.update({
    where: { id: group.id },
    data: {
      parentGroupId: input.targetParentGroupId,
      displayOrder,
    },
  });
}

export async function createPeopleGroup(
  prisma: PeoplePrismaClient,
  input: CreatePeopleGroupInput
) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Group name is required.");
  }

  if (input.parentGroupId) {
    await assertPeopleGroup(prisma, input.ownerId, input.parentGroupId);
  } else {
    await ensureDefaultPeopleGroup(prisma, input.ownerId);
  }

  const slug = await generateUniquePeopleGroupSlug(prisma, input.ownerId, name);

  return prisma.peopleGroup.create({
    data: {
      ownerId: input.ownerId,
      parentGroupId: input.parentGroupId ?? null,
      name,
      slug,
      description: input.description?.trim() || null,
    },
  });
}

function sortPeopleTree(groups: PeopleTreeGroupNode[]): void {
  groups.sort(compareGroups);

  for (const group of groups) {
    group.people.sort(comparePeople);
    sortPeopleTree(group.childGroups);
  }
}

function compareGroups(left: PeopleTreeGroupNode, right: PeopleTreeGroupNode): number {
  if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
  if (left.displayOrder !== right.displayOrder) return left.displayOrder - right.displayOrder;
  return left.name.localeCompare(right.name);
}

function comparePeople(left: PeopleTreePersonNode, right: PeopleTreePersonNode): number {
  if (left.displayOrder !== right.displayOrder) return left.displayOrder - right.displayOrder;
  return left.displayName.localeCompare(right.displayName);
}

function comparePeopleContent(left: PeopleTreeContentNode, right: PeopleTreeContentNode): number {
  if (left.displayOrder !== right.displayOrder) return left.displayOrder - right.displayOrder;
  return left.title.localeCompare(right.title);
}

async function assertPeopleGroup(
  prisma: PeoplePrismaClient,
  ownerId: string,
  groupId: string
) {
  const group = await prisma.peopleGroup.findFirst({
    where: {
      id: groupId,
      ownerId,
      deletedAt: null,
    },
  });

  if (!group) {
    throw new Error("People group was not found.");
  }

  return group;
}

async function generateUniquePersonSlug(
  prisma: PeoplePrismaClient,
  ownerId: string,
  displayName: string
): Promise<string> {
  return generateUniquePeopleSlug(generateSlug(displayName), async (slug) => {
    const existing = await prisma.person.findUnique({
      where: {
        ownerId_slug: {
          ownerId,
          slug,
        },
      },
      select: {
        id: true,
      },
    });

    return Boolean(existing);
  });
}

async function generateUniquePeopleGroupSlug(
  prisma: PeoplePrismaClient,
  ownerId: string,
  name: string
): Promise<string> {
  return generateUniquePeopleSlug(generateSlug(name), async (slug) => {
    const existing = await prisma.peopleGroup.findUnique({
      where: {
        ownerId_slug: {
          ownerId,
          slug,
        },
      },
      select: {
        id: true,
      },
    });

    return Boolean(existing);
  });
}

async function generateUniquePeopleSlug(
  baseSlug: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const normalizedBaseSlug = baseSlug || "people-record";
  if (!(await exists(normalizedBaseSlug))) {
    return normalizedBaseSlug;
  }

  let suffix = 2;
  let candidate = `${normalizedBaseSlug}-${suffix}`;
  while (await exists(candidate)) {
    suffix += 1;
    candidate = `${normalizedBaseSlug}-${suffix}`;

    if (suffix > 1000) {
      throw new Error("Could not generate unique People slug.");
    }
  }

  return candidate;
}

async function getNextPersonDisplayOrder(
  prisma: PeoplePrismaClient,
  ownerId: string,
  primaryGroupId: string
): Promise<number> {
  const aggregate = await prisma.person.aggregate({
    where: {
      ownerId,
      primaryGroupId,
      deletedAt: null,
    },
    _max: {
      displayOrder: true,
    },
  });

  return (aggregate._max.displayOrder ?? -1) + 1;
}

async function getNextGroupDisplayOrder(
  prisma: PeoplePrismaClient,
  ownerId: string,
  parentGroupId: string | null
): Promise<number> {
  const aggregate = await prisma.peopleGroup.aggregate({
    where: {
      ownerId,
      parentGroupId,
      deletedAt: null,
    },
    _max: {
      displayOrder: true,
    },
  });

  return (aggregate._max.displayOrder ?? -1) + 1;
}

async function collectDescendantGroupIds(
  prisma: PeoplePrismaClient,
  ownerId: string,
  groupId: string
): Promise<string[]> {
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

  const childrenByParent = new Map<string, string[]>();
  for (const group of groups) {
    if (!group.parentGroupId) continue;
    const children = childrenByParent.get(group.parentGroupId) ?? [];
    children.push(group.id);
    childrenByParent.set(group.parentGroupId, children);
  }

  const descendantIds: string[] = [];
  const queue = childrenByParent.get(groupId) ?? [];

  while (queue.length > 0) {
    const nextId = queue.shift();
    if (!nextId || descendantIds.includes(nextId)) continue;
    descendantIds.push(nextId);
    queue.push(...(childrenByParent.get(nextId) ?? []));
  }

  return descendantIds;
}
