import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { loadCollaborationYDocState } from "@/lib/domain/collaboration/documents";
import { getCollaborationDocumentName } from "@/lib/domain/collaboration/tokens";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as { contentId?: string };
    const contentId = body.contentId?.trim();

    if (!contentId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "contentId is required" },
        },
        { status: 400 }
      );
    }

    const access = await resolveContentAccess(prisma, {
      contentId,
      userId: session.user.id,
      require: "view",
    });

    const content = await prisma.contentNode.findFirst({
      where: {
        id: contentId,
        contentType: "note",
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!content) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_CONTENT",
            message: "Only note documents have collaborative state in this sprint",
          },
        },
        { status: 400 }
      );
    }

    const documentName = getCollaborationDocumentName(contentId);
    const state = await loadCollaborationYDocState(prisma, documentName);

    return NextResponse.json({
      success: true,
      data: {
        documentName,
        readOnly: access.readOnly,
        update: state ? Buffer.from(state).toString("base64") : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load collaboration state";
    const status = message.includes("Access") || message.includes("required") ? 403 : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: status === 403 ? "FORBIDDEN" : "SERVER_ERROR",
          message,
        },
      },
      { status }
    );
  }
}
