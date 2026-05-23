/**
 * Suggested follow-ups endpoint (Session 7).
 *
 * POST /api/ai/follow-ups
 *   body: {
 *     lastUserText: string;
 *     lastAssistantText: string;
 *     fallbackProviderId?: string;
 *     fallbackModelId?: string;
 *   }
 *
 * Returns `{ success: true, data: { suggestions: string[] } }`.
 * On any internal failure returns success with an empty array so the
 * client UX simply renders nothing — follow-ups are non-essential.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { generateFollowUps } from "@/lib/domain/ai/follow-ups";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/follow-ups";

interface Body {
  lastUserText?: string;
  lastAssistantText?: string;
  fallbackProviderId?: string;
  fallbackModelId?: string;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const body = (await request.json()) as Body;
      const lastUserText = body.lastUserText ?? "";
      const lastAssistantText = body.lastAssistantText ?? "";
      if (!lastAssistantText.trim()) {
        return NextResponse.json({
          success: true,
          data: { suggestions: [] },
        });
      }

      const suggestions = await generateFollowUps({
        userId: session.user.id,
        lastUserText,
        lastAssistantText,
        fallbackProviderId: body.fallbackProviderId,
        fallbackModelId: body.fallbackModelId,
      });

      return NextResponse.json({
        success: true,
        data: { suggestions },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Authentication required"
      ) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "follow_ups:post:caught",
        summary: "POST /api/ai/follow-ups caught",
        error,
      });
      // Soft-fail: return empty list so the client never errors on
      // decorative UX.
      return NextResponse.json({
        success: true,
        data: { suggestions: [] },
      });
    }
  });
}
