import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { createPeopleFileTreeMount, type PeoplePolicyDecision } from "@/lib/domain/people";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

import {
  parsePeopleMountParentId,
  parsePeopleMountTarget,
  type PeopleMountRequestBody,
} from "./request";

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

    const result = await createPeopleFileTreeMount(prisma, {
      ownerId: session.user.id,
      target,
      contentParentId: parsePeopleMountParentId(body),
      displayOrder: body.displayOrder,
      allowRemount: body.allowRemount ?? false,
    });

    if (!result.created) {
      const failedResult = result as { created: false; status: "denied" | "confirmation-required"; decision: typeof result.decision };
      return NextResponse.json(
        {
          success: false,
          error: {
            code: failedResult.status === "denied" ? "PEOPLE_MOUNT_DENIED" : "PEOPLE_MOUNT_CONFLICT",
            message: getPolicyMessage(failedResult.decision),
          },
          data: failedResult,
        },
        { status: failedResult.status === "denied" ? 409 : 412 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/people/mounts error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create People file-tree mount";
    const isValidationError =
      message.includes("target.kind plus") ||
      message.includes("Contacts and groups can only be placed");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isValidationError ? "VALIDATION_ERROR" : "SERVER_ERROR",
          message,
        },
      },
      { status: isValidationError ? 400 : 500 }
    );
  }
}

function getPolicyMessage(decision: PeoplePolicyDecision): string {
  return decision.action === "allow"
    ? "People mount allowed"
    : decision.reason;
}
