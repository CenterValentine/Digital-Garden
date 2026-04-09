import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { generateSlug } from "@/lib/domain/content/slug";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

type Params = Promise<{ id: string }>;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
    };

    const group = await prisma.peopleGroup.findFirst({
      where: {
        id,
        ownerId: session.user.id,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!group) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "People group not found",
          },
        },
        { status: 404 }
      );
    }

    const nextName = body.name?.trim();
    if (!nextName) {
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

    let slug = undefined as string | undefined;
    if (nextName !== group.name) {
      const baseSlug = generateSlug(nextName) || "group";
      let candidate = baseSlug;
      let suffix = 2;

      while (true) {
        const existing = await prisma.peopleGroup.findFirst({
          where: {
            ownerId: session.user.id,
            slug: candidate,
            id: { not: id },
            deletedAt: null,
          },
          select: { id: true },
        });

        if (!existing) {
          slug = candidate;
          break;
        }

        candidate = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
    }

    const updated = await prisma.peopleGroup.update({
      where: {
        id,
      },
      data: {
        name: nextName,
        description: body.description?.trim() || null,
        ...(slug ? { slug } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        groupId: updated.id,
        name: updated.name,
        slug: updated.slug,
      },
    });
  } catch (error) {
    console.error("PATCH /api/people/groups/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to update People group",
        },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const group = await prisma.peopleGroup.findFirst({
      where: {
        id,
        ownerId: session.user.id,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            childGroups: {
              where: {
                deletedAt: null,
              },
            },
            people: {
              where: {
                deletedAt: null,
              },
            },
            contentNodes: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!group) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "People group not found",
          },
        },
        { status: 404 }
      );
    }

    if (group.isDefault) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DEFAULT_GROUP_PROTECTED",
            message: "The default People group cannot be deleted.",
          },
        },
        { status: 409 }
      );
    }

    if (
      group._count.childGroups > 0 ||
      group._count.people > 0 ||
      group._count.contentNodes > 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "GROUP_NOT_EMPTY",
            message: "This group still contains contacts, subgroups, or content. Move or delete those items before deleting the group.",
          },
        },
        { status: 409 }
      );
    }

    await prisma.peopleGroup.update({
      where: {
        id: group.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        groupId: group.id,
      },
    });
  } catch (error) {
    console.error("DELETE /api/people/groups/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete People group",
        },
      },
      { status: 500 }
    );
  }
}
