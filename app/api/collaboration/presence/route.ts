import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { listCollaborationPresence } from "@/lib/domain/collaboration/presence-server";
import { getSession } from "@/lib/infrastructure/auth/session";

export const runtime = "nodejs";

const MAX_CONTENT_IDS = 16;

function parseContentIds(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("contentIds") ?? "";
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_CONTENT_IDS);
}

function getDisplayName(user: { username: string; email: string }) {
  return user.username || user.email.split("@")[0] || "Collaborator";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

async function getPublicContentIds(contentIds: string[]) {
  if (contentIds.length === 0) return [];

  const publicContent = await prisma.contentNode.findMany({
    where: {
      id: { in: contentIds },
      deletedAt: null,
      isPublished: true,
    },
    select: { id: true },
  });

  return publicContent.map((content) => content.id);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const contentIds = parseContentIds(request);
    const excludeSessionId = request.nextUrl.searchParams.get("excludeSessionId")?.trim();

    if (contentIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          presenceByContentId: {},
        },
      });
    }

    const accessResults = session
      ? await Promise.allSettled(
          contentIds.map((contentId) =>
            resolveContentAccess(prisma, {
              contentId,
              userId: session.user.id,
              require: "view",
            })
          )
        )
      : [];
    const accessibleContentIds = session
      ? contentIds.filter(
          (_contentId, index) =>
            accessResults[index].status === "fulfilled"
        )
      : await getPublicContentIds(contentIds);

    const records = accessibleContentIds.flatMap((contentId) =>
      listCollaborationPresence(contentId).filter(
        (record) => !excludeSessionId || record.sessionId !== excludeSessionId
      )
    );
    const userIds = Array.from(new Set(records.map((record) => record.userId))).filter(isUuid);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        email: true,
      },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    const presenceByContentId: Record<
      string,
      Array<{
        sessionId: string;
        userId: string;
        displayName: string;
        avatarUrl: string | null;
        isAnonymous: boolean;
        surfaceCount: number;
        transportState: string;
        firstSeenAt: number;
        lastSeenAt: number;
      }>
    > = {};

    for (const record of records) {
      const user = usersById.get(record.userId);
      const displayName = user ? getDisplayName(user) : record.displayName ?? "Guest Visitor";
      presenceByContentId[record.contentId] ??= [];
      presenceByContentId[record.contentId].push({
        sessionId: record.sessionId,
        userId: record.userId,
        displayName,
        avatarUrl: record.avatarUrl,
        isAnonymous: record.isAnonymous,
        surfaceCount: record.surfaceCount,
        transportState: record.transportState,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        presenceByContentId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load collaboration presence";

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}
