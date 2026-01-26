/**
 * API Route: Get User's OAuth Provider
 *
 * Returns the OAuth provider (if any) that the user signed in with.
 * Used to conditionally show Google Docs editing option.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user has a Google OAuth account
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
      select: {
        provider: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        hasGoogleAuth: !!account,
        provider: account?.provider || null,
        hasValidToken: account?.accessToken ? true : false,
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
