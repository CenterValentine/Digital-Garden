import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { createPeopleGroup } from "@/lib/domain/people";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger } from "@/lib/core/logger";

export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuth();
    const groups = await prisma.peopleGroup.findMany({
      where: { ownerId: session.user.id },
      select: { id: true, name: true, parentGroupId: true, isDefault: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, data: { groups } });
  } catch (error) {
    logger.error({ layer: "content", event: "people_group_list:caught", summary: "GET caught", error });
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message: "Failed to list People groups" } },
      { status: 500 }
    );
  }
}

interface CreatePeopleGroupRequest {
  name?: string;
  parentGroupId?: string | null;
  description?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as CreatePeopleGroupRequest;

    if (!body.name?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "name is required",
          },
        },
        { status: 400 }
      );
    }

    const group = await createPeopleGroup(prisma, {
      ownerId: session.user.id,
      name: body.name,
      parentGroupId: body.parentGroupId ?? null,
      description: body.description ?? null,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          treeNodeKind: "peopleGroup",
          id: `peopleGroup:${group.id}`,
          groupId: group.id,
          parentGroupId: group.parentGroupId,
          label: group.name,
          slug: group.slug,
          isDefault: group.isDefault,
          mount: null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ layer: "content", event: "people_group_create:caught", summary: "POST caught", error });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to create People group",
        },
      },
      { status: 500 }
    );
  }
}
