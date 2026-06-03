import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import type { ContentType } from "@/lib/database/generated/prisma";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import {
  createCollaborationToken,
  getCollaborationDocumentName,
} from "@/lib/domain/collaboration/tokens";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export const runtime = "nodejs";

const COLLABORATOR_COLORS = [
  "#2563eb",
  "#c4a15a",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#be185d",
];

function getCollaboratorColor(seed: string) {
  const hash = Array.from(seed).reduce(
    (value, character) => value + character.charCodeAt(0),
    0
  );
  return COLLABORATOR_COLORS[hash % COLLABORATOR_COLORS.length];
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as { contentId?: string };
    const contentId = body.contentId?.trim();

    if (!contentId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "contentId is required",
          },
        },
        { status: 400 }
      );
    }

    const access = await resolveContentAccess(prisma, {
      contentId,
      userId: session.user.id,
      require: "view",
    });

    const COLLABORATIVE_CONTENT_TYPES: ContentType[] = ["note", "visualization"];

    const content = await prisma.contentNode.findFirst({
      where: {
        id: contentId,
        contentType: { in: COLLABORATIVE_CONTENT_TYPES },
        deletedAt: null,
      },
      select: {
        id: true,
        contentType: true,
      },
    });

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_CONTENT",
            message: "This content type does not support real-time collaboration",
          },
        },
        { status: 400 }
      );
    }

    const documentName = getCollaborationDocumentName(contentId);
    const token = createCollaborationToken({
      contentId,
      documentName,
      userId: session.user.id,
      ownerId: access.ownerId,
      accessLevel: access.accessLevel === "owner" ? "owner" : access.canEdit ? "edit" : "view",
      readOnly: access.readOnly,
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        documentName,
        accessLevel: access.accessLevel,
        readOnly: access.readOnly,
        user: {
          id: session.user.id,
          name: session.user.username || session.user.email,
          email: session.user.email,
          color: getCollaboratorColor(session.user.id),
        },
        websocketUrl:
          process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ||
          `ws://localhost:${process.env.HOCUSPOCUS_PORT || "1234"}`,
      },
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Failed to create collaboration token";
    const isAccessError =
      rawMessage.includes("Access") || rawMessage.includes("required");
    const status = isAccessError ? 403 : 500;

    if (!isAccessError) {
      logger.error({
        layer: "collab",
        event: "token_create:caught",
        summary: "failed to create collaboration token",
        error,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isAccessError ? "FORBIDDEN" : "SERVER_ERROR",
          message: isAccessError ? rawMessage : "Failed to create collaboration token",
        },
      },
      { status }
    );
  }
}
