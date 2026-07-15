import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { WorkflowRun } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";

import { errorResponse } from "./http";
import { getRunForOwner } from "./runs";
import { getOptionalServiceTokenAuth } from "./service-token-http";

/**
 * Shared guard for the workflow callback surface (`/api/workflows/callback/*`).
 *
 * This is the ONE place the "wide" service token's blast radius is contained,
 * and it does it in two layers:
 *   1. PAT auth  → proves WHICH user is calling (getOptionalServiceTokenAuth).
 *   2. Ownership → the run must belong to that user (getRunForOwner).
 * The runs.ts writers don't take an ownerId, so without layer 2 a valid token
 * could post into any run by guessing ids. Every callback route MUST enter
 * through requireCallbackRun so neither layer can be forgotten.
 */

export class CallbackError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CallbackError";
  }
}

export interface CallbackContext {
  userId: string;
  run: WorkflowRun;
}

export async function requireCallbackRun(
  request: NextRequest,
  runId: string
): Promise<CallbackContext> {
  const auth = await getOptionalServiceTokenAuth(request);
  if (!auth) {
    throw new CallbackError(
      401,
      "UNAUTHORIZED",
      "Missing or invalid workflow service token"
    );
  }

  const run = await getRunForOwner(runId, auth.userId);
  if (!run) {
    // 404 (not 403) so a token can't probe which runIds exist for other users.
    throw new CallbackError(404, "NOT_FOUND", "Workflow run not found");
  }

  return { userId: auth.userId, run };
}

/**
 * Maps CallbackError to its status. Anything else is an unexpected 500: log
 * the real error for debugging, but return only the generic `fallback` to the
 * external caller (don't leak internals across the engine boundary).
 */
export function handleCallbackError(error: unknown, fallback: string) {
  if (error instanceof CallbackError) {
    return errorResponse(error.status, error.code, error.message);
  }
  logger.error({
    layer: "route",
    event: "workflows_callback:caught",
    summary: error instanceof Error ? error.message : fallback,
    error,
  });
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: fallback } },
    { status: 500 }
  );
}

/** Parse a JSON body, tolerating an empty/malformed body as `{}`. */
export async function readJsonBody(
  request: NextRequest
): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Narrow an unknown to a plain object, or undefined (for nested JSON fields). */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
