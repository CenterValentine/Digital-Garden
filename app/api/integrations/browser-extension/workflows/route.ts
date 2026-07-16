import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace } from "@/lib/core/logger";
import { prisma } from "@/lib/database/client";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  parseUrlPatterns,
  readEntryTrigger,
  urlMatchesPatterns,
} from "@/extensions/workflows/graph/url-match";
import { handleRouteError } from "@/extensions/workflows/server/http";

const ROUTE_PATH = "/api/integrations/browser-extension/workflows";

/**
 * Payload engines are versioned refs ("wdk-interpreter@1", "n8n@1"); the
 * extension DTO promises the bare FAMILY ("wdk" | "n8n" | …) so chips stay
 * stable across engine version bumps.
 */
function engineFamily(engine: string | null | undefined): string | null {
  if (!engine) return null;
  if (engine.startsWith("n8n")) return "n8n";
  if (engine.startsWith("wdk")) return "wdk";
  return engine.split("@")[0];
}

/**
 * Extension chooser list: the user's workflow content nodes with entry-trigger
 * info. `?pageUrl=` computes `matchesPage` server-side (only a SPECIFIC
 * page-capture pattern match counts — a blank catch-all matching everything
 * is not an informative hint). Matching workflows sort first; recency order
 * is preserved within each group.
 */
export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const record = await requireBrowserExtensionBearerAuth(request);
      const pageUrl = request.nextUrl.searchParams.get("pageUrl") ?? "";

      const nodes = await prisma.contentNode.findMany({
        where: {
          ownerId: record.user.id,
          contentType: "workflow",
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          workflowPayload: {
            select: { enabled: true, engine: true, definition: true },
          },
        },
        take: 100,
      });

      const workflows = nodes.map((node) => {
        const trigger = readEntryTrigger(node.workflowPayload?.definition);
        const patterns = parseUrlPatterns(trigger.urlPattern ?? "");
        const matchesPage = Boolean(
          pageUrl &&
            trigger.triggerType === "trigger-page-capture" &&
            patterns.length > 0 &&
            urlMatchesPatterns(pageUrl, patterns)
        );
        return {
          id: node.id,
          title: node.title,
          enabled: node.workflowPayload?.enabled ?? false,
          // Engine FAMILY ("wdk" = Trellis interpreter, "n8n", …). Lets the
          // chooser label engine + explain the "not pushed to n8n yet" case;
          // dispatch routing itself stays server-side.
          engine: engineFamily(node.workflowPayload?.engine),
          triggerType: trigger.triggerType,
          urlPattern: trigger.urlPattern,
          matchesPage,
        };
      });
      // Stable partition: page matches first, updatedAt order within groups.
      workflows.sort((a, b) => Number(b.matchesPage) - Number(a.matchesPage));

      return NextResponse.json({ success: true, data: { workflows } });
    } catch (error) {
      return handleRouteError(error, "Failed to list workflows");
    }
  });
}
