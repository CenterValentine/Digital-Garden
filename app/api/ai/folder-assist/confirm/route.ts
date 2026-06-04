/**
 * Folder Assistant API — confirm a placement.
 *
 * POST /api/ai/folder-assist/confirm
 *   body: { fileIds, prompt, folderId? } | { fileIds, prompt, createFolder:{name,underFolderId} }
 *   → FolderAssistResult ("moved" | "abstain")
 *
 * Used when the assistant returned candidates / a create-suggestion and the
 * user picked one.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  confirmPlacement,
  isFolderAssistantEnabled,
} from "@/lib/domain/ai/folder-assist/service";
import { withRouteTrace, withSpan } from "@/lib/core/logger";
import { handleFolderAssistError } from "@/lib/domain/ai/folder-assist/http";

const ROUTE_PATH = "/api/ai/folder-assist/confirm";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      if (!(await isFolderAssistantEnabled(session.user.id))) {
        return NextResponse.json(
          { success: false, error: "Folder Assistant is disabled in settings." },
          { status: 403 },
        );
      }

      const body = (await request.json()) as {
        fileIds?: unknown;
        prompt?: unknown;
        folderId?: unknown;
        createFolder?: { name?: unknown; underFolderId?: unknown };
      };
      const fileIds = Array.isArray(body.fileIds)
        ? body.fileIds.filter((x): x is string => typeof x === "string")
        : [];
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (fileIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "fileIds are required." },
          { status: 400 },
        );
      }

      const folderId =
        typeof body.folderId === "string" ? body.folderId : undefined;
      const createFolder =
        body.createFolder && typeof body.createFolder.name === "string"
          ? {
              name: body.createFolder.name,
              underFolderId:
                typeof body.createFolder.underFolderId === "string"
                  ? body.createFolder.underFolderId
                  : null,
            }
          : undefined;

      if (!folderId && !createFolder) {
        return NextResponse.json(
          { success: false, error: "Provide folderId or createFolder." },
          { status: 400 },
        );
      }

      const result = await confirmPlacement({
        userId: session.user.id,
        fileIds,
        prompt,
        folderId,
        createFolder,
      });
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleFolderAssistError(ROUTE_PATH, error);
    }
  });
}
