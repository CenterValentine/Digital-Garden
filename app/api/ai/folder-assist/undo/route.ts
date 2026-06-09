/**
 * Folder Assistant API — undo a placement.
 *
 * POST /api/ai/folder-assist/undo
 *   body: { undo: UndoPayload }
 *   → { success: true }
 *
 * Reverses the move, removes an auto-created folder if now empty, and
 * records the rejection in memory so the model avoids repeating it.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { undoPlacement } from "@/lib/domain/ai/folder-assist/service";
import type { UndoPayload } from "@/lib/domain/ai/folder-assist/types";
import { withRouteTrace, withSpan } from "@/lib/core/logger";
import { handleFolderAssistError } from "@/lib/domain/ai/folder-assist/http";

const ROUTE_PATH = "/api/ai/folder-assist/undo";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const body = (await request.json()) as { undo?: UndoPayload };
      const undo = body.undo;
      if (
        !undo ||
        typeof undo !== "object" ||
        typeof undo.prevParents !== "object"
      ) {
        return NextResponse.json(
          { success: false, error: "Invalid undo payload." },
          { status: 400 },
        );
      }

      await undoPlacement({ userId: session.user.id, undo });
      return NextResponse.json({ success: true });
    } catch (error) {
      return handleFolderAssistError(ROUTE_PATH, error);
    }
  });
}
