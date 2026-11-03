/**
 * Shared handler wrappers for /api/canvas/* routes: auth, tracing, and one
 * error → status mapping. Long operations (import, re-import) stream NDJSON
 * progress lines and end with a `done` (or `error`) line, so the dialog shows
 * where a several-minute import is instead of a spinner.
 */

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { NoteEditRefused } from "@/lib/domain/content/write-note-content";
import { CartridgeError } from "../cartridge";
import type { CanvasImportSummary, CanvasProgressEvent, CanvasStreamEvent } from "../types";
import { CanvasError } from "./http";

export interface CanvasRouteContext {
  ownerId: string;
  request: NextRequest;
}

/** Prisma "table does not exist": the Canvas migration hasn't been applied here. */
function isNotMigrated(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2021";
}

function describe(error: unknown): { status: number; code: string; message: string } {
  if (isNotMigrated(error)) {
    return {
      status: 503,
      code: "CANVAS_NOT_MIGRATED",
      message: "The Canvas tables haven't been created on this database yet. Run `npx prisma migrate deploy`.",
    };
  }
  if (error instanceof CanvasError) return { status: error.status, code: "CANVAS_ERROR", message: error.message };
  if (error instanceof CartridgeError) return { status: error.status, code: "CARTRIDGE_ERROR", message: error.message };
  if (error instanceof ZodError) {
    return { status: 400, code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Invalid request" };
  }
  if (error instanceof NoteEditRefused) return { status: 409, code: "NOTE_EDIT_REFUSED", message: error.message };
  return { status: 500, code: "SERVER_ERROR", message: error instanceof Error ? error.message : "Canvas request failed" };
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export function canvasRoute<T>(route: string, handler: (context: CanvasRouteContext) => Promise<T | NextResponse>) {
  return (request: NextRequest) =>
    withRouteTrace(request, { route }, async () => {
      let ownerId: string;
      try {
        ownerId = (await requireAuth()).user.id;
      } catch {
        return errorResponse(401, "UNAUTHORIZED", "Sign in to use Canvas import");
      }
      try {
        const result = await handler({ ownerId, request });
        if (result instanceof NextResponse) return result;
        return NextResponse.json({ success: true, data: result });
      } catch (error) {
        const described = describe(error);
        if (described.status >= 500) {
          logger.error({ layer: "external", event: "canvas:route_failed", summary: `${route} failed`, error });
        }
        return errorResponse(described.status, described.code, described.message);
      }
    });
}

/** Next 16 dynamic params arrive as a promise. */
export type RouteParams<P> = { params: Promise<P> };

export function canvasRouteWithParams<P, T>(
  route: string,
  handler: (context: CanvasRouteContext & { params: P }) => Promise<T | NextResponse>
) {
  return (request: NextRequest, { params }: RouteParams<P>) =>
    canvasRoute<T>(route, async (context) => handler({ ...context, params: await params }))(request);
}

/**
 * A streaming operation. Auth and body validation answer as plain JSON
 * errors; once the stream starts, failures arrive as an `error` line.
 */
export function canvasStreamRoute<B>(
  route: string,
  parseBody: (body: unknown) => B,
  handler: (context: CanvasRouteContext & { body: B; emit: (event: CanvasProgressEvent) => void }) => Promise<CanvasImportSummary>
) {
  return (request: NextRequest) =>
    withRouteTrace(request, { route }, async () => {
      let ownerId: string;
      try {
        ownerId = (await requireAuth()).user.id;
      } catch {
        return errorResponse(401, "UNAUTHORIZED", "Sign in to use Canvas import");
      }
      let body: B;
      try {
        body = parseBody(await request.json());
      } catch (error) {
        const described = describe(error);
        return errorResponse(described.status === 500 ? 400 : described.status, described.code, described.message);
      }
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: CanvasStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          try {
            const summary = await handler({ ownerId, request, body, emit: send });
            send(summary);
          } catch (error) {
            const described = describe(error);
            if (described.status >= 500) {
              logger.error({ layer: "external", event: "canvas:stream_failed", summary: `${route} failed`, error });
            }
            send({ type: "error", message: described.message });
          } finally {
            controller.close();
          }
        },
      });
      return new NextResponse(stream, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
      });
    });
}
