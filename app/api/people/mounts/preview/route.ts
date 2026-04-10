import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { previewPeopleFileTreeMount } from "@/lib/domain/people";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

import {
  parsePeopleMountParentId,
  parsePeopleMountTarget,
  type PeopleMountRequestBody,
} from "../request";

async function buildContentAncestorIds(ownerId: string, contentParentId: string | null) {
  const ids: string[] = [];
  const labels: string[] = [];
  let currentId = contentParentId;

  while (currentId) {
    const node = await prisma.contentNode.findFirst({
      where: {
        id: currentId,
        ownerId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        parentId: true,
      },
    });

    if (!node) {
      break;
    }

    ids.unshift(node.id);
    labels.unshift(node.title);
    currentId = node.parentId;
  }

  return {
    ids,
    labels,
  };
}

async function buildGroupChain(ownerId: string, groupId: string | null) {
  const chain: Array<{ id: string; name: string }> = [];
  let currentId = groupId;

  while (currentId) {
    const group = await prisma.peopleGroup.findFirst({
      where: {
        id: currentId,
        ownerId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        parentGroupId: true,
      },
    });

    if (!group) {
      break;
    }

    chain.unshift({
      id: group.id,
      name: group.name,
    });
    currentId = group.parentGroupId;
  }

  return chain;
}

async function buildConflictDetails(ownerId: string, mountId: string) {
  const mount = await prisma.peopleFileTreeMount.findFirst({
    where: {
      id: mountId,
      ownerId,
    },
    select: {
      id: true,
      contentParentId: true,
      group: {
        select: {
          id: true,
          name: true,
          parentGroupId: true,
        },
      },
      person: {
        select: {
          id: true,
          displayName: true,
          primaryGroupId: true,
        },
      },
    },
  });

  if (!mount) {
    return null;
  }

  const contentPath = await buildContentAncestorIds(ownerId, mount.contentParentId);
  const peopleChain = await buildGroupChain(
    ownerId,
    mount.group?.id ?? mount.person?.primaryGroupId ?? null
  );

  return {
    selectedNodeId: mount.person
      ? `person:${mount.person.id}`
      : mount.group
        ? `peopleGroup:${mount.group.id}`
        : null,
    contentAncestorIds: contentPath.ids,
    peopleAncestorIds: mount.group
      ? peopleChain.map((group) => `peopleGroup:${group.id}`)
      : [],
    fileTreePathLabel: contentPath.labels.length > 0 ? contentPath.labels.join(" / ") : "Root",
    peoplePathLabel: peopleChain.length > 0 ? peopleChain.map((group) => group.name).join(" / ") : null,
    targetLabel: mount.person?.displayName ?? mount.group?.name ?? "People record",
    targetKind: mount.person ? "person" : "peopleGroup",
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as PeopleMountRequestBody;
    const target = parsePeopleMountTarget(body);

    if (!target) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "target.kind plus target.groupId or target.personId is required",
          },
        },
        { status: 400 }
      );
    }

    const preview = await previewPeopleFileTreeMount(prisma, {
      ownerId: session.user.id,
      target,
      contentParentId: parsePeopleMountParentId(body),
    });

    return NextResponse.json({
      success: true,
      data: {
        ...preview,
        decision: "conflicts" in preview.decision && preview.decision.conflicts
          ? {
              ...preview.decision,
              conflicts: await Promise.all(
                preview.decision.conflicts.map(async (conflict) => ({
                  ...conflict,
                  location: await buildConflictDetails(session.user.id, conflict.mountId),
                }))
              ),
            }
          : preview.decision,
      },
    });
  } catch (error) {
    console.error("POST /api/people/mounts/preview error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to preview People file-tree mount",
        },
      },
      { status: 500 }
    );
  }
}
