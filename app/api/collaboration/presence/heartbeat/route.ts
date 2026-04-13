import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import {
  assertCachedPresenceAccess,
  assertCachedPublicPresenceAccess,
} from "@/lib/domain/collaboration/presence-access-cache";
import { upsertCollaborationPresence } from "@/lib/domain/collaboration/presence-server";
import { getSession } from "@/lib/infrastructure/auth/session";

export const runtime = "nodejs";

const MAX_HEARTBEAT_SESSIONS = 32;

type PresenceTransportState =
  | "localOnly"
  | "promoting"
  | "connecting"
  | "connected"
  | "synced"
  | "disconnectedButDirty"
  | "coolingDown";

const TRANSPORT_STATES = new Set<PresenceTransportState>([
  "localOnly",
  "promoting",
  "connecting",
  "connected",
  "synced",
  "disconnectedButDirty",
  "coolingDown",
]);

interface PresenceHeartbeatInput {
  contentId?: string;
  sessionId?: string;
  browserContextId?: string;
  displayName?: string;
  avatarUrl?: string | null;
  surfaceCount?: number;
  activePaneIds?: string[];
  activeTabIds?: string[];
  transportState?: string;
  lastKnownServerRevision?: number | null;
}

function parseTransportState(value: unknown): PresenceTransportState {
  return typeof value === "string" && TRANSPORT_STATES.has(value as PresenceTransportState)
    ? (value as PresenceTransportState)
    : "localOnly";
}

function parseHeartbeatInputs(body: PresenceHeartbeatInput & { sessions?: PresenceHeartbeatInput[] }) {
  const sessions = Array.isArray(body.sessions) ? body.sessions : [body];
  return sessions.slice(0, MAX_HEARTBEAT_SESSIONS).map((session) => ({
    ...session,
    contentId: session.contentId?.trim(),
    sessionId: session.sessionId?.trim(),
    browserContextId: session.browserContextId?.trim(),
  }));
}

function sanitizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 16);
}

function sanitizeDisplayName(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 80)
    : null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = (await request.json()) as PresenceHeartbeatInput & {
      sessions?: PresenceHeartbeatInput[];
    };
    const heartbeatSessions = parseHeartbeatInputs(body);

    if (
      heartbeatSessions.length === 0 ||
      heartbeatSessions.some(
        (heartbeat) => !heartbeat.contentId || !heartbeat.sessionId || !heartbeat.browserContextId
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Each heartbeat requires contentId, sessionId, and browserContextId",
          },
        },
        { status: 400 }
      );
    }

    const contentIds = Array.from(
      new Set(heartbeatSessions.map((heartbeat) => heartbeat.contentId as string))
    );

    for (const contentId of contentIds) {
      if (session) {
        await assertCachedPresenceAccess(prisma, {
          contentId,
          userId: session.user.id,
        });
      } else {
        await assertCachedPublicPresenceAccess(prisma, contentId);
      }
    }

    for (const heartbeat of heartbeatSessions) {
      upsertCollaborationPresence({
        contentId: heartbeat.contentId as string,
        userId: session?.user.id ?? `visitor:${heartbeat.browserContextId}`,
        displayName: session?.user.username ?? sanitizeDisplayName(heartbeat.displayName),
        avatarUrl: sanitizeDisplayName(heartbeat.avatarUrl),
        isAnonymous: !session,
        sessionId: heartbeat.sessionId as string,
        browserContextId: heartbeat.browserContextId as string,
        surfaceCount: Math.max(0, Number(heartbeat.surfaceCount ?? 0)),
        activePaneIds: sanitizeStringList(heartbeat.activePaneIds),
        activeTabIds: sanitizeStringList(heartbeat.activeTabIds),
        transportState: parseTransportState(heartbeat.transportState),
        lastKnownServerRevision:
          typeof heartbeat.lastKnownServerRevision === "number"
            ? heartbeat.lastKnownServerRevision
            : null,
      });
    }

    return NextResponse.json({ success: true, data: { accepted: heartbeatSessions.length } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update collaboration presence";
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
