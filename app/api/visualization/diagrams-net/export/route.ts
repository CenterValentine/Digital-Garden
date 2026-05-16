/**
 * Diagrams.net Export API
 *
 * POST /api/visualization/diagrams-net/export
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/visualization/diagrams-net/export";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const { xml, format } = await request.json();

      if (!xml || !format) {
        return NextResponse.json(
          { error: "Missing required fields: xml, format" },
          { status: 400 }
        );
      }

      if (!["png", "svg", "pdf"].includes(format)) {
        return NextResponse.json(
          { error: "Invalid format. Must be png, svg, or pdf" },
          { status: 400 }
        );
      }

      // TODO: Implement server-side export. Currently returns 501.
      return NextResponse.json(
        {
          error: "Server-side export not yet implemented",
          message: "Please use the export button within the diagram editor",
        },
        { status: 501 }
      );
    } catch (error: unknown) {
      logger.error({
        layer: "external",
        event: "diagrams_net_export:caught",
        summary: "export failed — 500",
        error,
      });
      return NextResponse.json(
        { error: "Export failed", details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  });
}
