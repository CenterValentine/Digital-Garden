/**
 * API Route: Get User's OAuth Provider
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  getValidGoogleAccessToken,
  GoogleAuthError,
  type GoogleAuthErrorCode,
} from "@/lib/infrastructure/auth";
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

      // Why the probe failed matters as much as whether it did: "not_linked"
      // (password user) and "reauth_required" (dead refresh token) both used to
      // collapse into `hasGoogleAuth: false`, so a Google user whose token had
      // expired saw "Sign in with Google for editing" with no way to act on it.
      const googleAuthCode = await withSpan(
        { layer: "auth", name: "google_token_probe" },
        undefined,
        async (span): Promise<GoogleAuthErrorCode | null> => {
          try {
            await getValidGoogleAccessToken(session.user.id);
            span.attr("valid", true).summary("token valid");
            return null;
          } catch (error) {
            const code: GoogleAuthErrorCode =
              error instanceof GoogleAuthError ? error.code : "transient";
            span.attr("valid", false).attr("code", code).summary(code);
            return code;
          }
        },
      );
      const hasValidToken = googleAuthCode === null;

      return NextResponse.json({
        success: true,
        data: {
          hasGoogleAuth: hasValidToken,
          provider: hasValidToken ? "google" : null,
          hasValidToken,
          googleAuthCode,
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
