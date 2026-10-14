/**
 * Document templates — mark/unmark a user's own .docx file, list the
 * marked ones, edit per-field notes.
 *
 *   GET    /api/content/docx-templates                → DocxTemplateSummary[]
 *   POST   /api/content/docx-templates { contentId }  → mark (inspects first)
 *   PATCH  /api/content/docx-templates { contentId, notes } → field notes
 *   DELETE /api/content/docx-templates?contentId=…    → unmark
 *
 * Mirrors /api/content/charters/mark: the file stays where it is; the mark
 * is a record on its own payload. A template whose tags do not parse is
 * refused with the paragraph to fix (`errors[]`).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  getDocxTemplateRecord,
  listDocxTemplates,
  markDocxTemplate,
  unmarkDocxTemplate,
  updateTemplateNotes,
  type TemplateFieldNote,
} from "@/lib/domain/ai/docx-templates/templates";
import { DocxRendererUnavailableError } from "@/lib/domain/ai/docx-templates/renderer-client";

const ROUTE_PATH = "/api/content/docx-templates";

function failure(error: unknown): NextResponse {
  if (error instanceof Error && error.message === "Authentication required") {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 401 });
  }
  if (error instanceof DocxRendererUnavailableError) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 503 });
  }
  logger.error({
    layer: "route",
    event: "docx_templates:route_failed",
    summary: "document templates route failed",
    error,
  });
  return NextResponse.json(
    { success: false, error: { message: error instanceof Error ? error.message : "Request failed" } },
    { status: 500 },
  );
}

async function session() {
  return withSpan({ layer: "auth", name: "session" }, { summary: "session lookup" }, async () => requireAuth());
}

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { user } = await session();
      // ?contentId=… → one template's full record (fields, sections, notes);
      // without it → the summaries list for the settings card.
      const contentId = request.nextUrl.searchParams.get("contentId");
      if (contentId) {
        const outcome = await getDocxTemplateRecord(user.id, contentId);
        if (!outcome.ok || !outcome.record) {
          return NextResponse.json(
            { success: false, error: { message: outcome.error ?? "Template not found", details: outcome.errors ?? [] } },
            { status: outcome.errors ? 422 : 404 },
          );
        }
        return NextResponse.json({ success: true, data: { title: outcome.title, record: outcome.record } });
      }
      const templates = await listDocxTemplates(user.id);
      return NextResponse.json({ success: true, data: templates });
    } catch (error) {
      return failure(error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { user } = await session();
      const body = (await request.json().catch(() => ({}))) as { contentId?: unknown };
      const contentId = typeof body.contentId === "string" ? body.contentId : null;
      if (!contentId) {
        return NextResponse.json({ success: false, error: { message: "contentId is required" } }, { status: 400 });
      }
      const outcome = await markDocxTemplate(user.id, contentId);
      if (!outcome.ok) {
        return NextResponse.json(
          { success: false, error: { message: outcome.error, details: outcome.errors ?? [] } },
          { status: outcome.errors ? 422 : 404 },
        );
      }
      return NextResponse.json({ success: true, data: { summary: outcome.summary, record: outcome.record } });
    } catch (error) {
      return failure(error);
    }
  });
}

export async function PATCH(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { user } = await session();
      const body = (await request.json().catch(() => ({}))) as { contentId?: unknown; notes?: unknown };
      const contentId = typeof body.contentId === "string" ? body.contentId : null;
      if (!contentId || !body.notes || typeof body.notes !== "object" || Array.isArray(body.notes)) {
        return NextResponse.json(
          { success: false, error: { message: "contentId and a notes object are required" } },
          { status: 400 },
        );
      }
      const notes: Record<string, TemplateFieldNote> = {};
      for (const [path, raw] of Object.entries(body.notes as Record<string, unknown>)) {
        if (!raw || typeof raw !== "object") continue;
        const note = raw as { description?: unknown; maxLength?: unknown };
        const entry: TemplateFieldNote = {};
        if (typeof note.description === "string" && note.description.trim()) {
          entry.description = note.description.trim().slice(0, 500);
        }
        if (typeof note.maxLength === "number" && Number.isFinite(note.maxLength) && note.maxLength > 0) {
          entry.maxLength = Math.floor(note.maxLength);
        }
        if (Object.keys(entry).length > 0) notes[path.slice(0, 200)] = entry;
      }
      const outcome = await updateTemplateNotes(user.id, contentId, notes);
      if (!outcome.ok) {
        return NextResponse.json({ success: false, error: { message: outcome.error } }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      return failure(error);
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { user } = await session();
      const contentId = request.nextUrl.searchParams.get("contentId");
      if (!contentId) {
        return NextResponse.json({ success: false, error: { message: "contentId is required" } }, { status: 400 });
      }
      const outcome = await unmarkDocxTemplate(user.id, contentId);
      if (!outcome.ok) {
        return NextResponse.json({ success: false, error: { message: outcome.error } }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    } catch (error) {
      return failure(error);
    }
  });
}
