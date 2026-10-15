/**
 * POST /api/content/docx-templates/rerender { contentId, values?, provenance? }
 *
 * Re-fill a document that was produced from a template, with edited
 * values, WITHOUT a model turn: same template, same node id (every
 * Materials cell and shortcut keeps pointing at it), same judge. A
 * refusal leaves the existing file untouched.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import { rerenderDocxFill } from "@/lib/domain/ai/docx-templates/fills";
import { DocxRendererUnavailableError, type TemplateValue } from "@/lib/domain/ai/docx-templates/renderer-client";
import type { FillProvenance } from "@/lib/domain/ai/docx-templates/record";

const ROUTE_PATH = "/api/content/docx-templates/rerender";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan({ layer: "auth", name: "session" }, { summary: "session lookup" }, async () =>
        requireAuth(),
      );
      const body = (await request.json().catch(() => ({}))) as {
        contentId?: unknown;
        values?: unknown;
        provenance?: unknown;
      };
      const contentId = typeof body.contentId === "string" ? body.contentId : null;
      if (!contentId) {
        return NextResponse.json({ success: false, error: { message: "contentId is required" } }, { status: 400 });
      }
      const values =
        body.values && typeof body.values === "object" && !Array.isArray(body.values)
          ? (body.values as Record<string, TemplateValue>)
          : undefined;
      const provenance =
        body.provenance && typeof body.provenance === "object" && !Array.isArray(body.provenance)
          ? (body.provenance as FillProvenance)
          : undefined;

      const outcome = await rerenderDocxFill(session.user.id, contentId, { values, provenance });
      if (outcome.error) {
        return NextResponse.json({ success: false, error: { message: outcome.error } }, { status: 404 });
      }
      if (!outcome.ok) {
        return NextResponse.json(
          { success: false, error: { message: outcome.refusal ?? "Not accepted", problems: outcome.problems ?? [] } },
          { status: 422 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          report: outcome.report,
          templateChanged: outcome.templateChanged === true,
          ...(outcome.droppedKeys ? { droppedKeys: outcome.droppedKeys } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ success: false, error: { message: error.message } }, { status: 401 });
      }
      if (error instanceof DocxRendererUnavailableError) {
        return NextResponse.json({ success: false, error: { message: error.message } }, { status: 503 });
      }
      logger.error({ layer: "route", event: "docx_templates:rerender_failed", summary: "rerender failed", error });
      return NextResponse.json(
        { success: false, error: { message: error instanceof Error ? error.message : "Request failed" } },
        { status: 500 },
      );
    }
  });
}
