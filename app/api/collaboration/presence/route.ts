import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { filterCachedPresenceContentIds } from "@/lib/domain/collaboration/presence-access-cache";
import { listCollaborationPresence } from "@/lib/domain/collaboration/presence-server";
import { getSession } from "@/lib/infrastructure/auth/session";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";

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

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: "/api/collaboration/presence" }, async () => {
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

    const accessibleContentIds = await filterCachedPresenceContentIds(prisma, {
      contentIds,
      userId: session?.user.id ?? null,
    });

    const records = (
      await Promise.all(
        accessibleContentIds.map((contentId) => listCollaborationPresence(prisma, contentId))
      )
    )
      .flat()
      .filter((record) => !excludeSessionId || record.sessionId !== excludeSessionId);
    // The server document's stamp per note. A sleeping tab (sleep disconnects
    // idle editors on purpose) cannot hear the broadcast of a write that
    // reached the live document from outside the browser — an MCP agent, a
    // script, another device. This poll already runs for the tab strip, so the
    // stamp rides on it: a tab that sees it move past what it last saw wakes
    // and catches up. Only Y.js stores move this stamp; a payload-only write
    // does not, and must not wake anyone (see runtime.wakeForRemoteWrite).
    const stamps = await prisma.collaborationDocument.findMany({
      where: { contentId: { in: accessibleContentIds } },
      select: { contentId: true, updatedAt: true },
    });
    const documentStampByContentId: Record<string, number> = {};
    for (const stamp of stamps) documentStampByContentId[stamp.contentId] = stamp.updatedAt.getTime();

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
        documentStampByContentId,
      },
    });
  } catch (error) {
    logger.error({ layer: "collab", event: "presence_list:caught", summary: "GET caught", error });
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
  });
}
