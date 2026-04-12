import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { upsertCollaborationPresence } from "@/lib/domain/collaboration/presence-server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export const runtime = "nodejs";

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

function parseTransportState(value: unknown): PresenceTransportState {
  return typeof value === "string" && TRANSPORT_STATES.has(value as PresenceTransportState)
    ? (value as PresenceTransportState)
    : "localOnly";
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json()) as {
      contentId?: string;
      sessionId?: string;
      browserContextId?: string;
      surfaceCount?: number;
      activePaneIds?: string[];
      activeTabIds?: string[];
      transportState?: string;
      lastKnownServerRevision?: number | null;
    };

    const contentId = body.contentId?.trim();
    const sessionId = body.sessionId?.trim();
    const browserContextId = body.browserContextId?.trim();

    if (!contentId || !sessionId || !browserContextId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "contentId, sessionId, and browserContextId are required",
          },
        },
        { status: 400 }
      );
    }

    await resolveContentAccess(prisma, {
      contentId,
      userId: session.user.id,
      require: "view",
    });

    upsertCollaborationPresence({
      contentId,
      userId: session.user.id,
      sessionId,
      browserContextId,
      surfaceCount: Math.max(0, Number(body.surfaceCount ?? 0)),
      activePaneIds: Array.isArray(body.activePaneIds) ? body.activePaneIds : [],
      activeTabIds: Array.isArray(body.activeTabIds) ? body.activeTabIds : [],
      transportState: parseTransportState(body.transportState),
      lastKnownServerRevision:
        typeof body.lastKnownServerRevision === "number"
          ? body.lastKnownServerRevision
          : null,
    });

    return NextResponse.json({ success: true });
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
