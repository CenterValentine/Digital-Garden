import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  getExtensionNoteContent,
  updateExtensionNoteContent,
} from "@/lib/domain/browser-extension";

type Params = Promise<{ id: string }>;

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lowered = message.toLowerCase();
  const status = lowered.includes("token") || lowered.includes("auth") ? 401 : lowered.includes("not found") ? 404 : 500;
  return NextResponse.json(
    {
      success: false,
      error: {
        code: status === 401 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
        message,
      },
    },
    { status }
  );
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const { id } = await params;
    const data = await getExtensionNoteContent(token.user.id, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension NoteContent] GET error:", error);
    return errorResponse(error, "Failed to load note content");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const { id } = await params;
    const body = await request.json();
    const data = await updateExtensionNoteContent(token.user.id, id, {
      tiptapJson: body.tiptapJson,
      markdown: typeof body.markdown === "string" ? body.markdown : undefined,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension NoteContent] PATCH error:", error);
    return errorResponse(error, "Failed to save note content");
  }
}
