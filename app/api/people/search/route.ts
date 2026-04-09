import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { searchPeopleTargets } from "@/lib/domain/people";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";
    const limit = Number.parseInt(searchParams.get("limit") ?? "25", 10);
    const results = await searchPeopleTargets(prisma, session.user.id, query, limit);

    return NextResponse.json({
      success: true,
      data: {
        results,
      },
    });
  } catch (error) {
    console.error("GET /api/people/search error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to search People records",
        },
      },
      { status: 500 }
    );
  }
}
