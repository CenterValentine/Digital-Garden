/**
 * Content Import API
 *
 * POST /api/content/import
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { importFile } from "@/lib/domain/import/import-service";
import type { JSONContent } from "@tiptap/core";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/import";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      if (!session?.user?.id) {
        return NextResponse.json(
          { success: false, error: { message: "Unauthorized" } },
          { status: 401 }
        );
      }
      const userId = session.user.id;

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

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: { message: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.` } },
          { status: 400 }
        );
      }

      const fileName = file.name;
      const fileContent = await file.text();

      let markdownContent: string | undefined;
      let jsonContent: JSONContent | undefined;

      if (fileName.endsWith(".json")) {
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

      // fileName is user-authored — not logged in attrs.
      const result = await withSpan(
        { layer: "content", name: "import" },
        {
          attrs: {
            kind: fileName.endsWith(".json") ? "json" : "markdown",
            bytes: file.size,
            has_sidecar: Boolean(sidecar),
          },
        },
        async (span) => {
          await spanPayload(span, "import_input", {
            fileName,
            kind: fileName.endsWith(".json") ? "json" : "markdown",
            markdownContent,
            jsonContent,
            sidecarContent,
            titleOverride,
            parentId,
          });
          const r = await importFile({
            markdownContent,
            jsonContent,
            sidecarContent,
            title: titleOverride || undefined,
            fileName,
            parentId: parentId || null,
            userId,
          });
          span
            .attr("ok", r.success)
            .attr("warnings", r.warnings?.length ?? 0);
          await spanPayload(span, "import_result", r);
          return r;
        },
      );

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
      logger.error({
        layer: "content",
        event: "import:caught",
        summary: "import failed — 500",
        error,
      });
      return NextResponse.json(
        { success: false, error: { message: "Internal server error" } },
        { status: 500 }
      );
    }
  });
}
