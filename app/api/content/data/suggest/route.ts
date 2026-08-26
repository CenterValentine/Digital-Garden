/**
 * Row suggestions API (plan Phase 5).
 *
 * GET /api/content/data/suggest?q=&limit=
 *
 * Un-promoted rows matching `q`, for the wiki-link and chat-mention
 * suggestion lists. Static segment beside [id] — Next resolves static over
 * dynamic, and table ids are UUIDs, so "suggest" can never shadow a table.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import { searchRowSuggestions } from "@/lib/domain/data/server/suggest";

const ROUTE_PATH = "/api/content/data/suggest";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const sp = request.nextUrl.searchParams;
      const query = sp.get("q") ?? "";
      const limit = Math.min(Math.max(Number(sp.get("limit")) || 5, 1), 25);

      const items = await withSpan(
        { layer: "content", name: "data_row_suggest" },
        { attrs: { query_chars: query.length, limit } },
        async (span) => {
          const r = await searchRowSuggestions(session.user.id, query, limit);
          span.attr("hits", r.length);
          return r;
        }
      );

      return NextResponse.json({ success: true, data: { items } });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:row_suggest:caught",
        summary: "row suggestion search failed",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to search rows" } },
        { status: 500 }
      );
    }
  });
}
