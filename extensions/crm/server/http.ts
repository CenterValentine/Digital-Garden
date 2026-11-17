/**
 * Route plumbing shared by app/api/crm/**. Thin handlers call `crmRoute`,
 * which owns tracing, the session, and the error → status mapping.
 *
 * Status stance (same as the database routes): something the caller cannot
 * read is 404, never 403 — a CRM's existence is not confirmed to outsiders.
 * Unlike those routes, a missing session is 401, not a 500.
 *
 * SERVER-ONLY.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace } from "@/lib/core/logger";
import { CrmActionError } from "./actions";
import { CrmEventError } from "./events";
import { CrmSetupError } from "./setup";
import { CrmWriteError } from "./writes";

export function crmError(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export const crmNotFound = () => crmError(404, "NOT_FOUND", "CRM not found");

export function crmOk<T>(data: T) {
  return NextResponse.json({ success: true, data });
}

export async function crmRoute(
  request: NextRequest,
  route: string,
  handler: (userId: string) => Promise<Response>
): Promise<Response> {
  return withRouteTrace(request, { route }, async () => {
    let userId: string;
    try {
      userId = (await requireAuth()).user.id;
    } catch {
      return crmError(401, "UNAUTHORIZED", "Sign in to use the CRM");
    }
    try {
      return await handler(userId);
    } catch (error) {
      if (error instanceof CrmActionError || error instanceof CrmEventError) {
        return error.status === 404
          ? crmNotFound()
          : crmError(error.status, error.status === 403 ? "FORBIDDEN" : "VALIDATION_ERROR", error.message);
      }
      if (error instanceof CrmSetupError || error instanceof CrmWriteError) {
        return crmError(400, "VALIDATION_ERROR", error.message);
      }
      logger.error({ layer: "route", event: "crm:route_failed", summary: `${route} failed`, error });
      return crmError(500, "INTERNAL_ERROR", "The CRM request failed");
    }
  });
}

export async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
