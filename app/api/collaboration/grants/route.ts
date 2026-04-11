import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_LEVELS = new Set(["view", "edit"]);

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as {
      contentId?: string;
      email?: string;
      accessLevel?: string;
    };

    const contentId = body.contentId?.trim();
    const email = body.email?.trim().toLowerCase();
    const accessLevel = body.accessLevel?.trim().toLowerCase();

    if (!contentId || !UUID_RE.test(contentId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "A valid contentId is required",
          },
        },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "A target user email is required",
          },
        },
        { status: 400 }
      );
    }

    if (!accessLevel || !ACCESS_LEVELS.has(accessLevel)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "accessLevel must be either view or edit",
          },
        },
        { status: 400 }
      );
    }

    const content = await prisma.contentNode.findFirst({
      where: {
        id: contentId,
        deletedAt: null,
      },
      select: {
        id: true,
        ownerId: true,
        title: true,
      },
    });

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Content not found",
          },
        },
        { status: 404 }
      );
    }

    if (content.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Only the content owner can grant collaboration access",
          },
        },
        { status: 403 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No user exists for that email",
          },
        },
        { status: 404 }
      );
    }

    if (targetUser.id === session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Owners already have full collaboration access",
          },
        },
        { status: 400 }
      );
    }

    const grant = await prisma.viewGrant.upsert({
      where: {
        contentId_userId: {
          contentId,
          userId: targetUser.id,
        },
      },
      create: {
        contentId,
        userId: targetUser.id,
        accessLevel,
      },
      update: {
        accessLevel,
        expiresAt: null,
      },
      select: {
        id: true,
        contentId: true,
        userId: true,
        accessLevel: true,
        grantedAt: true,
        expiresAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        grant,
        content: {
          id: content.id,
          title: content.title,
        },
        user: targetUser,
      },
    });
  } catch (error) {
    console.error("POST /api/collaboration/grants error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to grant collaboration access",
        },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as {
      contentId?: string;
      email?: string;
    };

    const contentId = body.contentId?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!contentId || !UUID_RE.test(contentId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "A valid contentId is required",
          },
        },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "A target user email is required",
          },
        },
        { status: 400 }
      );
    }

    const content = await prisma.contentNode.findFirst({
      where: {
        id: contentId,
        deletedAt: null,
      },
      select: {
        ownerId: true,
      },
    });

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Content not found",
          },
        },
        { status: 404 }
      );
    }

    if (content.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Only the content owner can revoke collaboration access",
          },
        },
        { status: 403 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "No user exists for that email",
          },
        },
        { status: 404 }
      );
    }

    await prisma.viewGrant.deleteMany({
      where: {
        contentId,
        userId: targetUser.id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("DELETE /api/collaboration/grants error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "Failed to revoke collaboration access",
        },
      },
      { status: 500 }
    );
  }
}
