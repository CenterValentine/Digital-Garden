/**
 * Shared handler wrapper for /api/reader/* routes: auth, tracing, and one
 * error → status mapping (source errors keep their status, a missing reader
 * migration is a 503 with instructions, validation errors are 400).
 */

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { NoteEditRefused } from "@/lib/domain/content/write-note-content";
import { isReaderNotMigrated, ReaderNotMigratedError } from "../db";
import { ScriptureError } from "@/lib/domain/scripture/server/corpus";
import { ResearchError } from "@/lib/domain/research/server/service";
import { ReaderFetchError } from "./http";
import { ReaderDrmError } from "./library";

export interface ReaderRouteContext {
  ownerId: string;
  request: NextRequest;
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export function readerRoute<T>(
  route: string,
  handler: (context: ReaderRouteContext) => Promise<T | NextResponse>
) {
  return (request: NextRequest) =>
    withRouteTrace(request, { route }, async () => {
      let ownerId: string;
      try {
        ownerId = (await requireAuth()).user.id;
      } catch {
        return errorResponse(401, "UNAUTHORIZED", "Sign in to use the reader");
      }
      try {
        const result = await handler({ ownerId, request });
        if (result instanceof NextResponse) return result;
        return NextResponse.json({ success: true, data: result });
      } catch (error) {
        if (isReaderNotMigrated(error)) {
          return errorResponse(
            503,
            "READER_NOT_MIGRATED",
            // The scripture tables carry their own apply instructions.
            error instanceof ReaderNotMigratedError && error.message.startsWith("Scripture")
              ? error.message
              : "The reader's database tables haven't been created yet. Apply docs/notes-feature/work-tracking/reader-schema-additions.prisma and run the reader migration."
          );
        }
        if (error instanceof ResearchError) {
          return errorResponse(error.status, "RESEARCH_ERROR", error.message);
        }
        if (error instanceof ScriptureError) {
          return errorResponse(error.status, "SCRIPTURE_ERROR", error.message);
        }
        if (error instanceof ZodError) {
          return errorResponse(400, "VALIDATION_ERROR", error.issues[0]?.message ?? "Invalid request");
        }
        if (error instanceof ReaderDrmError) {
          return errorResponse(422, "DRM_PROTECTED", error.message);
        }
        if (error instanceof ReaderFetchError) {
          return errorResponse(error.status, "SOURCE_ERROR", error.message);
        }
        if (error instanceof NoteEditRefused) {
          return errorResponse(409, "NOTE_EDIT_REFUSED", error.message);
        }
        logger.error({
          layer: "external",
          event: "reader:route_failed",
          summary: `${route} failed`,
          error,
        });
        return errorResponse(
          500,
          "SERVER_ERROR",
          error instanceof Error ? error.message : "Reader request failed"
        );
      }
    });
}

/** Next 16 dynamic params arrive as a promise. */
export type RouteParams<P> = { params: Promise<P> };

export function readerRouteWithParams<P, T>(
  route: string,
  handler: (context: ReaderRouteContext & { params: P }) => Promise<T | NextResponse>
) {
  return (request: NextRequest, { params }: RouteParams<P>) =>
    readerRoute<T>(route, async (context) =>
      handler({ ...context, params: await params })
    )(request);
}
