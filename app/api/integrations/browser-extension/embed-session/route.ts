import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import { prisma } from "@/lib/database/client";

// Short-lived: the extension refreshes every 20 min via alarm
const EMBED_SESSION_DURATION_MS = 30 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const tokenRecord = await requireBrowserExtensionBearerAuth(request);
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + EMBED_SESSION_DURATION_MS);

    await prisma.session.create({
      data: {
        userId: tokenRecord.user.id,
        token: sessionToken,
        expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        token: sessionToken,
        expiresAt: expiresAt.toISOString(),
        cookieName: "session_token",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create embed session";
    const status = message.toLowerCase().includes("token") ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
