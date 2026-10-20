/**
 * Shared handler wrapper for /api/content/comments/* routes: auth, tracing,
 * one error → status mapping (the readerRoute shape). Responses are
 * `{ success: true, data }` or `{ success: false, error: { code, message } }`.
 */

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { CommentsError } from "./threads";

export interface CommentsRouteContext<P> {
  userId: string;
  request: NextRequest;
  params: P;
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

const CODE_BY_STATUS: Record<number, string> = {
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

export function commentsRoute<P, T>(
  route: string,
  handler: (context: CommentsRouteContext<P>) => Promise<T>,
) {
  return (request: NextRequest, context: { params: Promise<P> }) =>
    withRouteTrace(request, { route }, async () => {
      let userId: string;
      try {
        userId = (await requireAuth()).user.id;
      } catch {
        return errorResponse(401, "UNAUTHORIZED", "Sign in to comment");
      }
      try {
        const data = await handler({ userId, request, params: await context.params });
        return NextResponse.json({ success: true, data });
      } catch (error) {
        if (error instanceof ZodError) {
          return errorResponse(400, "VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid request");
        }
        if (error instanceof CommentsError) {
          return errorResponse(error.status, CODE_BY_STATUS[error.status] ?? "COMMENTS_ERROR", error.message);
        }
        logger.error({
          layer: "content",
          event: "comments:route_failed",
          summary: `${route} failed`,
          error,
        });
        return errorResponse(500, "SERVER_ERROR", error instanceof Error ? error.message : "Comment request failed");
      }
    });
}
