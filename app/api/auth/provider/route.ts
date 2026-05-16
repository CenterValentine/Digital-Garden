/**
 * API Route: Get User's OAuth Provider
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, getValidGoogleAccessToken } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/auth/provider";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => getSession(),
      );

      if (!session) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }

      const hasValidToken = await withSpan(
        { layer: "auth", name: "google_token_probe" },
        undefined,
        async (span) => {
          try {
            await getValidGoogleAccessToken(session.user.id);
            span.attr("valid", true).summary("token valid");
            return true;
          } catch {
            // Not an error — user simply doesn't have Google auth
            span.attr("valid", false).summary("no google auth");
            return false;
          }
        },
      );

      return NextResponse.json({
        success: true,
        data: {
          hasGoogleAuth: hasValidToken,
          provider: hasValidToken ? "google" : null,
          hasValidToken,
        },
      });
    } catch (error) {
      logger.error({
        layer: "auth",
        event: "provider_probe:caught",
        summary: "probe failed — 500",
        error,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  });
}
