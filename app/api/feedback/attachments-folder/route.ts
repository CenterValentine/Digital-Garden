/**
 * POST /api/feedback/attachments-folder
 *
 * Find-or-create the caller's root "Feedback attachments" folder, where
 * screenshots pasted into the feedback form are uploaded (through the
 * ordinary upload route) before they are linked into the issue. One folder
 * the user owns and can prune; see lib/domain/feedback/attachments.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { findOrCreateFolder } from "@/lib/domain/ai/documents";
import { FEEDBACK_ATTACHMENTS_FOLDER } from "@/lib/domain/feedback/attachments";

const ROUTE_PATH = "/api/feedback/attachments-folder";

export async function POST(req: NextRequest) {
  return withRouteTrace(req, { route: ROUTE_PATH }, async () => {
    let ownerId: string;
    try {
      ownerId = (await requireAuth()).user.id;
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Sign in to attach screenshots." } },
        { status: 401 },
      );
    }
    try {
      const { contentNodeId } = await findOrCreateFolder(ownerId, FEEDBACK_ATTACHMENTS_FOLDER, null);
      return NextResponse.json({ success: true, data: { folderId: contentNodeId } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "feedback_attachments_folder:caught",
        summary: "couldn't find or create the Feedback attachments folder",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "SERVER_ERROR", message: "Couldn't prepare the attachments folder." } },
        { status: 500 },
      );
    }
  });
}
