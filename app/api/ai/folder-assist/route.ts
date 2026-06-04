/**
 * Folder Assistant API — decide placement.
 *
 * POST /api/ai/folder-assist
 *   body: { fileIds: string[], prompt: string, feelingLucky: boolean }
 *   → FolderAssistResult ("moved" | "needs_confirmation" | "abstain")
 *
 * Standalone one-shot agent — NOT a chat tool. Gated by the per-user
 * folderAssistant.enabled setting.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  isFolderAssistantEnabled,
  runFolderAssist,
} from "@/lib/domain/ai/folder-assist/service";
import { handleFolderAssistError } from "@/lib/domain/ai/folder-assist/http";
import { withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/folder-assist";

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
        feelingLucky?: unknown;
      };
      const fileIds = Array.isArray(body.fileIds)
        ? body.fileIds.filter((x): x is string => typeof x === "string")
        : [];
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      const feelingLucky = body.feelingLucky === true;

      if (fileIds.length === 0 || !prompt) {
        return NextResponse.json(
          { success: false, error: "fileIds and prompt are required." },
          { status: 400 },
        );
      }

      const result = await withSpan(
        { layer: "ai", name: "folder_assist" },
        { attrs: { files: fileIds.length, lucky: feelingLucky } },
        async (span) => {
          const r = await runFolderAssist({
            userId: session.user.id,
            fileIds,
            prompt,
            feelingLucky,
          });
          span.attr("status", r.status).summary(`folder-assist → ${r.status}`);
          return r;
        },
      );

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleFolderAssistError(ROUTE_PATH, error);
    }
  });
}
