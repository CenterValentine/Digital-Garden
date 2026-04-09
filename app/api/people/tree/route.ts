import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { getPeopleTree } from "@/lib/domain/people";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

export async function GET() {
  try {
    const session = await requireAuth();
    const tree = await getPeopleTree(prisma, session.user.id);

    return NextResponse.json({
      success: true,
      data: tree,
    });
  } catch (error) {
    console.error("GET /api/people/tree error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch People tree",
        },
      },
      { status: 500 }
    );
  }
}
