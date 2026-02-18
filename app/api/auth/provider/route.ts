/**
 * API Route: Get User's OAuth Provider
 *
 * Returns the OAuth provider (if any) that the user signed in with.
 * Used to conditionally show Google Docs editing option.
 */

import { NextResponse } from "next/server";
import { getSession, getValidGoogleAccessToken } from "@/lib/infrastructure/auth";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Proactively refresh Google access token if expired
    // This ensures the user has a valid token for subsequent API calls
    let hasValidToken = false;
    try {
      await getValidGoogleAccessToken(session.user.id);
      hasValidToken = true;
    } catch (error) {
      // No Google account or refresh failed
      // This is not an error - just means user doesn't have Google auth
      hasValidToken = false;
    }

    return NextResponse.json({
      success: true,
      data: {
        hasGoogleAuth: hasValidToken,
        provider: hasValidToken ? "google" : null,
        hasValidToken,
      },
    });
  } catch (error) {
    console.error("[Auth Provider API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
