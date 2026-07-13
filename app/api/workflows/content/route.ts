import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { handleRouteError } from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/workflows/content";

/** List the caller's workflow content nodes for the panel's Run menu. */
export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const nodes = await prisma.contentNode.findMany({
        where: {
          ownerId: session.user.id,
          contentType: "workflow",
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          workflowPayload: { select: { enabled: true } },
        },
        take: 100,
      });
      return NextResponse.json({
        success: true,
        data: {
          workflows: nodes.map((node) => ({
            id: node.id,
            title: node.title,
            enabled: node.workflowPayload?.enabled ?? false,
          })),
        },
      });
    } catch (error) {
      return handleRouteError(error, "Failed to list workflows");
    }
  });
}
