/**
 * Content Import API
 *
 * POST /api/content/import
 *
 * Accepts multipart/form-data:
 * - file: .md or .json file (required)
 * - sidecar: .meta.json file (optional)
 * - parentId: folder UUID (optional)
 * - title: override title (optional)
 *
 * Returns 201 on success with { contentId, title, warnings }.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { importFile } from "@/lib/domain/import/import-service";
import type { JSONContent } from "@tiptap/core";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  try {
    // ── Auth ──
    const session = await requireAuth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { message: "Unauthorized" } },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    // ── Parse multipart form data ──
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: { message: "Invalid form data. Expected multipart/form-data." } },
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    const sidecar = formData.get("sidecar") as File | null;
    const parentId = formData.get("parentId") as string | null;
    const titleOverride = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: { message: "No file provided. Upload a .md or .json file." } },
        { status: 400 }
      );
    }

    // ── Validate file size ──
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: { message: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.` } },
        { status: 400 }
      );
    }

    // ── Determine file type and read content ──
    const fileName = file.name;
    const fileContent = await file.text();

    let markdownContent: string | undefined;
    let jsonContent: JSONContent | undefined;

    if (fileName.endsWith(".json")) {
      // Try to parse as TipTap JSON
      try {
        const parsed = JSON.parse(fileContent);
        if (parsed && typeof parsed === "object" && parsed.type === "doc") {
          jsonContent = parsed as JSONContent;
        } else {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: "JSON file must have root type 'doc'. If this is a .meta.json sidecar, upload it alongside a .md file using the 'sidecar' field.",
              },
            },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, error: { message: "Invalid JSON file" } },
          { status: 400 }
        );
      }
    } else if (fileName.endsWith(".md") || fileName.endsWith(".markdown") || fileName.endsWith(".txt")) {
      markdownContent = fileContent;
    } else {
      return NextResponse.json(
        { success: false, error: { message: `Unsupported file type: ${fileName}. Supported: .md, .json` } },
        { status: 400 }
      );
    }

    // ── Read sidecar if provided ──
    let sidecarContent: string | undefined;
    if (sidecar) {
      if (sidecar.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: { message: "Sidecar file too large" } },
          { status: 400 }
        );
      }
      sidecarContent = await sidecar.text();
    }

    // ── Import ──
    const result = await importFile({
      markdownContent,
      jsonContent,
      sidecarContent,
      title: titleOverride || undefined,
      fileName,
      parentId: parentId || null,
      userId,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { message: result.error } },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          contentId: result.contentId,
          title: result.title,
          warnings: result.warnings,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/content/import] Error:", error);
    return NextResponse.json(
      { success: false, error: { message: "Internal server error" } },
      { status: 500 }
    );
  }
}
