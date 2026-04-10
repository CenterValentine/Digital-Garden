import type { Prisma, PrismaClient } from "@/lib/database/generated/prisma";

export const DEFAULT_PEOPLE_GROUP_NAME = "People";
export const DEFAULT_PEOPLE_GROUP_SLUG = "people";

type PeoplePrismaClient = PrismaClient | Prisma.TransactionClient;

export async function ensureDefaultPeopleGroup(
  prisma: PeoplePrismaClient,
  ownerId: string
) {
  const existingDefault = await prisma.peopleGroup.findUnique({
    where: { defaultForOwnerId: ownerId },
  });

  if (existingDefault) {
    return existingDefault;
  }

  const existingPeopleGroup = await prisma.peopleGroup.findUnique({
    where: {
      ownerId_slug: {
        ownerId,
        slug: DEFAULT_PEOPLE_GROUP_SLUG,
      },
    },
  });

  if (existingPeopleGroup) {
    return prisma.peopleGroup.update({
      where: { id: existingPeopleGroup.id },
      data: {
        name: existingPeopleGroup.name || DEFAULT_PEOPLE_GROUP_NAME,
        parentGroupId: null,
        isDefault: true,
        defaultForOwnerId: ownerId,
      },
    });
  }

  return prisma.peopleGroup.create({
    data: {
      ownerId,
      defaultForOwnerId: ownerId,
      name: DEFAULT_PEOPLE_GROUP_NAME,
      slug: DEFAULT_PEOPLE_GROUP_SLUG,
      isDefault: true,
    },
  });
}
