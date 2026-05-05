import { NextRequest, NextResponse } from "next/server";
import { requireBrowserExtensionBearerAuth } from "@/lib/domain/browser-bookmarks/http";
import {
  createExtensionContentPickerItem,
  getExtensionContentPickerTree,
} from "@/lib/domain/browser-extension";

export async function GET(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const data = await getExtensionContentPickerTree(token.user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension ContentPickerTree] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to load content tree",
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await requireBrowserExtensionBearerAuth(request);
    const body = await request.json();
    const data = await createExtensionContentPickerItem(token.user.id, {
      parentId: typeof body.parentId === "string" ? body.parentId : null,
      type: body.type,
      title: typeof body.title === "string" ? body.title : null,
      url: typeof body.url === "string" ? body.url : null,
      description: typeof body.description === "string" ? body.description : null,
      webResourceId:
        typeof body.webResourceId === "string" ? body.webResourceId : null,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[BrowserExtension ContentPickerTree] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to create content item",
        },
      },
      { status: 500 }
    );
  }
}
