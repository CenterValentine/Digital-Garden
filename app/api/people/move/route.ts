import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { movePeopleGroup, movePersonToGroup } from "@/lib/domain/people";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

interface PeopleMoveRequest {
  source?: {
    kind?: string;
    personId?: string;
    groupId?: string;
  };
  targetGroupId?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as PeopleMoveRequest;

    if (!body.source?.kind) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "source.kind is required",
          },
        },
        { status: 400 }
      );
    }

    if (body.source.kind === "person") {
      if (!body.source.personId || !body.targetGroupId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "source.personId and targetGroupId are required",
            },
          },
          { status: 400 }
        );
      }

      const person = await movePersonToGroup(prisma, {
        ownerId: session.user.id,
        personId: body.source.personId,
        targetGroupId: body.targetGroupId,
      });

      return NextResponse.json({
        success: true,
        data: {
          kind: "person",
          personId: person.id,
          primaryGroupId: person.primaryGroupId,
        },
      });
    }

    if (body.source.kind === "peopleGroup") {
      if (!body.source.groupId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "source.groupId is required",
            },
          },
          { status: 400 }
        );
      }

      const group = await movePeopleGroup(prisma, {
        ownerId: session.user.id,
        groupId: body.source.groupId,
        targetParentGroupId: body.targetGroupId ?? null,
      });

      return NextResponse.json({
        success: true,
        data: {
          kind: "peopleGroup",
          groupId: group.id,
          parentGroupId: group.parentGroupId,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Unsupported source kind",
        },
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/people/move error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to move People record",
        },
      },
      { status: 500 }
    );
  }
}
