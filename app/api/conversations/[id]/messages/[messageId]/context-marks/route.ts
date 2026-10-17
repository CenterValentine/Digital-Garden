/**
 * User context marks on one message — "What the model sees"
 * (CONTEXT-WINDOW-EDITOR-PLAN §4).
 *
 * PATCH /api/conversations/[id]/messages/[messageId]/context-marks
 *   body: { add?: string[], remove?: string[], lineAbove?: boolean }
 *
 * Merges the patch into `metadata.contextMarks` server-side (read → merge →
 * write of one key), so a continuation's metadata PATCH and a mark never
 * clobber each other. The transcript itself is untouched; the chat route
 * reads the marks from the message metadata the client sends and stubs the
 * marked parts in the model-facing copy only.
 *
 * Response: { success: true, data: { marks: ContextMarks } }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { updateMessageContextMarks } from "@/lib/features/conversations";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/conversations/[id]/messages/[messageId]/context-marks";

interface RouteContext {
  params: Promise<{ id: string; messageId: string }>;
}

const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((k) => typeof k === "string" && k.length > 0 && k.length <= 200);

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id, messageId } = await context.params;
      const body = (await request.json().catch(() => null)) as {
        add?: unknown;
        remove?: unknown;
        lineAbove?: unknown;
      } | null;
      if (!body || typeof body !== "object") {
        return NextResponse.json(
          { success: false, error: "A JSON body is required" },
          { status: 400 },
        );
      }
      const add = body.add === undefined ? undefined : isStringList(body.add) ? body.add : null;
      const remove = body.remove === undefined ? undefined : isStringList(body.remove) ? body.remove : null;
      const lineAbove =
        body.lineAbove === undefined ? undefined : typeof body.lineAbove === "boolean" ? body.lineAbove : null;
      if (add === null || remove === null || lineAbove === null) {
        return NextResponse.json(
          { success: false, error: "`add`/`remove` must be string lists; `lineAbove` a boolean" },
          { status: 400 },
        );
      }
      if ((add?.length ?? 0) > 500 || (remove?.length ?? 0) > 500) {
        return NextResponse.json(
          { success: false, error: "Too many keys in one patch" },
          { status: 400 },
        );
      }

      const marks = await updateMessageContextMarks(session.user.id, id, messageId, {
        add,
        remove,
        lineAbove,
      });
      if (marks === null) {
        return NextResponse.json(
          { success: false, error: "Message not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, data: { marks } });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "context_marks:caught",
        summary: `PATCH ${ROUTE_PATH} caught — 500`,
        error,
      });
      return NextResponse.json(
        { success: false, error: "Failed to update context marks" },
        { status: 500 },
      );
    }
  });
}
