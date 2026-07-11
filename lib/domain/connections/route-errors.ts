/**
 * Shared error → HTTP translation for /api/connections/** routes.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/core/logger";
import {
  ConnectionInviteNotFoundError,
  ConnectionNotFoundError,
  InvalidConnectionActionError,
  RateLimitExceededError,
} from "./types";

export function handleConnectionsRouteError(
  routeEvent: string,
  error: unknown,
): NextResponse {
  if (
    error instanceof Error &&
    (error.message === "Unauthorized" ||
      error.message === "Authentication required")
  ) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  if (error instanceof RateLimitExceededError) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many requests",
        retryAfterSeconds: error.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      },
    );
  }
  if (
    error instanceof ConnectionInviteNotFoundError ||
    error instanceof ConnectionNotFoundError
  ) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 404 },
    );
  }
  if (error instanceof InvalidConnectionActionError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 },
    );
  }
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: error.message },
      { status: 400 },
    );
  }

  logger.error({
    layer: "content",
    event: `${routeEvent}:caught`,
    summary: "connections route caught — translated to 500",
    error,
  });
  return NextResponse.json(
    { success: false, error: "Something went wrong" },
    { status: 500 },
  );
}
